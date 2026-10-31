import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import pino from 'pino'
import QRCode from 'qrcode'
import { createClient } from '@supabase/supabase-js'
import { generateAiReply } from './openai-replies.js'
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
const welcomedContacts = new Map()
const humanHandoffTimes = new Map()
const HANDOFF_MARKER = '\u2063HANDOFF\u2063'
const welcomeStateFile = path.join(AUTH_DIR, 'welcomed-contacts.json')
const aiUsageFile = path.join(AUTH_DIR, 'ai-usage.json')
const AI_DAILY_CONTACT_LIMIT = 15
const AI_DAILY_RESTAURANT_LIMIT = 200
function fortalezaDayKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
let aiUsageState = { date: fortalezaDayKey(), restaurants: {}, contacts: {} }
try {
  const savedUsage = JSON.parse(fs.readFileSync(aiUsageFile, 'utf8'))
  if (savedUsage?.date === fortalezaDayKey()) {
    aiUsageState = {
      date: savedUsage.date,
      restaurants: savedUsage.restaurants || {},
      contacts: savedUsage.contacts || {}
    }
  }
} catch {}

function restaurantIsOpenForAi(restaurant) {
  if (restaurant?.aceita_pedidos === false) return false
  if (typeof restaurant?.status_loja_manual === 'boolean') return restaurant.status_loja_manual
  const schedule = restaurant?.horario_funcionamento
  if (!schedule || typeof schedule !== 'object' || !Object.keys(schedule).length) return false
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Fortaleza', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date())
  const weekday = parts.find(part => part.type === 'weekday')?.value
  const hour = Number(parts.find(part => part.type === 'hour')?.value)
  const minute = Number(parts.find(part => part.type === 'minute')?.value)
  const day = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 })[weekday]
  const current = hour * 60 + minute
  const today = schedule[String(day)]
  if (today && !today.closed && today.open && today.close) {
    const [oh, om] = today.open.split(':').map(Number)
    const [ch, cm] = today.close.split(':').map(Number)
    const opening = oh * 60 + om
    const closing = ch * 60 + cm
    if (closing > opening && current >= opening && current < closing) return true
    if (closing <= opening && current >= opening) return true
  }
  const yesterday = schedule[String((day + 6) % 7)]
  if (yesterday && !yesterday.closed && yesterday.open && yesterday.close) {
    const [oh, om] = yesterday.open.split(':').map(Number)
    const [ch, cm] = yesterday.close.split(':').map(Number)
    if (ch * 60 + cm <= oh * 60 + om && current < ch * 60 + cm) return true
  }
  return false
}

function reserveAiUsage(restaurantId, senderKey, restaurant) {
  if (!process.env.OPENAI_API_KEY) return { allowed: false, reason: 'unavailable' }
  if (!restaurantIsOpenForAi(restaurant)) return { allowed: false, reason: 'closed' }
  const today = fortalezaDayKey()
  if (aiUsageState.date !== today) aiUsageState = { date: today, restaurants: {}, contacts: {} }
  const restaurantKey = String(restaurantId)
  const contactKey = senderKey
  const restaurantCount = Number(aiUsageState.restaurants[restaurantKey] || 0)
  const contactCount = Number(aiUsageState.contacts[contactKey] || 0)
  if (restaurantCount >= AI_DAILY_RESTAURANT_LIMIT) return { allowed: false, reason: 'restaurant_limit' }
  if (contactCount >= AI_DAILY_CONTACT_LIMIT) return { allowed: false, reason: 'contact_limit' }
  aiUsageState.restaurants[restaurantKey] = restaurantCount + 1
  aiUsageState.contacts[contactKey] = contactCount + 1
  try {
    const tempFile = aiUsageFile + '.tmp'
    fs.writeFileSync(tempFile, JSON.stringify(aiUsageState), { mode: 0o600 })
    fs.renameSync(tempFile, aiUsageFile)
  } catch (saveError) {
    log.warn({ message: String(saveError?.message || saveError) }, 'Could not persist AI usage counters')
  }
  return { allowed: true, restaurantCount: restaurantCount + 1, contactCount: contactCount + 1 }
}
try {
  const savedWelcomes = JSON.parse(fs.readFileSync(welcomeStateFile, 'utf8'))
  for (const [key, timestamp] of Object.entries(savedWelcomes)) {
    if (Date.now() - Number(timestamp) < 30 * 24 * 60 * 60 * 1000) welcomedContacts.set(key, Number(timestamp))
  }
} catch {}
const log = pino({ level: process.env.LOG_LEVEL || 'info' })

function unwrapMessageContent(message) {
  let content = message
  for (let i = 0; i < 4 && content; i++) {
    if (content.ephemeralMessage?.message) content = content.ephemeralMessage.message
    else if (content.viewOnceMessage?.message) content = content.viewOnceMessage.message
    else if (content.viewOnceMessageV2?.message) content = content.viewOnceMessageV2.message
    else break
  }
  return content || {}
}

function isAudioMessage(message) {
  const content = unwrapMessageContent(message)
  return Boolean(content?.audioMessage || content?.ptvMessage?.videoMessage?.audioMessage)
}

