import { createClient } from '@supabase/supabase-js'

type Req = { method?: string; headers: Record<string, string | string[] | undefined>; body?: any; query?: Record<string, string | string[] | undefined> }
type Res = { status(code: number): Res; json(body: unknown): void; setHeader(name: string, value: string): void }

const respond = (res: Res, code: number, body: unknown) => res.status(code).json(body)
const adminEmails = () => (process.env.MENUHUB_ADMIN_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean)
const supabaseUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const anonKey = () => process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''

async function getUser(req: Req) {
  const auth = req.headers.authorization
  const token = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token || !supabaseUrl() || !anonKey()) return null
  const response = await fetch(supabaseUrl().replace(/\/$/, '') + '/auth/v1/user', { headers: { apikey: anonKey(), Authorization: 'Bearer ' + token } })
  if (!response.ok) return null
  return await response.json() as { id: string; email?: string }
}

function db() {
  const url = supabaseUrl()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Falta configurar SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY na Vercel.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET' && req.method !== 'POST') return respond(res, 405, { error: 'Método não permitido.' })
  const user = await getUser(req)
  if (!user?.id || !user.email) return respond(res, 401, { error: 'Entre na sua conta novamente.' })
  const email = user.email.trim().toLowerCase()
  const isAdmin = adminEmails().includes(email)
  // Do not activate the paywall until every required secret and the admin allowlist are configured.
  // This keeps the existing dashboard usable during setup; billing becomes enforced once configured.
  if (!process.env.MERCADO_PAGO_ACCESS_TOKEN || !process.env.MERCADO_PAGO_WEBHOOK_SECRET ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY || adminEmails().length === 0) {
    return respond(res, 200, { allowed: true, configured: false, admin: false, free: true, expiresAt: null })
  }
  let supabase
  try { supabase = db() } catch (e) { return respond(res, 503, { error: e instanceof Error ? e.message : 'Configuração incompleta.' }) }

  if (req.method === 'GET') {
    if (isAdmin) return respond(res, 200, { allowed: true, configured: true, admin: true, free: true, expiresAt: null })
    const free = await supabase.from('menuhub_acessos_gratis').select('email').eq('email', email).maybeSingle()
    if (free.error) return respond(res, 503, { error: 'Execute a migração de cobrança do Menuhub no Supabase.' })
    if (free.data) return respond(res, 200, { allowed: true, configured: true, admin: false, free: true, expiresAt: null })
    const sub = await supabase.from('menuhub_assinaturas').select('vence_em').eq('usuario_id', user.id).maybeSingle()
    if (sub.error) return respond(res, 503, { error: 'Execute a migração de cobrança do Menuhub no Supabase.' })
    const expiresAt = sub.data?.vence_em ?? null
    const allowed = Boolean(expiresAt && Date.parse(expiresAt) > Date.now())
    return respond(res, 200, { allowed, configured: true, admin: false, free: false, expiresAt })
  }

  const body = req.body || {}
  if (body.action === 'checkout') {
    const token = process.env.MERCADO_PAGO_ACCESS_TOKEN
    if (!token) return respond(res, 503, { error: 'O pagamento ainda está em configuração. Falta o token seguro do Mercado Pago na Vercel.' })
    const baseUrl = process.env.MENUHUB_PUBLIC_URL || 'https://fb3d2ymenu.com.br'
    const preference = {
      items: [{ id: 'menuhub-30-dias', title: 'Menuhub — acesso por 30 dias', description: 'Assinatura de acesso ao Menuhub por 30 dias', quantity: 1, currency_id: 'BRL', unit_price: 20 }],
      external_reference: user.id,
      notification_url: baseUrl.replace(/\/$/, '') + '/api/mercadopago-webhook',
      back_urls: { success: baseUrl + '/admin?pagamento=sucesso', pending: baseUrl + '/admin?pagamento=pendente', failure: baseUrl + '/admin?pagamento=falhou' },
      auto_return: 'approved',
      statement_descriptor: 'MENUHUB'
    }
    const response = await fetch('https://api.mercadopago.com/checkout/preferences', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(preference) })
    const result = await response.json() as { init_point?: string; sandbox_init_point?: string; message?: string }
    if (!response.ok || !result.init_point) return respond(res, 502, { error: 'O Mercado Pago não conseguiu criar o checkout. Confira as credenciais de produção.' })
    return respond(res, 200, { checkoutUrl: result.init_point })
  }

  if (body.action === 'grant-free' || body.action === 'revoke-free') {
    if (!isAdmin) return respond(res, 403, { error: 'Somente o administrador pode gerenciar acessos gratuitos.' })
    const targetEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail) || targetEmail.length > 254) return respond(res, 400, { error: 'Informe um e-mail válido.' })
    if (adminEmails().includes(targetEmail)) return respond(res, 400, { error: 'O administrador já tem acesso permanente.' })
    if (body.action === 'grant-free') {
      const result = await supabase.from('menuhub_acessos_gratis').upsert({ email: targetEmail, criado_por: user.id }, { onConflict: 'email' })
      if (result.error) return respond(res, 503, { error: 'Não foi possível salvar o acesso gratuito. Confira se a migração foi executada.' })
    } else {
      const result = await supabase.from('menuhub_acessos_gratis').delete().eq('email', targetEmail)
      if (result.error) return respond(res, 503, { error: 'Não foi possível remover o acesso gratuito.' })
    }
    return respond(res, 200, { ok: true })
  }
  return respond(res, 400, { error: 'Ação inválida.' })
}
