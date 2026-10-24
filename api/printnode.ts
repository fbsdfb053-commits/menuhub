type VercelRequest = { method?: string; headers: { authorization?: string }; body?: unknown }
type VercelResponse = { status(code: number): VercelResponse; json(body: unknown): void }
import { createClient } from '@supabase/supabase-js'

type Body = {
  action?: 'printers' | 'print'
  restaurantId?: number
  printerId?: number
  content?: string
  title?: string
}

function respond(res: VercelResponse, status: number, body: unknown) {
  res.status(status).json(body)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return respond(res, 405, { error: 'Método não permitido.' })

  const apiKey = process.env.PRINTNODE_API_KEY
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!apiKey || !supabaseUrl || !supabaseAnonKey) {
    return respond(res, 500, { error: 'Configure PRINTNODE_API_KEY, SUPABASE_URL e SUPABASE_ANON_KEY nas variáveis da Vercel.' })
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) return respond(res, 401, { error: 'Sessão não encontrada. Entre novamente no Menuhub.' })

  // Validate the user's access token through Supabase Auth REST API.
  // This avoids SDK-version differences in auth.getUser typings.
  const authResponse = await fetch(supabaseUrl.replace(/\/$/, '') + '/auth/v1/user', {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: 'Bearer ' + token,
    },
  })
  if (!authResponse.ok) return respond(res, 401, { error: 'Sessão inválida. Entre novamente no Menuhub.' })
  const userData = await authResponse.json() as { id?: string }
  if (!userData.id) return respond(res, 401, { error: 'Sessão inválida. Entre novamente no Menuhub.' })

  const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: 'Bearer ' + token } }, auth: { persistSession: false, autoRefreshToken: false } })
  const body = (req.body || {}) as Body
  if (body.action === 'print') {
    if (!Number.isInteger(body.restaurantId) || !Number.isInteger(body.printerId) || typeof body.content !== 'string' || !body.content.trim()) {
      return respond(res, 400, { error: 'Dados de impressão incompletos.' })
    }
    const { data: restaurant, error: restaurantError } = await supabase
      .from('empresas')
      .select('id')
      .eq('id', body.restaurantId)
      .eq('dono_id', userData.id)
      .maybeSingle()
    if (restaurantError || !restaurant) return respond(res, 403, { error: 'Você não tem permissão para imprimir neste restaurante.' })

    const payload = {
      printerId: body.printerId,
      contentType: 'raw_base64',
      content: Buffer.from(body.content, 'utf8').toString('base64'),
      title: body.title || 'Menuhub - comanda',
      source: 'Menuhub',
    }
    const printResponse = await fetch('https://api.printnode.com/printjobs', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(apiKey + ':').toString('base64'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const result = await printResponse.text()
    if (!printResponse.ok) return respond(res, 502, { error: 'PrintNode recusou a impressão: ' + result.slice(0, 500) })
    return respond(res, 200, { ok: true, jobId: result })
  }

  if (body.action === 'printers') {
    const printerResponse = await fetch('https://api.printnode.com/printers', {
      headers: { Authorization: 'Basic ' + Buffer.from(apiKey + ':').toString('base64') },
    })
    const result = await printerResponse.text()
    if (!printerResponse.ok) return respond(res, 502, { error: 'Não foi possível consultar as impressoras no PrintNode: ' + result.slice(0, 500) })
    let printers: Array<{ id: number; name: string; computer?: { name?: string } }> = []
    try { printers = JSON.parse(result) } catch { return respond(res, 502, { error: 'Resposta inválida do PrintNode.' }) }
    return respond(res, 200, { printers: printers.map(p => ({ id: p.id, name: p.name, computer: p.computer?.name || '' })) })
  }

  return respond(res, 400, { error: 'Ação inválida.' })
}