function messageText(message) {
  const content = unwrapMessageContent(message)
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

function isMenuRequest(text) {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return /\b(cardapio|menu|comida|pratos|opcoes|opcoes do menu)\b/.test(normalized)
}

function isMenuLinkRequest(text) {
  const normalized = normalizeText(text)
  return isMenuRequest(text) && /\b(link|url|endereco)\b/.test(normalized)
}

async function buildMenuReply(restaurantId, full = false) {
  const [restaurantResult, productsResult, categoriesResult] = await Promise.all([
    admin.from('empresas').select('nome').eq('id', Number(restaurantId)).maybeSingle(),
    admin.from('produtos').select('nome,preco,descricao,categoria_id,ordem').eq('empresa_id', Number(restaurantId)).eq('disponivel', true).order('ordem').order('nome'),
    admin.from('categorias').select('id,nome,ordem').eq('empresa_id', Number(restaurantId)).order('ordem').order('nome')
  ])
  if (restaurantResult.error) throw restaurantResult.error
  if (productsResult.error) throw productsResult.error
  if (categoriesResult.error) throw categoriesResult.error

  const restaurantName = restaurantResult.data?.nome || 'Cardápio'
  const availableProducts = productsResult.data || []
  if (!availableProducts.length) return `*${restaurantName}*\nNo momento, não há itens disponíveis no cardápio.`

  const categoryNames = new Map((categoriesResult.data || []).map(category => [category.id, category.nome]))
  const groups = new Map()
  for (const product of availableProducts) {
    const groupName = categoryNames.get(product.categoria_id) || 'Outros itens'
    if (!groups.has(groupName)) groups.set(groupName, [])
    groups.get(groupName).push(product)
  }

  if (!full) {
    const summary = [...groups.entries()].map(([name, items]) =>
      `• ${name} (${items.length} ${items.length === 1 ? 'opção' : 'opções'})`
    ).join('\n')
    return `Temos estas categorias no cardápio:\n${summary}\n\nQual delas você gostaria de conhecer?`
  }

  const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
  const lines = [`*${restaurantName}*`, '*Itens disponíveis no momento:*', '']
  let truncated = false
  for (const [groupName, products] of groups) {
    const groupLines = [`*${groupName}*`]
    for (const product of products) {
      let line = `• ${product.nome} — ${currency.format(Number(product.preco) || 0)}`
      if (product.descricao?.trim()) line += `\n  ${product.descricao.trim().slice(0, 120)}`
      groupLines.push(line)
    }
    const section = groupLines.join('\n') + '\n'
    if ((lines.join('\n') + '\n' + section).length > 3500) {
      lines.push('Para ver mais opções, peça uma categoria específica.')
      truncated = true
      break
    }
    lines.push(...groupLines, '')
  }
  if (truncated) log.info({ restaurantId }, 'Menu WhatsApp reply shortened to fit message limit')
  return lines.join('\n').trim().slice(0, 3900)
}


function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

function currentFortalezaDate() {
  const now = new Date()
  const options = { timeZone: 'America/Fortaleza' }
  const dateParts = new Intl.DateTimeFormat('pt-BR', { ...options, day: '2-digit', month: '2-digit', year: 'numeric' }).format(now)
  const weekday = new Intl.DateTimeFormat('pt-BR', { ...options, weekday: 'long' }).format(now)
  const time = new Intl.DateTimeFormat('pt-BR', { ...options, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now)
  return { dateParts, weekday, time }
}

function isTodayDateQuestion(text) {
  const normalized = normalizeText(text)
  return /\b(que dia e hoje|qual (o )?dia de hoje|hoje (e|nao e) (domingo|segunda|terca|quarta|quinta|sexta|sabado))\b/.test(normalized)
}

function isHoursQuestion(text) {
  return /\b(horario|horarios|abre|aberto|aberta|fecha|fechado|fechada|funciona|funcionamento)\b/.test(normalizeText(text))
}

function humanHelpMessage(_restaurant, reason) {
  return HANDOFF_MARKER + reason
}

function formatBusinessHours(restaurant) {
  const schedule = restaurant?.horario_funcionamento
  if (schedule && typeof schedule === 'object') {
    const days = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Fortaleza', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date())
    const weekday = parts.find(part => part.type === 'weekday')?.value
    const hour = Number(parts.find(part => part.type === 'hour')?.value)
    const minute = Number(parts.find(part => part.type === 'minute')?.value)
    const dayIndex = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 })[weekday]
    const today = schedule[String(dayIndex)]
    const lines = days.map((day, index) => {
      const item = schedule[String(index)]
      if (!item || item.closed) return '• ' + day + ': fechado'
      if (!item.open || !item.close) return '• ' + day + ': horário não informado'
      return '• ' + day + ': ' + item.open + ' às ' + item.close
    })
    let current = 'O horário de hoje não está cadastrado.'
    if (today?.closed) current = 'Hoje estamos fechados.'
    else if (today?.open && today?.close) {
      const currentMinutes = hour * 60 + minute
      const open = today.open.split(':').map(Number)
      const close = today.close.split(':').map(Number)
      const isOpen = currentMinutes >= open[0] * 60 + open[1] && currentMinutes < close[0] * 60 + close[1]
      current = isOpen ? 'Hoje estamos abertos até ' + today.close + '.' : 'Hoje nosso horário é das ' + today.open + ' às ' + today.close + '.'
    }
    if (typeof restaurant.status_loja_manual === 'boolean') current = restaurant.status_loja_manual ? 'A loja está marcada como aberta no momento.' : 'A loja está marcada como fechada no momento.'
    if (restaurant.aceita_pedidos === false) current += ' No momento, não estamos aceitando pedidos.'
    return 'Nosso funcionamento:\n' + current + '\n\n' + lines.join('\n')
  }
  if (restaurant?.horario?.trim()) return 'Nosso horário informado é: ' + restaurant.horario.trim() + '.'
  return null
}

