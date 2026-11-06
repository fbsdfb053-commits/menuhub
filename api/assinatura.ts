import { createClient } from '@supabase/supabase-js'

type Req = { method?: string; headers: { authorization?: string }; body?: unknown }
type Res = { status(code: number): Res; json(body: unknown): void }

const json = (res: Res, status: number, body: unknown) => res.status(status).json(body)
const url = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const anon = () => process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
const service = () => process.env.SUPABASE_SERVICE_ROLE_KEY || ''

async function userFrom(req: Req) {
  const authorization = (req.headers.authorization || '').trim()
  const token = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : authorization
  if (!token || !url() || !anon()) return null
  const response = await fetch((url().endsWith('/') ? url().slice(0, -1) : url()) + '/auth/v1/user', {
    headers: { apikey: anon(), Authorization: 'Bearer ' + token }
  })
  if (!response.ok) return null
  return await response.json() as { id: string; email?: string }
}

export default async function handler(req: Req, res: Res) {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return json(res, 405, { error: 'Método não permitido.' })
    }
    if (!url() || !anon() || !service()) {
      return json(res, 500, { error: 'Falta configurar as variáveis do Supabase na Vercel.' })
    }

    const user = await userFrom(req)
    if (!user) return json(res, 401, { error: 'Entre novamente na sua conta.' })

    const db = createClient(url(), service(), {
      auth: { persistSession: false, autoRefreshToken: false }
    })
    const email = (user.email || '').trim().toLowerCase()

    const [free, member, subscription] = await Promise.all([
      db.from('assinaturas_gratuitas').select('email').eq('email', email).maybeSingle(),
      db.from('empresa_usuarios').select('empresa_id').eq('user_id', user.id).limit(1),
      db.from('assinaturas').select('status,expira_em,mp_payment_id').eq('user_id', user.id).maybeSingle()
    ])

    if (free.error) return json(res, 500, { error: 'Não foi possível consultar o acesso gratuito.' })
    if (member.error) return json(res, 500, { error: 'Não foi possível verificar o acesso compartilhado.' })
    if (subscription.error) return json(res, 500, { error: 'Não foi possível consultar a assinatura.' })

    const isFree = Boolean(free.data)
    const isMember = Boolean(member.data?.length)
    const sub = subscription.data
    const isSubscriptionActive = sub?.status === 'ativa' && Boolean(sub.expira_em) &&
      new Date(sub.expira_em as string).getTime() > Date.now()
    const active = isFree || isMember || isSubscriptionActive

    if (req.method === 'GET') {
      return json(res, 200, {
        active,
        free: isFree || isMember,
        expiresAt: sub?.expira_em || null,
        status: isMember ? 'acesso_compartilhado' : isFree ? 'gratuita' : active ? 'ativa' : 'inativa'
      })
    }

    if (isFree || isMember) {
      return json(res, 200, { active: true, free: true, status: isMember ? 'acesso_compartilhado' : 'gratuita' })
    }

    const mp = process.env.MERCADO_PAGO_ACCESS_TOKEN
    if (!mp) return json(res, 500, { error: 'Configure MERCADO_PAGO_ACCESS_TOKEN na Vercel.' })

    const paymentResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + mp,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': crypto.randomUUID()
      },
      body: JSON.stringify({
        transaction_amount: 50,
        description: 'FB3D2Y Menu — assinatura por 30 dias',
        payment_method_id: 'pix',
        payer: { email: user.email || 'cliente@fb3d2ymenu.com.br' },
        external_reference: user.id,
        notification_url: 'https://fb3d2ymenu.com.br/api/mercadopago-webhook',
        date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString()
      })
    })

    const paymentText = await paymentResponse.text()
    let payment: {
      id?: number; status?: string; message?: string;
      point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string } }
    }
    try {
      payment = JSON.parse(paymentText)
    } catch {
      return json(res, 502, { error: 'O Mercado Pago retornou uma resposta inválida. Tente novamente.' })
    }

    if (!paymentResponse.ok || !payment.id) {
      return json(res, 502, { error: payment.message || 'O Mercado Pago não conseguiu gerar o Pix.' })
    }

    const saved = await db.from('pagamentos_assinatura').insert({
      payment_id: String(payment.id),
      user_id: user.id,
      status: payment.status || 'pending',
      valor: 50
    })
    if (saved.error) {
      return json(res, 500, { error: 'O Pix foi criado, mas não foi possível registrar a cobrança. Entre em contato com o suporte.' })
    }

    return json(res, 200, {
      paymentId: payment.id,
      qrCode: payment.point_of_interaction?.transaction_data?.qr_code || '',
      qrCodeBase64: payment.point_of_interaction?.transaction_data?.qr_code_base64 || '',
      ticketUrl: payment.point_of_interaction?.transaction_data?.ticket_url || ''
    })
  } catch (error) {
    console.error('Erro na API de assinatura:', error)
    return json(res, 500, { error: 'Falha interna ao verificar o acesso. Atualize a página e tente novamente.' })
  }
}
