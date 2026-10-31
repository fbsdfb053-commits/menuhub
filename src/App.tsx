import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  ArrowLeft,
  Bell,
  CircleUserRound,
  Settings,
  Volume2,
  LogOut,
  BarChart3,
  Check,
  CheckCircle2,
  CreditCard,
  ChevronRight,
  Clock3,
  Instagram,
  LayoutDashboard,
  MapPin,
  Monitor,
  MessageCircle,
  Minus,
  MoreHorizontal,
  Plus,
  Power,
  Pencil,
  Printer,
  Share2,
  ShoppingBag,
  Star,
  Store,
  Utensils,
  X,
} from 'lucide-react'
import {
  categories,
  demoRestaurant,
  orderExamples,
  products,
  type Category,
  type ComplementOption,
  type Product,
  type Restaurant,
} from './data'
import { hasSupabaseConfig, supabase } from './lib/supabase'
import { createOrder, fetchMenu, uploadMenuImage, type MenuData, type OrderForm, type OrderItem } from './lib/api'
import type { Session } from '@supabase/supabase-js'
import PrivacyPolicy from './PrivacyPolicy'

declare global {
  interface Window {
    qz?: {
      security: {
        setCertificatePromise: (callback: (resolve: (certificate: string) => void, reject: (error: Error) => void) => void) => void
        setSignatureAlgorithm: (algorithm: string) => void
        setSignaturePromise: (callback: (toSign: string) => (resolve: (signature: string) => void, reject: (error: Error) => void) => void) => void
      }
      websocket: { isActive: () => boolean; connect: (options?: { retries?: number; delay?: number }) => Promise<void> }
      printers: { find: () => Promise<string[]> }
      configs: { create: (printer: string, options?: Record<string, unknown>) => unknown }
      print: (config: unknown, data: Array<string | Record<string, unknown>>) => Promise<void>
    }
  }
}

let qzSecurityConfigured = false
function configureQzSecurity() {
  const qz = window.qz
  if (!qz) throw new Error('A biblioteca QZ Tray não carregou. Atualize a página.')
  if (qzSecurityConfigured) return

  qz.security.setCertificatePromise((resolve, reject) => {
    fetch('/qz/digital-certificate.txt', { cache: 'no-store' })
      .then(response => {
        if (!response.ok) throw new Error('Não foi possível carregar o certificado QZ.')
        return response.text()
      })
      .then(resolve)
      .catch(reject)
  })
  qz.security.setSignatureAlgorithm('SHA512')
  qz.security.setSignaturePromise(toSign => (resolve, reject) => {
    fetch('/api/qz-sign?request=' + encodeURIComponent(toSign), { cache: 'no-store' })
      .then(response => {
        if (!response.ok) throw new Error('Não foi possível assinar a solicitação QZ.')
        return response.text()
      })
      .then(resolve)
      .catch(reject)
  })
  qzSecurityConfigured = true
}

type CartLine = {
  product: Product
  quantity: number
  complements: ComplementOption[]
  lineId: string
}

function unitPricePreview(p: {id:number;preco:number}, prices: Record<number,string>) { const raw=prices[p.id]; if(raw===undefined||raw.trim()==='') return Number(p.preco); const n=Number(raw.replace(',','.')); return Number.isFinite(n)&&n>=0?n:0 }

function formatPrice(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Código público estável: mantém o ID sequencial apenas no painel interno.
function formatPublicOrderCode(id: number, createdAt: string | Date) {
  const date = new Date(createdAt)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: 'short',
  }).formatToParts(date)
  const day = parts.find(part => part.type === 'day')?.value ?? '01'
  const month = (parts.find(part => part.type === 'month')?.value ?? 'JAN').toUpperCase()
  let hash = (Number(id) ^ 0x9e3779b9) >>> 0
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d)
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b)
  hash = (hash ^ (hash >>> 16)) >>> 0
  const suffix = (hash % 46656).toString(36).toUpperCase().padStart(3, '0')
  return 'D' + day + month + '-' + suffix
}

function GoogleAccountButton({ className = 'text-button' }: { className?: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const signIn = async () => {
    setLoading(true)
    setError(null)
    if (!hasSupabaseConfig) {
      setError('Configure os dados do Supabase para continuar.')
      setLoading(false)
      return
    }
    // Return to the same environment where sign-in started (preview or production).
    const redirectTo = 'https://fb3d2ymenu.com.br/admin'
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
    if (authError) {
      setError('Ative o Google no Supabase para continuar.')
      setLoading(false)
    }
  }
  return <span className="account-control"><button className={className} type="button" onClick={() => void signIn()} disabled={loading}>{loading ? 'abrindo Google…' : 'Criar conta / entrar'}</button>{error && <small className="account-error">{error}</small>}</span>
}

function ProductArtwork({ product, compact = false, priority = false }: { product: Product; compact?: boolean; priority?: boolean }) {
  if (product.imageUrl) {
    return <div className={`product-art product-art--photo ${compact ? 'product-art--compact' : ''}`}><img src={product.imageUrl} alt="" loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : 'auto'} decoding="async" /></div>
  }
  return (
    <div className={`product-art product-art--${product.tone} ${compact ? 'product-art--compact' : ''}`} aria-hidden="true">
      <span className="art-ring art-ring--one" />
      <span className="art-ring art-ring--two" />
      <span className="art-rice" />
      <span className="art-filling" />
      <span className="art-label">{product.category === 'extras' ? 'extra' : 'fresh'}</span>
    </div>
  )
}

function RestaurantHeader({ showAccount }: { showAccount: boolean }) {
  return (
    <header className="site-header">
      <a className="brand" href="/" aria-label="FB3d2y Menu - início">
        <span className="brand-mark">F</span>
        <span>FB3d2y <b>Menu</b></span>
      </a>
      <div className="header-actions">
        <span className="local-badge"><span className="pulse-dot" /> menus locais</span>
        {showAccount && <GoogleAccountButton />}
      </div>
    </header>
  )
}