async function buildIntelligentReply(restaurantId, text, config, senderKey) {
  const normalized = normalizeText(text)
  const [restaurantResult, productsResult, categoriesResult] = await Promise.all([
    admin.from('empresas').select('nome,slug,descricao,localizacao,endereco,cidade,estado,telefone_contato,instagram,whatsapp_contato,horario,horario_funcionamento,aceita_pedidos,status_loja_manual,config_entrega').eq('id', Number(restaurantId)).maybeSingle(),
    admin.from('produtos').select('id,nome,preco,descricao,categoria_id,disponivel,ordem').eq('empresa_id', Number(restaurantId)).order('ordem').order('nome'),
    admin.from('categorias').select('id,nome,ordem').eq('empresa_id', Number(restaurantId)).order('ordem').order('nome')
  ])
  if (restaurantResult.error) throw restaurantResult.error
  if (productsResult.error) throw productsResult.error
  if (categoriesResult.error) throw categoriesResult.error
  const restaurant = restaurantResult.data
  const products = productsResult.data || []
  const categories = categoriesResult.data || []
  const available = products.filter(product => product.disponivel === true)
  if (/^(oi|ola|bom dia|boa tarde|boa noite|opa|e ai)[!.,? ]*$/.test(normalized)) {
    return 'Olá! 😊 O que posso fazer por você hoje?'
  }
  const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

  // A apresentação é determinística para preservar o nome configurado, inclusive kanji.
  if (/(se apresente|quem e voce|qual seu nome|como voce se chama)/.test(normalized)) {
    const botName = String(config?.botName || '').trim() || 'assistente virtual'
    return 'Sou ' + botName + ', atendente do ' + (restaurant?.nome || 'nosso estabelecimento') + '. 🍣'
  }

  // Respostas objetivas são resolvidas no backend, nunca por inferência da IA.
  if (isMenuLinkRequest(text)) {
    const baseUrl = String(process.env.PUBLIC_MENU_BASE_URL || 'https://menuhub-one.vercel.app').replace(/\/$/, '')
    if (restaurant?.slug) return 'Claro! Aqui está o link do nosso cardápio 🍣\n' + baseUrl + '/menu/' + encodeURIComponent(restaurant.slug)
    return humanHelpMessage(restaurant, 'Não consegui localizar o endereço público do cardápio.')
  }

  if (isTodayDateQuestion(text)) {
    const current = currentFortalezaDate()
    return 'Hoje é ' + current.weekday + ', ' + current.dateParts + '.'
  }

  if (isHoursQuestion(text)) {
    return formatBusinessHours(restaurant) || humanHelpMessage(restaurant, 'Ainda não temos o horário cadastrado corretamente.')
  }

  if (/\b(atendente|atendimento humano|pessoa real|quero falar|falar com|recepcionista|gerente|responsavel|humano|uma pessoa|alguem da equipe|chamar a equipe)\b/.test(normalized)) {
    return humanHelpMessage(restaurant, 'Claro. Vou avisar nossa equipe para continuar o atendimento com você por aqui.')
  }
  if (/\b(horario|horarios|abre|aberto|aberta|fecha|fechado|fechada|funciona|funcionamento)\b/.test(normalized)) {
    return formatBusinessHours(restaurant) || humanHelpMessage(restaurant, 'Ainda não temos o horário cadastrado corretamente.')
  }
  if (/\b(como faco|onde faco|fazer meu pedido|fazer pedido|realizar pedido|pedir pelo site|pedir pelo link)\b/.test(normalized)) {
    const baseUrl = String(process.env.PUBLIC_MENU_BASE_URL || 'https://fb3d2ymenu.com.br').replace(/\/$/, '')
    if (restaurant?.slug) return 'É só acessar nosso cardápio, escolher o que deseja e finalizar o pedido por lá.\n' + baseUrl + '/menu/' + encodeURIComponent(restaurant.slug)
    return 'Você pode fazer seu pedido diretamente com nossa equipe por aqui.'
  }
  if (/\b(pagamento|pagar|pix|cartao|dinheiro|credito|debito|vale|forma de pagamento)\b/.test(normalized)) {
    return config.faqPayment?.trim() || humanHelpMessage(restaurant, 'Não encontrei as formas de pagamento cadastradas.')
  }
  if (/\b(taxa|frete|entrega|entregam|bairro|regiao|distancia|delivery)\b/.test(normalized)) {
    const options = Array.isArray(restaurant?.config_entrega) ? restaurant.config_entrega : []
    const regions = options.filter(option => !option.negotiate && Array.isArray(option.places) && option.places.length)
    const matched = regions.filter(option => option.places.some(place => {
      const normalizedPlace = normalizeText(place)
      return normalizedPlace.length >= 3 && (normalized.includes(normalizedPlace) || normalizedPlace.includes(normalized))
    }))
    if (matched.length) {
      const lines = matched.map(option => {
        const fee = currency.format(Number(option.fee) || 0)
        return '• ' + (option.name || 'Entrega') + ': ' + fee
      })
      return 'Atendemos sua região! Estas são as opções cadastradas:\n' + lines.join('\n') + '\nA taxa será confirmada no fechamento do pedido. 🍣'
    }
    if (regions.length) {
      const lines = regions.map(option => {
        const places = option.places.join(', ')
        return '• ' + (option.name || 'Região') + ' — ' + currency.format(Number(option.fee) || 0) + ': ' + places
      })
      const negotiated = options.find(option => option.negotiate)
      if (negotiated) lines.push('• ' + (negotiated.name || 'Outras regiões') + ': taxa a combinar')
      const asksList = /\b(quais|opcoes|opcao|regioes|bairros|localidades|onde|lista)\b/.test(normalized)
      if (asksList || !/\b(centro|bairro|rua|localidade|regiao|moro|fica|para)\b/.test(normalized)) {
        return 'Estas são nossas opções de entrega e respectivas taxas:\n' + lines.join('\n')
      }
      return humanHelpMessage(restaurant, 'Não identifiquei sua localidade nas regiões cadastradas. Vou chamar alguém da equipe para confirmar.')
    }
    return humanHelpMessage(restaurant, 'As opções de entrega ainda não estão cadastradas. Vou chamar alguém da equipe para confirmar.')
  }
  if (/\b(promocao|promocoes|oferta|ofertas|desconto|cupom|combo do dia)\b/.test(normalized)) {
    return humanHelpMessage(restaurant, 'Não encontrei uma lista de promoções atualizada para consultar.')
  }

  const category = categories.find(item => normalized.includes(normalizeText(item.nome)))
  if (category && /\b(categoria|opcoes|itens|tem|quais|mostrar|ver)\b/.test(normalized)) {
    const items = available.filter(product => product.categoria_id === category.id)
    if (!items.length) return 'No momento, não encontrei itens disponíveis na categoria ' + category.nome + '.'
    return '*' + category.nome + '*\n' + items.map(product => '• ' + product.nome + ' — ' + currency.format(Number(product.preco) || 0) + (product.descricao?.trim() ? '\n  ' + product.descricao.trim().slice(0, 140) : '')).join('\n')
  }

  const productMatches = products.map(product => ({ product, name: normalizeText(product.nome) }))
    .filter(item => item.name.length >= 3 && normalized.includes(item.name))
    .sort((a, b) => b.name.length - a.name.length)
  if (productMatches.length) {
    const product = productMatches[0].product
    if (product.disponivel !== true) return 'No momento, *' + product.nome + '* está indisponível. Posso ajudar com outra opção?'
    const asksDescription = /\b(ingrediente|ingredientes|compoe|composicao|vem|acompanha|descricao|o que e|feito de|tem dentro)\b/.test(normalized)
    const asksPrice = /\b(preco|quanto custa|valor|custa|reais)\b/.test(normalized)
    const lines = ['*' + product.nome + '*', 'Preço: ' + currency.format(Number(product.preco) || 0)]
    if (product.descricao?.trim()) lines.push('Descrição: ' + product.descricao.trim())
    else if (asksDescription) lines.push('A descrição e os ingredientes não estão cadastrados. Nossa equipe pode confirmar para você.')
    if (!asksPrice && !asksDescription && product.descricao?.trim()) lines.push('Quer saber o preço, os detalhes ou ver outras opções?')
    return lines.join('\n')
  }

  if (isMenuRequest(text)) {
    const asksFullMenu = /\b(completo|completa|todos os itens|lista completa|cardapio inteiro|menu inteiro)\b/.test(normalized)
    return buildMenuReply(restaurantId, asksFullMenu)
  }

  const restaurantTopic = /\b(cardapio|menu|comida|prato|produto|item|preco|valor|ingrediente|sabor|opcao|pedido|entrega|frete|taxa|bairro|regiao|retirada|pagamento|pix|cartao|dinheiro|horario|abre|fecha|funciona|endereco|localizacao|onde fica|telefone|contato|promocao|desconto|cupom|reserva|mesa|restaurante|loja|aberto|fechado|disponivel|disponibilidade|temaki|sushi|sashimi|combo|bebida|sobremesa|yakisoba|yakissoba|pizza|hamburguer|hamburg|lasanha|pastel|sanduiche|macarrao|risoto|tempero|porcao|acai|tapioca|calzone|esfiha|sopa|salada|churrasco|carne|porco|frango|peixe|camarao|salmao|atum|legumes|arroz|massa|fritura|rolinho|onigiri|hot)\b/.test(normalized)
  const likelyOrderRequest = /\b(queria|quero|gostaria de|tem|nao tem|voces tem|vocês têm|vende|faz|prepara|aceita|pedido de|pedir)\s+(?:um|uma|o|a|algum|alguma)?\s*[a-z]{3,}/.test(normalized)
  if (!restaurantTopic && !likelyOrderRequest) {
    return 'Consigo ajudar com o cardápio, pedidos, entrega e informações do restaurante. Sobre outros assuntos, não consigo orientar por aqui.'
  }

  const aiPermission = reserveAiUsage(restaurantId, senderKey, restaurant)
  if (aiPermission.allowed) {
    const aiReply = await generateAiReply({ text, restaurant, products, categories, config, log })
    if (aiReply) return aiReply
  } else if (aiPermission.reason === 'closed') {
    const baseUrl = String(process.env.PUBLIC_MENU_BASE_URL || 'https://fb3d2ymenu.com.br').replace(/\/$/, '')
    const menuLink = restaurant?.slug ? '\nCardápio: ' + baseUrl + '/menu/' + encodeURIComponent(restaurant.slug) : ''
    return 'No momento estamos fora do horário de funcionamento. Confira nosso cardápio.' + menuLink
  } else if (aiPermission.reason === 'restaurant_limit' || aiPermission.reason === 'contact_limit') {
    return humanHelpMessage(restaurant, 'Atingimos o limite diário do atendimento automático. Vou chamar alguém da equipe para continuar com você.')
  }

  if (/\b(tem|possui|vende|disponivel|disponibilidade|ainda tem)\b/.test(normalized)) {
    return humanHelpMessage(restaurant, 'Não consegui identificar com segurança qual item você procura.')
  }
  return humanHelpMessage(restaurant, 'Posso ajudar com cardápio, preços, descrições, horários e formas de pagamento. Para outras dúvidas, nossa equipe pode atender você.')
}

