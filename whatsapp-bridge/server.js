import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import pino from 'pino'
import QRCode from 'qrcode'
import { createClient } from '@supabase/supabase-js'
import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys'

const app = express()

// Allow the Menuhub Vercel frontend to call this bridge from the browser.
// Authorization and JSON requests trigger a CORS preflight (OPTIONS).
const allowedOrigins = new Set([
  'https://menuhub-git-teste-menuhub-fb3d2y.vercel.app',
  'https://menuhub-one.vercel.app',
  'https://fb3d2ymenu.com.br',
  'https://www.fb3d2ymenu.com.br'
])
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin && (allowedOrigins.has(origin) || /^https:\/\/menuhub-[a-z0-9-]+-fb3d2y\.vercel\.app$/.test(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})
app.use(express.json({ limit: '32kb' }))
const PORT = Number(process.env.PORT || 3001)
const AUTH_DIR = process.env.WHATSAPP_AUTH_DIR || '/data/whatsapp-sessions'
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for the same Supabase project used by Menuhub Preview.')
  process.exit(1)
}
fs.mkdirSync(AUTH_DIR, { recursive: true })
// Use the same server-side Supabase client for token validation and database access.
// This avoids a second, potentially mismatched anon key causing false session failures.
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
const sessions = new Map()
const processedMessages = new Map()
const senderReplyTimes = new Map()
const log = pino({ level: process.env.LOG_LEVEL || 'info' })

function messageText(message) {
  let content = message
  for (let i = 0; i < 4 && content; i++) {
    if (content.ephemeralMessage?.message) content = content.ephemeralMessage.message
    else if (content.viewOnceMessage?.message) content = content.viewOnceMessage.message
    else if (content.viewOnceMessageV2?.message) content = content.viewOnceMessageV2.message
    else break
  }
  return String(
    content?.conversation ||
    content?.extendedTextMessage?.text ||
    content?.imageMessage?.caption ||
    content?.videoMessage?.caption ||
    content?.documentMessage?.caption ||
    content?.buttonsResponseMessage?.selectedDisplayText ||
    content?.listResponseMessage?.title ||
    content?.templateButtonReplyMessage?.selectedDisplayText ||
    ''
  ).trim()
}

function chooseReply(text, config) {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (/\b(cardapio|menu|comida|pratos|opcoes|opcoes do menu)\b/.test(normalized)) return config.faqMenu
  if (/\b(horario|horarios|abre|aberto|fecha|fechado|funciona|funcionamento)\b/.test(normalized)) return config.faqHours
  if (/\b(pagamento|pagar|pix|cartao|dinheiro|credito|debito)\b/.test(normalized)) return config.faqPayment
  return config.welcomeMessage
}

