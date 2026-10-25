import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'node:crypto'

type Req = { method?: string; headers: Record<string, string | string[] | undefined>; body?: any; query?: Record<string, string | string[] | undefined> }
type Res = { status(code: number): Res; json(body: unknown): void; setHeader(name: string, value: string): void }
const respond = (res: Res, code: number, body: unknown) => res.status(code).json(body)

function validSignature(req: Req, dataId: string, secret: string) {
  const signature = req.headers['x-signature']
  const requestId = req.headers['x-request-id']
  if (typeof signature !== 'string' || typeof requestId !== 'string') return false
  const fields = Object.fromEntries(signature.split(',').map((part: string) => { const [k, ...v] = part.trim().split('='); return [k, v.join('=')] }))
  if (!fields.ts || !fields.v1) return false
  const manifest = 'id:' + dataId.toLowerCase() + ';request-id:' + requestId + ';ts:' + fields.ts + ';'
  const expected = createHmac('sha256', secret).update(manifest).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(fields.v1)
  return a.length === b.length && timingSafeEqual(a, b)
}
export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') return respond(res, 405, { error: 'Método não permitido.' })
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!token || !secret || !url || !serviceKey) return respond(res, 503, { error: 'Webhook não configurado.' })
  const rawId = req.body?.data?.id ?? req.query?.['data.id'] ?? req.query?.id
  const paymentId = String(rawId ?? '')
  if (!/^\d+$/.test(paymentId)) return respond(res, 400, { error: 'Identificador de pagamento inválido.' })
  if (!validSignature(req, paymentId, secret)) return respond(res, 401, { error: 'Assinatura do webhook inválida.' })
  const paymentResponse = await fetch('https://api.mercadopago.com/v1/payments/' + encodeURIComponent(paymentId), { headers: { Authorization: 'Bearer ' + token } })
  if (!paymentResponse.ok) return respond(res, 502, { error: 'Não foi possível confirmar o pagamento no Mercado Pago.' })
  const payment = await paymentResponse.json() as { id?: number; status?: string; external_reference?: string; transaction_amount?: number; currency_id?: string }
  if (payment.status !== 'approved') return respond(res, 200, { received: true, ignored: true })
  if (!payment.external_reference || !/^\d+(\.\d{1,2})?$/.test(String(payment.transaction_amount)) || Number(payment.transaction_amount) !== 20 || payment.currency_id !== 'BRL') return respond(res, 200, { received: true, ignored: true })
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await supabase.rpc('menuhub_registrar_pagamento', { p_pagamento_id: String(payment.id ?? paymentId), p_usuario_id: payment.external_reference, p_valor: Number(payment.transaction_amount) })
  if (error) return respond(res, 500, { error: 'Não foi possível registrar o pagamento aprovado.' })
  return respond(res, 200, { received: true })
}