function chooseReply(text, config) {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (/\b(cardapio|menu|comida|pratos|opcoes|opcoes do menu)\b/.test(normalized)) return config.faqMenu
  if (/\b(horario|horarios|abre|aberto|fecha|fechado|funciona|funcionamento)\b/.test(normalized)) return config.faqHours
  if (/\b(pagamento|pagar|pix|cartao|dinheiro|credito|debito)\b/.test(normalized)) return config.faqPayment
  return config.welcomeMessage
}

async function notifyHumanAttendant({ restaurantId, sock, config, message, remoteJid, log }) {
  const phone = String(config?.humanSupportPhone || '').replace(/\D/g, '')
  if (!phone) {
    log.info({ restaurantId }, 'Human handoff requested but no attendant WhatsApp is configured')
    return
  }
  const customerKey = restaurantId + ':' + remoteJid
  const now = Date.now()
  if (now - (humanHandoffTimes.get(customerKey) || 0) < 15 * 60 * 1000) return
  const attendantJid = whatsappJid(phone)
  if (!attendantJid) {
    log.warn({ restaurantId }, 'Human handoff skipped: invalid attendant WhatsApp number')
    return
  }
  const customerJid = message?.key?.remoteJidPn || remoteJid
  const customerPhone = String(customerJid).replace(/@s\.whatsapp\.net$|@c\.us$|@lid$/g, '').replace(/\D/g, '')
  const customerName = String(message?.pushName || 'Cliente').trim().slice(0, 80)
  const customerContact = customerPhone ? (customerPhone.startsWith('55') ? customerPhone : '55' + customerPhone) : 'Número não identificado'
  const text = 'Olá! Um cliente precisa do seu suporte.\n\nCliente: *' + customerName + '*\nWhatsApp: *' + customerContact + '*\n\nEntre em contato para continuar o atendimento.'
  try {
    const matches = await sock.onWhatsApp(attendantJid)
    const recipient = Array.isArray(matches) ? matches.find(item => item?.exists && item?.jid) : null
    if (!recipient) {
      log.warn({ restaurantId }, 'Human handoff skipped: attendant number was not resolved by WhatsApp')
      return
    }
    const sent = await sock.sendMessage(recipient.jid, { text })
    if (sent?.key?.id) {
      humanHandoffTimes.set(customerKey, now)
      log.info({ restaurantId, messageId: sent.key.id }, 'Human attendant notification sent')
    }
  } catch (err) {
    log.error({ err, restaurantId }, 'Human attendant notification failed')
  }
}