function RestaurantHero({ restaurant }: { restaurant: Restaurant }) {
  const coverStyle = restaurant.coverUrl
    ? { background: `url("${restaurant.coverUrl}") center / cover no-repeat, ${restaurant.coverTone}` }
    : { background: restaurant.coverTone }
  const instagramHandle = restaurant.instagram.replace('@', '')
  const whatsappDigits = restaurant.whatsapp?.replace(/\D/g, '') ?? ''
  const share = () => {
    const url = window.location.origin + '/menu/' + encodeURIComponent(restaurant.slug) + '?share=4'
    if (navigator.share) void navigator.share({ title: restaurant.name, url }).catch(() => undefined)
    else void navigator.clipboard?.writeText(url).then(() => window.alert('Link do cardápio copiado.')).catch(() => window.alert(url))
  }
  return (
    <section className="restaurant-hero">
      <div className="hero-cover" style={coverStyle}>
        {!restaurant.coverUrl && <><span className="cover-orb cover-orb--one" /><span className="cover-orb cover-orb--two" /><span className="cover-swoosh">{restaurant.name.split(' ')[0].toLowerCase()}</span></>}
        <div className="cover-topline"><span className="cover-chip">menu digital</span><button className="icon-button icon-button--light" type="button" aria-label="Compartilhar menu" onClick={share}><Share2 size={16} /></button></div>
      </div>
      <div className="restaurant-identity">
        <div className="restaurant-avatar">{restaurant.logoUrl ? <img src={restaurant.logoUrl} alt="" /> : restaurant.logoLetter}</div>
        <div className="identity-copy">
          <div className="identity-title-row"><h1>{restaurant.name}</h1></div>
          <div className="identity-meta">
            <div className="identity-location">
              {restaurant.location && <span className="identity-address"><MapPin size={14} /> {restaurant.location}</span>}
              {restaurant.schedule && <span className="restaurant-hours"><Clock3 size={12} /> {restaurant.schedule}</span>}
            </div>
            {instagramHandle && <a href={`https://instagram.com/${instagramHandle}`} target="_blank" rel="noopener noreferrer"><Instagram size={14} /> {restaurant.instagram}</a>}
            {whatsappDigits && <a href={`https://wa.me/${whatsappDigits.startsWith('55') ? whatsappDigits : '55' + whatsappDigits}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} /> WhatsApp</a>}
          </div>
        </div>
        <span className={`status-pill ${restaurant.isOpen ? 'status-pill--open' : ''}`}><span /> {restaurant.isOpen ? 'Aberto agora' : 'Fechado'}</span>
      </div>
      {restaurant.description && <p className="restaurant-description">"{restaurant.description}"</p>}
      {!restaurant.isOpen && <div className="restaurant-closed-notice"><strong><Clock3 size={17}/> Loja fechada</strong><span>{restaurant.nextOpening || 'Não estamos aceitando pedidos neste momento.'}</span></div>}
    </section>
  )
}

function CategoryNav({ categories: list, selected, onSelect }: { categories: Category[]; selected: string; onSelect: (id: string) => void }) {
  return (
    <nav className="category-nav" aria-label="Categorias do cardápio">
      <button className={selected === 'all' ? 'category-link category-link--active' : 'category-link'} onClick={() => onSelect('all')} type="button">Tudo</button>
      {list.map((category) => (
        <button key={category.id} className={selected === category.id ? 'category-link category-link--active' : 'category-link'} onClick={() => onSelect(category.id)} type="button">
          {category.label}<span>{category.count}</span>
        </button>
      ))}
    </nav>
  )
}

function ProductCard({ product, categoryLabel, canOrder, onAdd, priority = false }: { product: Product; categoryLabel?: string; canOrder: boolean; onAdd: (product: Product) => void; priority?: boolean }) {
  return (
    <article className="product-card">
      <ProductArtwork product={product} priority={priority} />
      <div className="product-card__body">
        <div className="product-card__topline"><span className="product-category">{categoryLabel}</span><button type="button" className="add-button" onClick={() => onAdd(product)} disabled={!canOrder} aria-label={`Adicionar ${product.name}`}><Plus size={18} /></button></div>
        <h3>{product.name}</h3>
        <p>{product.description}</p>
        <strong>{formatPrice(product.price)}</strong>
      </div>
    </article>
  )
}

function CartDrawer({ cart, isDemo, deliveryRegions, onClose, onAdjust, onSubmit }: { cart: CartLine[]; isDemo: boolean; deliveryRegions: {name:string;fee:number;places:string[];negotiate?:boolean}[]; onClose: () => void; onAdjust: (lineId: string, amount: number) => void; onSubmit: (form: OrderForm) => Promise<void> }) {
  const [savedCustomer] = useState(() => { try { return JSON.parse(window.localStorage.getItem('menuhub-customer-data') || '{}') as {name?:string;phone?:string;deliveryType?:OrderForm['deliveryType'];address?:string;paymentMethod?:OrderForm['paymentMethod']} } catch { return {} } })
  const [name, setName] = useState(savedCustomer.name ?? '')
  const [phone, setPhone] = useState(savedCustomer.phone ?? '')
  const [deliveryType, setDeliveryType] = useState<OrderForm['deliveryType']>(savedCustomer.deliveryType === 'Entrega' ? 'Entrega' : 'Retirada')
  const [address, setAddress] = useState(savedCustomer.address ?? '')
  const [deliveryRegion, setDeliveryRegion] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<OrderForm['paymentMethod']>(savedCustomer.paymentMethod ?? 'Pix')
  const [observations, setObservations] = useState('')
  const [needsChange, setNeedsChange] = useState(false)
  const [changeFor, setChangeFor] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const total = cart.reduce((sum, line) => sum + (line.product.price + line.complements.reduce((n,o)=>n+o.price,0)) * line.quantity, 0)
  const selectedRegion = deliveryRegions.find(region => region.name === deliveryRegion)
  const deliveryFee = deliveryType === 'Entrega' && selectedRegion && !selectedRegion.negotiate ? Number(selectedRegion.fee) : 0
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0)
  useEffect(() => { try { window.localStorage.setItem('menuhub-customer-data', JSON.stringify({name,phone,deliveryType,address,paymentMethod})) } catch { /* armazenamento do navegador indisponível */ } }, [name,phone,deliveryType,address,paymentMethod])
  const phoneDigits = phone.replace(/\D/g, '')
  const nameValid=name.trim().length>=2
  const phoneValid=phoneDigits.length>=10&&phoneDigits.length<=13
  const addressValid=deliveryType!=="Entrega"||address.trim().length>=5
  const regionValid=deliveryType!=="Entrega"||Boolean(selectedRegion)
  const changeValid=paymentMethod!=="Dinheiro"||!needsChange||(Number(changeFor.replace(",","."))>0&&Number.isFinite(Number(changeFor.replace(",","."))))
  const valid=nameValid&&phoneValid&&addressValid&&regionValid&&changeValid

  const send = async () => {
    setSending(true)
    setError(null)
    try {
      await onSubmit({ name: name.trim(), phone, deliveryType, address: address.trim(), paymentMethod, observations: observations.trim(), needsChange: paymentMethod === 'Dinheiro' && needsChange, changeFor: paymentMethod === 'Dinheiro' && needsChange ? Number(changeFor.replace(',', '.')) : null, deliveryRegion: deliveryType === 'Entrega' ? deliveryRegion : '', deliveryFee })
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Não foi possível enviar o pedido. Tente de novo.')
      setSending(false)
    }
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="cart-drawer" onClick={(event) => event.stopPropagation()} aria-label="Seu pedido">
        <div className="drawer-header"><div><span className="eyebrow">seu pedido</span><h2>{itemCount} {itemCount === 1 ? 'item' : 'itens'}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Fechar carrinho"><X size={20} /></button></div>
        <div className="cart-lines">
          {cart.map((line) => (
            <div className="cart-line" key={line.lineId}>
              <ProductArtwork product={line.product} compact />
              <div className="cart-line__copy"><strong>{line.product.name}</strong><span>{formatPrice(line.product.price + line.complements.reduce((n,o)=>n+o.price,0))}</span>{line.complements.length>0&&<small className="cart-line-complements">{line.complements.map(o=>o.name).join(', ')}</small>}<div className="quantity-control"><button type="button" onClick={() => onAdjust(line.lineId, -1)} aria-label="Diminuir quantidade"><Minus size={14} /></button><b>{line.quantity}</b><button type="button" onClick={() => onAdjust(line.lineId, 1)} aria-label="Aumentar quantidade"><Plus size={14} /></button></div></div>
              <strong className="cart-line__total">{formatPrice((line.product.price + line.complements.reduce((n,o)=>n+o.price,0)) * line.quantity)}</strong>
            </div>
          ))}
        </div>
        <div className="order-form">
          <style>{`.order-form label .required-indicator{color:#dc4545;font-weight:900;margin-left:4px}.order-form label .required-indicator[aria-hidden="true"]{display:none}.order-form label:has(.field-invalid) input,.order-form label:has(.field-invalid) textarea,.order-form label:has(.field-invalid) select{border-color:#e5a0a0;box-shadow:0 0 0 2px rgba(220,69,69,.07)}.order-form label:has(.field-invalid) .required-indicator{display:inline;color:#dc4545}`}</style>
          <span className="eyebrow">para enviar, só precisamos de</span>
          <label>Seu nome<span className="required-indicator" aria-hidden={nameValid}>*</span><input className={!nameValid?"field-invalid":""} aria-invalid={!nameValid} value={name} onChange={(event) => setName(event.target.value)} placeholder="Como podemos te chamar?" maxLength={100} /></label>
          <label>WhatsApp<span className="required-indicator" aria-hidden={phoneValid}>*</span><input className={!phoneValid?"field-invalid":""} aria-invalid={!phoneValid} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(88) 9 9999-9999" inputMode="tel" maxLength={20} /></label>
          <div className="delivery-choice" role="radiogroup" aria-label="Como você quer receber?">
            <button type="button" role="radio" aria-checked={deliveryType === 'Retirada'} className={deliveryType === 'Retirada' ? 'delivery-option delivery-option--active' : 'delivery-option'} onClick={() => setDeliveryType('Retirada')}>Retirar no local</button>
            <button type="button" role="radio" aria-checked={deliveryType === 'Entrega'} className={deliveryType === 'Entrega' ? 'delivery-option delivery-option--active' : 'delivery-option'} onClick={() => setDeliveryType('Entrega')}>Entrega</button>
          </div>
          {deliveryType === 'Entrega' && <><label>Marque a taxa de acordo com sua região.<span className="required-indicator" aria-hidden={regionValid}>*</span><select className={!regionValid?"field-invalid":""} aria-invalid={!regionValid} value={deliveryRegion} onChange={event=>setDeliveryRegion(event.target.value)}><option value="">Selecione sua região</option>{deliveryRegions.map(region=><option key={region.name} value={region.name}>{region.name}{region.negotiate?' — taxa a combinar':' — '+formatPrice(Number(region.fee))}</option>)}</select></label>{selectedRegion?.places?.length ? <small className="delivery-region-places">{selectedRegion.places.join(' · ')}</small> : null}{selectedRegion?.negotiate&&<p className="delivery-region-note">Nossa equipe combinará a taxa de entrega com você.</p>}<label>Endereço de entrega<span className="required-indicator" aria-hidden={addressValid}>*</span><textarea className={!addressValid?"field-invalid":""} aria-invalid={!addressValid} value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Rua, número, bairro e referência" rows={2} maxLength={300} /></label></>}
          <label>Como você vai pagar?
            <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as OrderForm['paymentMethod'])}>
              <option value="Pix">Pix</option>
              <option value="Dinheiro">Dinheiro</option>
              <option value="Cartão de débito">Cartão de débito</option>
              <option value="Cartão de crédito">Cartão de crédito</option>
            </select>
          </label>
          <label>Observações do pedido<textarea value={observations} onChange={(event) => setObservations(event.target.value)} placeholder="Ex.: sem cebola, molho à parte…" rows={3} maxLength={500} /></label>
          {paymentMethod === 'Dinheiro' && <div className="cash-change-fields"><label className="admin-check-label"><input type="checkbox" checked={needsChange} onChange={(event) => { setNeedsChange(event.target.checked); if (!event.target.checked) setChangeFor('') }} /> Precisa de troco?</label>{needsChange && <label>Troco para quanto? (R$)<span className="required-indicator" aria-hidden={changeValid}>*</span><input className={!changeValid?"field-invalid":""} aria-invalid={!changeValid} value={changeFor} onChange={(event) => setChangeFor(event.target.value)} inputMode="decimal" placeholder="Ex.: 50,00" required /></label>}</div>}
        </div>
        <div className="drawer-total"><span>Subtotal dos itens</span><strong>{formatPrice(total)}</strong></div>{deliveryType==='Entrega'&&selectedRegion&&!selectedRegion.negotiate&&<div className="drawer-total"><span>Taxa de entrega</span><strong>{formatPrice(deliveryFee)}</strong></div>}{deliveryType==='Entrega'&&selectedRegion?.negotiate&&<div className="drawer-total"><span>Taxa de entrega</span><strong>A combinar</strong></div>}<div className="drawer-total"><span>Total do pedido</span><strong>{formatPrice(total+deliveryFee)}{deliveryType==='Entrega'&&selectedRegion?.negotiate?' + taxa a combinar':''}</strong></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button primary-button--full" type="button" onClick={() => void send()} disabled={!valid || sending}><ShoppingBag size={18} /> {sending ? 'Enviando…' : 'Enviar pedido'}</button>
        <p className="privacy-note">{isDemo ? 'Nesta demonstração, o pedido não é enviado a ninguém.' : 'Seu pedido será enviado direto ao restaurante, que vai combinar o pagamento com você pelo WhatsApp.'}</p>
      </aside>
    </div>
  )
}

function ComplementPicker({product,selectedIds,onChangeQuantity,onClose,onAdd}:{product:Product;selectedIds:number[];onChangeQuantity:(id:number,amount:number)=>void;onClose:()=>void;onAdd:()=>void}) {
  const options=(product.complements??[]).flatMap(g=>g.options)
  const extras=selectedIds.reduce((sum,id)=>sum+(options.find(o=>o.id===id)?.price??0),0)
  const limit=Number(product.maxComplementSelections??0), selectedCount=selectedIds.length
  return <div className="complement-picker-backdrop" onClick={onClose}><section className="complement-picker" role="dialog" aria-modal="true" aria-label={"Complementos de "+product.name} onClick={e=>e.stopPropagation()}><div className="drawer-header"><div><span className="eyebrow">escolha os sabores e opções</span><h2>{product.name}</h2><p>{limit>0?`Escolha até ${limit} complementos no total (${Math.min(selectedCount,limit)}/${limit}).`:'Escolha os complementos desejados.'}</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="Fechar"><X size={20}/></button></div>{(product.complements??[]).map(group=><section className="complement-choice-group" key={group.id}><h3>{group.name}</h3>{group.description&&<p>{group.description}</p>}{group.options.map(option=>{const quantity=selectedIds.filter(id=>id===option.id).length;const blocked=limit>0&&selectedCount>=limit;return <div key={option.id} className="complement-choice">{option.imageUrl&&<img src={option.imageUrl} alt={'Foto de '+option.name} loading="lazy"/>}<span>{option.name}{option.price>0&&<small className="complement-option-price"> + {formatPrice(option.price)}</small>}</span><div className="complement-quantity"><button type="button" aria-label={'Diminuir '+option.name} disabled={quantity===0} onClick={()=>onChangeQuantity(option.id,-1)}><Minus size={14}/></button><b>{quantity}</b><button type="button" aria-label={'Adicionar '+option.name} disabled={blocked} onClick={()=>onChangeQuantity(option.id,1)}><Plus size={14}/></button></div></div>})}</section>)}<div className="drawer-total"><span>Total por unidade</span><strong>{formatPrice(product.price+extras)}</strong></div><button className="primary-button primary-button--full" type="button" onClick={onAdd}>Adicionar ao pedido</button></section></div>
}

function EmptyCart({ onClose }: { onClose: () => void }) {
  return <div className="empty-cart"><div className="empty-cart__icon"><ShoppingBag size={24} /></div><h3>Seu carrinho está vazio</h3><p>Escolha algo gostoso no menu e ele aparece aqui.</p><button type="button" className="secondary-button" onClick={onClose}>Voltar para o menu</button></div>
}

type MenuViewProps = {
  data: MenuData
  isDemo: boolean
  onPlaceOrder?: (form: OrderForm, items: OrderItem[]) => Promise<number>
}

function MenuView({ data, isDemo, onPlaceOrder }: MenuViewProps) {
  const { restaurant, categories: menuCategories, products: menuProducts } = data
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [cart, setCart] = useState<CartLine[]>([])
  const [isCartOpen, setCartOpen] = useState(false)
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [selectedComplementIds, setSelectedComplementIds] = useState<number[]>([])
  const filteredProducts = useMemo(() => selectedCategory === 'all' ? [...menuCategories.flatMap(category => menuProducts.filter(product => product.category === category.id)), ...menuProducts.filter(product => !menuCategories.some(category => category.id === product.category))] : menuProducts.filter((product) => product.category === selectedCategory), [selectedCategory, menuCategories, menuProducts])
  const total = cart.reduce((sum, line) => sum + (line.product.price + line.complements.reduce((n,o)=>n+o.price,0)) * line.quantity, 0)
  const count = cart.reduce((sum, line) => sum + line.quantity, 0)

  useEffect(() => {
    if (!isDemo) document.title = `${restaurant.name} — Cardápio`
  }, [isDemo, restaurant.name])

  const addProduct = (product: Product) => {
    setConfirmation(null)
    if ((product.complements ?? []).some(group => group.options.length > 0)) {
      setSelectedProduct(product)
      setSelectedComplementIds([])
      return
    }
    addLineToCart(product, [])
  }
  const addLineToCart = (product: Product, complements: ComplementOption[]) => {
    const ids = complements.map(o=>o.id).sort((a,b)=>a-b)
    const lineId = String(product.id)+':'+ids.join(',')
    setCart(current => {
      const found = current.find(line=>line.lineId===lineId)
      return found ? current.map(line=>line.lineId===lineId?{...line,quantity:line.quantity+1}:line) : [...current,{product,quantity:1,complements,lineId}]
    })
    setSelectedProduct(null)
    setSelectedComplementIds([])
    setConfirmation(`${product.name} adicionado ao carrinho.`)
    window.setTimeout(() => setConfirmation(current => current === `${product.name} adicionado ao carrinho.` ? null : current), 2200)
  }
  const adjust = (lineId: string, amount: number) => setCart(current => current.flatMap(line=>line.lineId!==lineId?[line]:line.quantity+amount>0?[{...line,quantity:line.quantity+amount}]:[]))


  const submitOrder = async (form: OrderForm) => {
    const items = cart.map((line) => ({ productId: line.product.id, quantity: line.quantity, complementIds: line.complements.map(o=>o.id) }))
    const orderNumber = onPlaceOrder ? await onPlaceOrder(form, items) : null
    const firstName = form.name.split(' ')[0]
    setCartOpen(false)
    setCart([])
    setConfirmation(orderNumber ? `Pedido ${formatPublicOrderCode(orderNumber, new Date())} recebido, ${firstName}! Já vamos cuidar dele.` : `Pedido de demonstração recebido, ${firstName}!`)
  }

  const categoryLabel = (id: string) => menuCategories.find((category) => category.id === id)?.label

  return (
    <div className="app-shell" style={{ '--accent': restaurant.accent } as CSSProperties}>
      <RestaurantHeader showAccount={isDemo} />
      <main className="menu-main">
        <RestaurantHero restaurant={restaurant} />
        <CategoryNav categories={menuCategories} selected={selectedCategory} onSelect={setSelectedCategory} />
        <section className="menu-section">
          <div className="section-heading"><div><span className="eyebrow">feito na hora</span><h2>{selectedCategory === 'all' ? 'O que vai ser hoje?' : categoryLabel(selectedCategory)}</h2></div><span className="result-count">{filteredProducts.length} opções</span></div>
          {filteredProducts.length === 0 ? <p className="restaurant-description">Este menu ainda não tem produtos publicados.</p> : selectedCategory === 'all' ? <div className="all-categories-list">{menuCategories.map(category => { const categoryProducts = filteredProducts.filter(product => product.category === category.id); return categoryProducts.length ? <section className="all-category-section" key={category.id}><div className="all-category-heading"><h3>{category.label}</h3><span>{categoryProducts.length} itens</span></div><div className="product-grid">{categoryProducts.map(product => <ProductCard key={product.id} product={product} categoryLabel={category.label} canOrder={restaurant.isOpen} onAdd={addProduct} priority={filteredProducts.slice(0,4).some(item => item.id === product.id)} />)}</div></section> : null; })}{filteredProducts.some(product => !menuCategories.some(category => category.id === product.category)) && <section className="all-category-section"><div className="all-category-heading"><h3>Outros</h3></div><div className="product-grid">{filteredProducts.filter(product => !menuCategories.some(category => category.id === product.category)).map(product => <ProductCard key={product.id} product={product} categoryLabel={categoryLabel(product.category)} canOrder={restaurant.isOpen} onAdd={addProduct} priority={filteredProducts.slice(0,4).some(item => item.id === product.id)} />)}</div></section>}</div> : <div className="product-grid">{filteredProducts.map((product) => <ProductCard key={product.id} product={product} categoryLabel={categoryLabel(product.category)} canOrder={restaurant.isOpen} onAdd={addProduct} priority={filteredProducts.slice(0,4).some(item => item.id === product.id)} />)}</div>}
        </section>
      </main>
      <footer className="site-footer"><div><span className="brand brand--footer"><span className="brand-mark">F</span><span>FB3d2y <b>Menu</b></span></span><p>Cardápios próximos, pedidos simples.</p></div><span className="footer-note">feito para negócios locais · beta</span></footer>
      {confirmation && <div className="toast"><CheckCircle2 size={18} /><span>{confirmation}</span><button type="button" onClick={() => setConfirmation(null)} aria-label="Fechar aviso"><X size={15} /></button></div>}
      {count > 0 && !isCartOpen && <button className="floating-cart" type="button" onClick={() => setCartOpen(true)}><span><ShoppingBag size={18} /> Seu pedido</span><b>{formatPrice(total)} <span className="cart-count">{count}</span></b></button>}
      {selectedProduct&&<ComplementPicker product={selectedProduct} selectedIds={selectedComplementIds} onChangeQuantity={(id,amount)=>setSelectedComplementIds(old=>{if(amount<0){const index=old.indexOf(id);if(index<0)return old;return [...old.slice(0,index),...old.slice(index+1)]}const limit=Number(selectedProduct.maxComplementSelections??0);if(limit>0&&old.length>=limit)return old;return [...old,id]})} onClose={()=>setSelectedProduct(null)} onAdd={()=>addLineToCart(selectedProduct,selectedComplementIds.map(id=>(selectedProduct.complements??[]).flatMap(g=>g.options).find(o=>o.id===id)).filter((o):o is ComplementOption=>Boolean(o)))} />}
      {isCartOpen && (cart.length > 0 ? <CartDrawer cart={cart} deliveryRegions={data.restaurant.deliveryRegions??[]} isDemo={isDemo} onClose={() => setCartOpen(false)} onAdjust={adjust} onSubmit={submitOrder} /> : <div className="drawer-backdrop" onClick={() => setCartOpen(false)}><aside className="cart-drawer" onClick={(event) => event.stopPropagation()}><div className="drawer-header"><div><span className="eyebrow">seu pedido</span><h2>0 itens</h2></div><button className="icon-button" type="button" onClick={() => setCartOpen(false)} aria-label="Fechar carrinho"><X size={20} /></button></div><EmptyCart onClose={() => setCartOpen(false)} /></aside></div>)}
    </div>
  )
}

const demoMenu: MenuData = { restaurant: demoRestaurant, categories, products }

function menuSlugFromPath(path: string): string | null {
  const match = path.match(/^\/menu\/([^/?#]+)/)
  if (!match) return null
  try { return decodeURIComponent(match[1]) } catch { return null }
}

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: MenuData }

function StatusScreen({ message, loading = false }: { message: string; loading?: boolean }) {
  return <div className="auth-shell"><div className={loading ? 'auth-card auth-card--loading' : 'auth-card'}><div className="auth-mark">F</div><p>{message}</p>{!loading && <a className="back-link auth-back" href="/"><ArrowLeft size={16} /> voltar ao início</a>}</div></div>
}

function MenuLoader({ slug }: { slug: string }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  useEffect(() => {
    let active = true
    if (!hasSupabaseConfig) {
      setState({ status: 'error', message: 'Este site ainda não está conectado ao banco de dados.' })
      return
    }
    setState({ status: 'loading' })
    fetchMenu(slug)
      .then((data) => { if (active) setState(data ? { status: 'ready', data } : { status: 'error', message: 'Menu não encontrado. Confira o link com o restaurante.' }) })
      .catch(() => { if (active) setState({ status: 'error', message: 'Não foi possível carregar o menu agora. Tente de novo em instantes.' }) })
    return () => { active = false }
  }, [slug])
  if (state.status === 'loading') return <StatusScreen message="Carregando o menu…" loading />
  if (state.status === 'error') return <StatusScreen message={state.message} />
  return <MenuView data={state.data} isDemo={false} onPlaceOrder={(form, items) => createOrder(slug, form, items)} />
}

function StatCard({ value, label, icon }: { value: string; label: string; icon: React.ReactNode }) {
  return <div className="stat-card"><div className="stat-icon">{icon}</div><strong>{value}</strong><span>{label}</span></div>
}

function AdminLoginScreen({ onBack }: { onBack: () => void }) {
  return <div className="auth-shell"><div className="auth-card auth-card--login"><a className="auth-brand" href="/" aria-label="FB3d2y Menu início"><span className="auth-mark">F</span><span>FB3d2y <b>Menu</b></span></a><span className="eyebrow">área de gerenciamento</span><h1>Seu negócio, do seu jeito.</h1><p>Entre para criar seu cardápio, personalizar produtos e acompanhar pedidos em um só lugar.</p><GoogleAccountButton className="google-button" /><button className="back-link auth-back" type="button" onClick={onBack}><ArrowLeft size={16} /> voltar ao menu</button></div></div>
}

type SubscriptionStatus = {active:boolean;free:boolean;expiresAt:string|null;status:string}
type PixSubscription = {paymentId:number;qrCode:string;qrCodeBase64:string;ticketUrl:string}
function SubscriptionGate({session,onActivated}:{session:Session;onActivated:(value:SubscriptionStatus)=>void}) {
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [pix,setPix]=useState<PixSubscription|null>(null)
  const createPix=async()=>{
    setLoading(true);setError('')
    try {
      const response=await fetch('/api/assinatura',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({})})
      const data=await response.json()
      if(!response.ok)throw new Error(data.error||'Não foi possível gerar o Pix.')
      setPix(data)
    } catch(e) { setError(e instanceof Error?e.message:'Não foi possível gerar o Pix.') }
    finally { setLoading(false) }
  }
  const checkPayment=async()=>{
    setLoading(true);setError('')
    try {
      const response=await fetch('/api/assinatura',{headers:{Authorization:'Bearer '+session.access_token}})
      const data=await response.json()
      if(!response.ok)throw new Error(data.error||'Não foi possível consultar a assinatura.')
      if(data.active)onActivated(data as SubscriptionStatus)
      else setError('Pagamento ainda não confirmado. Aguarde a confirmação do Mercado Pago e tente novamente.')
    } catch(e) { setError(e instanceof Error?e.message:'Não foi possível consultar a assinatura.') }
    finally { setLoading(false) }
  }
  return <div className="auth-shell"><div className="auth-card">
    <a className="auth-brand" href="/" aria-label="FB3d2y Menu início"><span className="auth-mark">F</span><span>FB3d2y <b>Menu</b></span></a>
    <span className="eyebrow">acesso à plataforma</span><h1>Assinatura necessária</h1>
    <p>Para criar menus e usar o painel, ative sua assinatura. Contas previamente autorizadas têm acesso gratuito.</p>
    <section className="admin-panel"><div className="panel-heading"><div><span className="eyebrow">plano de acesso</span><h2>FB3d2y Menu completo</h2></div><strong>R$ 50,00</strong></div>
    <p>Pagamento por Pix para liberar 30 dias de acesso.</p>
    {!pix?<button className="primary-button" type="button" disabled={loading} onClick={()=>void createPix()}>{loading?'Gerando Pix…':'Pagar R$ 50,00 com Pix'}</button>:<div className="subscription-pix"><h3>Pix para pagamento #{pix.paymentId}</h3>{pix.qrCodeBase64&&<img alt="QR Code Pix" style={{display:'block',width:220,maxWidth:'100%',height:'auto',margin:'16px auto'}} src={'data:image/png;base64,'+pix.qrCodeBase64}/>}{pix.qrCode&&<><label>Pix copia e cola<textarea readOnly value={pix.qrCode} rows={4}/></label><button className="primary-button" type="button" onClick={()=>{void navigator.clipboard.writeText(pix.qrCode);setError('Código Pix copiado.')}}>Copiar código Pix</button></>}{pix.ticketUrl&&<p><a href={pix.ticketUrl} target="_blank" rel="noreferrer">Abrir cobrança no Mercado Pago</a></p>}<button className="secondary-button" type="button" disabled={loading} onClick={()=>void checkPayment()}>{loading?'Consultando…':'Já paguei — verificar acesso'}</button></div>}
    {error&&<p className="form-error" role="alert">{error}</p>}
    </section>
  </div></div>
}

type AdminRestaurant = { id:number; config_entrega?:{name:string;fee:number;places:string[];negotiate?:boolean}[]|null; nome:string; slug:string; descricao:string|null; localizacao:string|null; endereco:string|null; cep:string|null; cidade:string|null; estado:string|null; cnpj:string|null; email_contato:string|null; telefone_contato:string|null; whatsapp_contato:string|null; horario:string|null; horario_funcionamento?:Record<string,{closed:boolean;open:string;close:string}>|null; status_loja_manual?:boolean|null; instagram:string|null; cor_destaque:string|null; logo_url:string|null; capa_url:string|null; ativo:boolean; aceita_pedidos:boolean }
type AdminCategory = { id:number; nome:string; ordem:number }
type AdminProduct = { id:number; nome:string; descricao:string|null; preco:number; categoria_id:number|null; imagem_url:string|null; disponivel:boolean; ordem:number; max_complementos:number }
type AdminComplementOption = {id:number;nome:string;preco_adicional:number;imagem_url:string|null;ativo:boolean;ordem:number}
type AdminComplementGroup = {id:number;empresa_id:number;nome:string;descricao:string|null;ordem:number;ativo:boolean;max_selecoes:number;opcoes_complementos:AdminComplementOption[]}
const EMPTY_GROUP_IDS: number[] = []
const EMPTY_GROUP_LIMITS: Record<number, number> = {}
type AdminOrder = { id:number; cliente_nome:string; cliente_whatsapp:string; total:number; status:string; tipo_entrega:string; endereco_entrega:string|null; criado_em:string; origem?:string|null; forma_pagamento?:string|null; observacoes?:string|null; precisa_troco?:boolean|null; troco_para?:number|null; regiao_entrega?:string|null; taxa_entrega?:number|null }
function makeSlug(value:string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,55) }
function AdminView({ onBack }: { onBack: () => void }) {
  const [session,setSession]=useState<Session|null>(null), [authLoading,setAuthLoading]=useState(true), [activeTab,setActiveTab]=useState('dashboard')
  const [sidebarCollapsed,setSidebarCollapsed]=useState(()=>typeof window!=='undefined'&&window.matchMedia('(max-width: 760px)').matches)
  const [hoursDraft,setHoursDraft]=useState<Record<string,{closed:boolean;open:string;close:string}>>({})
  const [deliveryDraft,setDeliveryDraft]=useState(['Centro, Conjunto Padre Pedrosa, Espetos, Santa Inês, Bastiões, Rua do Fórum','Alvoredo, Guritiba, Capoeira Seca, Camará, Madeiros, Bom Lugar','Nova Olinda, São Roque, Veneza, Tijuca, Bonfim, Lameirão'])
  const [deliveryFees,setDeliveryFees]=useState([5,10,15])
  const [restaurants,setRestaurants]=useState<AdminRestaurant[]>([]), [selectedId,setSelectedId]=useState<number|null>(null)
  const [cats,setCats]=useState<AdminCategory[]>([]), [items,setItems]=useState<AdminProduct[]>([]), [orders,setOrders]=useState<AdminOrder[]>([])
  const [ordersPeriod,setOrdersPeriod]=useState<SalesPeriod>(1)
  const [complementGroups,setComplementGroups]=useState<AdminComplementGroup[]>([]),[productGroupLinks,setProductGroupLinks]=useState<Record<number,number[]>>({}),[newGroupName,setNewGroupName]=useState(''),[newGroupOptions,setNewGroupOptions]=useState(''),[newProductGroupIds,setNewProductGroupIds]=useState<number[]>([])
  const [busy,setBusy]=useState(false), [notice,setNotice]=useState(''), [noticeError,setNoticeError]=useState(false)
  const [subscription,setSubscription]=useState<{active:boolean;free:boolean;expiresAt:string|null;status:string}|null>(null)
  const [subscriptionError,setSubscriptionError]=useState('')
  const [subscriptionLoading,setSubscriptionLoading]=useState(false)
  const [pix,setPix]=useState<{paymentId:number;qrCode:string;qrCodeBase64:string;ticketUrl:string}|null>(null)
  const [editingOrder,setEditingOrder]=useState<AdminOrder|null>(null)
  const [showCreate,setShowCreate]=useState(false), [newName,setNewName]=useState(''), [newDesc,setNewDesc]=useState(''), [newLocation,setNewLocation]=useState('')
  const [newCat,setNewCat]=useState(''), [newItem,setNewItem]=useState({nome:'',descricao:'',preco:'',categoria_id:'',imagem_url:'',max_complementos:'0'})
  const [counterName,setCounterName]=useState(''),[counterPhone,setCounterPhone]=useState(''),[counterType,setCounterType]=useState<'Retirada'|'Entrega'>('Retirada'),[counterAddress,setCounterAddress]=useState(''),[counterPayment,setCounterPayment]=useState('Dinheiro'),[counterQty,setCounterQty]=useState<Record<number,number>>({})
  const [counterPrices,setCounterPrices]=useState<Record<number,string>>({}),[counterExtraName,setCounterExtraName]=useState(''),[counterExtraPrice,setCounterExtraPrice]=useState(''),[counterExtras,setCounterExtras]=useState<Array<{id:string;nome:string;preco:number;quantidade:number}>>([])
  const [printerName,setPrinterName]=useState(''),[autoPrint,setAutoPrint]=useState(false)
  const [qzPrinters,setQzPrinters]=useState<string[]>([]),[qzPrinterName,setQzPrinterName]=useState(''),[qzStatus,setQzStatus]=useState('Não conectado')
  const [keepScreenOn,setKeepScreenOn]=useState(false),[wakeLock,setWakeLock]=useState<any>(null)
  const [profileOpen,setProfileOpen]=useState(false)
  const profileMenuRef=useRef<HTMLDivElement|null>(null)
  useEffect(()=>{
    if(!profileOpen)return
    const handleOutsideClick=(event:PointerEvent)=>{
      if(profileMenuRef.current&&!profileMenuRef.current.contains(event.target as Node))setProfileOpen(false)
    }
    document.addEventListener('pointerdown',handleOutsideClick)
    return ()=>document.removeEventListener('pointerdown',handleOutsideClick)
  },[profileOpen])
  const [waiters,setWaiters]=useState<Array<{id:number;nome:string;telefone:string|null;ativo:boolean}>>([])
  const [tabs,setTabs]=useState<Array<{id:number;mesa:string;garcom_id:number|null;status:string;observacoes:string|null;created_at:string;closed_at:string|null;garcons?:{nome:string}|null;itens_comanda?:Array<{id:number;produto_nome:string;quantidade:number;preco_unitario:number}>}>>([])
  const [waiterName,setWaiterName]=useState(''),[waiterPhone,setWaiterPhone]=useState(''),[tabTable,setTabTable]=useState(''),[tabWaiter,setTabWaiter]=useState(''),[tabProduct,setTabProduct]=useState(''),[tabQty,setTabQty]=useState('1'),[activeTabId,setActiveTabId]=useState<number|null>(null)
  const selected=restaurants.find(r=>r.id===selectedId)??null
  const storeIsOpenNow=selected?selected.status_loja_manual===true?true:selected.status_loja_manual===false?false:(()=>{const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());const day=({'Sun':'0','Mon':'1','Tue':'2','Wed':'3','Thu':'4','Fri':'5','Sat':'6'} as Record<string,string>)[parts.find(p=>p.type==='weekday')?.value??'Sun'];const now=Number(parts.find(p=>p.type==='hour')?.value??0)*60+Number(parts.find(p=>p.type==='minute')?.value??0);const h=selected.horario_funcionamento?.[day];return h?!h.closed&&now>=Number(h.open.slice(0,2))*60+Number(h.open.slice(3,5))&&now<Number(h.close.slice(0,2))*60+Number(h.close.slice(3,5)):selected.aceita_pedidos})():false
  const weekDays=[{id:'1',label:'Segunda-feira'},{id:'2',label:'Terça-feira'},{id:'3',label:'Quarta-feira'},{id:'4',label:'Quinta-feira'},{id:'5',label:'Sexta-feira'},{id:'6',label:'Sábado'},{id:'0',label:'Domingo'}]
  useEffect(()=>{if(!selectedId)return;const current=restaurants.find(r=>r.id===selectedId);const defaults:Record<string,{closed:boolean;open:string;close:string}>={};for(let day=0;day<7;day++)defaults[String(day)]={closed:day===0,open:'18:00',close:'22:00'};setHoursDraft({...defaults,...(current?.horario_funcionamento??{})})},[selectedId,restaurants])
  // A conta gratuita vitalícia não deve ser redirecionada para a tela de assinatura.
  const notify=(message:string,error=false)=>{setNotice(message);setNoticeError(error);window.setTimeout(()=>setNotice(''),5000)}
  const playOrderAlert=()=>{try{if(!orderAudioRef.current){orderAudioRef.current=new Audio('/freesound_community-friend-request-14878.mp3');orderAudioRef.current.preload='auto'}const audio=orderAudioRef.current;audio.currentTime=0;void audio.play().catch(()=>notify('Clique em “Testar áudio” uma vez e confira se o volume do navegador está ligado.',true))}catch{notify('Não foi possível reproduzir o som neste navegador.',true)}}
  const testAudio=()=>{playOrderAlert();notify('Teste do som de novo pedido.')}
  useEffect(()=>{let alive=true;if(!hasSupabaseConfig){setAuthLoading(false);return}void supabase.auth.getSession().then(({data})=>{if(alive){setSession(data.session);setAuthLoading(false)}});const {data:listener}=supabase.auth.onAuthStateChange((_event,next)=>{if(alive){setSession(next);setAuthLoading(false)}});return()=>{alive=false;listener.subscription.unsubscribe()}},[])
  const loadRestaurants=async()=>{setBusy(true);const {data,error}=await supabase.from('empresas').select('id,nome,slug,descricao,localizacao,endereco,cep,cidade,estado,cnpj,email_contato,telefone_contato,whatsapp_contato,horario,horario_funcionamento,status_loja_manual,config_entrega,instagram,cor_destaque,logo_url,capa_url,ativo,aceita_pedidos').order('criado_em',{ascending:false});setBusy(false);if(error){notify('Erro ao carregar restaurantes. Confira se o SQL do projeto foi executado no Supabase.',true);return}const list=(data??[]) as AdminRestaurant[];setRestaurants(list);setSelectedId(old=>old&&list.some(r=>r.id===old)?old:(list[0]?.id??null))}
  useEffect(()=>{if(session)void loadRestaurants()},[session])
  useEffect(()=>{const config=(restaurants.find(r=>r.id===selectedId) as (AdminRestaurant & {config_entrega?:{name:string;fee:number;places:string[];negotiate?:boolean}[]})|undefined)?.config_entrega??[];const levels=[1,2,3].map(n=>config.find(x=>String(x.name??'').startsWith('Nível '+n))?.places?.join(', ')??'');const fees=[1,2,3].map((n,i)=>{const value=config.find(x=>String(x.name??'').startsWith('Nível '+n))?.fee;return Number.isFinite(Number(value))&&Number(value)>=0?Number(value):[5,10,15][i]});setDeliveryDraft(levels);setDeliveryFees(fees)},[restaurants,selectedId])
  useEffect(()=>{if(!session)return;let alive=true;void fetch('/api/assinatura',{headers:{Authorization:'Bearer '+session.access_token}}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível consultar a assinatura.');if(alive){setSubscription(data);setSubscriptionError('')}}).catch(error=>{if(alive)setSubscriptionError(error instanceof Error?error.message:'Não foi possível consultar a assinatura.')});return()=>{alive=false}},[session])
  const loadDetails=async(id:number)=>{setBusy(true);const [c,p,o,g,links]=await Promise.all([supabase.from('categorias').select('id,nome,ordem').eq('empresa_id',id).order('ordem'),supabase.from('produtos').select('id,nome,descricao,preco,categoria_id,imagem_url,disponivel,ordem,max_complementos').eq('empresa_id',id).order('ordem'),supabase.from('pedidos').select('id,cliente_nome,cliente_whatsapp,total,status,tipo_entrega,endereco_entrega,criado_em,origem,forma_pagamento,observacoes,precisa_troco,troco_para,regiao_entrega,taxa_entrega').eq('empresa_id',id).order('criado_em',{ascending:false}).limit(100),supabase.from('grupos_complementos').select('id,empresa_id,nome,descricao,ordem,ativo,max_selecoes,opcoes_complementos(id,nome,preco_adicional,imagem_url,ativo,ordem)').eq('empresa_id',id).order('ordem'),supabase.from('produto_grupos_complementos').select('produto_id,grupo_id')]);setBusy(false);if(c.error||p.error||o.error||g.error||links.error){notify('Erro ao carregar dados. Para Complementos, execute supabase/07_complementos.sql no Supabase de teste.',true);if(!g.error&&!links.error){setComplementGroups((g.data??[]) as unknown as AdminComplementGroup[])}return}setCats((c.data??[]) as AdminCategory[]);setItems((p.data??[]) as AdminProduct[]);setOrders((o.data??[]) as AdminOrder[]);setComplementGroups((g.data??[]) as unknown as AdminComplementGroup[]);const map:Record<number,number[]>={};for(const row of links.data??[]){const pid=Number(row.produto_id),gid=Number(row.grupo_id);(map[pid]??=[]).push(gid)}setProductGroupLinks(map)}
  const refreshOrders=async(id:number)=>{const {data,error}=await supabase.from('pedidos').select('id,cliente_nome,cliente_whatsapp,total,status,tipo_entrega,endereco_entrega,criado_em,origem,forma_pagamento,observacoes,precisa_troco,troco_para,regiao_entrega,taxa_entrega').eq('empresa_id',id).order('criado_em',{ascending:false}).limit(100);if(!error&&data)setOrders(data as AdminOrder[])}
  const autoPrintSeenIds=useRef(new Map<number,Set<string>>())
  const orderAudioRef=useRef<HTMLAudioElement|null>(null)
  useEffect(()=>{if(!session||selectedId===null)return;const id=selectedId;let active=true;let initialized=false;let polling=false;const pollOrders=async()=>{if(polling||!active)return;polling=true;try{const {data,error}=await supabase.from('pedidos').select('id,cliente_nome,cliente_whatsapp,total,status,tipo_entrega,endereco_entrega,criado_em,origem,forma_pagamento,observacoes,precisa_troco,troco_para,regiao_entrega,taxa_entrega').eq('empresa_id',id).order('criado_em',{ascending:false}).limit(100);if(!active||error||!data)return;const list=data as AdminOrder[];setOrders(list);const seen=autoPrintSeenIds.current.get(id)??new Set<string>();if(!initialized){list.forEach(order=>seen.add(String(order.id)));autoPrintSeenIds.current.set(id,seen);initialized=true;return}let cfg:{autoPrint?:boolean;qzPrinterName?:string}|null=null;try{cfg=JSON.parse(window.localStorage.getItem('menuhub-print-'+id)||'{}')}catch{cfg=null}const printerConfigured=Boolean(cfg?.qzPrinterName);for(const order of [...list].reverse()){const key=String(order.id);if(seen.has(key))continue;seen.add(key);if(String(order.status??'').trim().toLocaleLowerCase('pt-BR')==='novo'){playOrderAlert();notify('Novo pedido recebido! Pedido #'+order.id)}if(cfg?.autoPrint===true&&printerConfigured&&String(order.status??'').trim().toLocaleLowerCase('pt-BR')==='novo'){void printOrderWithItems(order)}}autoPrintSeenIds.current.set(id,seen)}finally{polling=false}};void pollOrders();const interval=window.setInterval(()=>{void pollOrders()},5000);const channel=supabase.channel('menuhub-orders-'+id).on('postgres_changes',{event:'INSERT',schema:'public',table:'pedidos',filter:'empresa_id=eq.'+id},()=>{void pollOrders()}).subscribe();return()=>{active=false;window.clearInterval(interval);void supabase.removeChannel(channel)}},[session,selectedId,qzPrinterName])
  useEffect(()=>{if(session&&selectedId!==null)void loadDetails(selectedId);else{setCats([]);setItems([]);setOrders([])}},[session,selectedId])
  const toggleStoreOrders=async()=>{if(!selected)return;const next=!storeIsOpenNow;const {error}=await supabase.from('empresas').update({status_loja_manual:next,aceita_pedidos:next}).eq('id',selected.id);if(error){notify('Não foi possível alterar o status da loja: '+error.message,true);return}setRestaurants(old=>old.map(r=>r.id===selected.id?{...r,status_loja_manual:next,aceita_pedidos:next}:r));notify(next?'Loja aberta para receber pedidos.':'Loja fechada para novos pedidos.')}
  const saveOpeningHours=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!selected)return;for(const [day,h] of Object.entries(hoursDraft)){if(!h.closed&&(!h.open||!h.close||h.close<=h.open)){notify('Confira os horários: o fechamento deve ser depois da abertura.',true);return}}const {error}=await supabase.from('empresas').update({horario_funcionamento:hoursDraft,status_loja_manual:null,aceita_pedidos:true}).eq('id',selected.id);if(error){notify('Não foi possível salvar os horários: '+error.message,true);return}setRestaurants(old=>old.map(r=>r.id===selected.id?{...r,horario_funcionamento:hoursDraft,status_loja_manual:null,aceita_pedidos:true}:r));notify('Horários salvos. A loja seguirá a programação automaticamente.')}
  const createRestaurant=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!session?.user||newName.trim().length<2)return;setBusy(true);const base=makeSlug(newName)||'meu-menu';let slug=base,n=2;while(restaurants.some(r=>r.slug===slug)){slug=base+'-'+n++}const {data,error}=await supabase.from('empresas').insert({nome:newName.trim(),slug,descricao:newDesc.trim()||null,localizacao:newLocation.trim()||null,dono_id:session.user.id,cor_destaque:'#0e4f59',ativo:true,aceita_pedidos:true}).select('id,nome,slug,descricao,localizacao,endereco,cep,cidade,estado,cnpj,email_contato,telefone_contato,whatsapp_contato,horario,horario_funcionamento,status_loja_manual,instagram,cor_destaque,logo_url,capa_url,ativo,aceita_pedidos').single();setBusy(false);if(error){notify('Não foi possível criar: '+error.message,true);return}const r=data as AdminRestaurant;setRestaurants(old=>[r,...old]);setSelectedId(r.id);setNewName('');setNewDesc('');setNewLocation('');setShowCreate(false);setActiveTab('menu');notify('Restaurante criado!')}
  const saveRestaurant=async(e:React.FormEvent<HTMLFormElement>,form:Record<string,unknown>)=>{e.preventDefault();if(!selected)return;setBusy(true);const {error}=await supabase.from('empresas').update(form).eq('id',selected.id);setBusy(false);if(error){notify('Erro ao salvar: '+error.message,true);return}setRestaurants(old=>old.map(r=>r.id===selected.id?{...r,...form} as AdminRestaurant:r));notify('Informações salvas.')}
  const addCategory=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!selected||!newCat.trim())return;const {data,error}=await supabase.from('categorias').insert({empresa_id:selected.id,nome:newCat.trim(),ordem:cats.length+1}).select('id,nome,ordem').single();if(error){notify('Erro ao criar categoria: '+error.message,true);return}setCats(old=>[...old,data as AdminCategory]);setNewCat('');notify('Categoria criada.')}
  const addProduct=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!selected||!newItem.nome.trim()||!Number.isFinite(Number(newItem.preco.replace(',','.')))||Number(newItem.preco.replace(',','.'))<0){notify('Informe nome e preço válido.',true);return}setBusy(true);const {data,error}=await supabase.from('produtos').insert({empresa_id:selected.id,nome:newItem.nome.trim(),descricao:newItem.descricao.trim()||null,preco:Number(newItem.preco.replace(',','.')),categoria_id:newItem.categoria_id?Number(newItem.categoria_id):null,imagem_url:newItem.imagem_url.trim()||null,disponivel:true,ordem:items.length+1,max_complementos:Math.max(0,Math.min(50,Math.floor(Number(newItem.max_complementos)||0)))}).select('id,nome,descricao,preco,categoria_id,imagem_url,disponivel,ordem,max_complementos').single();if(error){setBusy(false);notify('Erro ao cadastrar produto: '+error.message,true);return}if(newProductGroupIds.length){const link=await supabase.from('produto_grupos_complementos').insert(newProductGroupIds.map(grupo_id=>({produto_id:data.id,grupo_id})));if(link.error){setBusy(false);notify('Produto criado, mas os complementos não foram vinculados: '+link.error.message,true);return}}setBusy(false);setItems(old=>[...old,data as AdminProduct]);setProductGroupLinks(old=>({...old,[data.id]:newProductGroupIds}));setNewProductGroupIds([]);setNewItem({nome:'',descricao:'',preco:'',categoria_id:'',imagem_url:'',max_complementos:'0'});notify('Produto cadastrado.')}
  const updateProduct=async(p:AdminProduct,patch:Partial<AdminProduct>,groupIds?:number[])=>{const {error}=await supabase.from('produtos').update(patch).eq('id',p.id);if(error){notify('Erro ao atualizar produto: '+error.message,true);throw error}if(groupIds!==undefined){const {error:linksError}=await supabase.rpc('definir_complementos_produto',{p_produto_id:p.id,p_grupo_ids:groupIds});if(linksError){notify('Não foi possível salvar os complementos: '+linksError.message,true);throw linksError}setProductGroupLinks(old=>({...old,[p.id]:groupIds}))}setItems(old=>old.map(x=>x.id===p.id?{...x,...patch}:x));notify('Produto e complementos salvos.')}
  const deleteProduct=async(p:AdminProduct)=>{if(!window.confirm('Excluir o produto '+p.nome+'?'))return;const {error}=await supabase.from('produtos').delete().eq('id',p.id);if(error){notify('Erro ao excluir: '+error.message,true);return}setItems(old=>old.filter(x=>x.id!==p.id));notify('Produto excluído.')}
  const updateOrder=async(o:AdminOrder,status:string)=>{const {error}=await supabase.from('pedidos').update({status}).eq('id',o.id);if(error){notify('Erro ao atualizar pedido: '+error.message,true);return}setOrders(old=>old.map(x=>x.id===o.id?{...x,status}:x))}
  const startEditOrder=async(o:AdminOrder)=>{if(!selected)return;setBusy(true);const {data,error}=await supabase.from('itens_pedido').select('produto_id,quantidade').eq('pedido_id',o.id);setBusy(false);if(error){notify('Não foi possível carregar os itens do pedido: '+error.message,true);return}setEditingOrder(o);setCounterName(o.cliente_nome);setCounterPhone(o.cliente_whatsapp);setCounterType(o.tipo_entrega==='Entrega'?'Entrega':'Retirada');setCounterAddress(o.endereco_entrega??'');setCounterPayment(o.forma_pagamento??'Dinheiro');const quantities:Record<number,number>={};for(const row of data??[]){if(row.produto_id)quantities[Number(row.produto_id)]=Number(row.quantidade)}setCounterQty(quantities);setActiveTab('counter');notify('Pedido carregado no balcão para edição.')}
  useEffect(()=>{if(!selectedId)return;const saved=window.localStorage.getItem('menuhub-print-'+selectedId);if(saved){try{const cfg=JSON.parse(saved) as {name?:string;qzPrinterName?:string;autoPrint?:boolean};setPrinterName(cfg.name??'');setQzPrinterName(cfg.qzPrinterName??'');setAutoPrint(cfg.autoPrint===true)}catch{setPrinterName('');setQzPrinterName('');setAutoPrint(false)}}else{setPrinterName('');setQzPrinterName('');setAutoPrint(false)}},[selectedId])
  useEffect(()=>{if(!keepScreenOn)return;let active=true;const requestLock=async()=>{try{if(!active||document.visibilityState!=='visible'||!('wakeLock' in navigator))return;const lock=await (navigator as any).wakeLock.request('screen');if(!active){await lock.release();return}setWakeLock(lock);lock.addEventListener('release',()=>setWakeLock(null),{once:true})}catch{setWakeLock(null)}};const onVisibility=()=>{if(document.visibilityState==='visible')void requestLock()};void requestLock();document.addEventListener('visibilitychange',onVisibility);return()=>{active=false;document.removeEventListener('visibilitychange',onVisibility);setWakeLock(null)}},[keepScreenOn])
  useEffect(()=>()=>{if(wakeLock)void wakeLock.release?.()},[wakeLock])
  const connectQzTray=async()=>{try{setQzStatus('Conectando…');configureQzSecurity();if(!window.qz)throw new Error('A biblioteca QZ Tray não carregou. Atualize a página.');if(!window.qz.websocket.isActive())await window.qz.websocket.connect({retries:3,delay:1});const found=await window.qz.printers.find();setQzPrinters(found);setQzPrinterName(old=>old&&found.includes(old)?old:(found[0]??''));setQzStatus(found.length?'Conectado':'Nenhuma impressora encontrada');notify(found.length?'QZ Tray conectado. Selecione a impressora.':'QZ Tray conectado, mas nenhuma impressora foi encontrada.',!found.length)}catch(err){setQzStatus('Falha na conexão');notify(err instanceof Error?err.message:'Não foi possível conectar ao QZ Tray.',true)}}
  const printQzText=async(printer:string,content:string)=>{if(!window.qz)throw new Error('QZ Tray não está disponível nesta página.');configureQzSecurity();if(!window.qz.websocket.isActive())await window.qz.websocket.connect({retries:3,delay:1});const config=window.qz.configs.create(printer,{encoding:'CP860',jobName:'FB3d2y Menu'});await window.qz.print(config,[content])}
  const buildTestReceipt=(storeName:string)=>'\x1B\x40'+'\x1B\x61\x01'+'\x1B\x45\x01'+'\x1B\x21\x30'+storeName.slice(0,24)+'\n\n'+'\x1B\x21\x00'+'\x1B\x45\x00'+'\x1B\x61\x00'+'TESTE DE IMPRESSAO\n'+'QZ TRAY - FB3d2y MENU\n'+'Papel: 50 mm\n'+'--------------------------------\n'+'Conexao funcionando!\n'+'\n'.repeat(4)+'\x1D\x56\x00'
  const testQzPrinter=async()=>{try{if(!qzPrinterName)throw new Error('Selecione uma impressora primeiro.');setQzStatus('Enviando teste…');await printQzText(qzPrinterName,buildTestReceipt(printerName.trim()||selected?.nome||'FB3d2y Menu'));setQzStatus('Conectado');notify('Teste enviado para '+qzPrinterName+'.')}catch(err){setQzStatus('Erro no teste');notify(err instanceof Error?err.message:'Falha ao imprimir o teste.',true)}}
  const savePrinterSettings=()=>{if(!selectedId||!qzPrinterName){notify('Conecte o QZ Tray e selecione uma impressora.',true);return}window.localStorage.setItem('menuhub-print-'+selectedId,JSON.stringify({name:printerName.trim()||selected?.nome||'Restaurante',qzPrinterName,autoPrint}));notify(autoPrint?'Configurações salvas. Impressão automática ativada neste computador.':'Configurações da impressora salvas neste dispositivo.')}
  const printOrderWithItems=async(o:AdminOrder)=>{
    const cfg=(()=>{try{return JSON.parse(window.localStorage.getItem('menuhub-print-'+(selectedId??''))||'{}') as {name?:string;logo?:string;qzPrinterName?:string}}catch{return {}}})();
    const activeQzPrinter=cfg.qzPrinterName||qzPrinterName;
    const useQzTray=Boolean(activeQzPrinter);
    const w=useQzTray?null:window.open('','_blank','width=420,height=720');
    if(!useQzTray&&!w){notify('Permita pop-ups para imprimir a comanda.',true);return}
    if(w)w.document.title='Preparando nota';
    let itemLines:{nome:string;quantidade:number;preco?:number;categoria:string;complements?:string[]}[]=[];
    const {data}=await supabase.from('itens_pedido').select('quantidade,preco_unitario,nome_produto').eq('pedido_id',o.id);
    if(data)itemLines=(data as any[]).map(x=>({nome:x.nome_produto??'Produto',quantidade:Number(x.quantidade),preco:Number(x.preco_unitario??0),categoria:'Outros'}));
    const storeName=(selected?.nome||cfg.name||'Restaurante').replace(/[<>]/g,'');
    itemLines=itemLines.map(line=>{
      const match=line.nome.match(/^(.*?)\s+\((.+)\)$/);
      const rawComplements=match?match[2].split(/\s*,\s*/).map(raw=>raw.split(/\s+[-–—]\s+/)[0].trim()).filter(Boolean):[];
      const counts=new Map<string,number>();
      rawComplements.forEach(name=>counts.set(name,(counts.get(name)||0)+1));
      const complements=[...counts.entries()].map(([name,count])=>name+' '+count+'x');
      return {...line,nome:match?match[1].trim():line.nome,complements};
    });
    itemLines=itemLines.map(line=>({...line,categoria:(cats.find(cat=>cat.id===items.find(p=>p.nome===line.nome)?.categoria_id)?.nome)||'Outros'}));
    const categorySequence=[...cats].sort((a,b)=>a.ordem-b.ordem).map(c=>c.nome);
    const groupedItems=[...itemLines].sort((a,b)=>{const ai=categorySequence.indexOf(a.categoria),bi=categorySequence.indexOf(b.categoria);return (ai<0?999:ai)-(bi<0?999:bi)});
    const rows=groupedItems.map(x=>'<div class="row"><span><strong>'+String(x.quantidade)+'x '+String(x.nome).replace(/[<>]/g,'')+'</strong>'+(x.complements?.length?x.complements.map(name=>'<small class="complement">'+String(name).replace(/[<>]/g,'')+'</small>').join(''):'')+'<small>'+String(x.categoria).replace(/[<>]/g,'')+'</small></span><span>'+formatPrice((x.preco??0)*x.quantidade)+'</span></div>').join('');
    const categoryGroups=[...new Set(groupedItems.map(x=>x.categoria))];
    const publicOrderCode=formatPublicOrderCode(o.id,o.criado_em);
    if(useQzTray){try{
      const cleanText=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[<>]/g,'');
      const moneyText=(value:number)=>'R$ '+Number(value||0).toFixed(2).replace('.',',');
      const receipt=['PEDIDO: '+publicOrderCode,new Date(o.criado_em).toLocaleString('pt-BR'),'--------------------------------','Cliente: '+cleanText(o.cliente_nome),...(o.observacoes?['Obs.: '+cleanText(o.observacoes)]:[]),'--------------------------------',...categoryGroups.flatMap((category,index)=>[...(index?['--------------------------------']:[]),cleanText(category).toUpperCase(),...groupedItems.filter(x=>x.categoria===category).flatMap(x=>[String(x.quantidade)+'x '+cleanText(x.nome)+'  '+moneyText((x.preco??0)*x.quantidade),...(x.complements??[]).map(name=>'  '+cleanText(name))])]),'--------------------------------','TOTAL: '+moneyText(Number(o.total)),'--------------------------------',...(o.precisa_troco?['TROCO PARA: '+moneyText(Number(o.troco_para)),'TROCO: '+moneyText(Math.max(0,Number(o.troco_para)-Number(o.total))),'']:[]),...(o.endereco_entrega?['Endereco: '+cleanText(o.endereco_entrega)]:[]),'--------------------------------','TIPO: '+cleanText(o.tipo_entrega),...(o.tipo_entrega==='Entrega'?[o.regiao_entrega==='Outra região'?'TAXA DE ENTREGA: A COMBINAR':Number(o.taxa_entrega)>0?'TAXA DE ENTREGA: '+moneyText(Number(o.taxa_entrega)):'TAXA DE ENTREGA: NÃO REGISTRADA']:[]),'PAGAMENTO: '+cleanText(o.forma_pagamento||'Pix'),'--------------------------------','Obrigado pela preferencia!'].join('\n');
      const content='\x1B\x40'+'\x1B\x33\x14'+'\x1B\x61\x01'+'\x1B\x45\x01'+'\x1B\x21\x30'+storeName.slice(0,24)+'\n'+'\x1B\x45\x00'+'\x1B\x21\x01'+'\x1B\x61\x00'+receipt.replace('PEDIDO: ','\x1B\x45\x01\x1B\x21\x00PEDIDO: \x1B\x45\x00\x1B\x21\x01').replace('Cliente: ','\x1B\x45\x01Cliente: \x1B\x45\x00').replace('Obs.: ','\x1B\x45\x01Obs.: \x1B\x45\x00').replace('TOTAL: ','\x1B\x45\x01\x1B\x21\x00TOTAL: \x1B\x45\x00\x1B\x21\x01').replace('TIPO: ','\x1B\x45\x01TIPO: ').replace('PAGAMENTO: ','\x1B\x45\x01PAGAMENTO: ').replace(/(^|\n)([A-ZÁÉÍÓÚÃÕÇ ]{3,})(?=\n)/g,'$1\x1B\x45\x01\x1B\x21\x00$2\x1B\x45\x00\x1B\x21\x01')+'\x1B\x32\x1B\x21\x00\x1B\x45\x00'+'\n'.repeat(2)+'\x1D\x56\x00';
      await printQzText(activeQzPrinter,content);notify('Comanda #'+o.id+' enviada para '+activeQzPrinter+'.');return
    }catch(err){if(w)w.close();notify('Falha ao imprimir pelo QZ Tray: '+(err instanceof Error?err.message:'erro desconhecido'),true);return}}
    if(!w)return;
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Pedido '+publicOrderCode+'</title><style>@page{size:60mm auto;margin:2mm}*{box-sizing:border-box}body{width:56mm;margin:0 auto;font:9px/1.04 monospace;color:#000;padding:1mm 0}header{text-align:left;border-bottom:1px dashed #000;padding-bottom:3px;margin-bottom:4px}.logo{display:block;width:42px;height:42px;object-fit:contain;image-rendering:pixelated;filter:grayscale(1) contrast(3);margin:8px auto}h1{font-size:20px;font-weight:1000;text-align:center;text-transform:uppercase;letter-spacing:.1px;line-height:1.05;margin:1px 0;overflow-wrap:anywhere;transform:translateX(-2mm)}p{margin:1.5px 0}.row{display:flex;justify-content:space-between;gap:4px;padding:1px 0;border-bottom:0}.row small{display:block;font-size:7px;line-height:1;margin-top:0}.row small.complement{display:block;font-size:7px;font-weight:600;line-height:1;margin:0 0 0 3px;padding:0}.row strong{font-weight:1000}.items{border-bottom:1px dashed #000;padding:2px 0;margin-bottom:2px}.total{font-size:11px;font-weight:bold;padding:3px 0;border-top:1px dashed #000;border-bottom:1px dashed #000;margin:2px 0}.foot{text-align:center;border-top:1px dashed #000;padding-top:3px;margin-top:3px;font-size:9px}.receipt-title,.receipt-meta{font-weight:900;text-align:center}.receipt-meta{margin-top:6px}.end-meta{font-weight:900;font-size:13px;line-height:1.25;margin-top:4px;padding:2px 4px;border-top:2px solid #000;border-bottom:2px solid #000}.end-meta p{font-weight:900;margin:0;padding:1px 0;border-bottom:1px dashed #000}.end-meta p:last-child{border-bottom:0}</style></head><body><header><h1>'+storeName+'</h1><p class="receipt-title">PEDIDO: '+publicOrderCode+'</p><p>'+new Date(o.criado_em).toLocaleString('pt-BR')+'</p></header><p>Cliente: '+String(o.cliente_nome).replace(/[<>]/g,'')+'</p>'+(o.observacoes?'<p>Obs.: '+String(o.observacoes).replace(/[<>]/g,'')+'</p>':'')+'<div class="items">'+(rows||'<p>Itens indisponíveis para impressão.</p>')+'</div>'+'<div class="row total"><span>TOTAL</span><span>'+formatPrice(Number(o.total))+'</span></div>'+(o.precisa_troco?'<p>Troco para: '+formatPrice(Number(o.troco_para))+'</p><p><b>Troco: '+formatPrice(Math.max(0,Number(o.troco_para)-Number(o.total)))+'</b></p>':'')+(o.endereco_entrega?'<p>Endereço: '+String(o.endereco_entrega).replace(/[<>]/g,'')+'</p>':'')+'<div class="end-meta"><p><b>TIPO: '+String(o.tipo_entrega).replace(/[<>]/g,'')+'</b></p>'+(o.tipo_entrega==='Entrega'?(o.regiao_entrega==='Outra região'?'<p><b>TAXA DE ENTREGA: A COMBINAR</b></p>':Number(o.taxa_entrega)>0?'<p><b>TAXA DE ENTREGA: '+formatPrice(Number(o.taxa_entrega))+'</b></p>':'<p><b>TAXA DE ENTREGA: NÃO REGISTRADA</b></p>'):'')+'<p><b>PAGAMENTO: '+String(o.forma_pagamento||'Pix').replace(/[<>]/g,'')+'</b></p></div><div class="foot">Obrigado pela preferência!</div><script>window.onload=()=>setTimeout(()=>window.print(),300);window.onafterprint=()=>window.close()</script></body></html>');
    w.document.close()
  }
  const createCounterOrder=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!selected)return;const picked=items.filter(p=>(counterQty[p.id]??0)>0&&p.disponivel);const extras=counterExtras.filter(x=>x.quantidade>0);if(!picked.length&&!extras.length){notify('Adicione pelo menos um produto ou pedido avulso.',true);return}const unitPrice=(p:AdminProduct)=>{const raw=counterPrices[p.id];return raw===undefined||raw.trim()===''?Number(p.preco):Number(raw.replace(',','.'))};if(picked.some(p=>!Number.isFinite(unitPrice(p))||unitPrice(p)<0)){notify('Confira os preços dos produtos.',true);return}const total=picked.reduce((sum,p)=>sum+unitPrice(p)*(counterQty[p.id]??0),0)+extras.reduce((sum,x)=>sum+x.preco*x.quantidade,0);setBusy(true);try{if(editingOrder){const patch={cliente_nome:counterName.trim()||'Cliente balcão',cliente_whatsapp:counterPhone.trim()||'0000000000',tipo_entrega:counterType,endereco_entrega:counterType==='Entrega'?counterAddress.trim():null,forma_pagamento:counterPayment,total};const upd=await supabase.from('pedidos').update(patch).eq('id',editingOrder.id);if(upd.error)throw new Error(upd.error.message);const del=await supabase.from('itens_pedido').delete().eq('pedido_id',editingOrder.id);if(del.error)throw new Error(del.error.message);const rows=[...picked.map(p=>({pedido_id:editingOrder.id,produto_id:p.id,nome_produto:p.nome,quantidade:counterQty[p.id],preco_unitario:unitPrice(p)})),...extras.map(x=>({pedido_id:editingOrder.id,produto_id:null,nome_produto:x.nome,quantidade:x.quantidade,preco_unitario:x.preco}))];const ins=await supabase.from('itens_pedido').insert(rows);if(ins.error)throw new Error(ins.error.message);setEditingOrder(null);setCounterExtras([]);setCounterPrices({});await loadDetails(selected.id);setActiveTab('orders');notify('Pedido editado e total recalculado.')}else if(extras.length||picked.some(p=>unitPrice(p)!==Number(p.preco))){const order=await supabase.from('pedidos').insert({empresa_id:selected.id,cliente_nome:counterName.trim()||'Cliente balcão',cliente_whatsapp:counterPhone.trim()||'0000000000',total,status:'novo',tipo_entrega:counterType,endereco_entrega:counterType==='Entrega'?counterAddress.trim():null,forma_pagamento:counterPayment,origem:'balcao'}).select('id').single();if(order.error)throw new Error(order.error.message);const rows=[...picked.map(p=>({pedido_id:order.data.id,produto_id:p.id,nome_produto:p.nome,quantidade:counterQty[p.id],preco_unitario:unitPrice(p)})),...extras.map(x=>({pedido_id:order.data.id,produto_id:null,nome_produto:x.nome,quantidade:x.quantidade,preco_unitario:x.preco}))];const ins=await supabase.from('itens_pedido').insert(rows);if(ins.error)throw new Error(ins.error.message);setCounterName('');setCounterPhone('');setCounterAddress('');setCounterType('Retirada');setCounterPayment('Dinheiro');setCounterQty({});setCounterPrices({});setCounterExtras([]);await loadDetails(selected.id);setActiveTab('orders');notify('Pedido de balcão com itens avulsos registrado.')}else{const {error}=await supabase.rpc('criar_pedido_balcao',{p_empresa_id:selected.id,p_nome:counterName.trim()||'Cliente balcão',p_whatsapp:counterPhone.trim(),p_tipo_entrega:counterType,p_endereco:counterAddress.trim(),p_forma_pagamento:counterPayment,p_itens:picked.map(p=>({produto_id:p.id,quantidade:counterQty[p.id],preco_unitario:unitPrice(p)}))});if(error)throw new Error(error.message);setCounterName('');setCounterPhone('');setCounterAddress('');setCounterType('Retirada');setCounterPayment('Dinheiro');setCounterQty({});setCounterPrices({});await loadDetails(selected.id);setActiveTab('orders');notify('Pedido de balcão registrado. Você já pode imprimir a nota.')}}catch(err){notify(err instanceof Error?err.message:'Não foi possível salvar o pedido.',true)}finally{setBusy(false)}}
  const loadTabsAndWaiters=async(id:number)=>{const [w,t]=await Promise.all([supabase.from('garcons').select('id,nome,telefone,ativo').eq('empresa_id',id).order('nome'),supabase.from('comandas').select('id,mesa,garcom_id,status,observacoes,created_at,closed_at,garcons(nome),itens_comanda(id,produto_nome,quantidade,preco_unitario)').eq('empresa_id',id).order('created_at',{ascending:false})]);if(w.error||t.error){notify('Para usar Comandas e garçons, execute o arquivo supabase/09_comandas_garcons.sql no Supabase de teste.',true);return}setWaiters((w.data??[]) as any);setTabs((t.data??[]) as any)}
  useEffect(()=>{if(session&&selectedId!==null&&activeTab==='tabs')void loadTabsAndWaiters(selectedId)},[session,selectedId,activeTab])
  if(authLoading)return <div className="auth-shell"><div className="auth-card auth-card--loading"><div className="auth-mark">F</div><p>Verificando sua conta…</p></div></div>
  if(!hasSupabaseConfig)return <StatusScreen message="Configure SUPABASE_URL e SUPABASE_ANON_KEY nas variáveis da Vercel."/>
  if(!session)return <AdminLoginScreen onBack={onBack}/>
  if(subscription===null)return <div className="auth-shell"><div className="auth-card"><span className="auth-mark">F</span><h1>Verificando acesso</h1>{subscriptionError?<><p className="form-error">{subscriptionError}</p><button className="primary-button" type="button" onClick={async()=>{setSubscriptionError('');try{const response=await fetch('/api/assinatura',{headers:{Authorization:'Bearer '+session.access_token}});const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível consultar a assinatura.');setSubscription(data)}catch(error){setSubscriptionError(error instanceof Error?error.message:'Não foi possível consultar a assinatura.')}}}>Tentar novamente</button></>:<p>Confirmando se esta conta tem acesso gratuito ou assinatura ativa…</p>}</div></div>
  if(!subscription.active)return <SubscriptionGate session={session} onActivated={setSubscription}/>
  const addWaiter=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!selected||!waiterName.trim())return;const {data,error}=await supabase.from('garcons').insert({empresa_id:selected.id,nome:waiterName.trim(),telefone:waiterPhone.trim()||null,ativo:true}).select('id,nome,telefone,ativo').single();if(error){notify('Não foi possível cadastrar o garçom. O SQL 09 ainda não foi aplicado no projeto Supabase de teste. Execute supabase/09_comandas_garcons.sql no SQL Editor e recarregue o painel. '+error.message,true);return}setWaiters(old=>[...old,data as any].sort((a,b)=>a.nome.localeCompare(b.nome)));setWaiterName('');setWaiterPhone('');notify('Garçom cadastrado.')}
  const toggleWaiter=async(w:{id:number;ativo:boolean})=>{const {error}=await supabase.from('garcons').update({ativo:!w.ativo}).eq('id',w.id);if(error){notify('Não foi possível atualizar o garçom: '+error.message,true);return}setWaiters(old=>old.map(x=>x.id===w.id?{...x,ativo:!w.ativo}:x));notify(w.ativo?'Garçom desativado.':'Garçom reativado.')}
  const openTab=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!selected||!tabTable.trim())return;const {data,error}=await supabase.from('comandas').insert({empresa_id:selected.id,mesa:tabTable.trim(),garcom_id:tabWaiter?Number(tabWaiter):null,status:'aberta'}).select('id,mesa,garcom_id,status,observacoes,created_at,closed_at').single();if(error){notify('Não foi possível abrir a comanda: '+error.message,true);return}setTabs(old=>[{...(data as any),garcons:waiters.find(w=>w.id===Number(tabWaiter))?{nome:waiters.find(w=>w.id===Number(tabWaiter))!.nome}:null,itens_comanda:[]},...old]);setActiveTabId(data.id);setTabTable('');notify('Comanda aberta.')}
  const addTabItem=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();const tab=tabs.find(x=>x.id===activeTabId);const product=items.find(x=>x.id===Number(tabProduct));const qty=Math.floor(Number(tabQty));if(!tab||tab.status!=='aberta'||!product||qty<1||qty>99){notify('Selecione uma comanda aberta, um produto e uma quantidade válida.',true);return}const {data,error}=await supabase.from('itens_comanda').insert({comanda_id:tab.id,produto_id:product.id,produto_nome:product.nome,quantidade:qty,preco_unitario:Number(product.preco)}).select('id,produto_nome,quantidade,preco_unitario').single();if(error){notify('Não foi possível adicionar o item: '+error.message,true);return}setTabs(old=>old.map(x=>x.id===tab.id?{...x,itens_comanda:[...(x.itens_comanda??[]),data as any]}:x));setTabProduct('');setTabQty('1');notify('Item adicionado à comanda.')}
  const closeTab=async(tabId:number)=>{const tab=tabs.find(x=>x.id===tabId);if(!tab)return;const {error}=await supabase.from('comandas').update({status:'fechada',closed_at:new Date().toISOString()}).eq('id',tabId);if(error){notify('Não foi possível fechar a comanda: '+error.message,true);return}setTabs(old=>old.map(x=>x.id===tabId?{...x,status:'fechada',closed_at:new Date().toISOString()}:x));notify('Comanda fechada.')}
  const nav=(id:string,label:string,icon:React.ReactNode)=><button className={activeTab===id?'admin-nav__link admin-nav__link--active':'admin-nav__link'} onClick={()=>{setActiveTab(id);if(window.matchMedia('(max-width: 760px)').matches)setSidebarCollapsed(true)}} type="button">{icon}{label}</button>
  const addComplementGroup=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!selected||!newGroupName.trim())return;const lines=newGroupOptions.split('\n').map(x=>x.trim()).filter(Boolean).map(line=>{const [name,price='0']=line.split('|');return {nome:name.trim(),preco_adicional:Number(price.trim().replace(',','.'))}});if(!lines.length||lines.some(x=>!x.nome||!Number.isFinite(x.preco_adicional)||x.preco_adicional<0)){notify('Informe as opções uma por linha. Use Nome|Preço opcional, por exemplo Calabresa|3,00.',true);return}setBusy(true);const {data,error}=await supabase.from('grupos_complementos').insert({empresa_id:selected.id,nome:newGroupName.trim(),ordem:complementGroups.length+1,ativo:true}).select('id,empresa_id,nome,descricao,ordem,ativo,max_selecoes').single();if(error){setBusy(false);notify('Erro ao criar grupo. Execute supabase/07_complementos.sql no Supabase de teste. '+error.message,true);return}const opt=await supabase.from('opcoes_complementos').insert(lines.map((x,i)=>({grupo_id:data.id,nome:x.nome,preco_adicional:x.preco_adicional,imagem_url:null,ordem:i+1,ativo:true}))).select('id,nome,preco_adicional,imagem_url,ativo,ordem');setBusy(false);if(opt.error){notify('Grupo criado, mas houve erro ao salvar opções: '+opt.error.message,true);return}setComplementGroups(old=>[...old,{...(data as any),opcoes_complementos:(opt.data??[]) as AdminComplementOption[]}]);setNewGroupName('');setNewGroupOptions('');notify('Grupo de complementos criado.')}
  const deleteComplementGroup=async(g:AdminComplementGroup)=>{if(!window.confirm('Excluir o grupo '+g.nome+'? Ele será desvinculado dos produtos.'))return;const {error}=await supabase.from('grupos_complementos').delete().eq('id',g.id);if(error){notify('Não foi possível excluir: '+error.message,true);return}setComplementGroups(old=>old.filter(x=>x.id!==g.id));setProductGroupLinks(old=>Object.fromEntries(Object.entries(old).map(([id,groups])=>[id,groups.filter(x=>x!==g.id)])));notify('Grupo removido.')}
  return <div className={sidebarCollapsed?"admin-shell admin-shell--collapsed":"admin-shell"}>
    {!sidebarCollapsed&&<button className="mobile-sidebar-backdrop" type="button" aria-label="Fechar menu lateral" onClick={()=>setSidebarCollapsed(true)}/>}
    <aside className="admin-sidebar"><button className="sidebar-collapse-edge" type="button" onClick={()=>setSidebarCollapsed(v=>!v)} aria-label={sidebarCollapsed?"Expandir menu":"Recolher menu"} title={sidebarCollapsed?"Expandir menu":"Recolher menu"}>{sidebarCollapsed?'»':'<<'}</button><div className="admin-brand"><span className="brand-mark">F</span><div><b>FB3d2y</b><span>Menu</span></div></div><button className={'store-order-toggle '+(storeIsOpenNow?'store-order-toggle--open':'store-order-toggle--closed')} type="button" disabled={!selected||busy} onClick={()=>void toggleStoreOrders()}><Power size={16}/><span>{storeIsOpenNow?'Fechar loja':'Abrir loja'}</span></button><div className="workspace-label">meus menus</div><div className="restaurant-switcher"><span className="restaurant-switcher__avatar">{selected?.logo_url?<img src={selected.logo_url} alt=""/>:selected?.nome.charAt(0)??'+'}</span><div><strong>{selected?.nome??'Nenhum restaurante'}</strong><span>{selected?.slug??'Crie seu menu'}</span></div></div><nav className="admin-nav">{nav('whatsapp','Bot do WhatsApp',<MessageCircle size={17}/>)}{nav('dashboard','Visão geral',<LayoutDashboard size={17}/>)}{nav('menu','Meu cardápio',<Utensils size={17}/>)}{nav('restaurants','Restaurantes',<Store size={17}/>)}{nav('orders','Pedidos',<ShoppingBag size={17}/>)}{nav('counter','Pedidos balcão',<Plus size={17}/>)}{nav('tabs','Comandas e garçons',<Utensils size={17}/>)}{nav('sales','Relatório de vendas',<BarChart3 size={17}/>)}{nav('hours','Horário de funcionamento',<Clock3 size={17}/>)}{nav('delivery','Regiões e taxas',<MapPin size={17}/>)}{nav('printer','Config. impressora',<Store size={17}/>)}{nav('subscription','Assinatura',<CreditCard size={17}/>)}{subscription&&!subscription.active&&<button className="admin-nav__link" type="button" onClick={()=>setActiveTab('subscription')}><Bell size={15}/> Assinatura pendente</button>}</nav></aside>
    <main className="admin-main"><header className="admin-topbar"><button className="mobile-sidebar-toggle" type="button" onClick={()=>setSidebarCollapsed(v=>!v)} aria-label={sidebarCollapsed?"Abrir menu lateral":"Fechar menu lateral"}>{sidebarCollapsed?<MoreHorizontal size={19}/>:<X size={19}/>}<span>Menu</span></button><button className="back-link" type="button" onClick={onBack}><ArrowLeft size={17}/> Ver menu público</button><div className="admin-topbar__right"><div className="profile-menu-container" ref={profileMenuRef}><button className={profileOpen?'profile-menu-trigger profile-menu-trigger--open':'profile-menu-trigger'} type="button" onClick={()=>setProfileOpen(v=>!v)} aria-expanded={profileOpen} aria-label="Perfil e configurações"><CircleUserRound size={19}/><span>Perfil e configurações</span><ChevronRight className={profileOpen?'profile-menu-chevron profile-menu-chevron--open':'profile-menu-chevron'} size={15}/></button>{profileOpen&&<div className="profile-menu-panel"><div className="profile-menu-heading"><span className="profile-menu-avatar">{(session.user.email??'U').charAt(0).toUpperCase()}</span><div><strong>{session.user.user_metadata?.full_name??'Minha conta'}</strong><small>{session.user.email}</small></div></div><div className="profile-menu-divider"/><div className="profile-menu-section-title"><Settings size={15}/> Configurações</div><button className="profile-menu-action" type="button" onClick={testAudio}><Volume2 size={17}/><span><strong>Testar áudio</strong><small>Reproduzir uma mensagem de teste</small></span></button><button className={keepScreenOn?'profile-menu-action profile-menu-action--active':'profile-menu-action'} type="button" onClick={()=>setKeepScreenOn(v=>!v)}><Monitor size={17}/><span><strong>Manter tela ligada</strong><small>{keepScreenOn?(wakeLock?'Ativo neste dispositivo':'Ativado, aguardando permissão'):'Evitar que a tela apague'}</small></span><span className={keepScreenOn?'profile-switch profile-switch--on':'profile-switch'}><i/></span></button><div className="profile-menu-divider"/><button className="profile-menu-action profile-menu-logout" type="button" onClick={()=>void supabase.auth.signOut()}><LogOut size={17}/><span><strong>Sair da conta</strong><small>Encerrar esta sessão</small></span></button></div>}</div></div></header>
    {notice&&<div className="admin-content"><p className={noticeError?'form-error':'green-text'}>{notice}</p></div>}{busy&&<div className="admin-content"><small>Atualizando dados…</small></div>}
    {activeTab==='subscription'&&<div className="admin-content"><div className="admin-heading"><div><span className="eyebrow">acesso à plataforma</span><h1>Assinatura</h1><p>Pagamento único por Pix para liberar 30 dias de acesso.</p></div></div><section className="admin-panel"><div className="panel-heading"><div><span className="eyebrow">plano mensal</span><h2>FB3d2y Menu completo</h2></div><strong>R$ 50,00 / 30 dias</strong></div>{subscriptionError&&<p className="form-error">{subscriptionError}</p>}{subscription?.active?<><p className="green-text">{subscription.free?'Sua conta tem acesso gratuito.':'Sua assinatura está ativa.'}</p>{subscription.expiresAt&&<p>Válida até <strong>{new Date(subscription.expiresAt).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}</strong>.</p>}</>:<><p>Após a confirmação do Mercado Pago, o acesso é liberado automaticamente por 30 dias. Não feche esta tela até copiar os dados do Pix.</p>{!pix?<button className="primary-button" type="button" disabled={subscriptionLoading} onClick={async()=>{if(!session)return;setSubscriptionLoading(true);setSubscriptionError('');try{const response=await fetch('/api/assinatura',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível gerar o Pix.');setPix(data)}catch(error){setSubscriptionError(error instanceof Error?error.message:'Não foi possível gerar o Pix.')}finally{setSubscriptionLoading(false)}}}>{subscriptionLoading?'Gerando Pix…':'Gerar Pix de R$ 50,00'}</button>:<div className="subscription-pix"><h3>Pix para pagamento #{pix.paymentId}</h3>{pix.qrCodeBase64&&<img alt="QR Code Pix" style={{display:'block',width:220,maxWidth:'100%',height:'auto',margin:'16px auto'}} src={'data:image/png;base64,'+pix.qrCodeBase64}/>}{pix.qrCode&&<><label>Pix copia e cola<textarea readOnly value={pix.qrCode} rows={4}/></label><button className="primary-button" type="button" onClick={()=>{void navigator.clipboard.writeText(pix.qrCode);notify('Código Pix copiado.')}}>Copiar código Pix</button></>}{pix.ticketUrl&&<p><a href={pix.ticketUrl} target="_blank" rel="noreferrer">Abrir cobrança no Mercado Pago</a></p>}<p>Depois de pagar, a confirmação é automática. Se esta tela não atualizar, recarregue-a após alguns instantes.</p><button className="secondary-button" type="button" onClick={async()=>{if(!session)return;setSubscriptionLoading(true);try{const response=await fetch('/api/assinatura',{headers:{Authorization:'Bearer '+session.access_token}});const data=await response.json();if(!response.ok)throw new Error(data.error||'Erro ao consultar assinatura.');setSubscription(data);if(data.active)setPix(null);else setSubscriptionError('Pagamento ainda não confirmado. Aguarde a confirmação do Mercado Pago.')}catch(error){setSubscriptionError(error instanceof Error?error.message:'Erro ao consultar assinatura.')}finally{setSubscriptionLoading(false)}}}>Já paguei — atualizar status</button></div>}</>}</section></div>}
    {activeTab==='dashboard'&&<div className="admin-content"><div className="admin-heading"><div><span className="eyebrow">painel de controle</span><h1>Seus menus, em um só lugar.</h1><p>Gerencie restaurantes, produtos e pedidos.</p></div><button className="primary-button" type="button" onClick={()=>{setShowCreate(true);setActiveTab('restaurants')}}><Plus size={17}/> Novo restaurante</button></div><section className="backup-assurance"><span className="backup-assurance__icon"><CheckCircle2 size={20}/></span><div><strong>Seus dados têm cópia de segurança</strong><p>O banco de dados e as fotos dos cardápios contam com backup automático semanal.</p></div></section><div className="stats-grid"><StatCard value={String(restaurants.length)} label="restaurantes" icon={<Store size={17}/>} /><StatCard value={String(items.length)} label="produtos neste menu" icon={<Utensils size={17}/>} /><StatCard value={String(orders.filter(o=>!['Concluído','Cancelado'].includes(o.status)).length)} label="pedidos em andamento" icon={<ShoppingBag size={17}/>} /></div><div className="admin-panels"><section className="admin-panel orders-panel"><div className="panel-heading"><div><span className="eyebrow">atividade</span><h2>Pedidos recentes</h2></div><button className="link-button" type="button" onClick={()=>setActiveTab('orders')}>Ver todos <ChevronRight size={15}/></button></div>{orders.length===0?<p>Ainda não há pedidos neste restaurante.</p>:orders.slice(0,5).map(o=><div className="admin-order" key={o.id}><div className="order-status"><span/></div><div className="admin-order__main"><strong>#{o.id} · {o.cliente_nome}</strong><span>{o.tipo_entrega} · {new Date(o.criado_em).toLocaleString('pt-BR')}</span></div><div className="admin-order__right"><strong>{formatPrice(Number(o.total))}</strong><span>{o.status}</span></div></div>)}</section><section className="admin-panel menu-panel"><div className="panel-heading"><div><span className="eyebrow">menu selecionado</span><h2>{selected?.nome??'Comece por aqui'}</h2></div></div>{selected?<div className="selected-menu-actions selected-menu-actions--compact"><button className="primary-button" type="button" onClick={()=>window.open('/menu/'+selected.slug,'_blank','noopener,noreferrer')}>Ver menu</button><button className="secondary-button" type="button" onClick={()=>{const url=window.location.origin+'/menu/'+selected.slug;if(navigator.share)void navigator.share({title:selected.nome,url}).catch(()=>undefined);else void navigator.clipboard?.writeText(url).catch(()=>undefined)}}>Compartilhar <Share2 size={14}/></button><button className="secondary-button" type="button" onClick={()=>setActiveTab('menu')}>Editar <ChevronRight size={14}/></button></div>:<button className="primary-button" type="button" onClick={()=>{setShowCreate(true);setActiveTab('restaurants')}}>Criar primeiro restaurante</button>}</section></div></div>}
    {activeTab==='whatsapp'&&<WhatsAppBotPanel restaurantId={selectedId} restaurantName={selected?.nome??''} notify={notify}/>}
    {activeTab==='restaurants'&&<div className="admin-content"><div className="admin-heading"><div><span className="eyebrow">seus negócios</span><h1>Restaurantes</h1><p>Crie e gerencie os cardápios dos seus negócios.</p></div><button className="primary-button" type="button" onClick={()=>setShowCreate(v=>!v)}><Plus size={17}/> Criar restaurante</button></div>{showCreate&&<form className="admin-panel admin-create-form" onSubmit={e=>void createRestaurant(e)}><h2>Novo restaurante</h2><label>Nome<input required minLength={2} maxLength={255} value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Ex.: Cantinho da Pizza"/></label><label>Descrição<textarea value={newDesc} onChange={e=>setNewDesc(e.target.value)} maxLength={1000}/></label><label>Localização<input value={newLocation} onChange={e=>setNewLocation(e.target.value)} maxLength={255} placeholder="Bairro, cidade"/></label><div className="form-row"><button className="primary-button" type="submit" disabled={busy}>Criar menu</button><button className="secondary-button" type="button" onClick={()=>setShowCreate(false)}>Cancelar</button></div></form>}{restaurants.length===0?<section className="admin-panel"><p>Você ainda não criou um restaurante. Clique em “Criar restaurante” para começar.</p></section>:<div className="restaurant-grid">{restaurants.map(r=><article className={r.id===selectedId?'restaurant-admin-card restaurant-admin-card--active':'restaurant-admin-card'} key={r.id}><div className="restaurant-admin-card__cover" style={{background:r.capa_url?'url('+r.capa_url+') center/cover':(r.cor_destaque??'#0e4f59')}}><span>{r.nome.charAt(0).toUpperCase()}</span><b>{r.ativo?'ativo':'inativo'}</b></div><div className="restaurant-admin-card__body"><div><strong>{r.nome}</strong><span>{r.localizacao||'Localização não informada'}</span><small>/menu/{r.slug}</small></div><div className="restaurant-admin-card__footer"><button className="link-button" type="button" onClick={()=>{setSelectedId(r.id);setActiveTab('restaurant-settings')}}>Gerenciar <ChevronRight size={14}/></button><a className="link-button" href={'/menu/'+r.slug} target="_blank" rel="noreferrer">Ver menu</a></div></div></article>)}</div>}</div>}
    {activeTab==='restaurant-settings'&&<div className="admin-content"><div className="admin-heading"><div><span className="eyebrow">cadastro do estabelecimento</span><h1>Editar restaurante</h1><p>Altere apenas os dados, a foto e o banner do estabelecimento. Produtos e complementos ficam em Meu cardápio.</p></div><button className="secondary-button" type="button" onClick={()=>setActiveTab('restaurants')}><ArrowLeft size={16}/> Voltar aos restaurantes</button></div>{restaurants.length>1&&<label className="restaurant-select-label">Restaurante<select value={selectedId??''} onChange={e=>setSelectedId(Number(e.target.value))}>{restaurants.map(r=><option key={r.id} value={r.id}>{r.nome}</option>)}</select></label>}{selected?<RestaurantSettings key={selected.id} restaurant={selected} saving={busy} onSave={saveRestaurant}/>:<section className="admin-panel">Selecione ou crie um restaurante primeiro.</section>}</div>}
    {activeTab==='menu'&&<div className="admin-content"><div className="admin-heading"><div><span className="eyebrow">personalização</span><h1>Meu cardápio</h1><p>Gerencie categorias, produtos, preços e complementos. Os dados do estabelecimento ficam em Restaurantes.</p></div>{selected&&<a className="secondary-button" href={'/menu/'+selected.slug} target="_blank" rel="noreferrer">Ver menu público</a>}</div>{restaurants.length>1&&<label className="restaurant-select-label">Restaurante<select value={selectedId??''} onChange={e=>setSelectedId(Number(e.target.value))}>{restaurants.map(r=><option key={r.id} value={r.id}>{r.nome}</option>)}</select></label>}{!selected?<section className="admin-panel"><p>Crie um restaurante na aba Restaurantes para começar.</p><button className="primary-button" type="button" onClick={()=>{setShowCreate(true);setActiveTab('restaurants')}}>Criar restaurante</button></section>:<><section className="admin-panel admin-data-panel"><div className="panel-heading"><div><span className="eyebrow">organização</span><h2>Categorias</h2></div></div><form className="inline-create-form" onSubmit={e=>void addCategory(e)}><input value={newCat} onChange={e=>setNewCat(e.target.value)} placeholder="Nome da categoria" maxLength={100} required/><button className="primary-button" type="submit"><Plus size={16}/> Adicionar</button></form>{[...cats].sort((a,b)=>a.ordem-b.ordem).map((c,index)=><div className="category-admin-row" key={c.id}><span>{c.nome}</span><button className="link-button" type="button" disabled={index===0} aria-label={'Mover '+c.nome+' para cima'} onClick={async()=>{const ordered=[...cats].sort((a,b)=>a.ordem-b.ordem);const other=ordered[index-1];if(!other)return;const result=await Promise.all([supabase.from('categorias').update({ordem:other.ordem}).eq('id',c.id),supabase.from('categorias').update({ordem:c.ordem}).eq('id',other.id)]);if(result.some(x=>x.error)){notify('Não foi possível alterar a ordem.',true);return}setCats(old=>old.map(x=>x.id===c.id?{...x,ordem:other.ordem}:x.id===other.id?{...x,ordem:c.ordem}:x))}}><ChevronRight size={15} style={{transform:'rotate(-90deg)'}}/></button><button className="link-button" type="button" disabled={index===cats.length-1} aria-label={'Mover '+c.nome+' para baixo'} onClick={async()=>{const ordered=[...cats].sort((a,b)=>a.ordem-b.ordem);const other=ordered[index+1];if(!other)return;const result=await Promise.all([supabase.from('categorias').update({ordem:other.ordem}).eq('id',c.id),supabase.from('categorias').update({ordem:c.ordem}).eq('id',other.id)]);if(result.some(x=>x.error)){notify('Não foi possível alterar a ordem.',true);return}setCats(old=>old.map(x=>x.id===c.id?{...x,ordem:other.ordem}:x.id===other.id?{...x,ordem:c.ordem}:x))}}><ChevronRight size={15} style={{transform:'rotate(90deg)'}}/></button><button className="link-button" type="button" onClick={async()=>{const name=window.prompt('Novo nome da categoria:',c.nome);if(!name?.trim())return;const {error}=await supabase.from('categorias').update({nome:name.trim()}).eq('id',c.id);if(error)notify(error.message,true);else{setCats(old=>old.map(x=>x.id===c.id?{...x,nome:name.trim()}:x));notify('Categoria renomeada.')}}}>Renomear</button><button className="link-button" type="button" onClick={async()=>{if(!window.confirm('Excluir a categoria '+c.nome+'?'))return;const {error}=await supabase.from('categorias').delete().eq('id',c.id);if(error)notify(error.message,true);else{setCats(old=>old.filter(x=>x.id!==c.id));setItems(old=>old.map(p=>p.categoria_id===c.id?{...p,categoria_id:null}:p));notify('Categoria excluída.')}}}>Excluir</button></div>)}</section><section className="admin-panel admin-data-panel"><div className="panel-heading"><div><span className="eyebrow">opções reutilizáveis</span><h2>Complementos e sabores</h2></div><span>{complementGroups.length} grupos</span></div><p className="complement-admin-help">Cadastre grupos de opções reutilizáveis como “Sabores” ou “Adicionais”. O limite de escolhas é definido separadamente em cada produto. Uma opção por linha; para adicionais cobrados à parte, use Nome|Preço.</p><form className="complement-admin-create" onSubmit={e=>void addComplementGroup(e)}><label>Nome do item<input value={newGroupName} onChange={e=>setNewGroupName(e.target.value)} placeholder="Ex.: Sabores" required maxLength={120}/></label><label>Opções do item<textarea value={newGroupOptions} onChange={e=>setNewGroupOptions(e.target.value)} placeholder={'Calabresa\nFrango com catupiry|4,00\nPortuguesa|2,50'} rows={4} required/></label><button className="primary-button" type="submit" disabled={busy}><Plus size={16}/> Criar item</button></form>{complementGroups.length===0?<p>Nenhum grupo criado ainda.</p>:<div className="complement-admin-list">{complementGroups.map(g=><article className="complement-admin-group" key={g.id}><div className="complement-admin-group__heading"><div><strong>{g.nome}</strong><small>{g.ativo?'Grupo ativo no cardápio':'Grupo desativado'}</small></div><div className="admin-product-actions"><button className="link-button" type="button" onClick={async()=>{const next=!g.ativo;const {error}=await supabase.from('grupos_complementos').update({ativo:next}).eq('id',g.id);if(error){notify('Não foi possível alterar o grupo: '+error.message,true);return}setComplementGroups(old=>old.map(x=>x.id===g.id?{...x,ativo:next}:x));notify(next?'Grupo reativado.':'Grupo desativado.')}}>{g.ativo?'Desativar grupo':'Reativar grupo'}</button><button className="link-button" type="button" onClick={()=>void deleteComplementGroup(g)}>Excluir</button></div></div><div className="complement-admin-options">{g.opcoes_complementos.map(o=><ComplementOptionAdminRow key={o.id} option={o} groupId={g.id} restaurantId={selected.id} onUpdated={patch=>setComplementGroups(old=>old.map(x=>x.id===g.id?{...x,opcoes_complementos:x.opcoes_complementos.map(y=>y.id===o.id?{...y,...patch}:y)}:x))} notify={notify}/>)}</div></article>)}</div>}</section><section className="admin-panel admin-data-panel"><div className="panel-heading"><div><span className="eyebrow">itens do menu</span><h2>Produtos e preços</h2></div><span>{items.length} produtos</span></div><form className="admin-product-form" onSubmit={e=>void addProduct(e)}><h3>Adicionar produto</h3><label>Nome<input required maxLength={255} value={newItem.nome} onChange={e=>setNewItem({...newItem,nome:e.target.value})} placeholder="Ex.: Pizza calabresa"/></label><label>Descrição<textarea maxLength={1000} value={newItem.descricao} onChange={e=>setNewItem({...newItem,descricao:e.target.value})}/></label><div className="form-row"><label>Preço (R$)<input required inputMode="decimal" value={newItem.preco} onChange={e=>setNewItem({...newItem,preco:e.target.value})} placeholder="29,90"/></label><label>Categoria<select value={newItem.categoria_id} onChange={e=>setNewItem({...newItem,categoria_id:e.target.value})}><option value="">Sem categoria</option>{cats.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></label></div><label>Máximo de complementos deste produto (0 = sem limite)<input type="number" min="0" max="50" step="1" value={newItem.max_complementos} onChange={e=>setNewItem({...newItem,max_complementos:e.target.value})}/></label><label>URL da foto (opcional)<input type="url" value={newItem.imagem_url} onChange={e=>setNewItem({...newItem,imagem_url:e.target.value})} placeholder="https://..."/></label>{complementGroups.length>0&&<fieldset className="product-complement-link"><legend>Complementos deste produto (opcional)</legend>{complementGroups.filter(g=>g.ativo).map(g=><label key={g.id}><input type="checkbox" checked={newProductGroupIds.includes(g.id)} onChange={e=>setNewProductGroupIds(old=>e.target.checked?[...old,g.id]:old.filter(id=>id!==g.id))}/><span>{g.nome}</span><small>{g.opcoes_complementos.filter(o=>o.ativo).length} opções</small></label>)}</fieldset>}<label>Ou enviar foto do computador (máx. 5 MB)<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={async e=>{const file=e.target.files?.[0];if(!file||!selected)return;try{setBusy(true);const url=await uploadMenuImage(file,selected.id);setNewItem(old=>({...old,imagem_url:url}));notify('Foto enviada. Salve o produto para aplicar.')}catch(err){notify(err instanceof Error?err.message:'Erro ao enviar foto.',true)}finally{setBusy(false);e.target.value=''}}}/></label><button className="primary-button" type="submit" disabled={busy}><Plus size={16}/> Cadastrar produto</button></form>{items.length===0?<p>Nenhum produto cadastrado ainda.</p>:<div className="products-by-category">{cats.map(c=>{const categoryItems=items.filter(p=>p.categoria_id===c.id);return categoryItems.length?<section className="products-category-group" key={c.id}><h3><strong>{c.nome}</strong><span>· {categoryItems.length} {categoryItems.length===1?'produto':'produtos'}</span></h3>{categoryItems.map(p=><ProductAdminRow key={p.id} product={p} restaurantId={selected.id} categories={cats} complementGroups={complementGroups} linkedGroupIds={productGroupLinks[p.id]??EMPTY_GROUP_IDS} onSave={updateProduct} onDelete={deleteProduct}/>)}</section>:null})}{items.some(p=>!p.categoria_id||!cats.some(c=>c.id===p.categoria_id))&&<section className="products-category-group"><h3><strong>Sem categoria</strong><span>· {items.filter(p=>!p.categoria_id||!cats.some(c=>c.id===p.categoria_id)).length} produtos</span></h3>{items.filter(p=>!p.categoria_id||!cats.some(c=>c.id===p.categoria_id)).map(p=><ProductAdminRow key={p.id} product={p} restaurantId={selected.id} categories={cats} complementGroups={complementGroups} linkedGroupIds={productGroupLinks[p.id]??EMPTY_GROUP_IDS} onSave={updateProduct} onDelete={deleteProduct}/>)}</section>}</div>}</section></>}</div>}
    {activeTab==='hours'&&<div className="admin-content"><div className="admin-heading"><div><span className="eyebrow">funcionamento da loja</span><h1>Horário de funcionamento</h1><p>Configure os horários semanais. O cardápio informa automaticamente se a loja está aberta e quando abrirá novamente.</p></div></div>{!selected?<section className="admin-panel">Selecione ou crie um restaurante primeiro.</section>:<><form className="admin-panel opening-hours-form" onSubmit={e=>void saveOpeningHours(e)}><div className="opening-hours-intro"><Clock3 size={20}/><div><strong>{selected.status_loja_manual===true?'Loja aberta manualmente':selected.status_loja_manual===false?'Loja fechada manualmente':'Modo automático'}</strong><p>Salvar os horários reativa o modo automático.</p></div></div>{weekDays.map(day=>{const value=hoursDraft[day.id]??{closed:false,open:'18:00',close:'22:00'};return <div className={'opening-hours-row'+(value.closed?' opening-hours-row--closed':'')} key={day.id}><label className="opening-hours-day"><input type="checkbox" checked={!value.closed} onChange={e=>setHoursDraft(old=>({...old,[day.id]:{...value,closed:!e.target.checked}}))}/><span>{day.label}</span></label>{value.closed?<span className="opening-hours-closed-label">Fechado</span>:<div className="opening-hours-times"><label>Abre<input type="time" required value={value.open} onChange={e=>setHoursDraft(old=>({...old,[day.id]:{...value,open:e.target.value}}))}/></label><span>até</span><label>Fecha<input type="time" required value={value.close} onChange={e=>setHoursDraft(old=>({...old,[day.id]:{...value,close:e.target.value}}))}/></label></div>}</div>})}<div className="opening-hours-actions"><button className="primary-button" type="submit" disabled={busy}>Salvar horários e ativar automático</button><button className="secondary-button" type="button" disabled={busy} onClick={async()=>{if(!selected)return;const {error}=await supabase.from('empresas').update({status_loja_manual:null,aceita_pedidos:true}).eq('id',selected.id);if(error){notify('Não foi possível ativar o modo automático: '+error.message,true);return}setRestaurants(old=>old.map(r=>r.id===selected.id?{...r,status_loja_manual:null,aceita_pedidos:true}:r));notify('Modo automático ativado.')}}>Usar horário automático agora</button></div></form></>}</div>}
    {activeTab==='delivery'&&<><style>{`
.delivery-editor{background:#fff;border:1px solid #e8ecef;border-radius:20px;padding:24px;box-shadow:0 12px 35px rgba(25,45,55,.06);max-width:980px}
.delivery-editor__intro{display:flex;gap:14px;align-items:center;padding:4px 2px 22px;border-bottom:1px solid #edf0f2;margin-bottom:20px}
.delivery-editor__icon{width:46px;height:46px;border-radius:14px;background:#eaf5f3;color:#176b62;display:grid;place-items:center}
.delivery-editor__intro strong{font-size:16px;color:#18343a}.delivery-editor__intro p{margin:4px 0 0;color:#718087;font-size:13px}
.delivery-editor__levels{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.delivery-level{border:1px solid #e8edef;border-radius:16px;padding:17px;min-width:0;background:linear-gradient(180deg,#fff,#fbfcfc)}
.delivery-level__top{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:18px}
.delivery-level__tag{font-size:10px;font-weight:800;letter-spacing:.09em;color:#688087}
.delivery-level h3{font-size:16px;margin:6px 0 0;color:#20383d}
.delivery-level__price{background:#eef6f3;border-radius:12px;padding:8px 10px;text-align:right;white-space:nowrap}
.delivery-level__price small{display:block;color:#668078;font-size:10px}.delivery-level__price strong{display:block;color:#176b62;font-size:18px}.delivery-level__price input{display:block;width:104px;max-width:100%;margin-top:4px;border:1px solid #d5e3df;border-radius:8px;padding:6px 8px;background:#fff;color:#176b62;font-size:18px;font-weight:800;text-align:right;outline:none}.delivery-level__price input:focus{border-color:#4d9689;box-shadow:0 0 0 3px rgba(77,150,137,.12)}
.delivery-level__label{display:block;font-size:12px;font-weight:700;color:#42565c}
.delivery-level textarea{display:block;width:100%;box-sizing:border-box;margin-top:8px;min-height:104px;resize:vertical;border:1px solid #dfe7e8;border-radius:11px;padding:11px 12px;font:inherit;font-size:13px;line-height:1.5;color:#263d42;background:#fff;outline:none}
.delivery-level textarea:focus{border-color:#4d9689;box-shadow:0 0 0 3px rgba(77,150,137,.12)}
.delivery-level__hint{display:block;margin-top:8px;color:#829096;font-size:11px}
.delivery-negotiated{display:flex;align-items:center;gap:13px;margin-top:16px;padding:15px 17px;border:1px dashed #d6dfe2;border-radius:14px;background:#f8fafb}
.delivery-negotiated__badge{width:38px;height:38px;display:grid;place-items:center;border-radius:12px;background:#edf1f4;color:#60757d}
.delivery-negotiated strong{color:#294047;font-size:14px}.delivery-negotiated p{margin:4px 0 0;color:#74838a;font-size:12px}
.delivery-negotiated__status{margin-left:auto;padding:7px 11px;border-radius:20px;background:#fff1db;color:#98611c;font-size:11px;font-weight:800;white-space:nowrap}
.delivery-editor__footer{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:22px;padding-top:18px;border-top:1px solid #edf0f2}
.delivery-editor__footer>span{font-size:12px;color:#7a898e}.delivery-editor__footer .primary-button{display:inline-flex;align-items:center;gap:8px}
@media(max-width:850px){.delivery-editor__levels{grid-template-columns:1fr}.delivery-level{padding:16px}.delivery-editor{padding:17px}}
@media(max-width:520px){.delivery-editor__footer{align-items:stretch;flex-direction:column}.delivery-editor__footer .primary-button{justify-content:center}.delivery-negotiated{align-items:flex-start;flex-wrap:wrap}.delivery-negotiated__status{margin-left:51px}}
`}</style><div className="admin-content"><div className="admin-heading"><div><span className="eyebrow">logística do restaurante</span><h1>Regiões e taxas de entrega</h1><p>Organize as localidades atendidas e defina o valor cobrado em cada faixa.</p></div></div>{!selected?<section className="admin-panel">Selecione ou crie um restaurante primeiro.</section>:<section className="delivery-editor"><div className="delivery-editor__intro"><div className="delivery-editor__icon"><MapPin size={22}/></div><div><strong>Área de atendimento</strong><p>As opções cadastradas aparecem para o cliente quando ele escolhe Entrega.</p></div></div><div className="delivery-editor__levels">{deliveryDraft.map((value,index)=><article className={'delivery-level delivery-level--'+(index+1)} key={index}><div className="delivery-level__top"><div><span className="delivery-level__tag">FAIXA {index+1}</span><h3>{['Região próxima','Região intermediária','Região ampliada'][index]}</h3></div><div className="delivery-level__price"><small>Taxa de entrega (R$)</small><input aria-label={'Taxa da faixa '+(index+1)+' em reais'} type="number" min="0" max="9999" step="0.01" value={deliveryFees[index]} onChange={e=>setDeliveryFees(old=>old.map((v,i)=>i===index?(e.target.value===''?0:Math.max(0,Number(e.target.value))):v))}/></div></div><label className="delivery-level__label">Localidades atendidas<textarea rows={3} value={value} onChange={e=>setDeliveryDraft(old=>old.map((v,i)=>i===index?e.target.value:v))} placeholder="Separe cada localidade por vírgula"/></label><small className="delivery-level__hint">Separe os nomes por vírgula. Ex.: Centro, Bairro...</small></article>)}</div><div className="delivery-negotiated"><div className="delivery-negotiated__badge"><MapPin size={18}/></div><div><strong>Outra região</strong><p>Para localidades fora das faixas acima, a taxa será combinada com a equipe.</p></div><span className="delivery-negotiated__status">A combinar</span></div><div className="delivery-editor__footer"><span>As alterações são aplicadas ao cardápio após salvar.</span><button className="primary-button" type="button" disabled={busy} onClick={async()=>{const config=[{name:'Nível 1',fee:deliveryFees[0],places:deliveryDraft[0].split(',').map(x=>x.trim()).filter(Boolean)},{name:'Nível 2',fee:deliveryFees[1],places:deliveryDraft[1].split(',').map(x=>x.trim()).filter(Boolean)},{name:'Nível 3',fee:deliveryFees[2],places:deliveryDraft[2].split(',').map(x=>x.trim()).filter(Boolean)},{name:'Outra região',fee:0,places:[],negotiate:true}];const {error}=await supabase.from('empresas').update({config_entrega:config}).eq('id',selected.id);if(error){notify('Não foi possível salvar as regiões: '+error.message,true);return}setRestaurants(old=>old.map(r=>r.id===selected.id?{...r,config_entrega:config} as AdminRestaurant:r));notify('Regiões e taxas salvas.')}}><Check size={16}/> Salvar regiões e taxas</button></div></section>}</div></>}
    {activeTab==='sales'&&<SalesReport orders={orders} onRefresh={()=>{if(selectedId!==null)void loadDetails(selectedId)}}/>}
    {activeTab==='orders'&&<div className="admin-content"><div className="admin-heading"><div><span className="eyebrow">acompanhamento</span><h1>Pedidos</h1><p>Lista organizada e atualizada automaticamente.</p></div><button className="secondary-button" type="button" onClick={()=>selectedId!==null&&void loadDetails(selectedId)}>Atualizar</button></div>{restaurants.length>1&&<label className="restaurant-select-label">Restaurante<select value={selectedId??''} onChange={e=>setSelectedId(Number(e.target.value))}>{restaurants.map(r=><option key={r.id} value={r.id}>{r.nome}</option>)}</select></label>}{orders.length===0?<section className="admin-panel">Nenhum pedido recebido ainda.</section>:<section className="admin-panel admin-orders-panel"><div className="sales-period" role="group" aria-label="Período dos pedidos">{([1,7,30,90] as SalesPeriod[]).map(value=><button key={value} type="button" className={ordersPeriod===value?'sales-period__button sales-period__button--active':'sales-period__button'} onClick={()=>setOrdersPeriod(value)}>{value===1?'Hoje':value+' dias'}</button>)}</div><p>{orders.filter(o=>{const now=new Date();const start=new Date(now);start.setHours(0,0,0,0);start.setDate(start.getDate()-(ordersPeriod-1));const date=new Date(o.criado_em);return date>=start&&date<=now}).length} pedidos no período.</p><div className="admin-orders-table-wrap"><table className="admin-orders-table"><thead><tr><th>N. pedido</th><th>Nome</th><th>Data</th><th>Pagamento</th><th>Status</th><th>Tipo</th><th>Valor</th><th>Origem</th><th>Ação</th></tr></thead><tbody>{orders.filter(o=>{const now=new Date();const start=new Date(now);start.setHours(0,0,0,0);start.setDate(start.getDate()-(ordersPeriod-1));const date=new Date(o.criado_em);return date>=start&&date<=now}).map(o=>{const created=new Date(o.criado_em);const dateLabel=created.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'})+' às '+created.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});const statusLabel=({'Novo':'Pedido recebido','Preparando':'Em preparo','Pronto':'Pedido pronto','Em entrega':'Pedido em entrega','Retirada disponível':'Retirada disponível','Concluído':'Finalizado'} as Record<string,string>)[o.status]||o.status;const statusClass=o.status==='Cancelado'?'cancelled':o.status==='Concluído'?'finished':'pending';return <tr key={o.id}><td className="admin-order-number">{String(o.id).length>8?String(o.id).slice(-8):String(o.id)}</td><td><strong className="admin-order-customer">{o.cliente_nome}</strong><small className="admin-order-phone">{o.cliente_whatsapp}</small>{o.observacoes&&<small className="admin-order-note">Obs.: {o.observacoes}</small>}{o.precisa_troco&&<small className="admin-order-note">Troco para {formatPrice(Number(o.troco_para))}</small>}</td><td className="admin-order-date">{dateLabel}</td><td><span className={'admin-order-payment admin-order-payment--'+({'Pix':'pix','Dinheiro':'dinheiro','Cartão de débito':'debito','Cartão de crédito':'credito'}[o.forma_pagamento||'Pix']||'pix')}>{o.forma_pagamento||'Pix'}</span></td><td><span className={'admin-order-status admin-order-status--'+statusClass}>{statusLabel}</span></td><td>{o.tipo_entrega}</td><td className="admin-order-value">{formatPrice(Number(o.total))}</td><td><span className="admin-order-origin">{o.origem||'Menu digital'}</span></td><td><div className="admin-order-actions"><button className="order-edit-button" type="button" title="Editar pedido" aria-label={"Editar pedido "+o.id} onClick={()=>startEditOrder(o)}><Pencil size={15}/></button><button className="order-print-button" type="button" onClick={()=>void printOrderWithItems(o)}>Imprimir</button><label className="admin-order-action"><span className="sr-only">Alterar status do pedido {o.id}</span><select aria-label={'Ação para o pedido '+o.id} value={o.status} onChange={e=>void updateOrder(o,e.target.value)}>{[['Novo','Pedido recebido'],['Preparando','Mover para preparo'],['Pronto','Pedido pronto'],['Em entrega','Pedido em entrega'],['Retirada disponível','Retirada disponível'],['Concluído','Finalizar (somente interno)'],['Cancelado','Cancelar pedido']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div></td></tr>})}</tbody></table></div></section>}</div>}
    {activeTab==='counter'&&<div className="admin-content"><div className="admin-heading"><div><span className="eyebrow">{editingOrder?`editando pedido #${editingOrder.id}`:'venda presencial'}</span><h1>{editingOrder?'Editar pedido no balcão':'Pedidos balcão'}</h1><p>{editingOrder?'Os dados e itens do cliente foram carregados. Adicione ou remova produtos e salve.':'Registre no caixa pedidos feitos presencialmente.'}</p></div>{editingOrder&&<button className="secondary-button" type="button" onClick={()=>{setEditingOrder(null);setCounterQty({});setActiveTab('orders')}}>Cancelar edição</button>}</div>{!selected?<section className="admin-panel">Selecione ou crie um restaurante primeiro.</section>:<form className="admin-panel counter-order-form" onSubmit={e=>void createCounterOrder(e)}><div className="counter-fields"><label>Nome do cliente (opcional)<input value={counterName} onChange={e=>setCounterName(e.target.value)} placeholder="Cliente balcão"/></label><label>Telefone (opcional)<input value={counterPhone} onChange={e=>setCounterPhone(e.target.value)} placeholder="Telefone"/></label><label>Tipo<select value={counterType} onChange={e=>setCounterType(e.target.value as 'Retirada'|'Entrega')}><option>Retirada</option><option>Entrega</option></select></label><label>Pagamento<select value={counterPayment} onChange={e=>setCounterPayment(e.target.value)}><option>Dinheiro</option><option>Pix</option><option>Cartão de débito</option><option>Cartão de crédito</option><option>A combinar</option></select></label></div>{counterType==='Entrega'&&<label>Endereço de entrega<input required value={counterAddress} onChange={e=>setCounterAddress(e.target.value)} placeholder="Rua, número, bairro"/></label>}<h2>Produtos</h2><p className="printer-help">No balcão, você pode ajustar o preço deste pedido sem alterar o preço do cardápio.</p><div className="counter-products">{items.filter(p=>p.disponivel).map(p=><div className="counter-product" key={p.id}><div><strong>{p.nome}</strong><small>Preço do cardápio: {formatPrice(Number(p.preco))}</small><label className="counter-price-field">Preço neste pedido<input aria-label={'Preço para '+p.nome} inputMode="decimal" placeholder={Number(p.preco).toFixed(2).replace('.',',')} value={counterPrices[p.id]??''} onChange={e=>setCounterPrices(old=>({...old,[p.id]:e.target.value}))}/></label></div><div className="counter-quantity"><button type="button" aria-label={'Diminuir '+p.nome} onClick={()=>setCounterQty(old=>({...old,[p.id]:Math.max(0,(old[p.id]??0)-1)}))}>−</button><span>{counterQty[p.id]??0}</span><button type="button" aria-label={'Adicionar '+p.nome} onClick={()=>setCounterQty(old=>({...old,[p.id]:(old[p.id]??0)+1}))}>+</button></div></div>)}</div><section className="counter-extra-box"><h2>Pedido avulso</h2><p>Adicione um item que não está cadastrado no cardápio e defina o preço apenas para esta venda.</p><div className="counter-fields"><label>Nome do item<input value={counterExtraName} onChange={e=>setCounterExtraName(e.target.value)} placeholder="Ex.: taxa, produto especial" /></label><label>Preço (R$)<input inputMode="decimal" value={counterExtraPrice} onChange={e=>setCounterExtraPrice(e.target.value)} placeholder="0,00" /></label><button type="button" className="secondary-button" onClick={()=>{const price=Number(counterExtraPrice.replace(',','.'));if(!counterExtraName.trim()||!counterExtraPrice.trim()||!Number.isFinite(price)||price<0){notify('Informe nome e preço válido para o item avulso.',true);return}setCounterExtras(old=>[...old,{id:String(Date.now())+'-'+old.length,nome:counterExtraName.trim(),preco:price,quantidade:1}]);setCounterExtraName('');setCounterExtraPrice('')}}>Adicionar avulso</button></div>{counterExtras.map(x=><div className="counter-product" key={x.id}><div><strong>{x.nome}</strong><small>{formatPrice(x.preco)} cada</small></div><div className="counter-quantity"><button type="button" onClick={()=>setCounterExtras(old=>old.map(y=>y.id===x.id?{...y,quantidade:Math.max(0,y.quantidade-1)}:y))}>−</button><span>{x.quantidade}</span><button type="button" onClick={()=>setCounterExtras(old=>old.map(y=>y.id===x.id?{...y,quantidade:y.quantidade+1}:y))}>+</button><button type="button" aria-label={'Remover '+x.nome} onClick={()=>setCounterExtras(old=>old.filter(y=>y.id!==x.id))}>×</button></div></div>)}</section><div className="counter-total"><span>Total</span><strong>{formatPrice(items.reduce((sum,p)=>sum+unitPricePreview(p,counterPrices)*(counterQty[p.id]??0),0)+counterExtras.reduce((sum,x)=>sum+x.preco*x.quantidade,0))}</strong></div><button className="primary-button" type="submit" disabled={busy||(!items.some(p=>(counterQty[p.id]??0)>0)&&!counterExtras.some(x=>x.quantidade>0))}><Plus size={16}/> {editingOrder?'Salvar pedido editado':'Registrar pedido'}</button></form>}</div>}
    {activeTab==='tabs'&&<div className="admin-content"><div className="admin-heading"><div><span className="eyebrow">atendimento presencial</span><h1>Comandas e garçons</h1><p>Cadastre a equipe, abra comandas por mesa e acompanhe os itens até o fechamento.</p></div></div>{!selected?<section className="admin-panel">Selecione ou crie um restaurante primeiro.</section>:<><div className="admin-panels"><section className="admin-panel"><div className="panel-heading"><div><span className="eyebrow">equipe</span><h2>Garçons</h2></div><span className="status-pill">{waiters.filter(w=>w.ativo).length} ativos</span></div><form className="counter-fields" onSubmit={e=>void addWaiter(e)}><label>Nome do garçom<input required value={waiterName} onChange={e=>setWaiterName(e.target.value)} placeholder="Nome completo"/></label><label>Telefone (opcional)<input value={waiterPhone} onChange={e=>setWaiterPhone(e.target.value)} placeholder="(85) 99999-9999"/></label><button className="primary-button" type="submit"><Plus size={16}/> Cadastrar</button></form>{waiters.length===0?<p className="printer-help">Nenhum garçom cadastrado ainda.</p>:<div className="table-wrap"><table className="admin-table"><thead><tr><th>Nome</th><th>Telefone</th><th>Situação</th><th></th></tr></thead><tbody>{waiters.map(w=><tr key={w.id}><td>{w.nome}</td><td>{w.telefone||'—'}</td><td>{w.ativo?'Ativo':'Inativo'}</td><td><button className="secondary-button" type="button" onClick={()=>void toggleWaiter(w)}>{w.ativo?'Desativar':'Reativar'}</button></td></tr>)}</tbody></table></div>}</section><section className="admin-panel"><div className="panel-heading"><div><span className="eyebrow">nova conta</span><h2>Abrir comanda</h2></div></div><form className="counter-fields" onSubmit={e=>void openTab(e)}><label>Mesa / identificação<input required value={tabTable} onChange={e=>setTabTable(e.target.value)} placeholder="Ex.: Mesa 4 ou Balcão"/></label><label>Garçom responsável<select value={tabWaiter} onChange={e=>setTabWaiter(e.target.value)}><option value="">Sem garçom atribuído</option>{waiters.filter(w=>w.ativo).map(w=><option key={w.id} value={w.id}>{w.nome}</option>)}</select></label><button className="primary-button" type="submit"><Plus size={16}/> Abrir comanda</button></form></section></div><section className="admin-panel"><div className="panel-heading"><div><span className="eyebrow">controle de consumo</span><h2>Comandas</h2></div><button className="secondary-button" type="button" onClick={()=>void loadTabsAndWaiters(selected.id)}>Atualizar</button></div>{tabs.length===0?<p>Nenhuma comanda aberta ou registrada ainda.</p>:<div className="tabs-manager-list">{tabs.map(tab=>{const total=(tab.itens_comanda??[]).reduce((sum,it)=>sum+Number(it.quantidade)*Number(it.preco_unitario),0);return <article className="tab-manager-card" key={tab.id}><div className="tab-manager-heading"><div><span className="eyebrow">comanda #{tab.id}</span><h3>{tab.mesa}</h3><p>{tab.garcons?.nome??'Sem garçom atribuído'} · {new Date(tab.created_at).toLocaleString('pt-BR')}</p></div><span className={tab.status==='aberta'?'status-pill status-pill--open':'status-pill'}>{tab.status==='aberta'?'Aberta':'Fechada'}</span></div>{(tab.itens_comanda??[]).length>0?<div className="tab-manager-items">{tab.itens_comanda!.map(it=><div key={it.id}><span>{it.quantidade}× {it.produto_nome}</span><strong>{formatPrice(Number(it.preco_unitario)*Number(it.quantidade))}</strong></div>)}</div>:<p className="printer-help">Nenhum item lançado nesta comanda.</p>}<div className="tab-manager-total"><span>Total</span><strong>{formatPrice(total)}</strong></div>{tab.status==='aberta'&&<div className="tab-manager-actions"><button className="secondary-button" type="button" onClick={()=>setActiveTabId(activeTabId===tab.id?null:tab.id)}>{activeTabId===tab.id?'Cancelar lançamento':'Adicionar produtos'}</button><button className="primary-button" type="button" onClick={()=>void closeTab(tab.id)}>Fechar comanda</button></div>}{activeTabId===tab.id&&tab.status==='aberta'&&<form className="counter-fields tab-add-item" onSubmit={e=>void addTabItem(e)}><label>Produto<select required value={tabProduct} onChange={e=>setTabProduct(e.target.value)}><option value="">Selecione um produto</option>{items.filter(p=>p.disponivel).map(p=><option key={p.id} value={p.id}>{p.nome} — {formatPrice(Number(p.preco))}</option>)}</select></label><label>Quantidade<input required type="number" min="1" max="99" value={tabQty} onChange={e=>setTabQty(e.target.value)}/></label><button className="primary-button" type="submit"><Plus size={16}/> Lançar item</button></form>}</article>})}</div>}</section></>}</div>}
    {activeTab==='printer'&&<div className="admin-content"><div className="admin-heading"><div><span className="eyebrow">comprovantes</span><h1>Configurações de impressora</h1><p>Personalize o cabeçalho das notas térmicas deste restaurante.</p></div></div>{!selected?<section className="admin-panel">Selecione ou crie um restaurante primeiro.</section>:<section className="admin-panel printer-settings-form"><div className="qz-panel"><div className="panel-heading"><div><span className="eyebrow">impressão direta</span><h2>QZ Tray</h2></div><span className={qzStatus==='Conectado'?'qz-status qz-status--connected':'qz-status'}>{qzStatus}</span></div><p className="printer-help">Conecta ao QZ Tray instalado neste computador e envia as comandas diretamente para a impressora térmica.</p><div className="qz-actions"><button className="primary-button" type="button" onClick={()=>void connectQzTray()}><Printer size={16}/> Conectar e buscar impressoras</button></div>{qzPrinters.length>0&&<label>Impressora<select value={qzPrinterName} onChange={e=>setQzPrinterName(e.target.value)}>{qzPrinters.map(name=><option key={name} value={name}>{name}</option>)}</select></label>}<label>Nome que sairá na nota<input value={printerName} onChange={e=>setPrinterName(e.target.value)} placeholder={selected.nome}/></label><label className="admin-check-label"><input type="checkbox" checked={autoPrint} onChange={e=>setAutoPrint(e.target.checked)}/> Imprimir automaticamente quando chegar pedido novo (com esta tela aberta)</label><div className="qz-actions"><button className="secondary-button" type="button" onClick={()=>void testQzPrinter()} disabled={!qzPrinterName}>Imprimir teste</button><button className="primary-button" type="button" onClick={savePrinterSettings} disabled={!qzPrinterName}>Salvar configurações</button></div><p className="printer-help">Mantenha o QZ Tray aberto neste computador. Na primeira conexão, autorize o endereço do FB3d2y Menu na janela do QZ Tray.</p></div></section>}</div>}
    </main></div>
}
type SalesPeriod = 1 | 7 | 30 | 90


type WhatsAppBotConfig = {
  botName: string
  personality: string
  humanSupportPhone: string
  enabled: boolean
  welcomeMessage: string
  faqMenu: string
  faqHours: string
  faqPayment: string
  statusNew: boolean
  statusPreparing: boolean
  statusReady: boolean
  statusOutForDelivery: boolean
  statusPickupReady: boolean
  statusDelivered: boolean
  messageNew: string
  messagePreparing: string
  messageReady: string
  messageOutForDelivery: string
  messagePickupReady: string
  messageDelivered: string
}
const defaultWhatsAppBotConfig: WhatsAppBotConfig = {
  botName: '',
  personality: 'Seja cordial, prestativo e objetivo. Responda em português brasileiro. Use emojis com moderação e adapte o vocabulário ao tipo de restaurante.',
  humanSupportPhone: '',
  enabled: false,
  welcomeMessage: 'Olá! 👋 Seja bem-vindo(a)! Como podemos ajudar?',
  faqMenu: 'Você pode consultar nosso cardápio e fazer seu pedido pelo link do nosso menu.',
  faqHours: 'Nosso horário de funcionamento está informado no cardápio. Se precisar, fale com nossa equipe.',
  faqPayment: 'As formas de pagamento disponíveis aparecem na finalização do pedido.',
  statusNew: true,
  statusPreparing: true,
  statusReady: true,
  statusOutForDelivery: true,
  statusPickupReady: true,
  statusDelivered: true,
  messageNew: 'Olá, {nome}! Recebemos seu pedido #{pedido}. Obrigado pela preferência!',
  messagePreparing: 'Olá, {nome}! Seu pedido #{pedido} já está sendo preparado. 🍳',
  messageReady: 'Boa notícia, {nome}! Seu pedido #{pedido} está pronto!',
  messageOutForDelivery: 'Olá, {nome}! Seu pedido #{pedido} saiu para entrega. 🚴',
  messagePickupReady: 'Olá, {nome}! Seu pedido #{pedido} está disponível para retirada.',
  messageDelivered: 'Olá, {nome}! Seu pedido #{pedido} foi concluído. Obrigado pela preferência!',
}
function WhatsAppBotPanel({restaurantId,restaurantName,notify}:{restaurantId:number|null;restaurantName:string;notify:(message:string,error?:boolean)=>void}) {
  const [config,setConfig]=useState<WhatsAppBotConfig>(defaultWhatsAppBotConfig)
  const [activeStatusTab,setActiveStatusTab]=useState<'preparing'|'ready'|'delivery'|'pickup'>('preparing')
  const [loading,setLoading]=useState(false)
  const [saving,setSaving]=useState(false)
  const [tableMissing,setTableMissing]=useState(false)
  const [metaPhoneId,setMetaPhoneId]=useState('')
  const [connectionNote,setConnectionNote]=useState('')
  const [bridgeStatus,setBridgeStatus]=useState<'unconfigured'|'disconnected'|'connecting'|'qr'|'connected'|'logged_out'|'error'>('unconfigured')
  const [bridgeError,setBridgeError]=useState('')
  const [qrDataUrl,setQrDataUrl]=useState('')
  const [linkedPhone,setLinkedPhone]=useState('')
  const [bridgeBusy,setBridgeBusy]=useState(false)
  const bridgeUrl=(import.meta.env.VITE_WHATSAPP_BRIDGE_URL as string|undefined)?.replace(/\/$/,'')
  const bridgeRequest=async(path:string,method='GET')=>{
    if(!bridgeUrl)throw new Error('O servidor de QR ainda não foi configurado.')
    const {data}=await supabase.auth.getSession()
    const token=data.session?.access_token
    if(!token)throw new Error('Sua sessão expirou. Entre novamente na sua conta.')
    const response=await fetch(bridgeUrl+'/api/whatsapp/'+restaurantId+'/'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}})
    const body=await response.json().catch(()=>({}))
    if(!response.ok)throw new Error(body.error||'Não foi possível acessar o serviço de WhatsApp.')
    return body as {status?:typeof bridgeStatus;phone?:string|null;qrDataUrl?:string|null;error?:string|null}
  }
  const refreshBridge=async(showFeedback=false)=>{
    if(!bridgeUrl||!restaurantId){
      if(showFeedback)notify(!bridgeUrl?'A URL do servidor de QR não está configurada nesta versão.':'Selecione um restaurante primeiro.',true)
      return
    }
    if(showFeedback)setBridgeBusy(true)
    try{
      const result=await bridgeRequest('status')
      setBridgeStatus(result.status??'disconnected')
      setBridgeError(result.error??'')
      setQrDataUrl(result.qrDataUrl??'')
      setLinkedPhone(result.phone??'')
      if(showFeedback)notify(result.status==='qr'?'QR Code disponível para leitura.':result.status==='connected'?'WhatsApp conectado.':'Servidor respondeu; situação atual: '+(result.status??'desconectado')+'.')
    }catch(err){
      const message=err instanceof Error ? err.message : 'Falha desconhecida ao consultar o servidor.'
      setBridgeStatus('error')
      setBridgeError(message)
      setQrDataUrl('')
      if(showFeedback)notify('Falha ao atualizar conexão: '+message,true)
    }finally{
      if(showFeedback)setBridgeBusy(false)
    }
  }
  useEffect(()=>{
    let active=true
    setConfig(defaultWhatsAppBotConfig)
    setMetaPhoneId('')
    setConnectionNote('')
    setTableMissing(false)
    setBridgeStatus(bridgeUrl?'disconnected':'unconfigured')
    setBridgeError('')
    setQrDataUrl('')
    setLinkedPhone('')
    if(!restaurantId)return
    setLoading(true)
    void supabase.from('whatsapp_bot_config').select('config,meta_phone_number_id,connection_note').eq('empresa_id',restaurantId).maybeSingle().then(({data,error})=>{
      if(!active)return
      setLoading(false)
      if(error){setTableMissing(true);return}
      if(data){
        setConfig({...defaultWhatsAppBotConfig,botName:/yamamoto/i.test(restaurantName)?'Yama':'',...(data.config as Partial<WhatsAppBotConfig>??{})})
        setMetaPhoneId(data.meta_phone_number_id??'')
        setConnectionNote(data.connection_note??'')
      }
    })
    if(bridgeUrl)void refreshBridge()
    return()=>{active=false}
  },[restaurantId,bridgeUrl])
  useEffect(()=>{
    if(!bridgeUrl||!restaurantId||!['connecting','qr','disconnected'].includes(bridgeStatus))return
    const timer=window.setInterval(()=>void refreshBridge(),2500)
    return()=>window.clearInterval(timer)
  },[bridgeUrl,restaurantId,bridgeStatus])
  const connectWhatsApp=async()=>{
    if(!bridgeUrl){notify('O serviço de QR ainda não foi publicado. Consulte whatsapp-bridge/README.md para configurar o servidor persistente.',true);return}
    if(!restaurantId){notify('Selecione um restaurante primeiro.',true);return}
    setBridgeBusy(true)
    try{await bridgeRequest('connect','POST');setBridgeError('');setBridgeStatus('connecting');notify('Solicitação enviada. Aguarde o QR Code aparecer.')}
    catch(err){setBridgeError(err instanceof Error?err.message:'Falha ao iniciar conexão.');setBridgeStatus('error');notify(err instanceof Error?err.message:'Falha ao iniciar conexão.',true)}
    finally{setBridgeBusy(false)}
    void refreshBridge()
  }
  const disconnectWhatsApp=async()=>{
    if(!bridgeUrl||!restaurantId)return
    if(!window.confirm('Desconectar este WhatsApp e apagar a sessão salva no servidor?'))return
    setBridgeBusy(true)
    try{await bridgeRequest('logout','POST');setBridgeStatus('disconnected');setQrDataUrl('');setLinkedPhone('');notify('Sessão do WhatsApp desconectada.')}
    catch(err){notify(err instanceof Error?err.message:'Falha ao desconectar.',true)}
    finally{setBridgeBusy(false)}
  }
  const save=async()=>{
    if(!restaurantId){notify('Crie ou selecione um restaurante antes de configurar o bot.',true);return}
    setSaving(true)
    const {data:auth}=await supabase.auth.getSession()
    const {error}=await supabase.from('whatsapp_bot_config').upsert({
      empresa_id:restaurantId,
      config,
      meta_phone_number_id:metaPhoneId.trim()||null,
      connection_note:connectionNote.trim()||null,
      atualizado_em:new Date().toISOString(),
      atualizado_por:auth.session?.user.id??null
    },{onConflict:'empresa_id'})
    setSaving(false)
    if(error){notify('Não foi possível salvar. Execute o arquivo supabase/08_whatsapp_bot.sql no Supabase de teste. '+error.message,true);return}
    notify('Configurações do Bot do WhatsApp salvas.')
  }
  const update=(patch:Partial<WhatsAppBotConfig>)=>setConfig(old=>({...old,...patch}))
  const statusLabel=bridgeStatus==='connected'?'WhatsApp conectado':bridgeStatus==='qr'?'Aguardando leitura do QR Code':bridgeStatus==='connecting'?'Iniciando sessão…':bridgeStatus==='logged_out'?'Sessão encerrada no celular':bridgeStatus==='error'?'Serviço indisponível':bridgeStatus==='unconfigured'?'Servidor de QR não configurado':'WhatsApp desconectado'
  return <div className="admin-content whatsapp-bot-page">
    <div className="admin-heading"><div><span className="eyebrow">atendimento automatizado</span><h1>Bot do WhatsApp</h1><p>Configure respostas e avisos automáticos para {restaurantName||'seu restaurante'}.</p></div><span className={config.enabled?'whatsapp-state whatsapp-state--on':'whatsapp-state'}><span/>{config.enabled?'Bot ativado nas configurações':'Configuração inicial'}</span></div>
    {!restaurantId?<section className="admin-panel"><h2>Primeiro, crie um restaurante</h2><p>O bot e suas mensagens são configurados separadamente para cada estabelecimento.</p></section>:<>
      {tableMissing&&<section className="whatsapp-notice"><strong>Falta preparar o banco de dados</strong><p>As configurações precisam da tabela nova. Execute <code>supabase/08_whatsapp_bot.sql</code> no SQL Editor do projeto Supabase de teste; depois volte aqui e atualize a página.</p></section>}
      <section className="admin-panel whatsapp-connect-panel">
        <div className="whatsapp-connect-icon"><MessageCircle size={25}/></div><div className="whatsapp-connect-copy"><span className="eyebrow">etapa 1 · conexão de teste</span><h2>Vincular pelo QR Code</h2><p>Esta conexão pertence exclusivamente a {restaurantName||'este restaurante'}. No celular, abra WhatsApp → Dispositivos conectados → Conectar dispositivo e leia o QR Code. O mesmo número não pode ser usado em outro restaurante.</p><div className="whatsapp-connection-status"><span className={bridgeStatus==='connected'?'whatsapp-status-dot whatsapp-status-dot--connected':'whatsapp-status-dot'}/><span>{statusLabel}{bridgeStatus==='connected'&&linkedPhone?' · +'+linkedPhone:''}</span></div></div>
        {bridgeStatus==='qr'&&qrDataUrl&&<div className="whatsapp-qr-wrap"><img src={qrDataUrl} alt="QR Code temporário para vincular WhatsApp" /><p>O QR Code expira rapidamente. Se não funcionar, clique em atualizar conexão.</p></div>}
        {bridgeStatus==='unconfigured'&&<div className="whatsapp-notice"><strong>Falta publicar o servidor persistente</strong><p>O painel já está preparado para mostrar o QR, mas o serviço precisa ser hospedado com armazenamento persistente. Siga <code>whatsapp-bridge/README.md</code> e configure <code>VITE_WHATSAPP_BRIDGE_URL</code> no ambiente de teste da Vercel.</p></div>}
        {bridgeStatus==='error'&&<div className="whatsapp-notice"><strong>Falha na conexão com o servidor de QR</strong><p>{bridgeError||'Não foi possível acessar o servidor. Clique em atualizar conexão para tentar novamente.'}</p><small>Essa mensagem ajuda a identificar se o problema é de rede, autorização ou configuração.</small></div>}
        <div className="whatsapp-connect-actions"><button className="primary-button" type="button" onClick={()=>void connectWhatsApp()} disabled={bridgeBusy||bridgeStatus==='connected'}>{bridgeBusy?'Aguarde…':bridgeStatus==='qr'?'Gerar novo QR Code':'Gerar QR Code de login'}</button>{bridgeStatus!=='unconfigured'&&<button className="secondary-button" type="button" onClick={()=>void refreshBridge(true)} disabled={bridgeBusy}>{bridgeBusy?'Consultando…':'Atualizar conexão'}</button>}{['connected','qr','connecting','logged_out'].includes(bridgeStatus)&&<button className="secondary-button" type="button" onClick={()=>void disconnectWhatsApp()} disabled={bridgeBusy}>Desconectar</button>}</div>
        <p className="printer-help">A sessão fica armazenada no servidor. Use um número de teste: a biblioteca é não oficial e pode causar desconexões ou restrições. Este QR conecta a conta, mas ainda não ativa envios automáticos de pedidos.</p>
        <label>ID do número do WhatsApp (Meta, opcional)<input value={metaPhoneId} onChange={e=>setMetaPhoneId(e.target.value)} placeholder="Usado apenas na futura integração oficial"/></label>
        <label>Observação da conexão<input value={connectionNote} onChange={e=>setConnectionNote(e.target.value)} placeholder="Ex.: número de teste vinculado"/></label>
      </section>
      <section className="admin-panel whatsapp-config-panel">
        <div className="panel-heading"><div><span className="eyebrow">etapa 2 · comportamento</span><h2>Respostas automáticas</h2></div><label className="whatsapp-toggle"><input type="checkbox" checked={config.enabled} onChange={e=>update({enabled:e.target.checked})}/><span>{config.enabled?'Ativado':'Desativado'}</span></label></div>
        <p>Edite os textos que o bot usará. As mensagens ficam salvas por restaurante; a automação só começará a enviar mensagens depois que a conexão oficial for concluída.</p>
        <div className="whatsapp-faq-grid">
          <label>Nome do seu bot<input type="text" maxLength={40} value={config.botName} onChange={e=>update({botName:e.target.value})} placeholder="Ex.: Yama"/></label>
          <label>Personalidade e estilo de atendimento<textarea rows={3} maxLength={1200} value={config.personality} onChange={e=>update({personality:e.target.value})} placeholder="Ex.: descontraído, educado, usa emojis de sushi e respostas curtas."/></label>
        </div>
        <label>WhatsApp do atendente para receber solicitações de atendimento humano<input type="tel" inputMode="tel" autoComplete="tel" maxLength={20} value={config.humanSupportPhone} onChange={e=>update({humanSupportPhone:e.target.value})} placeholder="Ex.: (88) 99999-9999"/></label>
        <p className="printer-help">Esse número é privado: os clientes não terão acesso a ele. Quando alguém pedir uma pessoa da equipe ou o bot não conseguir resolver uma dúvida, o WhatsApp conectado ao restaurante avisará esse atendente.</p>
        <label>Mensagem de boas-vindas<textarea rows={2} maxLength={1000} value={config.welcomeMessage} onChange={e=>update({welcomeMessage:e.target.value})}/></label>
        <div className="whatsapp-faq-grid">
          <label>Resposta sobre cardápio<textarea rows={3} maxLength={1000} value={config.faqMenu} onChange={e=>update({faqMenu:e.target.value})}/></label>
          <label>Resposta sobre horário<textarea rows={3} maxLength={1000} value={config.faqHours} onChange={e=>update({faqHours:e.target.value})}/></label>
          <label>Resposta sobre pagamento<textarea rows={3} maxLength={1000} value={config.faqPayment} onChange={e=>update({faqPayment:e.target.value})}/></label>
        </div>
      </section>
      <section className="admin-panel whatsapp-config-panel">
        <div className="panel-heading"><div><span className="eyebrow">etapa 3 · acompanhamento</span><h2>Avisos de status do pedido</h2></div></div>
        <p>Marque quais mudanças de status devem gerar uma mensagem. Use <code>{'{nome}'}</code> para o primeiro nome do cliente e <code>{'{pedido}'}</code> para o número do pedido.</p>
        <div className="whatsapp-status-tabs" role="tablist" aria-label="Etapas de atualização do pedido" style={{display:'flex',flexWrap:'wrap',gap:8}}>
          {([
            ['preparing','Mover para preparo'],
            ['ready','Pedido pronto'],
            ['delivery','Pedido em entrega'],
            ['pickup','Retirada disponível'],
          ] as const).map(([key,label])=><button key={key} type="button" role="tab" aria-selected={activeStatusTab===key} className={activeStatusTab===key?'primary-button':'secondary-button'} onClick={()=>setActiveStatusTab(key)}>{label}</button>)}
        </div>
        {activeStatusTab==='preparing'&&<div className="whatsapp-status-editor"><label className="whatsapp-toggle"><input type="checkbox" checked={config.statusPreparing} onChange={e=>update({statusPreparing:e.target.checked})}/><span>Enviar aviso ao mover para preparo</span></label><textarea aria-label="Mensagem ao mover para preparo" rows={3} maxLength={1000} value={config.messagePreparing} onChange={e=>update({messagePreparing:e.target.value})}/></div>}
        {activeStatusTab==='ready'&&<div className="whatsapp-status-editor"><label className="whatsapp-toggle"><input type="checkbox" checked={config.statusReady} onChange={e=>update({statusReady:e.target.checked})}/><span>Enviar aviso quando o pedido estiver pronto</span></label><textarea aria-label="Mensagem de pedido pronto" rows={3} maxLength={1000} value={config.messageReady} onChange={e=>update({messageReady:e.target.value})}/></div>}
        {activeStatusTab==='delivery'&&<div className="whatsapp-status-editor"><label className="whatsapp-toggle"><input type="checkbox" checked={config.statusOutForDelivery} onChange={e=>update({statusOutForDelivery:e.target.checked})}/><span>Enviar aviso quando sair para entrega</span></label><textarea aria-label="Mensagem de pedido em entrega" rows={3} maxLength={1000} value={config.messageOutForDelivery} onChange={e=>update({messageOutForDelivery:e.target.value})}/></div>}
        {activeStatusTab==='pickup'&&<div className="whatsapp-status-editor"><label className="whatsapp-toggle"><input type="checkbox" checked={config.statusPickupReady} onChange={e=>update({statusPickupReady:e.target.checked})}/><span>Enviar aviso quando estiver disponível para retirada</span></label><textarea aria-label="Mensagem de retirada disponível" rows={3} maxLength={1000} value={config.messagePickupReady} onChange={e=>update({messagePickupReady:e.target.value})}/></div>}
        <div className="whatsapp-template-note"><strong>Importante sobre envios</strong><p>Para iniciar mensagens fora da janela de atendimento do WhatsApp, a Meta normalmente exige modelos aprovados. A integração final precisa mapear cada status para um modelo permitido e respeitar as regras de consentimento e envio.</p></div>
        <button className="primary-button" type="button" onClick={()=>void save()} disabled={saving||loading}>{saving?'Salvando…':'Salvar configurações do bot'}</button>
        {loading&&<small>Carregando configurações…</small>}
      </section>
    </>}
  </div>
}

function SalesReport({orders,onRefresh}:{orders:AdminOrder[];onRefresh:()=>void}) {
  const [period,setPeriod]=useState<SalesPeriod>(1)
  const now = new Date()
  const start = new Date(now)
  start.setHours(0,0,0,0)
  start.setDate(start.getDate()-(period-1))
  const dateKey = (date:Date) => [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-')
  const periodOrders = orders.filter(order=>{const date=new Date(order.criado_em);return date>=start&&date<=now&&order.status!=='Cancelado'})
  const revenue = periodOrders.reduce((sum,order)=>sum+Number(order.total||0),0)
  const average = periodOrders.length ? revenue/periodOrders.length : 0
  const days = Array.from({length:period},(_,index)=>{const date=new Date(start);date.setDate(start.getDate()+index);return {key:dateKey(date),label:period===7?date.toLocaleDateString('pt-BR',{weekday:'short'}):date.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}),total:0,count:0}})
  const daily = new Map(days.map(day=>[day.key,day]))
  periodOrders.forEach(order=>{const day=daily.get(dateKey(new Date(order.criado_em)));if(day){day.total+=Number(order.total||0);day.count+=1}})
  const maxDay = Math.max(1,...days.map(day=>day.total))
  const statuses = ['Novo','Preparando','Pronto','Concluído']
  const exportCsv = () => {
    const rows = [['Pedido','Data','Cliente','Tipo','Status','Total'],...periodOrders.map(order=>[String(order.id),new Date(order.criado_em).toLocaleString('pt-BR'),order.cliente_nome,order.tipo_entrega,order.status,Number(order.total).toFixed(2).replace('.',',')])]
    const csv = '\uFEFF'+rows.map(row=>row.map(value=>'"'+String(value??'').replace(/"/g,'""')+'"').join(';')).join('\r\n')
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}))
    const link=document.createElement('a');link.href=url;link.download='relatorio-vendas-'+period+'-dias.csv';link.click();URL.revokeObjectURL(url)
  }
  return <div className="admin-content sales-report"><div className="admin-heading"><div><span className="eyebrow">desempenho do negócio</span><h1>Relatório de vendas</h1><p>Acompanhe faturamento e pedidos do menu selecionado.</p></div><div className="sales-report__actions"><button className="secondary-button" type="button" onClick={onRefresh}>Atualizar dados</button><button className="primary-button" type="button" onClick={exportCsv} disabled={periodOrders.length===0}>Exportar CSV</button></div></div>
    {orders.length>=100&&<p className="sales-report__notice">O painel carregou os 100 pedidos mais recentes. Este relatório considera apenas esses pedidos.</p>}
    <div className="sales-period" role="group" aria-label="Período do relatório">{([1,7,30,90] as SalesPeriod[]).map(value=><button key={value} type="button" className={period===value?'sales-period__button sales-period__button--active':'sales-period__button'} onClick={()=>setPeriod(value)}>{value===1?'Hoje':value+' dias'}</button>)}</div>
    <div className="stats-grid sales-stats"><StatCard value={formatPrice(revenue)} label="vendas não canceladas" icon={<BarChart3 size={17}/>} /><StatCard value={String(periodOrders.length)} label="pedidos no período" icon={<ShoppingBag size={17}/>} /><StatCard value={formatPrice(average)} label="ticket médio" icon={<Store size={17}/>} /></div>
    <section className="admin-panel sales-chart-panel"><div className="panel-heading"><div><span className="eyebrow">evolução</span><h2>Vendas por dia</h2></div><span>{period} dias</span></div>{periodOrders.length===0?<p>Não há pedidos não cancelados nesse período.</p>:<div className="sales-chart" role="img" aria-label={'Gráfico de vendas dos últimos '+period+' dias'}>{days.map(day=><div className="sales-chart__column" key={day.key} title={day.label+': '+formatPrice(day.total)+' ('+day.count+' pedidos)'}><span className="sales-chart__value">{day.total>0?formatPrice(day.total):''}</span><div className="sales-chart__track"><div className="sales-chart__bar" style={{height:(day.total/maxDay*100)+'%'}}/></div><small>{day.label}</small></div>)}</div>}</section>
    <section className="admin-panel sales-status-panel"><div className="panel-heading"><div><span className="eyebrow">operação</span><h2>Status dos pedidos</h2></div></div><div className="sales-status-list">{statuses.map(status=>{const count=periodOrders.filter(order=>order.status===status).length;return <div className="sales-status-row" key={status}><span>{status}</span><div className="sales-status-track"><div style={{width:(count/Math.max(1,periodOrders.length)*100)+'%'}}/></div><strong>{count}</strong></div>})}<div className="sales-status-row sales-status-row--muted"><span>Cancelados (fora do faturamento)</span><div className="sales-status-track"><div style={{width:(orders.filter(order=>{const date=new Date(order.criado_em);return date>=start&&date<=now&&order.status==='Cancelado'}).length/Math.max(1,orders.filter(order=>{const date=new Date(order.criado_em);return date>=start&&date<=now}).length)*100)+'%'}}/></div><strong>{orders.filter(order=>{const date=new Date(order.criado_em);return date>=start&&date<=now&&order.status==='Cancelado'}).length}</strong></div></div></section>
    <section className="admin-panel sales-table-panel"><div className="panel-heading"><div><span className="eyebrow">movimentações</span><h2>Pedidos considerados</h2></div><span>{periodOrders.length} registros</span></div>{periodOrders.length===0?<p>Nenhuma venda para exibir.</p>:<div className="sales-table-wrap"><table className="sales-table"><thead><tr><th>Pedido</th><th>Data</th><th>Cliente</th><th>Status</th><th>Total</th></tr></thead><tbody>{[...periodOrders].sort((a,b)=>new Date(b.criado_em).getTime()-new Date(a.criado_em).getTime()).map(order=><tr key={order.id}><td>#{order.id}</td><td>{new Date(order.criado_em).toLocaleDateString('pt-BR')}</td><td>{order.cliente_nome}</td><td><span className="sales-order-status">{order.status}</span></td><td>{formatPrice(Number(order.total))}</td></tr>)}</tbody></table></div>}</section>
    <p className="sales-report__footnote">O valor exibido soma pedidos que não estão cancelados; não representa confirmação de pagamento. Os dados são os pedidos disponíveis no painel.</p>
  </div>
}

function RestaurantSettings({restaurant,saving,onSave}:{restaurant:AdminRestaurant;saving:boolean;onSave:(e:React.FormEvent<HTMLFormElement>,form:Record<string,unknown>)=>Promise<void>}) {
  const [form,setForm]=useState({
    nome:restaurant.nome, descricao:restaurant.descricao??'', cnpj:restaurant.cnpj??'',
    endereco:restaurant.endereco??'', cep:restaurant.cep??'', cidade:restaurant.cidade??'',
    estado:restaurant.estado??'', localizacao:restaurant.localizacao??'',
    telefone_contato:restaurant.telefone_contato??'', whatsapp_contato:restaurant.whatsapp_contato??'',
    email_contato:restaurant.email_contato??'', horario:restaurant.horario??'',
    instagram:restaurant.instagram??'',
    logo_url:restaurant.logo_url??'', capa_url:restaurant.capa_url??'',
    ativo:restaurant.ativo
  })
  useEffect(()=>{setForm({
    nome:restaurant.nome, descricao:restaurant.descricao??'', cnpj:restaurant.cnpj??'',
    endereco:restaurant.endereco??'', cep:restaurant.cep??'', cidade:restaurant.cidade??'',
    estado:restaurant.estado??'', localizacao:restaurant.localizacao??'',
    telefone_contato:restaurant.telefone_contato??'', whatsapp_contato:restaurant.whatsapp_contato??'',
    email_contato:restaurant.email_contato??'', horario:restaurant.horario??'',
    instagram:restaurant.instagram??'',
    logo_url:restaurant.logo_url??'', capa_url:restaurant.capa_url??'',
    ativo:restaurant.ativo
  })},[restaurant])
  const textField=(key:'nome'|'descricao'|'cnpj'|'endereco'|'cep'|'cidade'|'estado'|'localizacao'|'telefone_contato'|'whatsapp_contato'|'email_contato'|'horario'|'instagram'|'logo_url'|'capa_url',label:string,placeholder='')=><label>{label}{key==='descricao'?<textarea value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})} rows={3}/>:<input value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})} placeholder={placeholder} maxLength={key==='cnpj'?18:key==='cep'?9:undefined} />}</label>
  return <form className="admin-panel admin-settings-form" onSubmit={e=>void onSave(e,form)}>
    <div className="panel-heading"><div><span className="eyebrow">cadastro do estabelecimento</span><h2>Dados do restaurante</h2></div><span>/menu/{restaurant.slug}</span></div>
    <div className="form-row">{textField('nome','Nome do restaurante')}{textField('cnpj','CNPJ','00.000.000/0000-00')}</div>
    {textField('descricao','Descrição do negócio')}
    {textField('endereco','Endereço completo','Rua, número e complemento')}
    <div className="form-row">{textField('cep','CEP','00000-000')}{textField('cidade','Cidade')}{textField('estado','Estado / UF','CE')}</div>
    <div className="form-row">{textField('localizacao','Bairro ou referência')}{textField('horario','Horário de funcionamento','Seg a sáb, 18h às 23h')}</div>
    <div className="form-row">{textField('telefone_contato','Telefone de contato')}{textField('whatsapp_contato','WhatsApp para pedidos')}</div>
    <div className="form-row">{textField('email_contato','E-mail comercial')}{textField('instagram','Instagram','@seurestaurante')}</div>
    <div className="form-row">{textField('logo_url','URL da foto de perfil','https://...')}{textField('capa_url','URL do banner / capa','https://...')}</div>
    <div className="restaurant-image-upload-grid"><label>Trocar foto de perfil (máx. 600 KB)<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{const url=await uploadMenuImage(file,restaurant.id,{optimizeForShare:true});setForm(old=>({...old,logo_url:url}));}catch(err){window.alert(err instanceof Error?err.message:'Não foi possível enviar a foto.')}finally{e.target.value=''}}}/>{form.logo_url&&<img src={form.logo_url} alt="Prévia da foto de perfil"/>}</label><label>Trocar banner do restaurante<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{const url=await uploadMenuImage(file,restaurant.id);setForm(old=>({...old,capa_url:url}));}catch(err){window.alert(err instanceof Error?err.message:'Não foi possível enviar o banner.')}finally{e.target.value=''}}}/>{form.capa_url&&<img className="restaurant-banner-preview" src={form.capa_url} alt="Prévia do banner"/>}</label></div>
    <div className="form-row"><label className="admin-check-label"><input type="checkbox" checked={form.ativo} onChange={e=>setForm({...form,ativo:e.target.checked})}/> Menu publicado</label></div>
    <button className="primary-button" type="submit" disabled={saving}>{saving?'Salvando…':'Salvar dados do restaurante'}</button>
  </form>
}
function ComplementOptionAdminRow({option,groupId,restaurantId,onUpdated,notify}:{option:AdminComplementOption;groupId:number;restaurantId:number;onUpdated:(patch:Partial<AdminComplementOption>)=>void;notify:(message:string,isError?:boolean)=>void}) {
  const [editing,setEditing]=useState(false),[name,setName]=useState(option.nome),[price,setPrice]=useState(String(option.preco_adicional).replace('.',',')),[saving,setSaving]=useState(false)
  useEffect(()=>{setName(option.nome);setPrice(String(option.preco_adicional).replace('.',','))},[option.nome,option.preco_adicional])
  const save=async()=>{const amount=Number(price.replace(',','.'));if(!name.trim()||!Number.isFinite(amount)||amount<0){notify('Informe o nome e um preço válido para o complemento.',true);return}setSaving(true);const {error}=await supabase.from('opcoes_complementos').update({nome:name.trim(),preco_adicional:amount}).eq('id',option.id).eq('grupo_id',groupId);setSaving(false);if(error){notify('Não foi possível editar o complemento: '+error.message,true);return}onUpdated({nome:name.trim(),preco_adicional:amount});setEditing(false);notify('Complemento atualizado.')}
  return <div className={'complement-admin-option'+(!option.ativo?' complement-admin-option--inactive':'')}>
    {option.imagem_url?<img className="complement-admin-option__image" src={option.imagem_url} alt={'Foto de '+option.nome}/>:<span className="complement-admin-option__no-image">Sem foto</span>}
    {editing?<div className="complement-option-edit-fields"><label>Nome<input value={name} maxLength={150} onChange={e=>setName(e.target.value)} autoFocus/></label><label>Preço adicional (R$)<input value={price} inputMode="decimal" onChange={e=>setPrice(e.target.value)} placeholder="0,00"/></label><div className="admin-product-actions"><button className="link-button" type="button" disabled={saving} onClick={()=>void save()}>{saving?'Salvando…':'Salvar'}</button><button className="link-button" type="button" disabled={saving} onClick={()=>{setName(option.nome);setPrice(String(option.preco_adicional).replace('.',','));setEditing(false)}}>Cancelar</button></div></div>:<><span className="complement-admin-option__name">{option.nome}{Number(option.preco_adicional)>0?' · +'+formatPrice(Number(option.preco_adicional)):''}</span><button className="link-button" type="button" onClick={()=>setEditing(true)}>Editar</button></>}
    <label className="complement-admin-option__photo-button">{option.imagem_url?'Trocar foto':'Adicionar foto'}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{const url=await uploadMenuImage(file,restaurantId);const {error}=await supabase.from('opcoes_complementos').update({imagem_url:url}).eq('id',option.id);if(error)throw error;onUpdated({imagem_url:url});notify('Foto do complemento salva.')}catch(err){notify(err instanceof Error?err.message:'Não foi possível salvar a foto.',true)}finally{e.target.value=''}}}/></label>
    <span className="complement-admin-option__status">{option.ativo?'Ativo':'Desativado'}</span>
    <button className="link-button" type="button" onClick={async()=>{const next=!option.ativo;const {error}=await supabase.from('opcoes_complementos').update({ativo:next}).eq('id',option.id);if(error){notify('Não foi possível alterar o complemento: '+error.message,true);return}onUpdated({ativo:next});notify(next?'Complemento reativado.':'Complemento desativado.')}}>{option.ativo?'Desativar':'Reativar'}</button>
  </div>
}
function ProductAdminRow({product,restaurantId,categories,complementGroups,linkedGroupIds,onSave,onDelete}:{product:AdminProduct;restaurantId:number;categories:AdminCategory[];complementGroups:AdminComplementGroup[];linkedGroupIds:number[];onSave:(p:AdminProduct,patch:Partial<AdminProduct>,groupIds?:number[])=>Promise<void>;onDelete:(p:AdminProduct)=>Promise<void>}) {
  const [editing,setEditing]=useState(false),[groupIds,setGroupIds]=useState<number[]>(linkedGroupIds),[form,setForm]=useState({nome:product.nome,descricao:product.descricao??'',preco:String(product.preco).replace('.',','),categoria_id:product.categoria_id?String(product.categoria_id):'',imagem_url:product.imagem_url??'',disponivel:product.disponivel,max_complementos:String(product.max_complementos??0)})
  useEffect(()=>{if(!editing)return;setForm({nome:product.nome,descricao:product.descricao??'',preco:String(product.preco).replace('.',','),categoria_id:product.categoria_id?String(product.categoria_id):'',imagem_url:product.imagem_url??'',disponivel:product.disponivel,max_complementos:String(product.max_complementos??0)});setGroupIds(linkedGroupIds)},[editing,product,linkedGroupIds])
  return <article className="admin-product-row">{product.imagem_url?<img className="admin-product-image" src={product.imagem_url} alt=""/>:<span className="admin-product-placeholder"><Utensils size={17}/></span>}<div className="admin-product-row__content">{editing?<><label>Nome<input value={form.nome} onChange={e=>setForm({...form,nome:e.target.value})}/></label><label>Descrição<textarea value={form.descricao} onChange={e=>setForm({...form,descricao:e.target.value})}/></label><div className="form-row"><label>Preço<input value={form.preco} onChange={e=>setForm({...form,preco:e.target.value})}/></label><label>Categoria<select value={form.categoria_id} onChange={e=>setForm({...form,categoria_id:e.target.value})}><option value="">Sem categoria</option>{categories.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></label></div><label>URL da foto<input value={form.imagem_url} onChange={e=>setForm({...form,imagem_url:e.target.value})}/></label><label>Máximo de complementos deste produto (0 = sem limite)<input type="number" min="0" max="50" step="1" value={form.max_complementos} onChange={e=>setForm({...form,max_complementos:e.target.value})}/></label>{complementGroups.length>0&&<fieldset className="product-complement-link"><legend>Complementos disponíveis para este produto</legend><p>Marque quais opções o cliente poderá escolher. O limite acima vale para o total de opções selecionadas entre todos os grupos.</p>{complementGroups.filter(g=>g.ativo).map(g=><label key={g.id}><input type="checkbox" checked={groupIds.includes(g.id)} onChange={e=>setGroupIds(old=>e.target.checked?[...old,g.id]:old.filter(id=>id!==g.id))}/><span>{g.nome}</span><small>{g.opcoes_complementos.filter(o=>o.ativo).length} opções</small></label>)}</fieldset>}<label>Ou enviar foto (máx. 5 MB)<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{const url=await uploadMenuImage(file,restaurantId);setForm(old=>({...old,imagem_url:url}));window.alert('Foto enviada. Clique em Salvar para aplicar.')}catch(err){window.alert(err instanceof Error?err.message:'Erro ao enviar foto.')}finally{e.target.value=''}}}/></label><label className="admin-check-label"><input type="checkbox" checked={form.disponivel} onChange={e=>setForm({...form,disponivel:e.target.checked})}/> Disponível no menu</label><div className="form-row"><button className="primary-button" type="button" onClick={()=>{const price=Number(form.preco.replace(',','.'));if(!form.nome.trim()||!Number.isFinite(price)||price<0){notifyProductError();return}void onSave(product,{nome:form.nome.trim(),descricao:form.descricao.trim()||null,preco:price,categoria_id:form.categoria_id?Number(form.categoria_id):null,imagem_url:form.imagem_url.trim()||null,disponivel:form.disponivel,max_complementos:Math.max(0,Math.min(50,Math.floor(Number(form.max_complementos)||0)))},groupIds).then(()=>setEditing(false)).catch(()=>undefined)}}>Salvar</button><button className="secondary-button" type="button" onClick={()=>setEditing(false)}>Cancelar</button></div></>:<><div className="admin-product-row__heading"><strong>{product.nome}</strong><b>{formatPrice(Number(product.preco))}</b></div><p>{product.descricao||'Sem descrição'}</p><small>{categories.find(c=>c.id===product.categoria_id)?.nome??'Sem categoria'} · {product.disponivel?'Disponível':'Indisponível'}</small><div className="admin-product-actions"><button className="link-button" type="button" onClick={()=>void onSave(product,{disponivel:!product.disponivel})}>{product.disponivel?'Desativar':'Reativar'}</button><button className="link-button" type="button" onClick={()=>setEditing(true)}>Editar</button><button className="link-button" type="button" onClick={()=>void onDelete(product)}>Excluir</button></div></>}</div></article>
}
function notifyProductError(){window.alert('Informe o nome e um preço válido.')} function notifyUploadDone(){window.alert('Imagem enviada. Clique em “Salvar informações” para guardar a alteração.')}
function HomePage() {
  useEffect(() => {
    document.title = 'FB3d2y Menu — Seu cardápio digital'
  }, [])
  return (
    <div className="home-page">
      <header className="home-header">
        <a className="brand" href="/" aria-label="FB3d2y Menu - início"><span className="brand-mark">F</span><span>FB3d2y <b>Menu</b></span></a>
        <a className="home-header-link" href="/admin">Entrar na minha conta <ChevronRight size={16}/></a>
      </header>
      <main>
        <section className="home-hero">
          <div className="home-hero-copy">
            <span className="home-kicker"><span className="pulse-dot"/> CARDÁPIO DIGITAL PARA NEGÓCIOS LOCAIS</span>
            <h1>Seu negócio merece um menu <em>à sua maneira.</em></h1>
            <p>Crie seu cardápio online, organize seus produtos e acompanhe os pedidos em um só lugar. Simples para você, prático para seus clientes.</p>
            <div className="home-actions">
              <a className="home-primary-button" href="/admin">Começar com Google <ChevronRight size={18}/></a>
              <a className="home-example-button" href="/demo">Modelo de menu <ChevronRight size={17}/></a>
            </div>
            <div className="home-trust"><span><Check size={15}/> Personalize seus produtos</span><span><Check size={15}/> Gerencie seus pedidos</span><span><CheckCircle2 size={15}/> Backup automático semanal</span></div>
          </div>
          <div className="home-preview home-preview--phone" aria-label="Prévia de um cardápio genérico de pizzaria em um celular">
            <div className="phone-frame">
              <div className="phone-side-button phone-side-button--one" />
              <div className="phone-side-button phone-side-button--two" />
              <div className="phone-screen">
                <div className="phone-status"><span>9:41</span><span>● ● ▰</span></div>
                <div className="phone-camera"><span /></div>
                <div className="phone-menu-header"><span className="phone-brand-mark">🍕</span><div><strong>Forno da Vila</strong><small>Pizza artesanal · Delivery</small></div><span className="phone-menu-open">Aberto</span></div>
                <div className="phone-cover phone-cover--pizza"><span>SAINDO DO FORNO</span><strong>Sua pizza favorita<br/>começa aqui.</strong></div>
                <div className="phone-menu-body">
                  <div className="phone-menu-title"><div><small>FEITA NA HORA, COM CARINHO</small><strong>Mais pedidos</strong></div><span>Ver menu</span></div>
                  <div className="phone-product"><div className="phone-food phone-food--pizza-one"><span /></div><div><strong>Calabresa Especial</strong><small>Calabresa, cebola e muçarela.</small><b>R$ 39,90</b></div><span className="phone-add">+</span></div>
                  <div className="phone-product"><div className="phone-food phone-food--pizza-two"><span /></div><div><strong>Margherita</strong><small>Muçarela, tomate e manjericão.</small><b>R$ 36,90</b></div><span className="phone-add">+</span></div>
                  <div className="phone-cart"><ShoppingBag size={14}/><span>Seu pedido · escolha seus itens</span><b>R$ 0,00</b></div>
                </div>
              </div>
            </div>
            <div className="home-floating-note"><span><CheckCircle2 size={17}/></span><div><strong>Seu menu, suas regras</strong><small>Edite quando quiser</small></div></div>
          </div>
        </section>
        <section className="home-features">
          <div className="home-section-heading"><span className="eyebrow">TUDO EM UM SÓ LUGAR</span><h2>Do primeiro produto ao próximo pedido.</h2></div>
          <div className="home-feature-grid">
            <article><span className="home-feature-icon"><Store size={20}/></span><h3>Seu espaço</h3><p>Cadastre seu restaurante ou negócio e compartilhe um link próprio.</p></article>
            <article><span className="home-feature-icon"><Utensils size={20}/></span><h3>Cardápio personalizado</h3><p>Organize categorias, fotos, descrições, preços e disponibilidade.</p></article>
            <article><span className="home-feature-icon"><ShoppingBag size={20}/></span><h3>Pedidos organizados</h3><p>Veja os pedidos recebidos e atualize o andamento pelo painel.</p></article>
          </div>
        </section>
      </main>
      <footer className="home-footer"><a className="brand" href="/"><span className="brand-mark">F</span><span>FB3d2y <b>Menu</b></span></a><span>Cardápios próximos, pedidos simples.</span><a href="/privacy">Política de Privacidade</a><a href="/demo">Modelo de menu <ArrowLeft size={14}/></a></footer>
    </div>
  )
}

export default function App() {
  const path = window.location.pathname
  const [admin, setAdmin] = useState(() => path.startsWith('/admin'))
  if (path === '/privacy' || path === '/privacy/') return <PrivacyPolicy />
  if (admin) return <AdminView onBack={() => { window.history.pushState({}, '', '/'); setAdmin(false) }} />
  const slug = menuSlugFromPath(path)
  if (slug) return <MenuLoader slug={slug} />
  if (path === '/demo' || path === '/demo/') return <MenuLoader slug="yamamoto-sushibar" />
  return <HomePage />
}