async function handleIncomingMessage(restaurantId, sock, message) {
  const key = message?.key
  const remoteJid = key?.remoteJid
  const messageId = key?.id
  if (!remoteJid || !messageId || key.fromMe || remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast' || remoteJid.endsWith('@broadcast')) return

  const text = messageText(message.message)
  if (!text) return

  const now = Date.now()
  for (const [id, timestamp] of processedMessages) if (now - timestamp > 10 * 60 * 1000) processedMessages.delete(id)
  if (processedMessages.has(messageId)) return
  processedMessages.set(messageId, now)

  const senderKey = restaurantId + ':' + remoteJid
  if (now - (senderReplyTimes.get(senderKey) || 0) < 1500) return

  try {
    const { data, error } = await admin
      .from('whatsapp_bot_config')
      .select('config')
      .eq('empresa_id', Number(restaurantId))
      .maybeSingle()
    if (error) throw error
    const config = data?.config
    if (!config || config.enabled !== true) return

    const reply = chooseReply(text, config)
    if (typeof reply !== 'string' || !reply.trim()) return
    senderReplyTimes.set(senderKey, now)
    await sock.sendMessage(remoteJid, { text: reply.trim().slice(0, 4000) })
    log.info({ restaurantId, messageId, topic: reply === config.faqMenu ? 'menu' : reply === config.faqHours ? 'hours' : reply === config.faqPayment ? 'payment' : 'welcome' }, 'Automatic WhatsApp reply sent')
  } catch (err) {
    log.error({ err, restaurantId, messageId }, 'Automatic WhatsApp reply failed')
  }
}



function normalizeOrderStatus(value) {
  return String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().trim()
}
function customerJid(value) {
  let digits = String(value || '').replace(/\\D/g, '')
  if (digits.length === 10 || digits.length === 11) digits = '55' + digits
  if (digits.length < 12 || digits.length > 15) return null
  return digits + '@s.whatsapp.net'
}
function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function receiptMessage(order, items) {
  const firstName = String(order.cliente_nome || 'cliente').trim().split(/\\s+/)[0] || 'cliente'
  const lines = [
    '🧾 *Pedido recebido no Menuhub*',
    'Olá, ' + firstName + '!',
    'Pedido nº *' + order.id + '*',
    '',
    '*Resumo do pedido:*',
    ...(items || []).map(item => '• ' + Number(item.quantidade || 1) + 'x ' + String(item.nome_produto || 'Item') + ' — ' + money(Number(item.preco_unitario || 0) * Number(item.quantidade || 1))),
    '',
    '*Total: ' + money(order.total) + '*',
    'Tipo: ' + String(order.tipo_entrega || 'Não informado'),
    order.forma_pagamento ? 'Pagamento: ' + String(order.forma_pagamento) : '',
    order.tipo_entrega === 'Entrega' && order.endereco_entrega ? 'Endereço: ' + String(order.endereco_entrega) : '',
    order.observacoes ? 'Observações: ' + String(order.observacoes) : '',
    '',
    'Enviaremos novas mensagens quando o status do pedido mudar.'
  ].filter(Boolean)
  return lines.join('\\n').slice(0, 4000)
}
function orderStatusMessage(status, order, config) {
  const normalized = normalizeOrderStatus(status)
  const firstName = String(order.cliente_nome || 'cliente').trim().split(/\\s+/)[0] || 'cliente'
  const orderNumber = String(order.id)
  const template = (value) => typeof value === 'string' ? value.replace(/\\{nome\\}/g, firstName).replace(/\\{pedido\\}/g, orderNumber) : ''
  if (normalized === 'aceito' || normalized === 'aceita') return config.statusAccepted !== false ? template(config.messageAccepted || 'Olá, {nome}! Seu pedido #{pedido} foi aceito pelo restaurante. 👍') : null
  if (normalized === 'preparando' || normalized === 'em preparo') return config.statusPreparing !== false ? template(config.messagePreparing || 'Olá, {nome}! Seu pedido #{pedido} está sendo preparado. 🍳') : null
  if (normalized === 'pronto' || normalized === 'retirada disponivel' || normalized === 'saiu para entrega') {
    if (config.statusReady === false) return null
    if (normalizeOrderStatus(order.tipo_entrega) === 'entrega') return template(config.messageOutForDelivery || 'Olá, {nome}! Seu pedido #{pedido} saiu para entrega. 🛵')
    return template(config.messageReady || 'Olá, {nome}! Seu pedido #{pedido} está pronto para retirada.')
  }
  // Finalizado/concluído is an internal status and deliberately sends no customer message.
  return null
}
const knownOrderStatuses = new Map()
let orderPollingInitialized = false
let pollingOrders = false
async function pollOrderNotifications() {
  if (pollingOrders) return
  pollingOrders = true
  try {
    const { data: configs, error: configError } = await admin.from('whatsapp_bot_config').select('empresa_id,config')
    if (configError) throw configError
    const configByRestaurant = new Map((configs || []).map(row => [String(row.empresa_id), row.config || {}]))
    const { data: orders, error: orderError } = await admin
      .from('pedidos')
      .select('id,empresa_id,cliente_nome,cliente_whatsapp,total,status,tipo_entrega,endereco_entrega,forma_pagamento,observacoes,criado_em')
      .order('criado_em', { ascending: false })
      .limit(2000)
    if (orderError) throw orderError

    for (const order of [...(orders || [])].reverse()) {
      const key = String(order.empresa_id) + ':' + String(order.id)
      const status = normalizeOrderStatus(order.status)
      const previous = knownOrderStatuses.get(key)
      if (!orderPollingInitialized) {
        knownOrderStatuses.set(key, status)
        continue
      }
      if (previous === status) continue

      // Record the new state only after attempting delivery, so temporary connection issues can retry.
      const config = configByRestaurant.get(String(order.empresa_id))
      const state = sessions.get(String(order.empresa_id))
      if (!config || config.enabled !== true || !state || state.status !== 'connected' || !state.socket) continue
      const jid = customerJid(order.cliente_whatsapp)
      if (!jid) {
        log.warn({ orderId: order.id, restaurantId: order.empresa_id }, 'Order notification skipped: invalid customer WhatsApp number')
        knownOrderStatuses.set(key, status)
        continue
      }
      try {
        if (previous === undefined) {
          const { data: items, error: itemsError } = await admin
            .from('itens_pedido')
            .select('nome_produto,quantidade,preco_unitario')
            .eq('pedido_id', order.id)
          if (itemsError) throw itemsError
          await state.socket.sendMessage(jid, { text: receiptMessage(order, items || []) })
          log.info({ restaurantId: order.empresa_id, orderId: order.id }, 'WhatsApp order receipt sent')
        }
        if (status !== 'novo') {
          const template = orderStatusMessage(order.status, order, config)
          if (typeof template === 'string' && template.trim()) {
            await state.socket.sendMessage(jid, { text: template.trim().slice(0, 4000) })
            log.info({ restaurantId: order.empresa_id, orderId: order.id, status: order.status }, 'WhatsApp order status notification sent')
          }
        }
        knownOrderStatuses.set(key, status)
      } catch (err) {
        log.error({ err, restaurantId: order.empresa_id, orderId: order.id, status: order.status }, 'WhatsApp order notification failed')
      }
    }
    orderPollingInitialized = true
  } catch (err) {
    log.error({ err }, 'Order notification polling failed')
  } finally {
    pollingOrders = false
  }
}

function safeId(value) {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id < 1) return null
  return String(id)
}
async function ownerFor(req, restaurantId) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return { ok: false, status: 401, error: 'Sua sessão do Menuhub não foi enviada. Saia da conta e entre novamente.' }

  let userData
  try {
    const result = await admin.auth.getUser(token)
    if (result.error || !result.data?.user) {
      log.warn({ authError: result.error?.message || 'user_not_found' }, 'Menuhub bearer token rejected')
      return { ok: false, status: 401, error: 'A sessão do Menuhub expirou ou não corresponde ao projeto Supabase configurado no servidor. Entre novamente; se persistir, confira SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no Render.' }
    }
    userData = result.data.user
  } catch (err) {
    log.error({ err }, 'Menuhub token validation failed')
    return { ok: false, status: 503, error: 'Não foi possível validar sua sessão no Supabase. Confira a configuração do servidor.' }
  }

  const { data: restaurant, error } = await admin.from('empresas').select('id,dono_id').eq('id', Number(restaurantId)).maybeSingle()
  if (error) {
    log.error({ error: error.message, restaurantId }, 'Restaurant ownership lookup failed')
    return { ok: false, status: 503, error: 'O servidor não conseguiu consultar o restaurante no Supabase. Confirme se as credenciais do Render pertencem ao banco de teste correto.' }
  }
  if (!restaurant) return { ok: false, status: 404, error: 'Restaurante não encontrado no projeto Supabase configurado no servidor.' }
  if (String(restaurant.dono_id) !== String(userData.id)) {
    log.warn({ restaurantId, userId: userData.id, ownerId: restaurant.dono_id }, 'Restaurant ownership check failed')
    return { ok: false, status: 403, error: 'Este restaurante não pertence à conta conectada. Selecione o restaurante correto no Menuhub.' }
  }
  return { ok: true, user: userData }
}
function sessionPath(id) { return path.join(AUTH_DIR, id) }
function stateFor(id) {
  if (!sessions.has(id)) sessions.set(id, { status: 'disconnected', qr: null, qrDataUrl: null, phone: null, socket: null, starting: false, lastError: null })
  return sessions.get(id)
}
async function startSession(id) {
  const state = stateFor(id)
  if (state.starting || state.status === 'connected') return state
  state.starting = true
  state.status = 'connecting'
  state.qr = null
  state.qrDataUrl = null
  state.lastError = null
  try {
    const { state: authState, saveCreds } = await useMultiFileAuthState(sessionPath(id))
    let version
    try { ({ version } = await fetchLatestBaileysVersion()) } catch { version = undefined }
    const sock = makeWASocket({
      ...(version ? { version } : {}),
      auth: authState,
      logger: log.child({ restaurantId: id }),
      printQRInTerminal: false,
      browser: ['Menuhub', 'Chrome', '1.0.0'],
      syncFullHistory: false,
      markOnlineOnConnect: false
    })
    state.socket = sock
    sock.ev.on('creds.update', saveCreds)
    sock.ev.on('messages.upsert', async event => {
      if (event.type !== 'notify') return
      for (const message of event.messages || []) {
        await handleIncomingMessage(id, sock, message)
      }
    })
    sock.ev.on('connection.update', async update => {
      if (update.qr) {
        state.qr = update.qr
        try { state.qrDataUrl = await QRCode.toDataURL(update.qr, { width: 280, margin: 2 }) } catch { state.qrDataUrl = null }
        state.status = 'qr'
      }
      if (update.connection === 'open') {
        state.status = 'connected'
        state.phone = sock.user?.id?.split(':')[0] || null
        state.qr = null
        state.qrDataUrl = null
        state.starting = false
        state.lastError = null
      }
      if (update.connection === 'close') {
        state.starting = false
        state.socket = null
        const code = update.lastDisconnect?.error?.output?.statusCode
        state.status = code === DisconnectReason.loggedOut ? 'logged_out' : 'disconnected'
        state.qr = null
        state.qrDataUrl = null
        if (code !== DisconnectReason.loggedOut) {
          setTimeout(() => { if (state.status === 'disconnected') void startSession(id).catch(err => log.error({ err }, 'Reconnect failed')) }, 3000)
        }
      }
    })
    state.starting = false
  } catch (err) {
    state.starting = false
    state.status = 'error'
    state.lastError = 'Não foi possível iniciar a sessão.'
    log.error({ err, restaurantId: id }, 'WhatsApp session start failed')
  }
  return state
}
app.get('/health', (_req, res) => res.json({ ok: true, service: 'menuhub-whatsapp-bridge' }))
app.use('/api/whatsapp/:restaurantId', async (req, res, next) => {
  const id = safeId(req.params.restaurantId)
  if (!id) return res.status(400).json({ error: 'Restaurante inválido.' })
  try {
    const authorization = await ownerFor(req, id)
    if (!authorization.ok) return res.status(authorization.status).json({ error: authorization.error })
    req.restaurantId = id
    next()
  } catch (err) {
    log.error({ err, restaurantId: id }, 'Unexpected WhatsApp authorization error')
    return res.status(500).json({ error: 'Erro inesperado ao validar o acesso. Consulte os logs do serviço no Render.' })
  }
})
app.post('/api/whatsapp/:restaurantId/connect', async (req, res) => {
  const id = req.restaurantId
  const state = stateFor(id)
  if (state.status === 'logged_out') {
    fs.rmSync(sessionPath(id), { recursive: true, force: true })
    sessions.set(id, { status: 'disconnected', qr: null, qrDataUrl: null, phone: null, socket: null, starting: false, lastError: null })
  }
  const nextState = await startSession(id)
  res.status(202).json({ status: nextState.status })
})
app.get('/api/whatsapp/:restaurantId/status', async (req, res) => {
  const id = req.restaurantId
  let state = stateFor(id)
  if (!state.socket && state.status === 'disconnected' && fs.existsSync(path.join(sessionPath(id), 'creds.json'))) {
    void startSession(id)
    state = stateFor(id)
  }
  res.json({ status: state.status, phone: state.phone, qrDataUrl: state.qrDataUrl, error: state.lastError })
})
app.post('/api/whatsapp/:restaurantId/logout', async (req, res) => {
  const id = req.restaurantId
  const state = stateFor(id)
  try { await state.socket?.logout() } catch (err) { log.warn({ err }, 'WhatsApp logout failed') }
  try { state.socket?.end(undefined) } catch {}
  fs.rmSync(sessionPath(id), { recursive: true, force: true })
  sessions.set(id, { status: 'disconnected', qr: null, qrDataUrl: null, phone: null, socket: null, starting: false, lastError: null })
  res.json({ status: 'disconnected' })
})
setInterval(() => { void pollOrderNotifications() }, 5000)
void pollOrderNotifications()
app.listen(PORT, '0.0.0.0', () => log.info({ port: PORT }, 'Menuhub WhatsApp bridge listening'))