async function handleIncomingMessage(restaurantId, sock, message) {
  const key = message?.key
  const remoteJid = key?.remoteJid
  const messageId = key?.id
  if (!remoteJid || !messageId || key.fromMe || remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast' || remoteJid.endsWith('@broadcast')) return

  const audioMessage = isAudioMessage(message.message)
  const text = messageText(message.message)
  if (!text && !audioMessage) return

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

    let reply = audioMessage
      ? 'No momento não consigo ouvir áudios. Pode me enviar sua mensagem por escrito?'
      : await buildIntelligentReply(restaurantId, text, config, senderKey)
    if (typeof reply !== 'string' || !reply.trim()) return

    const isHandoff = reply.includes(HANDOFF_MARKER)
    if (isHandoff) {
      reply = reply.replaceAll(HANDOFF_MARKER, '').trim()
      await notifyHumanAttendant({ restaurantId, sock, config, message, remoteJid, log })
    }

    // Apresenta o bot na primeira interação com cada contato (e novamente após 24 horas).
    const lastWelcome = welcomedContacts.get(senderKey) || 0
    const shouldIntroduce = now - lastWelcome >= 24 * 60 * 60 * 1000
    if (shouldIntroduce) {
      const { data: restaurantData } = await admin.from('empresas').select('nome').eq('id', Number(restaurantId)).maybeSingle()
      const botName = String(config.botName || '').trim() || 'assistente virtual'
      const restaurantName = restaurantData?.nome || 'nosso estabelecimento'
      const greeting = 'Olá! Sou ' + botName + ', atendente do ' + restaurantName + '. Vou te atender por aqui.'
      const isGreeting = /^(oi|ola|bom dia|boa tarde|boa noite|opa|e ai)[!.,? ]*$/.test(normalizeText(text))
      const isPresentation = /(se apresente|quem e voce|qual seu nome|como voce se chama)/.test(normalizeText(text))
      if (isGreeting) reply = greeting + ' O que você gostaria de saber?'
      else if (isPresentation) reply = greeting
      else if (!isHandoff) reply = greeting + String.fromCharCode(10) + reply.trim()
    }

    senderReplyTimes.set(senderKey, now)
    await sock.sendMessage(remoteJid, { text: reply.trim().slice(0, 4000) })
    if (shouldIntroduce) {
      welcomedContacts.set(senderKey, now)
      const cutoff = now - 30 * 24 * 60 * 60 * 1000
      for (const [key, timestamp] of welcomedContacts) if (timestamp < cutoff) welcomedContacts.delete(key)
      try { fs.writeFileSync(welcomeStateFile, JSON.stringify(Object.fromEntries(welcomedContacts)), { mode: 0o600 }) }
      catch (saveError) { log.warn({ message: String(saveError?.message || saveError) }, 'Could not persist WhatsApp welcome state') }
    }
    log.info({ restaurantId, messageId, aiEnabled: Boolean(process.env.OPENAI_API_KEY), introduced: shouldIntroduce }, 'Automatic WhatsApp reply sent')
  } catch (err) {
    log.error({ err, restaurantId, messageId }, 'Automatic WhatsApp reply failed')
  }
}


