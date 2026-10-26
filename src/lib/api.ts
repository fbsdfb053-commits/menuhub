import { supabase } from './supabase'
import type { Category, ComplementGroup, Product, Restaurant } from '../data'

export type MenuData = {
  restaurant: Restaurant
  categories: Category[]
  products: Product[]
}

export type OrderForm = {
  name: string
  phone: string
  deliveryType: 'Retirada' | 'Entrega'
  address: string
  paymentMethod: 'Pix' | 'Dinheiro' | 'Cartão de débito' | 'Cartão de crédito'
  observations: string
  needsChange: boolean
  changeFor: number | null
}

export type OrderItem = { productId: number; quantity: number; complementIds?: number[] }

const DEFAULT_ACCENT = '#0e4f59'

function safeColor(value: unknown): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : DEFAULT_ACCENT
}

function safeImageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^https:\/\//i.test(value)) return undefined
  return encodeURI(value)
}

function safeInstagram(value: unknown): string {
  return typeof value === 'string' ? value.replace(/[^a-zA-Z0-9._]/g, '') : ''
}

function storeHoursStatus(config: Record<string, { closed: boolean; open: string; close: string }> | null, manual: boolean | null | undefined, accepts: boolean) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date())
  const weekday = parts.find(p => p.type === 'weekday')?.value ?? 'Sun'
  const hour = Number(parts.find(p => p.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find(p => p.type === 'minute')?.value ?? 0)
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const today = days.indexOf(weekday)
  const current = hour * 60 + minute
  const configured = config && Object.keys(config).length > 0
  const todayHours = configured ? config[String(today)] : undefined
  const withinHours = Boolean(todayHours && !todayHours.closed && todayHours.open && todayHours.close && current >= Number(todayHours.open.slice(0,2))*60+Number(todayHours.open.slice(3,5)) && current < Number(todayHours.close.slice(0,2))*60+Number(todayHours.close.slice(3,5)))
  const isOpen = manual === true ? true : manual === false ? false : configured ? withinHours : accepts
  let nextOpening = ''
  if (!isOpen && configured) {
    for (let offset = 0; offset <= 7; offset++) {
      const day = (today + offset) % 7
      const hours = config[String(day)]
      if (!hours || hours.closed || !hours.open) continue
      const opening = Number(hours.open.slice(0,2))*60+Number(hours.open.slice(3,5))
      if (offset === 0 && opening <= current) continue
      const dayLabel = offset === 0 ? 'hoje' : offset === 1 ? 'amanhã' : ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'][day]
      nextOpening = 'Abriremos ' + dayLabel + ' às ' + hours.open
      break
    }
  }
  return { isOpen, nextOpening }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function fetchMenu(slug: string): Promise<MenuData | null> {
  const { data, error } = await supabase.rpc('obter_menu', { p_slug: slug })
  if (error) throw new Error(error.message)
  if (!data) return null
  const raw = data as any

  const e = raw.empresa
  const accent = safeColor(e.cor_destaque)
  const instagram = safeInstagram(e.instagram)

  const scheduleConfig = e.horario_funcionamento && typeof e.horario_funcionamento === 'object' ? e.horario_funcionamento as Record<string, { closed: boolean; open: string; close: string }> : null
  const manualOpen = typeof e.status_loja_manual === 'boolean' ? e.status_loja_manual : null
  const storeStatus = storeHoursStatus(scheduleConfig, manualOpen, Boolean(e.aceita_pedidos))
  const restaurant: Restaurant = {
    id: e.id,
    name: e.nome,
    slug: e.slug,
    description: e.descricao ?? '',
    location: e.localizacao ?? '',
    schedule: e.horario ?? '',
    scheduleConfig: scheduleConfig ?? undefined,
    manualOpen,
    nextOpening: storeStatus.nextOpening,
    instagram: instagram ? `@${instagram}` : '',
    whatsapp: typeof e.whatsapp_contato === 'string' && e.whatsapp_contato.trim() ? e.whatsapp_contato : typeof e.telefone_contato === 'string' ? e.telefone_contato : '',
    isOpen: storeStatus.isOpen,
    logoLetter: String(e.nome ?? '?').trim().charAt(0).toUpperCase() || '?',
    logoUrl: safeImageUrl(e.logo_url),
    coverUrl: safeImageUrl(e.capa_url),
    coverTone: `linear-gradient(120deg, color-mix(in srgb, ${accent} 40%, #000) 0%, ${accent} 100%)`,
    accent,
  }

  const rawProducts: any[] = raw.produtos ?? []
  const categories: Category[] = (raw.categorias ?? []).map((c: any) => ({
    id: String(c.id),
    label: c.nome,
    count: rawProducts.filter((p) => p.categoria_id === c.id).length,
  }))

  const hasUncategorized = rawProducts.some((p) => p.categoria_id == null || !categories.some((c) => c.id === String(p.categoria_id)))
  if (hasUncategorized) {
    categories.push({
      id: 'outros',
      label: 'Outros',
      count: rawProducts.filter((p) => p.categoria_id == null || !categories.some((c) => c.id === String(p.categoria_id))).length,
    })
  }

  const products: Product[] = rawProducts.map((p) => ({
    id: p.id,
    name: p.nome,
    description: p.descricao ?? '',
    price: Number(p.preco),
    category: p.categoria_id != null && categories.some((c) => c.id === String(p.categoria_id)) ? String(p.categoria_id) : 'outros',
    tone: 'sunset',
    accent,
    available: p.disponivel !== false,
    imageUrl: safeImageUrl(p.imagem_url),
    maxComplementSelections: Number(p.max_complementos ?? 0),
    complements: ((p.complementos ?? []) as any[]).map((g): ComplementGroup => ({ id:Number(g.id), name:String(g.nome), description:g.descricao ?? undefined, options:((g.opcoes ?? []) as any[]).map(o=>({id:Number(o.id),name:String(o.nome),price:Number(o.preco_adicional ?? 0),imageUrl:safeImageUrl(o.imagem_url)})) })),
  }))

  return { restaurant, categories: categories.filter((c) => c.count > 0), products }
}

export async function createOrder(slug: string, form: OrderForm, items: OrderItem[]): Promise<number> {
  const { data, error } = await supabase.rpc('criar_pedido', {
    p_slug: slug,
    p_nome: form.name,
    p_whatsapp: form.phone,
    p_tipo_entrega: form.deliveryType,
    p_endereco: form.deliveryType === 'Entrega' ? form.address : '',
    p_forma_pagamento: form.paymentMethod,
    p_observacoes: form.observations,
    p_precisa_troco: form.needsChange,
    p_troco_para: form.changeFor,
    p_itens: items.map((i) => ({ produto_id: i.productId, quantidade: i.quantity, complementos: (i.complementIds ?? []).map(id => ({ id })) })),
  })
  if (error) throw new Error(error.message)
  return Number(data)
}


export async function uploadMenuImage(file: File, restaurantId: number): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem.')
  if (file.size > 5 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 5 MB.')
  const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('Entre na sua conta para enviar imagens.')
  const path = auth.user.id + '/' + restaurantId + '/' + crypto.randomUUID() + '.' + extension
  const { error } = await supabase.storage.from('menu-images').upload(path, file, { upsert: false, contentType: file.type })
  if (error) throw new Error(error.message.includes('Bucket not found') ? 'O armazenamento de imagens ainda não foi configurado no Supabase. Execute o arquivo supabase/03_imagens.sql.' : error.message)
  return supabase.storage.from('menu-images').getPublicUrl(path).data.publicUrl
}