function normalizedStatus(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
}

function whatsappJid(value) {
  let digits = String(value || '').replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.length === 10 || digits.length === 11) digits = '55' + digits
  if (digits.length < 12 || digits.length > 13) return null
  return digits + '@s.whatsapp.net'
}

function orderStatusSettings(status, config) {
  const key = normalizedStatus(status)
  const settings = {
    novo: { enabled: 'statusNew', message: 'messageNew', fallback: 'Olá {nome}! Recebemos seu pedido #{pedido}.' },
    aceito: { enabled: 'statusAccepted', message: 'messageAccepted', fallback: 'Olá {nome}! O restaurante aceitou seu pedido #{pedido}.' },
    aceita: { enabled: 'statusAccepted', message: 'messageAccepted', fallback: 'Olá {nome}! O restaurante aceitou seu pedido #{pedido}.' },
    preparando: { enabled: 'statusPreparing', message: 'messagePreparing', fallback: 'Olá {nome}! Seu pedido #{pedido} está sendo preparado.' },
    'em preparo': { enabled: 'statusPreparing', message: 'messagePreparing', fallback: 'Olá {nome}! Seu pedido #{pedido} está sendo preparado.' },
    pronto: { enabled: 'statusReady', message: 'messageReady', fallback: 'Olá {nome}! Seu pedido #{pedido} está pronto.' },
    'retirada disponivel': { enabled: 'statusPickupReady', message: 'messagePickupReady', fallback: 'Olá {nome}! Seu pedido #{pedido} está pronto para retirada.' },
    'em entrega': { enabled: 'statusOutForDelivery', message: 'messageOutForDelivery', fallback: 'Olá {nome}! Seu pedido #{pedido} saiu para entrega.' },
    'saiu para entrega': { enabled: 'statusOutForDelivery', message: 'messageOutForDelivery', fallback: 'Olá {nome}! Seu pedido #{pedido} saiu para entrega.' },
    concluido: null,
    entregue: { enabled: 'statusDelivered', message: 'messageDelivered', fallback: 'Olá {nome}! Seu pedido #{pedido} foi entregue.' },
    cancelado: { enabled: 'statusCanceled', message: 'messageCanceled', fallback: 'Olá {nome}, seu pedido #{pedido} foi cancelado. Entre em contato com o restaurante se precisar de ajuda.' }
  }
  const setting = settings[key]
  if (setting === null) return null
  if (setting && config?.[setting.enabled] === false) return null
  const configuredMessage = setting?.message ? config?.[setting.message] : null
  const fallback = setting?.fallback || `Olá {nome}! O status do seu pedido #{pedido} foi atualizado para: {status}.`
  return {
    text: typeof configuredMessage === 'string' && configuredMessage.trim() ? configuredMessage.trim() : fallback
  }
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0)
}

async function buildOrderReceiptMessage(order) {
  const [restaurantResult, itemsResult] = await Promise.all([
    admin.from('empresas').select('nome').eq('id', Number(order.empresa_id)).maybeSingle(),
    admin.from('itens_pedido').select('produto_id,nome_produto,quantidade,preco_unitario').eq('pedido_id', Number(order.id)).order('id')
  ])
  if (restaurantResult.error) throw restaurantResult.error
  if (itemsResult.error) throw itemsResult.error

  const orderItems = itemsResult.data || []
  const productIds = [...new Set(orderItems.map(item => Number(item.produto_id)).filter(id => Number.isSafeInteger(id) && id > 0))]
  let productPrices = new Map()
  if (productIds.length) {
    const productsResult = await admin.from('produtos').select('id,preco').in('id', productIds)
    if (productsResult.error) throw productsResult.error
    productPrices = new Map((productsResult.data || []).map(product => [Number(product.id), Number(product.preco) || 0]))
  }

  const firstName = String(order.cliente_nome || 'cliente').trim().split(' ').filter(Boolean)[0]
  const restaurantName = restaurantResult.data?.nome || 'nosso restaurante'
  const lines = [
    `Olá, ${firstName}! Recebemos seu pedido #${order.id} no *${restaurantName}*.`,
    '',
    '*Resumo do pedido*'
  ]
  for (const item of orderItems) {
    const quantity = Number(item.quantidade) || 1
    const savedPrice = Number(item.preco_unitario)
    const unitPrice = Number.isFinite(savedPrice) && savedPrice > 0
      ? savedPrice
      : productPrices.get(Number(item.produto_id)) ?? 0
    const itemName = item.nome_produto || 'Item do cardápio'
    lines.push(`• ${quantity}x ${itemName} — ${formatCurrency(unitPrice * quantity)}`)
  }
  if (!orderItems.length) lines.push('Os itens do pedido foram registrados.')
  lines.push('', `*Total: ${formatCurrency(order.total)}*`)
  if (order.forma_pagamento) lines.push(`Pagamento: ${order.forma_pagamento}`)
  if (order.tipo_entrega) lines.push(`Entrega: ${order.tipo_entrega}`)
  if (normalizedStatus(order.tipo_entrega) === 'entrega' && order.endereco_entrega) {
    lines.push(`Endereço: ${order.endereco_entrega}`)
  }
  if (order.observacoes?.trim()) lines.push(`Observações: ${order.observacoes.trim()}`)
  if (order.precisa_troco && order.troco_para) lines.push(`Troco para: ${formatCurrency(order.troco_para)}`)
  lines.push('', 'Vamos avisar você por aqui quando houver atualização no seu pedido.')
  return lines.join(String.fromCharCode(10)).slice(0, 4000)
}

function formatOrderStatusMessage(template, order) {
  const firstName = String(order.cliente_nome || 'cliente').trim().split(' ').filter(Boolean)[0]
  const values = {
    nome: firstName,
    cliente_nome: String(order.cliente_nome || 'cliente'),
    pedido: String(order.id),
    pedido_id: String(order.id),
    status: String(order.status || '')
  }
  let message = template
  for (const [key, value] of Object.entries(values)) {
    message = message.replaceAll(`{{${key}}}`, value).replaceAll(`{${key}}`, value)
  }
  return message.trim().slice(0, 4000)
}

async function handleOrderStatusEvent(payload) {
  let order = payload?.new
  if (!order || !order.id || !order.empresa_id || !order.status) return

  const isInsert = payload.eventType === 'INSERT'
  if (!isInsert && normalizedStatus(payload.old?.status) === normalizedStatus(order.status)) return

  // The order RPC inserts total=0, then stores items and final total in one transaction.
  // Re-read after commit so the receipt always contains the persisted final values.
  if (isInsert) {
    const latestOrder = await admin.from('pedidos').select('*').eq('id', Number(order.id)).maybeSingle()
    if (latestOrder.error) throw latestOrder.error
    if (latestOrder.data) order = latestOrder.data
  }

  const settings = await admin
    .from('whatsapp_bot_config')
    .select('config')
    .eq('empresa_id', Number(order.empresa_id))
    .maybeSingle()
  if (settings.error) throw settings.error
  const config = settings.data?.config
  if (!config || config.enabled !== true) return

  const notification = orderStatusSettings(order.status, config)
  if (!notification) return

  const jid = whatsappJid(order.cliente_whatsapp)
  if (!jid) {
    log.warn({ orderId: order.id, restaurantId: order.empresa_id }, 'Order WhatsApp notification skipped: invalid customer number')
    return
  }

  const state = stateFor(String(order.empresa_id))
  if (state.status !== 'connected' || !state.socket) {
    log.warn({ orderId: order.id, restaurantId: order.empresa_id, status: order.status }, 'Order WhatsApp notification skipped: restaurant WhatsApp is not connected')
    return
  }

  // A unique (order, status) key prevents duplicate messages if Realtime replays an event.
  const reservation = await admin
    .from('whatsapp_status_enviados')
    .insert({ pedido_id: Number(order.id), status: String(order.status) })
    .select('id')
    .single()
  if (reservation.error) {
    if (reservation.error.code === '23505') return
    throw reservation.error
  }

  try {
    // Resolve the phone number through WhatsApp before sending. Some accounts use
    // LID addressing, so constructing an @s.whatsapp.net JID can target the wrong address.
    const recipients = await state.socket.onWhatsApp(jid)
    const recipient = Array.isArray(recipients)
      ? recipients.find(item => item?.exists && item?.jid)
      : null
    if (!recipient) {
      log.warn({ orderId: order.id, restaurantId: order.empresa_id, status: order.status }, 'Order WhatsApp notification skipped: customer number was not resolved by WhatsApp')
      await admin.from('whatsapp_status_enviados').delete().eq('id', reservation.data.id)
      return
    }

    const text = isInsert
      ? await buildOrderReceiptMessage(order)
      : formatOrderStatusMessage(notification.text, order)
    const sent = await state.socket.sendMessage(recipient.jid, { text })
    if (!sent?.key?.id) throw new Error('WhatsApp did not return a message ID')
    log.info({ orderId: order.id, restaurantId: order.empresa_id, status: order.status, event: isInsert ? 'receipt' : 'status', messageId: sent.key.id }, 'Order WhatsApp notification accepted by WhatsApp')
  } catch (err) {
    await admin.from('whatsapp_status_enviados').delete().eq('id', reservation.data.id)
    throw err
  }
}

function startOrderStatusRealtime() {
  admin
    .channel('menuhub-order-status-notifications')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pedidos' }, payload => {
      void handleOrderStatusEvent(payload).catch(err => log.error({ err, orderId: payload?.new?.id }, 'New order WhatsApp notification failed'))
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pedidos' }, payload => {
      void handleOrderStatusEvent(payload).catch(err => log.error({ err, orderId: payload?.new?.id }, 'Order status WhatsApp notification failed'))
    })
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') log.info('Supabase Realtime subscribed to order status changes')
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') log.error({ status, err }, 'Supabase Realtime order status subscription failed')
    })
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
async function registerWhatsAppConnection(restaurantId, rawJid) {
  const phone = String(rawJid || '').split('@')[0].split(':')[0].replace(/\D/g, '')
  if (!/^\d{8,15}$/.test(phone)) {
    throw new Error('O WhatsApp conectou, mas o servidor não conseguiu identificar o número da conta.')
  }

  const { error } = await admin
    .from('whatsapp_bot_connections')
    .upsert({
      empresa_id: Number(restaurantId),
      whatsapp_phone: phone,
      connected_at: new Date().toISOString()
    }, { onConflict: 'empresa_id' })

  if (error?.code === '23505') {
    const conflict = new Error('Este número de WhatsApp já está vinculado a outro restaurante. Desconecte-o da outra conta antes de continuar.')
    conflict.code = 'WHATSAPP_NUMBER_IN_USE'
    throw conflict
  }
  if (error) throw error
  return phone
}

async function releaseWhatsAppConnection(restaurantId) {
  const { error } = await admin
    .from('whatsapp_bot_connections')
    .delete()
    .eq('empresa_id', Number(restaurantId))
  if (error) log.error({ err: error, restaurantId }, 'Could not release WhatsApp restaurant binding')
}

function stateFor(id) {
  if (!sessions.has(id)) {
    sessions.set(id, {
      status: 'disconnected', qr: null, qrDataUrl: null, phone: null,
      socket: null, starting: false, lastError: null,
      reconnectTimer: null, reconnectAttempts: 0, lastDisconnectCode: null
    })
  }
  return sessions.get(id)
}

function scheduleReconnect(id, reason) {
  const state = stateFor(id)
  if (state.status === 'logged_out' || state.reconnectTimer) return
  state.reconnectAttempts = Math.min((state.reconnectAttempts || 0) + 1, 6)
  const delay = Math.min(2000 * (2 ** (state.reconnectAttempts - 1)), 60000)
  log.warn({ restaurantId: id, reason, attempt: state.reconnectAttempts, retryInMs: delay }, 'WhatsApp reconnect scheduled')
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null
    if (state.status === 'disconnected' || state.status === 'error') {
      void startSession(id)
    }
  }, delay)
}

async function startSession(id) {
  const state = stateFor(id)
  // A socket in QR, connecting, or connected state is already an active attempt.
  if (state.starting || state.socket || state.status === 'connected') return state
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer)
    state.reconnectTimer = null
  }
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
        try {
          const phone = await registerWhatsAppConnection(id, sock.user?.id)
          if (state.socket !== sock) return
          state.status = 'connected'
          state.phone = phone
          state.qr = null
          state.qrDataUrl = null
          state.starting = false
          state.reconnectAttempts = 0
          state.lastDisconnectCode = null
          state.lastError = null
          log.info({ restaurantId: id, phone }, 'WhatsApp session connected and bound to restaurant')
        } catch (err) {
          if (state.socket !== sock) return
          state.starting = false
          state.socket = null
          state.status = 'error'
          state.phone = null
          state.qr = null
          state.qrDataUrl = null
          state.lastError = err?.message || 'Não foi possível registrar o número deste WhatsApp.'
          try { sock.end(undefined) } catch {}
          if (err?.code === 'WHATSAPP_NUMBER_IN_USE') {
            fs.rmSync(sessionPath(id), { recursive: true, force: true })
          }
          log.error({ err, restaurantId: id }, 'WhatsApp connection could not be bound to restaurant')
        }
      }
      if (update.connection === 'close') {
        // Ignore late close events from sockets that have already been replaced.
        if (state.socket !== sock) return
        state.starting = false
        state.socket = null
        const code = update.lastDisconnect?.error?.output?.statusCode ?? null
        state.lastDisconnectCode = code
        state.status = code === DisconnectReason.loggedOut ? 'logged_out' : 'disconnected'
        state.qr = null
        state.qrDataUrl = null
        if (code === DisconnectReason.loggedOut) {
          state.phone = null
          void releaseWhatsAppConnection(id)
        }
        log.warn({ restaurantId: id, code, loggedOut: code === DisconnectReason.loggedOut }, 'WhatsApp connection closed')
        if (code !== DisconnectReason.loggedOut) scheduleReconnect(id, code ?? 'connection_closed')
      }
    })
  } catch (err) {
    state.starting = false
    state.socket = null
    state.status = 'error'
    state.lastError = 'Não foi possível iniciar a sessão.'
    log.error({ err, restaurantId: id }, 'WhatsApp session start failed')
    scheduleReconnect(id, 'session_start_failed')
  }
  return state
}

function restoreSavedSessions() {
  let entries
  try {
    entries = fs.readdirSync(AUTH_DIR, { withFileTypes: true })
  } catch (err) {
    log.error({ err, authDir: AUTH_DIR }, 'Could not inspect WhatsApp session directory')
    return
  }
  const saved = entries
    .filter(entry => entry.isDirectory() && safeId(entry.name) && fs.existsSync(path.join(AUTH_DIR, entry.name, 'creds.json')))
    .map(entry => entry.name)
  if (!saved.length) {
    log.info({ authDir: AUTH_DIR }, 'No saved WhatsApp sessions to restore')
    return
  }
  log.info({ count: saved.length }, 'Restoring saved WhatsApp sessions')
  saved.forEach((id, index) => {
    setTimeout(() => {
      void startSession(id)
    }, index * 1500)
  })
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
  await releaseWhatsAppConnection(id)
  sessions.set(id, { status: 'disconnected', qr: null, qrDataUrl: null, phone: null, socket: null, starting: false, lastError: null })
  res.json({ status: 'disconnected' })
})
startOrderStatusRealtime()
app.listen(PORT, '0.0.0.0', () => {
  log.info({ port: PORT, authDir: AUTH_DIR }, 'Menuhub WhatsApp bridge listening')
  restoreSavedSessions()
})