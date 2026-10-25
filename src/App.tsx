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

function ProductArtwork({ product, compact = false }: { product: Product; compact?: boolean }) {
  if (product.imageUrl) {
    return <div className={`product-art product-art--photo ${compact ? 'product-art--compact' : ''}`}><img src={product.imageUrl} alt="" loading="lazy" /></div>
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
    const url = window.location.href
    if (navigator.share) void navigator.share({ title: restaurant.name, url }).catch(() => undefined)
    else void navigator.clipboard?.writeText(url)
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

function ProductCard({ product, categoryLabel, canOrder, onAdd }: { product: Product; categoryLabel?: string; canOrder: boolean; onAdd: (product: Product) => void }) {
  return (
    <article className="product-card">
      <ProductArtwork product={product} />
      <div className="product-card__body">
        <div className="product-card__topline"><span className="product-category">{categoryLabel}</span><button type="button" className="add-button" onClick={() => onAdd(product)} disabled={!canOrder} aria-label={`Adicionar ${product.name}`}><Plus size={18} /></button></div>
        <h3>{product.name}</h3>
        <p>{product.description}</p>
        <strong>{formatPrice(product.price)}</strong>
      </div>
    </article>
  )
}

function CartDrawer({ cart, isDemo, onClose, onAdjust, onSubmit }: { cart: CartLine[]; isDemo: boolean; onClose: () => void; onAdjust: (lineId: string, amount: number) => void; onSubmit: (form: OrderForm) => Promise<void> }) {
  const [savedCustomer] = useState(() => { try { return JSON.parse(window.localStorage.getItem('menuhub-customer-data') || '{}') as {name?:string;phone?:string;deliveryType?:OrderForm['deliveryType'];address?:string;paymentMethod?:OrderForm['paymentMethod']} } catch { return {} } })
  const [name, setName] = useState(savedCustomer.name ?? '')
  const [phone, setPhone] = useState(savedCustomer.phone ?? '')
  const [deliveryType, setDeliveryType] = useState<OrderForm['deliveryType']>(savedCustomer.deliveryType === 'Entrega' ? 'Entrega' : 'Retirada')
  const [address, setAddress] = useState(savedCustomer.address ?? '')
  const [paymentMethod, setPaymentMethod] = useState<OrderForm['paymentMethod']>(savedCustomer.paymentMethod ?? 'Pix')
  const [observations, setObservations] = useState('')
  const [needsChange, setNeedsChange] = useState(false)
  const [changeFor, setChangeFor] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const total = cart.reduce((sum, line) => sum + (line.product.price + line.complements.reduce((n,o)=>n+o.price,0)) * line.quantity, 0)
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0)
  useEffect(() => { try { window.localStorage.setItem('menuhub-customer-data', JSON.stringify({name,phone,deliveryType,address,paymentMethod})) } catch { /* armazenamento do navegador indisponível */ } }, [name,phone,deliveryType,address,paymentMethod])
  const phoneDigits = phone.replace(/\D/g, '')
  const valid = name.trim().length >= 2 && phoneDigits.length >= 10 && phoneDigits.length <= 13 && (deliveryType === 'Retirada' || address.trim().length >= 5) && (paymentMethod !== 'Dinheiro' || !needsChange || (Number(changeFor.replace(',', '.')) > 0 && Number.isFinite(Number(changeFor.replace(',', '.')))))

  const send = async () => {
    setSending(true)
    setError(null)
    try {
      await onSubmit({ name: name.trim(), phone, deliveryType, address: address.trim(), paymentMethod, observations: observations.trim(), needsChange: paymentMethod === 'Dinheiro' && needsChange, changeFor: paymentMethod === 'Dinheiro' && needsChange ? Number(changeFor.replace(',', '.')) : null })
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
          <span className="eyebrow">para enviar, só precisamos de</span>
          <label>Seu nome<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Como podemos te chamar?" maxLength={100} /></label>
          <label>WhatsApp<input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(88) 9 9999-9999" inputMode="tel" maxLength={20} /></label>
          <div className="delivery-choice" role="radiogroup" aria-label="Como você quer receber?">
            <button type="button" role="radio" aria-checked={deliveryType === 'Retirada'} className={deliveryType === 'Retirada' ? 'delivery-option delivery-option--active' : 'delivery-option'} onClick={() => setDeliveryType('Retirada')}>Retirar no local</button>
            <button type="button" role="radio" aria-checked={deliveryType === 'Entrega'} className={deliveryType === 'Entrega' ? 'delivery-option delivery-option--active' : 'delivery-option'} onClick={() => setDeliveryType('Entrega')}>Entrega</button>
          </div>
          {deliveryType === 'Entrega' && <label>Endereço de entrega<textarea value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Rua, número, bairro e referência" rows={2} maxLength={300} /></label>}
          <label>Como você vai pagar?
            <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as OrderForm['paymentMethod'])}>
              <option value="Pix">Pix</option>
              <option value="Dinheiro">Dinheiro</option>
              <option value="Cartão de débito">Cartão de débito</option>
              <option value="Cartão de crédito">Cartão de crédito</option>
            </select>
          </label>
          <label>Observações do pedido<textarea value={observations} onChange={(event) => setObservations(event.target.value)} placeholder="Ex.: sem cebola, molho à parte…" rows={3} maxLength={500} /></label>
          {paymentMethod === 'Dinheiro' && <div className="cash-change-fields"><label className="admin-check-label"><input type="checkbox" checked={needsChange} onChange={(event) => { setNeedsChange(event.target.checked); if (!event.target.checked) setChangeFor('') }} /> Precisa de troco?</label>{needsChange && <label>Troco para quanto? (R$)<input value={changeFor} onChange={(event) => setChangeFor(event.target.value)} inputMode="decimal" placeholder="Ex.: 50,00" required /></label>}</div>}
        </div>
        <div className="drawer-total"><span>Total do pedido</span><strong>{formatPrice(total)}</strong></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button primary-button--full" type="button" onClick={() => void send()} disabled={!valid || sending}><ShoppingBag size={18} /> {sending ? 'Enviando…' : 'Enviar pedido'}</button>
        <p className="privacy-note">{isDemo ? 'Nesta demonstração, o pedido não é enviado a ninguém.' : 'Seu pedido será enviado direto ao restaurante, que vai combinar o pagamento com você pelo WhatsApp.'}</p>
      </aside>
    </div>
  )
}

function ComplementPicker({product,selectedIds,onToggle,onClose,onAdd}:{product:Product;selectedIds:number[];onToggle:(id:number)=>void;onClose:()=>void;onAdd:()=>void}) {
  const extras=(product.complements??[]).flatMap(g=>g.options.filter(o=>selectedIds.includes(o.id))).reduce((sum,o)=>sum+o.price,0)
  return <div className="complement-picker-backdrop" onClick={onClose}><section className="complement-picker" role="dialog" aria-modal="true" aria-label={"Complementos de "+product.name} onClick={e=>e.stopPropagation()}><div className="drawer-header"><div><span className="eyebrow">personalize seu pedido</span><h2>{product.name}</h2><p>{formatPrice(product.price)} base</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="Fechar"><X size={20}/></button></div>{(product.complements??[]).map(group=><section className="complement-choice-group" key={group.id}><h3>{group.name}</h3>{group.description&&<p>{group.description}</p>}{group.options.map(option=><label key={option.id} className="complement-choice"><input type="checkbox" checked={selectedIds.includes(option.id)} onChange={()=>onToggle(option.id)}/><span>{option.name}</span><strong>{option.price>0?'+'+formatPrice(option.price):'Grátis'}</strong></label>)}</section>)}<div className="drawer-total"><span>Total por unidade</span><strong>{formatPrice(product.price+extras)}</strong></div><button className="primary-button primary-button--full" type="button" onClick={onAdd}>Adicionar ao pedido</button></section></div>
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
  }
  const adjust = (lineId: string, amount: number) => setCart(current => current.flatMap(line=>line.lineId!==lineId?[line]:line.quantity+amount>0?[{...line,quantity:line.quantity+amount}]:[]))


  const submitOrder = async (form: OrderForm) => {
    const items = cart.map((line) => ({ productId: line.product.id, quantity: line.quantity, complementIds: line.complements.map(o=>o.id) }))
    const orderNumber = onPlaceOrder ? await onPlaceOrder(form, items) : null
    const firstName = form.name.split(' ')[0]
    setCartOpen(false)
    setCart([])
    setConfirmation(orderNumber ? `Pedido #${orderNumber} recebido, ${firstName}! Já vamos cuidar dele.` : `Pedido de demonstração recebido, ${firstName}!`)
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
          {filteredProducts.length === 0 ? <p className="restaurant-description">Este menu ainda não tem produtos publicados.</p> : selectedCategory === 'all' ? <div className="all-categories-list">{menuCategories.map(category => { const categoryProducts = filteredProducts.filter(product => product.category === category.id); return categoryProducts.length ? <section className="all-category-section" key={category.id}><div className="all-category-heading"><h3>{category.label}</h3><span>{categoryProducts.length} itens</span></div><div className="product-grid">{categoryProducts.map(product => <ProductCard key={product.id} product={product} categoryLabel={category.label} canOrder={restaurant.isOpen} onAdd={addProduct} />)}</div></section> : null; })}{filteredProducts.some(product => !menuCategories.some(category => category.id === product.category)) && <section className="all-category-section"><div className="all-category-heading"><h3>Outros</h3></div><div className="product-grid">{filteredProducts.filter(product => !menuCategories.some(category => category.id === product.category)).map(product => <ProductCard key={product.id} product={product} categoryLabel={categoryLabel(product.category)} canOrder={restaurant.isOpen} onAdd={addProduct} />)}</div></section>}</div> : <div className="product-grid">{filteredProducts.map((product) => <ProductCard key={product.id} product={product} categoryLabel={categoryLabel(product.category)} canOrder={restaurant.isOpen} onAdd={addProduct} />)}</div>}
        </section>
      </main>
      <footer className="site-footer"><div><span className="brand brand--footer"><span className="brand-mark">F</span><span>FB3d2y <b>Menu</b></span></span><p>Cardápios próximos, pedidos simples.</p></div><span className="footer-note">feito para negócios locais · beta</span></footer>
      {confirmation && <div className="toast"><CheckCircle2 size={18} /><span>{confirmation}</span><button type="button" onClick={() => setConfirmation(null)} aria-label="Fechar aviso"><X size={15} /></button></div>}
      {count > 0 && !isCartOpen && <button className="floating-cart" type="button" onClick={() => setCartOpen(true)}><span><ShoppingBag size={18} /> Seu pedido</span><b>{formatPrice(total)} <span className="cart-count">{count}</span></b></button>}
      {selectedProduct&&<ComplementPicker product={selectedProduct} selectedIds={selectedComplementIds} onToggle={id=>setSelectedComplementIds(old=>old.includes(id)?old.filter(x=>x!==id):[...old,id])} onClose={()=>setSelectedProduct(null)} onAdd={()=>addLineToCart(selectedProduct,(selectedProduct.complements??[]).flatMap(g=>g.options.filter(o=>selectedComplementIds.includes(o.id))))} />}
      {isCartOpen && (cart.length > 0 ? <CartDrawer cart={cart} isDemo={isDemo} onClose={() => setCartOpen(false)} onAdjust={adjust} onSubmit={submitOrder} /> : <div className="drawer-backdrop" onClick={() => setCartOpen(false)}><aside className="cart-drawer" onClick={(event) => event.stopPropagation()}><div className="drawer-header"><div><span className="eyebrow">seu pedido</span><h2>0 itens</h2></div><button className="icon-button" type="button" onClick={() => setCartOpen(false)} aria-label="Fechar carrinho"><X size={20} /></button></div><EmptyCart onClose={() => setCartOpen(false)} /></aside></div>)}
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

type AdminRestaurant = { id:number; nome:string; slug:string; descricao:string|null; localizacao:string|null; endereco:string|null; cep:string|null; cidade:string|null; estado:string|null; cnpj:string|null; email_contato:string|null; telefone_contato:string|null; whatsapp_contato:string|null; horario:string|null; horario_funcionamento?:Record<string,{closed:boolean;open:string;close:string}>|null; status_loja_manual?:boolean|null; instagram:string|null; cor_destaque:string|null; logo_url:string|null; capa_url:string|null; ativo:boolean; aceita_pedidos:boolean }
type AdminCategory = { id:number; nome:string; ordem:number }
type AdminProduct = { id:number; nome:string; descricao:string|null; preco:number; categoria_id:number|null; imagem_url:string|null; disponivel:boolean; ordem:number }
type AdminComplementOption = {id:number;nome:string;preco_adicional:number;ativo:boolean;ordem:number}
type AdminComplementGroup = {id:number;empresa_id:number;nome:string;descricao:string|null;ordem:number;ativo:boolean;opcoes_complementos:AdminComplementOption[]}
type AdminOrder = { id:number; cliente_nome:string; cliente_whatsapp:string; total:number; status:string; tipo_entrega:string; endereco_entrega:string|null; criado_em:string; origem?:string|null; forma_pagamento?:string|null; observacoes?:string|null; precisa_troco?:boolean|null; troco_para?:number|null }
function makeSlug(value:string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,55) }
function AdminView({ onBack }: { onBack: () => void }) {
  const [session,setSession]=useState<Session|null>(null), [authLoading,setAuthLoading]=useState(true), [activeTab,setActiveTab]=useState('dashboard')
  const [sidebarCollapsed,setSidebarCollapsed]=useState(()=>typeof window!=='undefined'&&window.matchMedia('(max-width: 760px)').matches)
  const [hoursDraft,setHoursDraft]=useState<Record<string,{closed:boolean;open:string;close:string}>>({})
  const [restaurants,setRestaurants]=useState<AdminRestaurant[]>([]), [selectedId,setSelectedId]=useState<number|null>(null)
  const [cats,setCats]=useState<AdminCategory[]>([]), [items,setItems]=useState<AdminProduct[]>([]), [orders,setOrders]=useState<AdminOrder[]>([])
  const [complementGroups,setComplementGroups]=useState<AdminComplementGroup[]>([]),[productGroupLinks,setProductGroupLinks]=useState<Record<number,number[]>>({}),[newGroupName,setNewGroupName]=useState(''),[newGroupOptions,setNewGroupOptions]=useState(''),[newProductGroupIds,setNewProductGroupIds]=useState<number[]>([])
  const [busy,setBusy]=useState(false), [notice,setNotice]=useState(''), [noticeError,setNoticeError]=useState(false)
  const [subscription,setSubscription]=useState<{active:boolean;free:boolean;expiresAt:string|null;status:string}|null>(null)
  const [subscriptionError,setSubscriptionError]=useState('')
  const [subscriptionLoading,setSubscriptionLoading]=useState(false)
  const [pix,setPix]=useState<{paymentId:number;qrCode:string;qrCodeBase64:string;ticketUrl:string}|null>(null)
  const [editingOrder,setEditingOrder]=useState<AdminOrder|null>(null)
  const [showCreate,setShowCreate]=useState(false), [newName,setNewName]=useState(''), [newDesc,setNewDesc]=useState(''), [newLocation,setNewLocation]=useState('')
  const [newCat,setNewCat]=useState(''), [newItem,setNewItem]=useState({nome:'',descricao:'',preco:'',categoria_id:'',imagem_url:''})
  const [counterName,setCounterName]=useState(''),[counterPhone,setCounterPhone]=useState(''),[counterType,setCounterType]=useState<'Retirada'|'Entrega'>('Retirada'),[counterAddress,setCounterAddress]=useState(''),[counterPayment,setCounterPayment]=useState('Dinheiro'),[counterQty,setCounterQty]=useState<Record<number,number>>({})
  const [counterPrices,setCounterPrices]=useState<Record<number,string>>({}),[counterExtraName,setCounterExtraName]=useState(''),[counterExtraPrice,setCounterExtraPrice]=useState(''),[counterExtras,setCounterExtras]=useState<Array<{id:string;nome:string;preco:number;quantidade:number}>>([])
  const [printerName,setPrinterName]=useState(''),[autoPrint,setAutoPrint]=useState(false)
  const [printNodePrinters,setPrintNodePrinters]=useState<Array<{id:number;name:string;computer:string}>>([]),[printNodePrinterId,setPrintNodePrinterId]=useState(''),[printNodeStatus,setPrintNodeStatus]=useState('Não configurado')
  const [keepScreenOn,setKeepScreenOn]=useState(false),[wakeLock,setWakeLock]=useState<any>(null)
  const [profileOpen,setProfileOpen]=useState(false)
  const [waiters,setWaiters]=useState<Array<{id:number;nome:string;telefone:string|null;ativo:boolean}>>([])
  const [tabs,setTabs]=useState<Array<{id:number;mesa:string;garcom_id:number|null;status:string;observacoes:string|null;created_at:string;closed_at:string|null;garcons?:{nome:string}|null;itens_comanda?:Array<{id:number;produto_nome:string;quantidade:number;preco_unitario:number}>}>>([])
  const [waiterName,setWaiterName]=useState(''),[waiterPhone,setWaiterPhone]=useState(''),[tabTable,setTabTable]=useState(''),[tabWaiter,setTabWaiter]=useState(''),[tabProduct,setTabProduct]=useState(''),[tabQty,setTabQty]=useState('1'),[activeTabId,setActiveTabId]=useState<number|null>(null)
  const selected=restaurants.find(r=>r.id===selectedId)??null
  const storeIsOpenNow=selected?selected.status_loja_manual===true?true:selected.status_loja_manual===false?false:(()=>{const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());const day=({'Sun':'0','Mon':'1','Tue':'2','Wed':'3','Thu':'4','Fri':'5','Sat':'6'} as Record<string,string>)[parts.find(p=>p.type==='weekday')?.value??'Sun'];const now=Number(parts.find(p=>p.type==='hour')?.value??0)*60+Number(parts.find(p=>p.type==='minute')?.value??0);const h=selected.horario_funcionamento?.[day];return h?!h.closed&&now>=Number(h.open.slice(0,2))*60+Number(h.open.slice(3,5))&&now<Number(h.close.slice(0,2))*60+Number(h.close.slice(3,5)):selected.aceita_pedidos})():false
  const weekDays=[{id:'1',label:'Segunda-feira'},{id:'2',label:'Terça-feira'},{id:'3',label:'Quarta-feira'},{id:'4',label:'Quinta-feira'},{id:'5',label:'Sexta-feira'},{id:'6',label:'Sábado'},{id:'0',label:'Domingo'}]
  useEffect(()=>{if(!selectedId)return;const current=restaurants.find(r=>r.id===selectedId);const defaults:Record<string,{closed:boolean;open:string;close:string}>={};for(let day=0;day<7;day++)defaults[String(day)]={closed:day===0,open:'18:00',close:'22:00'};setHoursDraft({...defaults,...(current?.horario_funcionamento??{})})},[selectedId,restaurants])
  // A conta gratuita vitalícia não deve ser redirecionada para a tela de assinatura.
  const notify=(message:string,error=false)=>{setNotice(message);setNoticeError(error);window.setTimeout(()=>setNotice(''),5000)}
  const playOrderAlert=()=>{try{const audio=new Audio('/freesound_community-friend-request-14878.mp3');audio.preload='auto';void audio.play().catch(()=>notify('Não foi possível reproduzir o som. Verifique o volume do dispositivo.',true))}catch{notify('Não foi possível reproduzir o som neste navegador.',true)}}
  const testAudio=()=>{playOrderAlert();notify('Teste do som de novo pedido.')}
  useEffect(()=>{let alive=true;if(!hasSupabaseConfig){setAuthLoading(false);return}void supabase.auth.getSession().then(({data})=>{if(alive){setSession(data.session);setAuthLoading(false)}});const {data:listener}=supabase.auth.onAuthStateChange((_event,next)=>{if(alive){setSession(next);setAuthLoading(false)}});return()=>{alive=false;listener.subscription.unsubscribe()}},[])
  const loadRestaurants=async()=>{setBusy(true);const {data,error}=await supabase.from('empresas').select('id,nome,slug,descricao,localizacao,endereco,cep,cidade,estado,cnpj,email_contato,telefone_contato,whatsapp_contato,horario,horario_funcionamento,status_loja_manual,instagram,cor_destaque,logo_url,capa_url,ativo,aceita_pedidos').order('criado_em',{ascending:false});setBusy(false);if(error){notify('Erro ao carregar restaurantes. Confira se o SQL do projeto foi executado no Supabase.',true);return}const list=(data??[]) as AdminRestaurant[];setRestaurants(list);setSelectedId(old=>old&&list.some(r=>r.id===old)?old:(list[0]?.id??null))}
  useEffect(()=>{if(session)void loadRestaurants()},[session])
  useEffect(()=>{if(!session)return;let alive=true;void fetch('/api/assinatura',{headers:{Authorization:'Bearer '+session.access_token}}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível consultar a assinatura.');if(alive){setSubscription(data);setSubscriptionError('')}}).catch(error=>{if(alive)setSubscriptionError(error instanceof Error?error.message:'Não foi possível consultar a assinatura.')});return()=>{alive=false}},[session])
  const loadDetails=async(id:number)=>{setBusy(true);const [c,p,o,g,links]=await Promise.all([supabase.from('categorias').select('id,nome,ordem').eq('empresa_id',id).order('ordem'),supabase.from('produtos').select('id,nome,descricao,preco,categoria_id,imagem_url,disponivel,ordem').eq('empresa_id',id).order('ordem'),supabase.from('pedidos').select('id,cliente_nome,cliente_whatsapp,total,status,tipo_entrega,endereco_entrega,criado_em,origem,forma_pagamento,observacoes,precisa_troco,troco_para').eq('empresa_id',id).order('criado_em',{ascending:false}).limit(100),supabase.from('grupos_complementos').select('id,empresa_id,nome,descricao,ordem,ativo,opcoes_complementos(id,nome,preco_adicional,ativo,ordem)').eq('empresa_id',id).order('ordem'),supabase.from('produto_grupos_complementos').select('produto_id,grupo_id')]);setBusy(false);if(c.error||p.error||o.error||g.error||links.error){notify('Erro ao carregar dados. Para Complementos, execute supabase/07_complementos.sql no Supabase de teste.',true);if(!g.error&&!links.error){setComplementGroups((g.data??[]) as unknown as AdminComplementGroup[])}return}setCats((c.data??[]) as AdminCategory[]);setItems((p.data??[]) as AdminProduct[]);setOrders((o.data??[]) as AdminOrder[]);setComplementGroups((g.data??[]) as unknown as AdminComplementGroup[]);const map:Record<number,number[]>={};for(const row of links.data??[]){(map[Number(row.produto_id)]??=[]).push(Number(row.grupo_id))}setProductGroupLinks(map)}
  const refreshOrders=async(id:number)=>{const {data,error}=await supabase.from('pedidos').select('id,cliente_nome,cliente_whatsapp,total,status,tipo_entrega,endereco_entrega,criado_em,origem,forma_pagamento,observacoes,precisa_troco,troco_para').eq('empresa_id',id).order('criado_em',{ascending:false}).limit(100);if(!error&&data)setOrders(data as AdminOrder[])}
  const autoPrintSeenIds=useRef(new Map<number,Set<string>>())
  useEffect(()=>{if(!session||selectedId===null)return;const id=selectedId;let active=true;let initialized=false;const pollOrders=async()=>{const {data,error}=await supabase.from('pedidos').select('id,cliente_nome,cliente_whatsapp,total,status,tipo_entrega,endereco_entrega,criado_em,origem,forma_pagamento,observacoes,precisa_troco,troco_para').eq('empresa_id',id).order('criado_em',{ascending:false}).limit(100);if(!active||error||!data)return;const list=data as AdminOrder[];setOrders(list);const seen=autoPrintSeenIds.current.get(id)??new Set<string>();if(!initialized){list.forEach(order=>seen.add(String(order.id)));autoPrintSeenIds.current.set(id,seen);initialized=true;return}let cfg:{autoPrint?:boolean;printNodePrinterId?:number}|null=null;try{cfg=JSON.parse(window.localStorage.getItem('menuhub-print-'+id)||'{}')}catch{cfg=null}const printerId=Number(cfg?.printNodePrinterId??0);for(const order of [...list].reverse()){const key=String(order.id);if(seen.has(key))continue;seen.add(key);if(String(order.status??'').trim().toLocaleLowerCase('pt-BR')==='novo'){playOrderAlert();notify('Novo pedido recebido! Pedido #'+order.id)}if(cfg?.autoPrint===true&&String(order.status??'').trim().toLocaleLowerCase('pt-BR')==='novo'&&Number.isInteger(printerId)&&printerId>0){void printOrderWithItems(order)}}autoPrintSeenIds.current.set(id,seen)};void pollOrders();const interval=window.setInterval(()=>{void pollOrders()},5000);return()=>{active=false;window.clearInterval(interval)}},[session,selectedId,printNodePrinterId])
  useEffect(()=>{if(session&&selectedId!==null)void loadDetails(selectedId);else{setCats([]);setItems([]);setOrders([])}},[session,selectedId])
  const toggleStoreOrders=async()=>{if(!selected)return;const next=!storeIsOpenNow;const {error}=await supabase.from('empresas').update({status_loja_manual:next,aceita_pedidos:next}).eq('id',selected.id);if(error){notify('Não foi possível alterar o status da loja: '+error.message,true);return}setRestaurants(old=>old.map(r=>r.id===selected.id?{...r,status_loja_manual:next,aceita_pedidos:next}:r));notify(next?'Loja aberta para receber pedidos.':'Loja fechada para novos pedidos.')}
  const saveOpeningHours=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!selected)return;for(const [day,h] of Object.entries(hoursDraft)){if(!h.closed&&(!h.open||!h.close||h.close<=h.open)){notify('Confira os horários: o fechamento deve ser depois da abertura.',true);return}}const {error}=await supabase.from('empresas').update({horario_funcionamento:hoursDraft,status_loja_manual:null,aceita_pedidos:true}).eq('id',selected.id);if(error){notify('Não foi possível salvar os horários: '+error.message,true);return}setRestaurants(old=>old.map(r=>r.id===selected.id?{...r,horario_funcionamento:hoursDraft,status_loja_manual:null,aceita_pedidos:true}:r));notify('Horários salvos. A loja seguirá a programação automaticamente.')}
  const createRestaurant=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!session?.user||newName.trim().length<2)return;setBusy(true);const base=makeSlug(newName)||'meu-menu';let slug=base,n=2;while(restaurants.some(r=>r.slug===slug)){slug=base+'-'+n++}const {data,error}=await supabase.from('empresas').insert({nome:newName.trim(),slug,descricao:newDesc.trim()||null,localizacao:newLocation.trim()||null,dono_id:session.user.id,cor_destaque:'#0e4f59',ativo:true,aceita_pedidos:true}).select('id,nome,slug,descricao,localizacao,endereco,cep,cidade,estado,cnpj,email_contato,telefone_contato,whatsapp_contato,horario,horario_funcionamento,status_loja_manual,instagram,cor_destaque,logo_url,capa_url,ativo,aceita_pedidos').single();setBusy(false);if(error){notify('Não foi possível criar: '+error.message,true);return}const r=data as AdminRestaurant;setRestaurants(old=>[r,...old]);setSelectedId(r.id);setNewName('');setNewDesc('');setNewLocation('');setShowCreate(false);setActiveTab('menu');notify('Restaurante criado!')}
  const saveRestaurant=async(e:React.FormEvent<HTMLFormElement>,form:Record<string,unknown>)=>{e.preventDefault();if(!selected)return;setBusy(true);const {error}=await supabase.from('empresas').update(form).eq('id',selected.id);setBusy(false);if(error){notify('Erro ao salvar: '+error.message,true);return}setRestaurants(old=>old.map(r=>r.id===selected.id?{...r,...form} as AdminRestaurant:r));notify('Informações salvas.')}
  const addCategory=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!selected||!newCat.trim())return;const {data,error}=await supabase.from('categorias').insert({empresa_id:selected.id,nome:newCat.trim(),ordem:cats.length+1}).select('id,nome,ordem').single();if(error){notify('Erro ao criar categoria: '+error.message,true);return}setCats(old=>[...old,data as AdminCategory]);setNewCat('');notify('Categoria criada.')}
  const addProduct=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!selected||!newItem.nome.trim()||!Number.isFinite(Number(newItem.preco.replace(',','.')))||Number(newItem.preco.replace(',','.'))<0){notify('Informe nome e preço válido.',true);return}setBusy(true);const {data,error}=await supabase.from('produtos').insert({empresa_id:selected.id,nome:newItem.nome.trim(),descricao:newItem.descricao.trim()||null,preco:Number(newItem.preco.replace(',','.')),categoria_id:newItem.categoria_id?Number(newItem.categoria_id):null,imagem_url:newItem.imagem_url.trim()||null,disponivel:true,ordem:items.length+1}).select('id,nome,descricao,preco,categoria_id,imagem_url,disponivel,ordem').single();if(error){setBusy(false);notify('Erro ao cadastrar produto: '+error.message,true);return}if(newProductGroupIds.length){const link=await supabase.from('produto_grupos_complementos').insert(newProductGroupIds.map(grupo_id=>({produto_id:data.id,grupo_id})));if(link.error){setBusy(false);notify('Produto criado, mas os complementos não foram vinculados: '+link.error.message,true);return}}setBusy(false);setItems(old=>[...old,data as AdminProduct]);setProductGroupLinks(old=>({...old,[data.id]:newProductGroupIds}));setNewProductGroupIds([]);setNewItem({nome:'',descricao:'',preco:'',categoria_id:'',imagem_url:''});notify('Produto cadastrado.')}
  const updateProduct=async(p:AdminProduct,patch:Partial<AdminProduct>,groupIds?:number[])=>{const {error}=await supabase.from('produtos').update(patch).eq('id',p.id);if(error){notify('Erro ao atualizar produto: '+error.message,true);return}if(groupIds){const del=await supabase.from('produto_grupos_complementos').delete().eq('produto_id',p.id);if(del.error){notify('Produto atualizado, mas não foi possível atualizar os complementos: '+del.error.message,true);return}if(groupIds.length){const ins=await supabase.from('produto_grupos_complementos').insert(groupIds.map(grupo_id=>({produto_id:p.id,grupo_id})));if(ins.error){notify('Produto atualizado, mas houve erro nos complementos: '+ins.error.message,true);return}}setProductGroupLinks(old=>({...old,[p.id]:groupIds}))}setItems(old=>old.map(x=>x.id===p.id?{...x,...patch}:x));notify('Produto atualizado.')}
  const deleteProduct=async(p:AdminProduct)=>{if(!window.confirm('Excluir o produto '+p.nome+'?'))return;const {error}=await supabase.from('produtos').delete().eq('id',p.id);if(error){notify('Erro ao excluir: '+error.message,true);return}setItems(old=>old.filter(x=>x.id!==p.id));notify('Produto excluído.')}
  const updateOrder=async(o:AdminOrder,status:string)=>{const {error}=await supabase.from('pedidos').update({status}).eq('id',o.id);if(error){notify('Erro ao atualizar pedido: '+error.message,true);return}setOrders(old=>old.map(x=>x.id===o.id?{...x,status}:x))}
  const startEditOrder=async(o:AdminOrder)=>{if(!selected)return;setBusy(true);const {data,error}=await supabase.from('itens_pedido').select('produto_id,quantidade').eq('pedido_id',o.id);setBusy(false);if(error){notify('Não foi possível carregar os itens do pedido: '+error.message,true);return}setEditingOrder(o);setCounterName(o.cliente_nome);setCounterPhone(o.cliente_whatsapp);setCounterType(o.tipo_entrega==='Entrega'?'Entrega':'Retirada');setCounterAddress(o.endereco_entrega??'');setCounterPayment(o.forma_pagamento??'Dinheiro');const quantities:Record<number,number>={};for(const row of data??[]){if(row.produto_id)quantities[Number(row.produto_id)]=Number(row.quantidade)}setCounterQty(quantities);setActiveTab('counter');notify('Pedido carregado no balcão para edição.')}
  useEffect(()=>{if(!selectedId)return;const saved=window.localStorage.getItem('menuhub-print-'+selectedId);if(saved){try{const cfg=JSON.parse(saved) as {name?:string;printNodePrinterId?:number;autoPrint?:boolean};setPrinterName(cfg.name??'');setPrintNodePrinterId(cfg.printNodePrinterId?String(cfg.printNodePrinterId):'');setAutoPrint(cfg.autoPrint===true)}catch{setPrinterName('');setPrintNodePrinterId('');setAutoPrint(false)}}else{setPrinterName('');setPrintNodePrinterId('');setAutoPrint(false)}},[selectedId])
  useEffect(()=>{if(!keepScreenOn)return;let active=true;const requestLock=async()=>{try{if(!active||document.visibilityState!=='visible'||!('wakeLock' in navigator))return;const lock=await (navigator as any).wakeLock.request('screen');if(!active){await lock.release();return}setWakeLock(lock);lock.addEventListener('release',()=>setWakeLock(null),{once:true})}catch{setWakeLock(null)}};const onVisibility=()=>{if(document.visibilityState==='visible')void requestLock()};void requestLock();document.addEventListener('visibilitychange',onVisibility);return()=>{active=false;document.removeEventListener('visibilitychange',onVisibility);setWakeLock(null)}},[keepScreenOn])
  useEffect(()=>()=>{if(wakeLock)void wakeLock.release?.()},[wakeLock])
  const loadPrintNodePrinters=async()=>{try{setPrintNodeStatus('Consultando…');const {data}=await supabase.auth.getSession();const token=data.session?.access_token;if(!token)throw new Error('Entre novamente no Menuhub.');const response=await fetch('/api/printnode',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'printers'})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Não foi possível consultar o PrintNode.');const list=(result.printers||[]) as Array<{id:number;name:string;computer:string}>;setPrintNodePrinters(list);setPrintNodePrinterId(old=>old&&list.some(p=>String(p.id)===old)?old:(list[0]?String(list[0].id):''));setPrintNodeStatus(list.length?'Conectado':'Nenhuma impressora encontrada');notify(list.length?'Impressoras do PrintNode carregadas.':'O PrintNode não encontrou impressoras.',!list.length)}catch(err){setPrintNodeStatus('Erro');notify(err instanceof Error?err.message:'Falha ao consultar o PrintNode.',true)}}
  const savePrinterSettings=()=>{if(!selectedId)return;window.localStorage.setItem('menuhub-print-'+selectedId,JSON.stringify({name:printerName.trim()||selected?.nome||'Restaurante',printNodePrinterId:printNodePrinterId?Number(printNodePrinterId):null,autoPrint}));notify(autoPrint?'Configurações salvas. Impressão automática ativada neste computador.':'Configurações da impressora salvas neste dispositivo.')}
  const printOrderWithItems=async(o:AdminOrder)=>{
    const cfg=(()=>{try{return JSON.parse(window.localStorage.getItem('menuhub-print-'+(selectedId??''))||'{}') as {name?:string;logo?:string;printNodePrinterId?:number}}catch{return {}}})();
    const activePrintNodeId=Number(cfg.printNodePrinterId||printNodePrinterId||0);
    const usePrintNode=Boolean(activePrintNodeId);
    const w=usePrintNode?null:window.open('','_blank','width=420,height=720');
    if(!usePrintNode&&!w){notify('Permita pop-ups para imprimir a comanda.',true);return}
    if(w)w.document.title='Preparando nota';
    let itemLines:{nome:string;quantidade:number;preco?:number;categoria:string}[]=[];
    const {data}=await supabase.from('itens_pedido').select('quantidade,preco_unitario,nome_produto').eq('pedido_id',o.id);
    if(data)itemLines=(data as any[]).map(x=>({nome:x.nome_produto??'Produto',quantidade:Number(x.quantidade),preco:Number(x.preco_unitario??0),categoria:'Outros'}));
    const storeName=(selected?.nome||cfg.name||'Restaurante').replace(/[<>]/g,'');
    itemLines=itemLines.map(line=>({...line,categoria:(cats.find(cat=>cat.id===items.find(p=>p.nome===line.nome)?.categoria_id)?.nome)||'Outros'}));
    
    const rows=itemLines.map(x=>'<div class="row"><span>'+String(x.quantidade)+'x '+String(x.nome).replace(/[<>]/g,'')+'<small>'+String(x.categoria).replace(/[<>]/g,'')+'</small></span><span>'+formatPrice((x.preco??0)*x.quantidade)+'</span></div>').join('');
    if(usePrintNode){
      try{
        const {data:sessionData}=await supabase.auth.getSession();
        const token=sessionData.session?.access_token;
        if(!token)throw new Error('Entre novamente no Menuhub.');
        const cleanText=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[<>]/g,'');
        const moneyText=(value:number)=>'R$ '+Number(value||0).toFixed(2).replace('.',',');
        const center=(value:string,width=32)=>{const s=value.slice(0,width);const left=Math.max(0,Math.floor((width-s.length)/2));return ' '.repeat(left)+s};
        const receipt=['COMANDA #'+o.id,new Date(o.criado_em).toLocaleString('pt-BR'),'','--------------------------------','','Cliente: '+cleanText(o.cliente_nome),...(o.observacoes?['','Obs.: '+cleanText(o.observacoes)]:[]),'','--------------------------------','',...itemLines.flatMap(x=>[String(x.quantidade)+'x '+cleanText(x.nome),'   '+cleanText(x.categoria)+'  '+moneyText((x.preco??0)*x.quantidade),'']),'','--------------------------------','','TOTAL: '+moneyText(Number(o.total)),'','--------------------------------','',...(o.precisa_troco?['TROCO PARA: '+moneyText(Number(o.troco_para)),'']:[]),...(o.endereco_entrega?['Endereco: '+cleanText(o.endereco_entrega),'']:[]),'','--------------------------------','','TIPO: '+cleanText(o.tipo_entrega),'','--------------------------------','','PAGAMENTO: '+cleanText(o.forma_pagamento||'Pix'),'','--------------------------------','','Obrigado pela preferencia!'].join('\n');
        const response=await fetch('/api/printnode',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'print',restaurantId:selectedId,printerId:activePrintNodeId,content:'\x1B\x40'+'\x1B\x61\x01\x1B\x45\x01\x1B\x21\x30'+center(storeName,16)+'\n\n\x1B\x21\x00\x1B\x45\x00\x1B\x61\x00'+receipt.replace('TOTAL: ','\x1B\x45\x01TOTAL: ').replace('TIPO: ','\x1B\x45\x01TIPO: ').replace('PAGAMENTO: ','\x1B\x45\x01PAGAMENTO: ')+'\x1B\x21\x00\x1B\x45\x00'+'\n'.repeat(5),title:'Menuhub - comanda #'+o.id})});
        const result=await response.json();
        if(!response.ok)throw new Error(result.error||'Falha ao enviar para o PrintNode.');
        notify('Comanda #'+o.id+' enviada ao PrintNode.');
        return
      }catch(err){notify('Falha ao imprimir pelo PrintNode: '+(err instanceof Error?err.message:'erro desconhecido'),true);return}
    }
    if(!w)return;
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Pedido '+o.id+'</title><style>@page{size:60mm auto;margin:2mm}*{box-sizing:border-box}body{width:56mm;margin:0 auto;font:12px/1.4 monospace;color:#000;padding-top:5mm;padding-bottom:5mm}header{text-align:left;border-bottom:1px dashed #000;padding-bottom:8px;margin-bottom:8px}.logo{display:block;width:42px;height:42px;object-fit:contain;image-rendering:pixelated;filter:grayscale(1) contrast(3);margin:8px auto}h1{font-size:24px;font-weight:1000;text-align:center;text-transform:uppercase;letter-spacing:.2px;line-height:1.15;margin:3px 0;overflow-wrap:anywhere;transform:translateX(-2mm)}p{margin:3px 0}.row{display:flex;justify-content:space-between;gap:5px;padding:5px 0;border-bottom:1px dotted #aaa}.row small{display:block;font-size:10px;margin-top:2px}.items{border-bottom:1px dashed #000;padding:10px 0;margin-bottom:10px}.total{font-size:14px;font-weight:bold;padding:12px 0;border-top:1px dashed #000;border-bottom:1px dashed #000;margin:8px 0}.foot{text-align:center;border-top:1px dashed #000;padding-top:8px;margin-top:8px;font-size:10px}.receipt-title,.receipt-meta{font-weight:900;text-align:center}.receipt-meta{margin-top:6px}.end-meta{font-weight:900;font-size:16px;line-height:1.9;margin-top:10px;padding:7px 5px;border-top:3px solid #000;border-bottom:3px solid #000}.end-meta p{font-weight:900;margin:0;padding:9px 0;border-bottom:1px dashed #000}.end-meta p:last-child{border-bottom:0}</style></head><body><header><h1>'+storeName+'</h1><p class="receipt-title">COMANDA #'+o.id+'</p><p>'+new Date(o.criado_em).toLocaleString('pt-BR')+'</p></header><p>Cliente: '+String(o.cliente_nome).replace(/[<>]/g,'')+'</p>'+(o.observacoes?'<p>Obs.: '+String(o.observacoes).replace(/[<>]/g,'')+'</p>':'')+'<div class="items">'+(rows||'<p>Itens indisponíveis para impressão.</p>')+'</div><div class="row total"><span>TOTAL</span><span>'+formatPrice(Number(o.total))+'</span></div>'+(o.precisa_troco?'<p>Troco para: '+formatPrice(Number(o.troco_para))+'</p>':'')+(o.endereco_entrega?'<p>Endereço: '+String(o.endereco_entrega).replace(/[<>]/g,'')+'</p>':'')+'<div class="end-meta"><p><b>TIPO: '+String(o.tipo_entrega).replace(/[<>]/g,'')+'</b></p><p><b>PAGAMENTO: '+String(o.forma_pagamento||'Pix').replace(/[<>]/g,'')+'</b></p></div><div class="foot">Obrigado pela preferência!</div><script>window.onload=()=>setTimeout(()=>window.print(),300);window.onafterprint=()=>window.close()</script></body></html>');
    w.document.close()
  }
  const createCounterOrder=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!selected)return;const picked=items.filter(p=>(counterQty[p.id]??0)>0&&p.disponivel);const extras=counterExtras.filter(x=>x.quantidade>0);if(!picked.length&&!extras.length){notify('Adicione pelo menos um produto ou pedido avulso.',true);return}const unitPrice=(p:AdminProduct)=>{const raw=counterPrices[p.id];return raw===undefined||raw.trim()===''?Number(p.preco):Number(raw.replace(',','.'))};if(picked.some(p=>!Number.isFinite(unitPrice(p))||unitPrice(p)<0)){notify('Confira os preços dos produtos.',true);return}const total=picked.reduce((sum,p)=>sum+unitPrice(p)*(counterQty[p.id]??0),0)+extras.reduce((sum,x)=>sum+x.preco*x.quantidade,0);setBusy(true);try{if(editingOrder){const patch={cliente_nome:counterName.trim()||'Cliente balcão',cliente_whatsapp:counterPhone.trim()||'0000000000',tipo_entrega:counterType,endereco_entrega:counterType==='Entrega'?counterAddress.trim():null,forma_pagamento:counterPayment,total};const upd=await supabase.from('pedidos').update(patch).eq('id',editingOrder.id);if(upd.error)throw new Error(upd.error.message);const del=await supabase.from('itens_pedido').delete().eq('pedido_id',editingOrder.id);if(del.error)throw new Error(del.error.message);const rows=[...picked.map(p=>({pedido_id:editingOrder.id,produto_id:p.id,nome_produto:p.nome,quantidade:counterQty[p.id],preco_unitario:unitPrice(p)})),...extras.map(x=>({pedido_id:editingOrder.id,produto_id:null,nome_produto:x.nome,quantidade:x.quantidade,preco_unitario:x.preco}))];const ins=await supabase.from('itens_pedido').insert(rows);if(ins.error)throw new Error(ins.error.message);setEditingOrder(null);setCounterExtras([]);setCounterPrices({});await loadDetails(selected.id);setActiveTab('orders');notify('Pedido editado e total recalculado.')}else if(extras.length||picked.some(p=>unitPrice(p)!==Number(p.preco))){const order=await supabase.from('pedidos').insert({empresa_id:selected.id,cliente_nome:counterName.trim()||'Cliente balcão',cliente_whatsapp:counterPhone.trim()||'0000000000',total,status:'novo',tipo_entrega:counterType,endereco_entrega:counterType==='Entrega'?counterAddress.trim():null,forma_pagamento:counterPayment,origem:'balcao'}).select('id').single();if(order.error)throw new Error(order.error.message);const rows=[...picked.map(p=>({pedido_id:order.data.id,produto_id:p.id,nome_produto:p.nome,quantidade:counterQty[p.id],preco_unitario:unitPrice(p)})),...extras.map(x=>({pedido_id:order.data.id,produto_id:null,nome_produto:x.nome,quantidade:x.quantidade,preco_unitario:x.preco}))];const ins=await supabase.from('itens_pedido').insert(rows);if(ins.error)throw new Error(ins.error.message);setCounterName('');setCounterPhone('');setCounterAddress('');setCounterType('Retirada');setCounterPayment('Dinheiro');setCounterQty({});setCounterPrices({});setCounterExtras([]);await loadDetails(selected.id);setActiveTab('orders');notify('Pedido de balcão com itens avulsos registrado.')}else{const {error}=await supabase.rpc('criar_pedido_balcao',{p_empresa_id:selected.id,p_nome:counterName.trim()||'Cliente balcão',p_whatsapp:counterPhone.trim(),p_tipo_entrega:counterType,p_endereco:counterAddress.trim(),p_forma_pagamento:counterPayment,p_itens:picked.map(p=>({produto_id:p.id,quantidade:counterQty[p.id],preco_unitario:unitPrice(p)}))});if(error)throw new Error(error.message);setCounterName('');setCounterPhone('');setCounterAddress('');setCounterType('Retirada');setCounterPayment('Dinheiro');setCounterQty({});setCounterPrices({});await loadDetails(selected.id);setActiveTab('orders');notify('Pedido de balcão registrado. Você já pode imprimir a nota.')}}catch(err){notify(err instanceof Error?err.message:'Não foi possível salvar o pedido.',true)}finally{setBusy(false)}}
  const loadTabsAndWaiters=async(id:number)=>{const [w,t]=await Promise.all([supabase.from('garcons').select('id,nome,telefone,ativo').eq('empresa_id',id).order('nome'),supabase.from('comandas').select('id,mesa,garcom_id,status,observacoes,created_at,closed_at,garcons(nome),itens_comanda(id,produto_nome,quantidade,preco_unitario)').eq('empresa_id',id).order('created_at',{ascending:false})]);if(w.error||t.error){notify('Para usar Comandas e garçons, execute o arquivo supabase/09_comandas_garcons.sql no Supabase de teste.',true);return}setWaiters((w.data??[]) as any);setTabs((t.data??[]) as any)}
  useEffect(()=>{if(session&&selectedId!==null&&activeTab==='tabs')void loadTabsAndWaiters(selectedId)},[session,selectedId,activeTab])
  if(authLoading)return <div className="auth-shell"><div className="auth-card auth-card--loading"><div className="auth-mark">F</div><p>Verificando sua conta…</p></div></div>
  if(!hasSupabaseConfig)return <StatusScreen message="Configure SUPABASE_URL e SUPABASE_ANON_KEY nas variáveis da Vercel."/>
  if(!session)return <AdminLoginScreen onBack={onBack}/>
  const addWaiter=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!selected||!waiterName.trim())return;const {data,error}=await supabase.from('garcons').insert({empresa_id:selected.id,nome:waiterName.trim(),telefone:waiterPhone.trim()||null,ativo:true}).select('id,nome,telefone,ativo').single();if(error){notify('Não foi possível cadastrar o garçom. O SQL 09 ainda não foi aplicado no projeto Supabase de teste. Execute supabase/09_comandas_garcons.sql no SQL Editor e recarregue o painel. '+error.message,true);return}setWaiters(old=>[...old,data as any].sort((a,b)=>a.nome.localeCompare(b.nome)));setWaiterName('');setWaiterPhone('');notify('Garçom cadastrado.')}
  const toggleWaiter=async(w:{id:number;ativo:boolean})=>{const {error}=await supabase.from('garcons').update({ativo:!w.ativo}).eq('id',w.id);if(error){notify('Não foi possível atualizar o garçom: '+error.message,true);return}setWaiters(old=>old.map(x=>x.id===w.id?{...x,ativo:!w.ativo}:x));notify(w.ativo?'Garçom desativado.':'Garçom reativado.')}
  const openTab=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!selected||!tabTable.trim())return;const {data,error}=await supabase.from('comandas').insert({empresa_id:selected.id,mesa:tabTable.trim(),garcom_id:tabWaiter?Number(tabWaiter):null,status:'aberta'}).select('id,mesa,garcom_id,status,observacoes,created_at,closed_at').single();if(error){notify('Não foi possível abrir a comanda: '+error.message,true);return}setTabs(old=>[{...(data as any),garcons:waiters.find(w=>w.id===Number(tabWaiter))?{nome:waiters.find(w=>w.id===Number(tabWaiter))!.nome}:null,itens_comanda:[]},...old]);setActiveTabId(data.id);setTabTable('');notify('Comanda aberta.')}
  const addTabItem=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();const tab=tabs.find(x=>x.id===activeTabId);const product=items.find(x=>x.id===Number(tabProduct));const qty=Math.floor(Number(tabQty));if(!tab||tab.status!=='aberta'||!product||qty<1||qty>99){notify('Selecione uma comanda aberta, um produto e uma quantidade válida.',true);return}const {data,error}=await supabase.from('itens_comanda').insert({comanda_id:tab.id,produto_id:product.id,produto_nome:product.nome,quantidade:qty,preco_unitario:Number(product.preco)}).select('id,produto_nome,quantidade,preco_unitario').single();if(error){notify('Não foi possível adicionar o item: '+error.message,true);return}setTabs(old=>old.map(x=>x.id===tab.id?{...x,itens_comanda:[...(x.itens_comanda??[]),data as any]}:x));setTabProduct('');setTabQty('1');notify('Item adicionado à comanda.')}
  const closeTab=async(tabId:number)=>{const tab=tabs.find(x=>x.id===tabId);if(!tab)return;const {error}=await supabase.from('comandas').update({status:'fechada',closed_at:new Date().toISOString()}).eq('id',tabId);if(error){notify('Não foi possível fechar a comanda: '+error.message,true);return}setTabs(old=>old.map(x=>x.id===tabId?{...x,status:'fechada',closed_at:new Date().toISOString()}:x));notify('Comanda fechada.')}
  const nav=(id:string,label:string,icon:React.ReactNode)=><button className={activeTab===id?'admin-nav__link admin-nav__link--active':'admin-nav__link'} onClick={()=>{setActiveTab(id);if(window.matchMedia('(max-width: 760px)').matches)setSidebarCollapsed(true)}} type="button">{icon}{label}</button>
  const addComplementGroup=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!selected||!newGroupName.trim())return;const lines=newGroupOptions.split('\n').map(x=>x.trim()).filter(Boolean).map(line=>{const [name,price='0']=line.split('|');return {nome:name.trim(),preco_adicional:Number(price.trim().replace(',','.'))}});if(!lines.length||lines.some(x=>!x.nome||!Number.isFinite(x.preco_adicional)||x.preco_adicional<0)){notify('Informe as opções uma por linha. Use Nome|Preço opcional, por exemplo Calabresa|3,00.',true);return}setBusy(true);const {data,error}=await supabase.from('grupos_complementos').insert({empresa_id:selected.id,nome:newGroupName.trim(),ordem:complementGroups.length+1,ativo:true}).select('id,empresa_id,nome,descricao,ordem,ativo').single();if(error){setBusy(false);notify('Erro ao criar grupo. Execute supabase/07_complementos.sql no Supabase de teste. '+error.message,true);return}const opt=await supabase.from('opcoes_complementos').insert(lines.map((x,i)=>({grupo_id:data.id,nome:x.nome,preco_adicional:x.preco_adicional,ordem:i+1,ativo:true}))).select('id,nome,preco_adicional,ativo,ordem');setBusy(false);if(opt.error){notify('Grupo criado, mas houve erro ao salvar opções: '+opt.error.message,true);return}setComplementGroups(old=>[...old,{...(data as any),opcoes_complementos:(opt.data??[]) as AdminComplementOption[]}]);setNewGroupName('');setNewGroupOptions('');notify('Grupo de complementos criado.')}
  const deleteComplementGroup=async(g:AdminComplementGroup)=>{if(!window.confirm('Excluir o grupo '+g.nome+'? Ele será desvinculado dos produtos.'))return;const {error}=await supabase.from('grupos_complementos').delete().eq('id',g.id);if(error){notify('Não foi possível excluir: '+error.message,true);return}setComplementGroups(old=>old.filter(x=>x.id!==g.id));setProductGroupLinks(old=>Object.fromEntries(Object.entries(old).map(([id,groups])=>[id,groups.filter(x=>x!==g.id)])));notify('Grupo removido.')}
  return <div className={sidebarCollapsed?"admin-shell admin-shell--collapsed":"admin-shell"}>
    {!sidebarCollapsed&&<button className="mobile-sidebar-backdrop" type="button" aria-label="Fechar menu lateral" onClick={()=>setSidebarCollapsed(true)}/>}
    <aside className="admin-sidebar"><button className="sidebar-collapse-edge" type="button" onClick={()=>setSidebarCollapsed(v=>!v)} aria-label={sidebarCollapsed?"Expandir menu":"Recolher menu"} title={sidebarCollapsed?"Expandir menu":"Recolher menu"}>{sidebarCollapsed?'»':'<<'}</button><div className="admin-brand"><span className="brand-mark">F</span><div><b>FB3d2y</b><span>Menu</span></div></div><button className={'store-order-toggle '+(storeIsOpenNow?'store-order-toggle--open':'store-order-toggle--closed')} type="button" disabled={!selected||busy} onClick={()=>void toggleStoreOrders()}><Power size={16}/><span>{storeIsOpenNow?'Fechar loja':'Abrir loja'}</span></button><div className="workspace-label">meus menus</div><div className="restaurant-switcher"><span className="restaurant-switcher__avatar">{selected?.logo_url?<img src={selected.logo_url} alt=""/>:selected?.nome.charAt(0)??'+'}</span><div><strong>{selected?.nome??'Nenhum restaurante'}</strong><span>{selected?.slug??'Crie seu menu'}</span></div></div><nav className="admin-nav">{nav('whatsapp','Bot do WhatsApp',<MessageCircle size={17}/>)}{nav('dashboard','Visão geral',<LayoutDashboard size={17}/>)}{nav('menu','Meu cardápio',<Utensils size={17}/>)}{nav('restaurants','Restaurantes',<Store size={17}/>)}{nav('orders','Pedidos',<ShoppingBag size={17}/>)}{nav('counter','Pedidos balcão',<Plus size={17}/>)}{nav('tabs','Comandas e garçons',<Utensils size={17}/>)}{nav('sales','Relatório de vendas',<BarChart3 size={17}/>)}{nav('hours','Horário de funcionamento',<Clock3 size={17}/>)}{nav('printer','Config. impressora',<Store size={17}/>)}{nav('subscription','Assinatura',<CreditCard size={17}/>)}{subscription&&!subscription.active&&<button className="admin-nav__link" type="button" onClick={()=>setActiveTab('subscription')}><Bell size={15}/> Assinatura pendente</button>}</nav></aside>
    <main className="admin-main"><header className="admin-topbar"><button className="mobile-sidebar-toggle" type="button" onClick={()=>setSidebarCollapsed(v=>!v)} aria-label={sidebarCollapsed?"Abrir menu lateral":"Fechar menu lateral"}>{sidebarCollapsed?<MoreHorizontal size={19}/>:<X size={19}/>}<span>Menu</span></button><button className="back-link" type="button" onClick={onBack}><ArrowLeft size={17}/> Ver menu público</button><div className="admin-topbar__right"><div className="profile-menu-container"><button className={profileOpen?'profile-menu-trigger profile-menu-trigger--open':'profile-menu-trigger'} type="button" onClick={()=>setProfileOpen(v=>!v)} aria-expanded={profileOpen} aria-label="Perfil e configurações"><CircleUserRound size={19}/><span>Perfil e configurações</span><ChevronRight className={profileOpen?'profile-menu-chevron profile-menu-chevron--open':'profile-menu-chevron'} size={15}/></button>{profileOpen&&<div className="profile-menu-panel"><div className="profile-menu-heading"><span className="profile-menu-avatar">{(session.user.email??'U').charAt(0).toUpperCase()}</span><div><strong>{session.user.user_metadata?.full_name??'Minha conta'}</strong><small>{session.user.email}</small></div></div><div className="profile-menu-divider"/><div className="profile-menu-section-title"><Settings size={15}/> Configurações</div><button className="profile-menu-action" type="button" onClick={testAudio}><Volume2 size={17}/><span><strong>Testar áudio</strong><small>Reproduzir uma mensagem de teste</small></span></button><button className={keepScreenOn?'profile-menu-action profile-menu-action--active':'profile-menu-action'} type="button" onClick={()=>setKeepScreenOn(v=>!v)}><Monitor size={17}/><span><strong>Manter tela ligada</strong><small>{keepScreenOn?(wakeLock?'Ativo neste dispositivo':'Ativado, aguardando permissão'):'Evitar que a tela apague'}</small></span><span className={keepScreenOn?'profile-switch profile-switch--on':'profile-switch'}><i/></span></button><div className="profile-menu-divider"/><button className="profile-menu-action profile-menu-logout" type="button" onClick={()=>void supabase.auth.signOut()}><LogOut size={17}/><span><strong>Sair da conta</strong><small>Encerrar esta sessão</small></span></button></div>}</div></div></header>
    {notice&&<div className="admin-content"><p className={noticeError?'form-error':'green-text'}>{notice}</p></div>}{busy&&<div className="admin-content"><small>Atualizando dados…</small></div>}
    {activeTab==='subscription'&&<div className="admin-content"><div className="admin-heading"><div><span className="eyebrow">acesso ao Menuhub</span><h1>Assinatura</h1><p>Pagamento único por Pix para liberar 30 dias de acesso.</p></div></div><section className="admin-panel"><div className="panel-heading"><div><span className="eyebrow">plano mensal</span><h2>Menuhub completo</h2></div><strong>R$ 50,00 / 30 dias</strong></div>{subscriptionError&&<p className="form-error">{subscriptionError}</p>}{subscription?.active?<><p className="green-text">{subscription.free?'Sua conta tem acesso gratuito.':'Sua assinatura está ativa.'}</p>{subscription.expiresAt&&<p>Válida até <strong>{new Date(subscription.expiresAt).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}</strong>.</p>}</>:<><p>Após a confirmação do Mercado Pago, o acesso é liberado automaticamente por 30 dias. Não feche esta tela até copiar os dados do Pix.</p>{!pix?<button className="primary-button" type="button" disabled={subscriptionLoading} onClick={async()=>{if(!session)return;setSubscriptionLoading(true);setSubscriptionError('');try{const response=await fetch('/api/assinatura',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível gerar o Pix.');setPix(data)}catch(error){setSubscriptionError(error instanceof Error?error.message:'Não foi possível gerar o Pix.')}finally{setSubscriptionLoading(false)}}}>{subscriptionLoading?'Gerando Pix…':'Gerar Pix de R$ 50,00'}</button>:<div className="subscription-pix"><h3>Pix para pagamento #{pix.paymentId}</h3>{pix.qrCodeBase64&&<img alt="QR Code Pix" style={{display:'block',width:220,maxWidth:'100%',height:'auto',margin:'16px auto'}} src={'data:image/png;base64,'+pix.qrCodeBase64}/>}{pix.qrCode&&<><label>Pix copia e cola<textarea readOnly value={pix.qrCode} rows={4}/></label><button className="primary-button" type="button" onClick={()=>{void navigator.clipboard.writeText(pix.qrCode);notify('Código Pix copiado.')}}>Copiar código Pix</button></>}{pix.ticketUrl&&<p><a href={pix.ticketUrl} target="_blank" rel="noreferrer">Abrir cobrança no Mercado Pago</a></p>}<p>Depois de pagar, a confirmação é automática. Se esta tela não atualizar, recarregue-a após alguns instantes.</p><button className="secondary-button" type="button" onClick={async()=>{if(!session)return;setSubscriptionLoading(true);try{const response=await fetch('/api/assinatura',{headers:{Authorization:'Bearer '+session.access_token}});const data=await response.json();if(!response.ok)throw new Error(data.error||'Erro ao consultar assinatura.');setSubscription(data);if(data.active)setPix(null);else setSubscriptionError('Pagamento ainda não confirmado. Aguarde a confirmação do Mercado Pago.')}catch(error){setSubscriptionError(error instanceof Error?error.message:'Erro ao consultar assinatura.')}finally{setSubscriptionLoading(false)}}}>Já paguei — atualizar status</button></div>}</>}</section></div>}
    {activeTab==='dashboard'&&<div className="admin-content"><div className="admin-heading"><div><span className="eyebrow">painel de controle</span><h1>Seus menus, em um só lugar.</h1><p>Gerencie restaurantes, produtos e pedidos.</p></div><button className="primary-button" type="button" onClick={()=>{setShowCreate(true);setActiveTab('restaurants')}}><Plus size={17}/> Novo restaurante</button></div><div className="stats-grid"><StatCard value={String(restaurants.length)} label="restaurantes" icon={<Store size={17}/>} /><StatCard value={String(items.length)} label="produtos neste menu" icon={<Utensils size={17}/>} /><StatCard value={String(orders.filter(o=>!['Concluído','Cancelado'].includes(o.status)).length)} label="pedidos em andamento" icon={<ShoppingBag size={17}/>} /></div><div className="admin-panels"><section className="admin-panel orders-panel"><div className="panel-heading"><div><span className="eyebrow">atividade</span><h2>Pedidos recentes</h2></div><button className="link-button" type="button" onClick={()=>setActiveTab('orders')}>Ver todos <ChevronRight size={15}/></button></div>{orders.length===0?<p>Ainda não há pedidos neste restaurante.</p>:orders.slice(0,5).map(o=><div className="admin-order" key={o.id}><div className="order-status"><span/></div><div className="admin-order__main"><strong>#{o.id} · {o.cliente_nome}</strong><span>{o.tipo_entrega} · {new Date(o.criado_em).toLocaleString('pt-BR')}</span></div><div className="admin-order__right"><strong>{formatPrice(Number(o.total))}</strong><span>{o.status}</span></div></div>)}</section><section className="admin-panel menu-panel"><div className="panel-heading"><div><span className="eyebrow">menu selecionado</span><h2>{selected?.nome??'Comece por aqui'}</h2></div></div>{selected?<div className="selected-menu-actions"><button className="primary-button" type="button" onClick={()=>window.open('/menu/'+selected.slug,'_blank','noopener,noreferrer')}>Ver menu</button><button className="secondary-button" type="button" onClick={()=>{const url=window.location.origin+'/menu/'+selected.slug;if(navigator.share)void navigator.share({title:selected.nome,url}).catch(()=>undefined);else void navigator.clipboard?.writeText(url).catch(()=>undefined)}}>Compartilhar menu <Share2 size={16}/></button><button className="secondary-button secondary-button--full" type="button" onClick={()=>setActiveTab('menu')}>Editar cardápio <ChevronRight size={16}/></button></div>:<button className="primary-button" type="button" onClick={()=>{setShowCreate(true);setActiveTab('restaurants')}}>Criar primeiro restaurante</button>}</section></div></div>}
    {activeTab==='whatsapp'&&<WhatsAppBotPanel restaurantId={selectedId} restaurantName={selected?.nome??''} notify={notify}/>}
    {activeTab==='restaurants'&&<div className="admin-content"><div className="admin-heading"><div><span className="eyebrow">seus negócios</span><h1>Restaurantes</h1><p>Crie e gerencie os cardápios dos seus negócios.</p></div><button className="primary-button" type="button" onClick={()=>setShowCreate(v=>!v)}><Plus size={17}/> Criar restaurante</button></div>{showCreate&&<form className="admin-panel admin-create-form" onSubmit={e=>void createRestaurant(e)}><h2>Novo restaurante</h2><label>Nome<input required minLength={2} maxLength={255} value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Ex.: Cantinho da Pizza"/></label><label>Descrição<textarea value={newDesc} onChange={e=>setNewDesc(e.target.value)} maxLength={1000}/></label><label>Localização<input value={newLocation} onChange={e=>setNewLocation(e.target.value)} maxLength={255} placeholder="Bairro, cidade"/></label><div className="form-row"><button className="primary-button" type="submit" disabled={busy}>Criar menu</button><button className="secondary-button" type="button" onClick={()=>setShowCreate(false)}>Cancelar</button></div></form>}{restaurants.length===0?<section className="admin-panel"><p>Você ainda não criou um restaurante. Clique em “Criar restaurante” para começar.</p></section>:<div className="restaurant-grid">{restaurants.map(r=><article className={r.id===selectedId?'restaurant-admin-card restaurant-admin-card--active':'restaurant-admin-card'} key={r.id}><div className="restaurant-admin-card__cover" style={{background:r.capa_url?'url('+r.capa_url+') center/cover':(r.cor_destaque??'#0e4f59')}}><span>{r.nome.charAt(0).toUpperCase()}</span><b>{r.ativo?'ativo':'inativo'}</b></div><div className="restaurant-admin-card__body"><div><strong>{r.nome}</strong><span>{r.localizacao||'Localização não informada'}</span><small>/menu/{r.slug}</small></div><div className="restaurant-admin-card__footer"><button className="link-button" type="button" onClick={()=>{setSelectedId(r.id);setActiveTab('restaurant-settings')}}>Gerenciar <ChevronRight size={14}/></button><a className="link-button" href={'/menu/'+r.slug} target="_blank" rel="noreferrer">Ver menu</a></div></div></article>)}</div>}</div>}
    {activeTab==='restaurant-settings'&&<div className="admin-content"><div className="admin-heading"><div><span className="eyebrow">cadastro do estabelecimento</span><h1>Editar restaurante</h1><p>Altere apenas os dados, a foto e o banner do estabelecimento. Produtos e complementos ficam em Meu cardápio.</p></div><button className="secondary-button" type="button" onClick={()=>setActiveTab('restaurants')}><ArrowLeft size={16}/> Voltar aos restaurantes</button></div>{restaurants.length>1&&<label className="restaurant-select-label">Restaurante<select value={selectedId??''} onChange={e=>setSelectedId(Number(e.target.value))}>{restaurants.map(r=><option key={r.id} value={r.id}>{r.nome}</option>)}</select></label>}{selected?<RestaurantSettings key={selected.id} restaurant={selected} saving={busy} onSave={saveRestaurant}/>:<section className="admin-panel">Selecione ou crie um restaurante primeiro.</section>}</div>}
    {activeTab==='menu'&&<div className="admin-content"><div className="admin-heading"><div><span className="eyebrow">personalização</span><h1>Meu cardápio</h1><p>Gerencie categorias, produtos, preços e complementos. Os dados do estabelecimento ficam em Restaurantes.</p></div>{selected&&<a className="secondary-button" href={'/menu/'+selected.slug} target="_blank" rel="noreferrer">Ver menu público</a>}</div>{restaurants.length>1&&<label className="restaurant-select-label">Restaurante<select value={selectedId??''} onChange={e=>setSelectedId(Number(e.target.value))}>{restaurants.map(r=><option key={r.id} value={r.id}>{r.nome}</option>)}</select></label>}{!selected?<section className="admin-panel"><p>Crie um restaurante na aba Restaurantes para começar.</p><button className="primary-button" type="button" onClick={()=>{setShowCreate(true);setActiveTab('restaurants')}}>Criar restaurante</button></section>:<><section className="admin-panel admin-data-panel"><div className="panel-heading"><div><span className="eyebrow">organização</span><h2>Categorias</h2></div></div><form className="inline-create-form" onSubmit={e=>void addCategory(e)}><input value={newCat} onChange={e=>setNewCat(e.target.value)} placeholder="Nome da categoria" maxLength={100} required/><button className="primary-button" type="submit"><Plus size={16}/> Adicionar</button></form>{cats.map(c=><div className="category-admin-row" key={c.id}><span>{c.nome}</span><button className="link-button" type="button" onClick={async()=>{const name=window.prompt('Novo nome da categoria:',c.nome);if(!name?.trim())return;const {error}=await supabase.from('categorias').update({nome:name.trim()}).eq('id',c.id);if(error)notify(error.message,true);else{setCats(old=>old.map(x=>x.id===c.id?{...x,nome:name.trim()}:x));notify('Categoria renomeada.')}}}>Renomear</button><button className="link-button" type="button" onClick={async()=>{if(!window.confirm('Excluir a categoria '+c.nome+'?'))return;const {error}=await supabase.from('categorias').delete().eq('id',c.id);if(error)notify(error.message,true);else{setCats(old=>old.filter(x=>x.id!==c.id));setItems(old=>old.map(p=>p.categoria_id===c.id?{...p,categoria_id:null}:p));notify('Categoria excluída.')}}}>Excluir</button></div>)}</section><section className="admin-panel admin-data-panel"><div className="panel-heading"><div><span className="eyebrow">opções reutilizáveis</span><h2>Complementos e sabores</h2></div><span>{complementGroups.length} grupos</span></div><p className="complement-admin-help">Cadastre grupos como “Sabores” ou “Adicionais”. Uma opção por linha; para cobrar adicional, use Nome|Preço (ex.: Catupiry|4,00). Depois, escolha os grupos dentro de cada produto.</p><form className="complement-admin-create" onSubmit={e=>void addComplementGroup(e)}><label>Nome do item<input value={newGroupName} onChange={e=>setNewGroupName(e.target.value)} placeholder="Ex.: Sabores" required maxLength={120}/></label><label>Opções do item<textarea value={newGroupOptions} onChange={e=>setNewGroupOptions(e.target.value)} placeholder={'Calabresa\nFrango com catupiry|4,00\nPortuguesa|2,50'} rows={4} required/></label><button className="primary-button" type="submit" disabled={busy}><Plus size={16}/> Criar item</button></form>{complementGroups.length===0?<p>Nenhum grupo criado ainda.</p>:<div className="complement-admin-list">{complementGroups.map(g=><article className="complement-admin-group" key={g.id}><div className="complement-admin-group__heading"><div><strong>{g.nome}</strong><small>{g.ativo?'Grupo ativo no cardápio':'Grupo desativado'}</small></div><div className="admin-product-actions"><button className="link-button" type="button" onClick={async()=>{const next=!g.ativo;const {error}=await supabase.from('grupos_complementos').update({ativo:next}).eq('id',g.id);if(error){notify('Não foi possível alterar o grupo: '+error.message,true);return}setComplementGroups(old=>old.map(x=>x.id===g.id?{...x,ativo:next}:x));notify(next?'Grupo reativado.':'Grupo desativado.')}}>{g.ativo?'Desativar grupo':'Reativar grupo'}</button><button className="link-button" type="button" onClick={()=>void deleteComplementGroup(g)}>Excluir</button></div></div><div className="complement-admin-options">{g.opcoes_complementos.map(o=><div className={'complement-admin-option'+(!o.ativo?' complement-admin-option--inactive':'')} key={o.id}><span>{o.nome}{Number(o.preco_adicional)>0?' · +'+formatPrice(Number(o.preco_adicional)):''}</span><span className="complement-admin-option__status">{o.ativo?'Ativo':'Desativado'}</span><button className="link-button" type="button" onClick={async()=>{const next=!o.ativo;const {error}=await supabase.from('opcoes_complementos').update({ativo:next}).eq('id',o.id);if(error){notify('Não foi possível alterar o complemento: '+error.message,true);return}setComplementGroups(old=>old.map(x=>x.id===g.id?{...x,opcoes_complementos:x.opcoes_complementos.map(y=>y.id===o.id?{...y,ativo:next}:y)}:x));notify(next?'Complemento reativado.':'Complemento desativado.')}}>{o.ativo?'Desativar':'Reativar'}</button></div>)}</div></article>)}</div>}</section><section className="admin-panel admin-data-panel"><div className="panel-heading"><div><span className="eyebrow">itens do menu</span><h2>Produtos e preços</h2></div><span>{items.length} produtos</span></div><form className="admin-product-form" onSubmit={e=>void addProduct(e)}><h3>Adicionar produto</h3><label>Nome<input required maxLength={255} value={newItem.nome} onChange={e=>setNewItem({...newItem,nome:e.target.value})} placeholder="Ex.: Pizza calabresa"/></label><label>Descrição<textarea maxLength={1000} value={newItem.descricao} onChange={e=>setNewItem({...newItem,descricao:e.target.value})}/></label><div className="form-row"><label>Preço (R$)<input required inputMode="decimal" value={newItem.preco} onChange={e=>setNewItem({...newItem,preco:e.target.value})} placeholder="29,90"/></label><label>Categoria<select value={newItem.categoria_id} onChange={e=>setNewItem({...newItem,categoria_id:e.target.value})}><option value="">Sem categoria</option>{cats.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></label></div><label>URL da foto (opcional)<input type="url" value={newItem.imagem_url} onChange={e=>setNewItem({...newItem,imagem_url:e.target.value})} placeholder="https://..."/></label>{complementGroups.length>0&&<fieldset className="product-complement-link"><legend>Complementos deste produto (opcional)</legend>{complementGroups.filter(g=>g.ativo).map(g=><label key={g.id}><input type="checkbox" checked={newProductGroupIds.includes(g.id)} onChange={e=>setNewProductGroupIds(old=>e.target.checked?[...old,g.id]:old.filter(id=>id!==g.id))}/><span>{g.nome}</span><small>{g.opcoes_complementos.filter(o=>o.ativo).length} opções</small></label>)}</fieldset>}<label>Ou enviar foto do computador (máx. 5 MB)<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={async e=>{const file=e.target.files?.[0];if(!file||!selected)return;try{setBusy(true);const url=await uploadMenuImage(file,selected.id);setNewItem(old=>({...old,imagem_url:url}));notify('Foto enviada. Salve o produto para aplicar.')}catch(err){notify(err instanceof Error?err.message:'Erro ao enviar foto.',true)}finally{setBusy(false);e.target.value=''}}}/></label><button className="primary-button" type="submit" disabled={busy}><Plus size={16}/> Cadastrar produto</button></form>{items.length===0?<p>Nenhum produto cadastrado ainda.</p>:items.map(p=><ProductAdminRow key={p.id} product={p} restaurantId={selected.id} categories={cats} complementGroups={complementGroups} linkedGroupIds={productGroupLinks[p.id]??[]} onSave={updateProduct} onDelete={deleteProduct}/>)}</section></>}</div>}
    {activeTab==='hours'&&<div className="admin-content"><div className="admin-heading"><div><span className="eyebrow">funcionamento da loja</span><h1>Horário de funcionamento</h1><p>Configure os horários semanais. O cardápio informa automaticamente se a loja está aberta e quando abrirá novamente.</p></div></div>{!selected?<section className="admin-panel">Selecione ou crie um restaurante primeiro.</section>:<form className="admin-panel opening-hours-form" onSubmit={e=>void saveOpeningHours(e)}><div className="opening-hours-intro"><Clock3 size={20}/><div><strong>{selected.status_loja_manual===true?'Loja aberta manualmente':selected.status_loja_manual===false?'Loja fechada manualmente':'Modo automático'}</strong><p>Salvar os horários reativa o modo automático.</p></div></div>{weekDays.map(day=>{const value=hoursDraft[day.id]??{closed:false,open:'18:00',close:'22:00'};return <div className={'opening-hours-row'+(value.closed?' opening-hours-row--closed':'')} key={day.id}><label className="opening-hours-day"><input type="checkbox" checked={!value.closed} onChange={e=>setHoursDraft(old=>({...old,[day.id]:{...value,closed:!e.target.checked}}))}/><span>{day.label}</span></label>{value.closed?<span className="opening-hours-closed-label">Fechado</span>:<div className="opening-hours-times"><label>Abre<input type="time" required value={value.open} onChange={e=>setHoursDraft(old=>({...old,[day.id]:{...value,open:e.target.value}}))}/></label><span>até</span><label>Fecha<input type="time" required value={value.close} onChange={e=>setHoursDraft(old=>({...old,[day.id]:{...value,close:e.target.value}}))}/></label></div>}</div>})}<div className="opening-hours-actions"><button className="primary-button" type="submit" disabled={busy}>Salvar horários e ativar automático</button><button className="secondary-button" type="button" disabled={busy} onClick={async()=>{if(!selected)return;const {error}=await supabase.from('empresas').update({status_loja_manual:null,aceita_pedidos:true}).eq('id',selected.id);if(error){notify('Não foi possível ativar o modo automático: '+error.message,true);return}setRestaurants(old=>old.map(r=>r.id===selected.id?{...r,status_loja_manual:null,aceita_pedidos:true}:r));notify('Modo automático ativado.')}}>Usar horário automático agora</button></div></form>}</div>}
    {activeTab==='sales'&&<SalesReport orders={orders} onRefresh={()=>{if(selectedId!==null)void loadDetails(selectedId)}}/>}
    {activeTab==='orders'&&<div className="admin-content"><div className="admin-heading"><div><span className="eyebrow">acompanhamento</span><h1>Pedidos</h1><p>Lista organizada e atualizada automaticamente.</p></div><button className="secondary-button" type="button" onClick={()=>selectedId!==null&&void loadDetails(selectedId)}>Atualizar</button></div>{restaurants.length>1&&<label className="restaurant-select-label">Restaurante<select value={selectedId??''} onChange={e=>setSelectedId(Number(e.target.value))}>{restaurants.map(r=><option key={r.id} value={r.id}>{r.nome}</option>)}</select></label>}{orders.length===0?<section className="admin-panel">Nenhum pedido recebido ainda.</section>:<section className="admin-panel admin-orders-panel"><div className="admin-orders-table-wrap"><table className="admin-orders-table"><thead><tr><th>N. pedido</th><th>Nome</th><th>Data</th><th>Pagamento</th><th>Status</th><th>Tipo</th><th>Valor</th><th>Origem</th><th>Ação</th></tr></thead><tbody>{orders.map(o=>{const created=new Date(o.criado_em);const dateLabel=created.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'})+' às '+created.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});const statusLabel=o.status==='Concluído'?'Finalizado':o.status;const statusClass=o.status==='Cancelado'?'cancelled':o.status==='Concluído'?'finished':'pending';return <tr key={o.id}><td className="admin-order-number">{String(o.id).length>8?String(o.id).slice(-8):String(o.id)}</td><td><strong className="admin-order-customer">{o.cliente_nome}</strong><small className="admin-order-phone">{o.cliente_whatsapp}</small>{o.observacoes&&<small className="admin-order-note">Obs.: {o.observacoes}</small>}{o.precisa_troco&&<small className="admin-order-note">Troco para {formatPrice(Number(o.troco_para))}</small>}</td><td className="admin-order-date">{dateLabel}</td><td><span className={'admin-order-payment admin-order-payment--'+({'Pix':'pix','Dinheiro':'dinheiro','Cartão de débito':'debito','Cartão de crédito':'credito'}[o.forma_pagamento||'Pix']||'pix')}>{o.forma_pagamento||'Pix'}</span></td><td><span className={'admin-order-status admin-order-status--'+statusClass}>{statusLabel}</span></td><td>{o.tipo_entrega}</td><td className="admin-order-value">{formatPrice(Number(o.total))}</td><td><span className="admin-order-origin">{o.origem||'Menu digital'}</span></td><td><div className="admin-order-actions"><button className="order-edit-button" type="button" title="Editar pedido" aria-label={"Editar pedido "+o.id} onClick={()=>startEditOrder(o)}><Pencil size={15}/></button><button className="order-print-button" type="button" onClick={()=>void printOrderWithItems(o)}>Imprimir</button><label className="admin-order-action"><span className="sr-only">Alterar status do pedido {o.id}</span><select aria-label={'Ação para o pedido '+o.id} value={o.status} onChange={e=>void updateOrder(o,e.target.value)}>{['Novo','Preparando','Pronto','Concluído','Cancelado'].map(st=><option key={st} value={st}>{st==='Concluído'?'Finalizar':st==='Novo'?'Marcar novo':st==='Preparando'?'Preparando':st==='Pronto'?'Marcar pronto':st}</option>)}</select></label></div></td></tr>})}</tbody></table></div></section>}</div>}
    {activeTab==='counter'&&<div className="admin-content"><div className="admin-heading"><div><span className="eyebrow">{editingOrder?`editando pedido #${editingOrder.id}`:'venda presencial'}</span><h1>{editingOrder?'Editar pedido no balcão':'Pedidos balcão'}</h1><p>{editingOrder?'Os dados e itens do cliente foram carregados. Adicione ou remova produtos e salve.':'Registre no caixa pedidos feitos presencialmente.'}</p></div>{editingOrder&&<button className="secondary-button" type="button" onClick={()=>{setEditingOrder(null);setCounterQty({});setActiveTab('orders')}}>Cancelar edição</button>}</div>{!selected?<section className="admin-panel">Selecione ou crie um restaurante primeiro.</section>:<form className="admin-panel counter-order-form" onSubmit={e=>void createCounterOrder(e)}><div className="counter-fields"><label>Nome do cliente (opcional)<input value={counterName} onChange={e=>setCounterName(e.target.value)} placeholder="Cliente balcão"/></label><label>Telefone (opcional)<input value={counterPhone} onChange={e=>setCounterPhone(e.target.value)} placeholder="Telefone"/></label><label>Tipo<select value={counterType} onChange={e=>setCounterType(e.target.value as 'Retirada'|'Entrega')}><option>Retirada</option><option>Entrega</option></select></label><label>Pagamento<select value={counterPayment} onChange={e=>setCounterPayment(e.target.value)}><option>Dinheiro</option><option>Pix</option><option>Cartão de débito</option><option>Cartão de crédito</option><option>A combinar</option></select></label></div>{counterType==='Entrega'&&<label>Endereço de entrega<input required value={counterAddress} onChange={e=>setCounterAddress(e.target.value)} placeholder="Rua, número, bairro"/></label>}<h2>Produtos</h2><p className="printer-help">No balcão, você pode ajustar o preço deste pedido sem alterar o preço do cardápio.</p><div className="counter-products">{items.filter(p=>p.disponivel).map(p=><div className="counter-product" key={p.id}><div><strong>{p.nome}</strong><small>Preço do cardápio: {formatPrice(Number(p.preco))}</small><label className="counter-price-field">Preço neste pedido<input aria-label={'Preço para '+p.nome} inputMode="decimal" placeholder={Number(p.preco).toFixed(2).replace('.',',')} value={counterPrices[p.id]??''} onChange={e=>setCounterPrices(old=>({...old,[p.id]:e.target.value}))}/></label></div><div className="counter-quantity"><button type="button" aria-label={'Diminuir '+p.nome} onClick={()=>setCounterQty(old=>({...old,[p.id]:Math.max(0,(old[p.id]??0)-1)}))}>−</button><span>{counterQty[p.id]??0}</span><button type="button" aria-label={'Adicionar '+p.nome} onClick={()=>setCounterQty(old=>({...old,[p.id]:(old[p.id]??0)+1}))}>+</button></div></div>)}</div><section className="counter-extra-box"><h2>Pedido avulso</h2><p>Adicione um item que não está cadastrado no cardápio e defina o preço apenas para esta venda.</p><div className="counter-fields"><label>Nome do item<input value={counterExtraName} onChange={e=>setCounterExtraName(e.target.value)} placeholder="Ex.: taxa, produto especial" /></label><label>Preço (R$)<input inputMode="decimal" value={counterExtraPrice} onChange={e=>setCounterExtraPrice(e.target.value)} placeholder="0,00" /></label><button type="button" className="secondary-button" onClick={()=>{const price=Number(counterExtraPrice.replace(',','.'));if(!counterExtraName.trim()||!counterExtraPrice.trim()||!Number.isFinite(price)||price<0){notify('Informe nome e preço válido para o item avulso.',true);return}setCounterExtras(old=>[...old,{id:String(Date.now())+'-'+old.length,nome:counterExtraName.trim(),preco:price,quantidade:1}]);setCounterExtraName('');setCounterExtraPrice('')}}>Adicionar avulso</button></div>{counterExtras.map(x=><div className="counter-product" key={x.id}><div><strong>{x.nome}</strong><small>{formatPrice(x.preco)} cada</small></div><div className="counter-quantity"><button type="button" onClick={()=>setCounterExtras(old=>old.map(y=>y.id===x.id?{...y,quantidade:Math.max(0,y.quantidade-1)}:y))}>−</button><span>{x.quantidade}</span><button type="button" onClick={()=>setCounterExtras(old=>old.map(y=>y.id===x.id?{...y,quantidade:y.quantidade+1}:y))}>+</button><button type="button" aria-label={'Remover '+x.nome} onClick={()=>setCounterExtras(old=>old.filter(y=>y.id!==x.id))}>×</button></div></div>)}</section><div className="counter-total"><span>Total</span><strong>{formatPrice(items.reduce((sum,p)=>sum+unitPricePreview(p,counterPrices)*(counterQty[p.id]??0),0)+counterExtras.reduce((sum,x)=>sum+x.preco*x.quantidade,0))}</strong></div><button className="primary-button" type="submit" disabled={busy||(!items.some(p=>(counterQty[p.id]??0)>0)&&!counterExtras.some(x=>x.quantidade>0))}><Plus size={16}/> {editingOrder?'Salvar pedido editado':'Registrar pedido'}</button></form>}</div>}
    {activeTab==='tabs'&&<div className="admin-content"><div className="admin-heading"><div><span className="eyebrow">atendimento presencial</span><h1>Comandas e garçons</h1><p>Cadastre a equipe, abra comandas por mesa e acompanhe os itens até o fechamento.</p></div></div>{!selected?<section className="admin-panel">Selecione ou crie um restaurante primeiro.</section>:<><div className="admin-panels"><section className="admin-panel"><div className="panel-heading"><div><span className="eyebrow">equipe</span><h2>Garçons</h2></div><span className="status-pill">{waiters.filter(w=>w.ativo).length} ativos</span></div><form className="counter-fields" onSubmit={e=>void addWaiter(e)}><label>Nome do garçom<input required value={waiterName} onChange={e=>setWaiterName(e.target.value)} placeholder="Nome completo"/></label><label>Telefone (opcional)<input value={waiterPhone} onChange={e=>setWaiterPhone(e.target.value)} placeholder="(85) 99999-9999"/></label><button className="primary-button" type="submit"><Plus size={16}/> Cadastrar</button></form>{waiters.length===0?<p className="printer-help">Nenhum garçom cadastrado ainda.</p>:<div className="table-wrap"><table className="admin-table"><thead><tr><th>Nome</th><th>Telefone</th><th>Situação</th><th></th></tr></thead><tbody>{waiters.map(w=><tr key={w.id}><td>{w.nome}</td><td>{w.telefone||'—'}</td><td>{w.ativo?'Ativo':'Inativo'}</td><td><button className="secondary-button" type="button" onClick={()=>void toggleWaiter(w)}>{w.ativo?'Desativar':'Reativar'}</button></td></tr>)}</tbody></table></div>}</section><section className="admin-panel"><div className="panel-heading"><div><span className="eyebrow">nova conta</span><h2>Abrir comanda</h2></div></div><form className="counter-fields" onSubmit={e=>void openTab(e)}><label>Mesa / identificação<input required value={tabTable} onChange={e=>setTabTable(e.target.value)} placeholder="Ex.: Mesa 4 ou Balcão"/></label><label>Garçom responsável<select value={tabWaiter} onChange={e=>setTabWaiter(e.target.value)}><option value="">Sem garçom atribuído</option>{waiters.filter(w=>w.ativo).map(w=><option key={w.id} value={w.id}>{w.nome}</option>)}</select></label><button className="primary-button" type="submit"><Plus size={16}/> Abrir comanda</button></form></section></div><section className="admin-panel"><div className="panel-heading"><div><span className="eyebrow">controle de consumo</span><h2>Comandas</h2></div><button className="secondary-button" type="button" onClick={()=>void loadTabsAndWaiters(selected.id)}>Atualizar</button></div>{tabs.length===0?<p>Nenhuma comanda aberta ou registrada ainda.</p>:<div className="tabs-manager-list">{tabs.map(tab=>{const total=(tab.itens_comanda??[]).reduce((sum,it)=>sum+Number(it.quantidade)*Number(it.preco_unitario),0);return <article className="tab-manager-card" key={tab.id}><div className="tab-manager-heading"><div><span className="eyebrow">comanda #{tab.id}</span><h3>{tab.mesa}</h3><p>{tab.garcons?.nome??'Sem garçom atribuído'} · {new Date(tab.created_at).toLocaleString('pt-BR')}</p></div><span className={tab.status==='aberta'?'status-pill status-pill--open':'status-pill'}>{tab.status==='aberta'?'Aberta':'Fechada'}</span></div>{(tab.itens_comanda??[]).length>0?<div className="tab-manager-items">{tab.itens_comanda!.map(it=><div key={it.id}><span>{it.quantidade}× {it.produto_nome}</span><strong>{formatPrice(Number(it.preco_unitario)*Number(it.quantidade))}</strong></div>)}</div>:<p className="printer-help">Nenhum item lançado nesta comanda.</p>}<div className="tab-manager-total"><span>Total</span><strong>{formatPrice(total)}</strong></div>{tab.status==='aberta'&&<div className="tab-manager-actions"><button className="secondary-button" type="button" onClick={()=>setActiveTabId(activeTabId===tab.id?null:tab.id)}>{activeTabId===tab.id?'Cancelar lançamento':'Adicionar produtos'}</button><button className="primary-button" type="button" onClick={()=>void closeTab(tab.id)}>Fechar comanda</button></div>}{activeTabId===tab.id&&tab.status==='aberta'&&<form className="counter-fields tab-add-item" onSubmit={e=>void addTabItem(e)}><label>Produto<select required value={tabProduct} onChange={e=>setTabProduct(e.target.value)}><option value="">Selecione um produto</option>{items.filter(p=>p.disponivel).map(p=><option key={p.id} value={p.id}>{p.nome} — {formatPrice(Number(p.preco))}</option>)}</select></label><label>Quantidade<input required type="number" min="1" max="99" value={tabQty} onChange={e=>setTabQty(e.target.value)}/></label><button className="primary-button" type="submit"><Plus size={16}/> Lançar item</button></form>}</article>})}</div>}</section></>}</div>}
    {activeTab==='printer'&&<div className="admin-content"><div className="admin-heading"><div><span className="eyebrow">comprovantes</span><h1>Configurações de impressora</h1><p>Personalize o cabeçalho das notas térmicas deste restaurante.</p></div></div>{!selected?<section className="admin-panel">Selecione ou crie um restaurante primeiro.</section>:<section className="admin-panel printer-settings-form"><div className="qz-panel"><div className="panel-heading"><div><span className="eyebrow">impressão direta</span><h2>PrintNode</h2></div><span className={printNodeStatus==='Conectado'?'qz-status qz-status--connected':'qz-status'}>{printNodeStatus}</span></div><p className="printer-help">Consulta as impressoras da sua conta PrintNode e envia as comandas sem abrir a janela do navegador.</p><div className="qz-actions"><button className="primary-button" type="button" onClick={()=>void loadPrintNodePrinters()}><Printer size={16}/> Buscar impressoras PrintNode</button></div>{printNodePrinters.length>0&&<label>Impressora PrintNode<select value={printNodePrinterId} onChange={e=>setPrintNodePrinterId(e.target.value)}>{printNodePrinters.map(p=><option key={p.id} value={p.id}>{p.name}{p.computer?' — '+p.computer:''} (ID {p.id})</option>)}</select></label>}<small className="printer-help">A chave da API do PrintNode fica protegida nas variáveis da Vercel, não no navegador.</small><label>Nome que sairá na nota<input value={printerName} onChange={e=>setPrinterName(e.target.value)} placeholder={selected.nome}/></label><label className="admin-check-label"><input type="checkbox" checked={autoPrint} onChange={e=>setAutoPrint(e.target.checked)}/> Imprimir automaticamente quando chegar pedido novo (com esta tela aberta e PrintNode configurado)</label><p className="printer-help">Para imprimir automaticamente, deixe esta área administrativa aberta neste computador, mantenha o cliente PrintNode conectado e salve as configurações.</p><button className="primary-button" type="button" onClick={savePrinterSettings}>Salvar configurações</button></div></section>}</div>}
    </main></div>
}
type SalesPeriod = 7 | 30 | 90


type WhatsAppBotConfig = {
  enabled: boolean
  welcomeMessage: string
  faqMenu: string
  faqHours: string
  faqPayment: string
  statusNew: boolean
  statusPreparing: boolean
  statusReady: boolean
  statusDelivered: boolean
  messageNew: string
  messagePreparing: string
  messageReady: string
  messageDelivered: string
}
const defaultWhatsAppBotConfig: WhatsAppBotConfig = {
  enabled: false,
  welcomeMessage: 'Olá! 👋 Seja bem-vindo(a)! Como podemos ajudar?',
  faqMenu: 'Você pode consultar nosso cardápio e fazer seu pedido pelo link do nosso menu.',
  faqHours: 'Nosso horário de funcionamento está informado no cardápio. Se precisar, fale com nossa equipe.',
  faqPayment: 'As formas de pagamento disponíveis aparecem na finalização do pedido.',
  statusNew: true,
  statusPreparing: true,
  statusReady: true,
  statusDelivered: true,
  messageNew: 'Olá, {nome}! Recebemos seu pedido #{pedido}. Obrigado pela preferência!',
  messagePreparing: 'Olá, {nome}! Seu pedido #{pedido} já está sendo preparado. 🍳',
  messageReady: 'Boa notícia, {nome}! Seu pedido #{pedido} está pronto!',
  messageDelivered: 'Olá, {nome}! Seu pedido #{pedido} foi concluído. Obrigado pela preferência!',
}
function WhatsAppBotPanel({restaurantId,restaurantName,notify}:{restaurantId:number|null;restaurantName:string;notify:(message:string,error?:boolean)=>void}) {
  const [config,setConfig]=useState<WhatsAppBotConfig>(defaultWhatsAppBotConfig)
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
    if(!token)throw new Error('Sua sessão expirou. Entre novamente no Menuhub.')
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
      setBridgeError('')
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
        setConfig({...defaultWhatsAppBotConfig,...(data.config as Partial<WhatsAppBotConfig>??{})})
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
    if(!window.confirm('Desconectar este WhatsApp do Menuhub e apagar a sessão salva no servidor?'))return
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
        <div className="whatsapp-connect-icon"><MessageCircle size={25}/></div><div className="whatsapp-connect-copy"><span className="eyebrow">etapa 1 · conexão de teste</span><h2>Vincular pelo QR Code</h2><p>Use um número de teste. No celular, abra WhatsApp → Dispositivos conectados → Conectar dispositivo e leia o QR exibido aqui.</p><div className="whatsapp-connection-status"><span className={bridgeStatus==='connected'?'whatsapp-status-dot whatsapp-status-dot--connected':'whatsapp-status-dot'}/><span>{statusLabel}{bridgeStatus==='connected'&&linkedPhone?' · +'+linkedPhone:''}</span></div></div>
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
        {([
          ['Novo','Pedido recebido','statusNew','messageNew'],
          ['Preparando','Em preparo','statusPreparing','messagePreparing'],
          ['Pronto','Pedido pronto','statusReady','messageReady'],
          ['Concluído','Pedido concluído/entregue','statusDelivered','messageDelivered'],
        ] as const).map(([status,label,flag,message])=><div className="whatsapp-status-editor" key={status}><label className="whatsapp-toggle"><input type="checkbox" checked={config[flag]} onChange={e=>update({[flag]:e.target.checked} as Partial<WhatsAppBotConfig>)}/><span>{label}</span></label><textarea aria-label={'Mensagem para '+label} rows={2} maxLength={1000} value={config[message]} onChange={e=>update({[message]:e.target.value})}/><small>Status no Menuhub: {status}</small></div>)}
        <div className="whatsapp-template-note"><strong>Importante sobre envios</strong><p>Para iniciar mensagens fora da janela de atendimento do WhatsApp, a Meta normalmente exige modelos aprovados. A integração final precisa mapear cada status para um modelo permitido e respeitar as regras de consentimento e envio.</p></div>
        <button className="primary-button" type="button" onClick={()=>void save()} disabled={saving||loading}>{saving?'Salvando…':'Salvar configurações do bot'}</button>
        {loading&&<small>Carregando configurações…</small>}
      </section>
    </>}
  </div>
}

function SalesReport({orders,onRefresh}:{orders:AdminOrder[];onRefresh:()=>void}) {
  const [period,setPeriod]=useState<SalesPeriod>(30)
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
    <div className="sales-period" role="group" aria-label="Período do relatório">{([7,30,90] as SalesPeriod[]).map(value=><button key={value} type="button" className={period===value?'sales-period__button sales-period__button--active':'sales-period__button'} onClick={()=>setPeriod(value)}>{value} dias</button>)}</div>
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
    <div className="restaurant-image-upload-grid"><label>Trocar foto de perfil<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{const url=await uploadMenuImage(file,restaurant.id);setForm(old=>({...old,logo_url:url}));}catch(err){window.alert(err instanceof Error?err.message:'Não foi possível enviar a foto.')}finally{e.target.value=''}}}/>{form.logo_url&&<img src={form.logo_url} alt="Prévia da foto de perfil"/>}</label><label>Trocar banner do restaurante<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{const url=await uploadMenuImage(file,restaurant.id);setForm(old=>({...old,capa_url:url}));}catch(err){window.alert(err instanceof Error?err.message:'Não foi possível enviar o banner.')}finally{e.target.value=''}}}/>{form.capa_url&&<img className="restaurant-banner-preview" src={form.capa_url} alt="Prévia do banner"/>}</label></div>
    <div className="form-row"><label className="admin-check-label"><input type="checkbox" checked={form.ativo} onChange={e=>setForm({...form,ativo:e.target.checked})}/> Menu publicado</label></div>
    <button className="primary-button" type="submit" disabled={saving}>{saving?'Salvando…':'Salvar dados do restaurante'}</button>
  </form>
}
function ProductAdminRow({product,restaurantId,categories,complementGroups,linkedGroupIds,onSave,onDelete}:{product:AdminProduct;restaurantId:number;categories:AdminCategory[];complementGroups:AdminComplementGroup[];linkedGroupIds:number[];onSave:(p:AdminProduct,patch:Partial<AdminProduct>,groupIds?:number[])=>Promise<void>;onDelete:(p:AdminProduct)=>Promise<void>}) {
  const [editing,setEditing]=useState(false),[groupIds,setGroupIds]=useState<number[]>(linkedGroupIds),[form,setForm]=useState({nome:product.nome,descricao:product.descricao??'',preco:String(product.preco).replace('.',','),categoria_id:product.categoria_id?String(product.categoria_id):'',imagem_url:product.imagem_url??'',disponivel:product.disponivel})
  useEffect(()=>{setForm({nome:product.nome,descricao:product.descricao??'',preco:String(product.preco).replace('.',','),categoria_id:product.categoria_id?String(product.categoria_id):'',imagem_url:product.imagem_url??'',disponivel:product.disponivel});setGroupIds(linkedGroupIds)},[product,linkedGroupIds])
  return <article className="admin-product-row">{product.imagem_url?<img className="admin-product-image" src={product.imagem_url} alt=""/>:<span className="admin-product-placeholder"><Utensils size={17}/></span>}<div className="admin-product-row__content">{editing?<><label>Nome<input value={form.nome} onChange={e=>setForm({...form,nome:e.target.value})}/></label><label>Descrição<textarea value={form.descricao} onChange={e=>setForm({...form,descricao:e.target.value})}/></label><div className="form-row"><label>Preço<input value={form.preco} onChange={e=>setForm({...form,preco:e.target.value})}/></label><label>Categoria<select value={form.categoria_id} onChange={e=>setForm({...form,categoria_id:e.target.value})}><option value="">Sem categoria</option>{categories.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></label></div><label>URL da foto<input value={form.imagem_url} onChange={e=>setForm({...form,imagem_url:e.target.value})}/></label>{complementGroups.length>0&&<fieldset className="product-complement-link"><legend>Complementos vinculados</legend>{complementGroups.filter(g=>g.ativo).map(g=><label key={g.id}><input type="checkbox" checked={groupIds.includes(g.id)} onChange={e=>setGroupIds(old=>e.target.checked?[...old,g.id]:old.filter(id=>id!==g.id))}/><span>{g.nome}</span><small>{g.opcoes_complementos.filter(o=>o.ativo).length} opções</small></label>)}</fieldset>}<label>Ou enviar foto (máx. 5 MB)<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{const url=await uploadMenuImage(file,restaurantId);setForm(old=>({...old,imagem_url:url}));window.alert('Foto enviada. Clique em Salvar para aplicar.')}catch(err){window.alert(err instanceof Error?err.message:'Erro ao enviar foto.')}finally{e.target.value=''}}}/></label><label className="admin-check-label"><input type="checkbox" checked={form.disponivel} onChange={e=>setForm({...form,disponivel:e.target.checked})}/> Disponível no menu</label><div className="form-row"><button className="primary-button" type="button" onClick={()=>{const price=Number(form.preco.replace(',','.'));if(!form.nome.trim()||!Number.isFinite(price)||price<0){notifyProductError();return}void onSave(product,{nome:form.nome.trim(),descricao:form.descricao.trim()||null,preco:price,categoria_id:form.categoria_id?Number(form.categoria_id):null,imagem_url:form.imagem_url.trim()||null,disponivel:form.disponivel},groupIds).then(()=>setEditing(false))}}>Salvar</button><button className="secondary-button" type="button" onClick={()=>setEditing(false)}>Cancelar</button></div></>:<><div className="admin-product-row__heading"><strong>{product.nome}</strong><b>{formatPrice(Number(product.preco))}</b></div><p>{product.descricao||'Sem descrição'}</p><small>{categories.find(c=>c.id===product.categoria_id)?.nome??'Sem categoria'} · {product.disponivel?'Disponível':'Indisponível'}</small><div className="admin-product-actions"><button className="link-button" type="button" onClick={()=>void onSave(product,{disponivel:!product.disponivel})}>{product.disponivel?'Desativar':'Reativar'}</button><button className="link-button" type="button" onClick={()=>setEditing(true)}>Editar</button><button className="link-button" type="button" onClick={()=>void onDelete(product)}>Excluir</button></div></>}</div></article>
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
              <a className="home-example-button" href="/menu/yamamoto-sushibar">Veja um exemplo de menu <ChevronRight size={17}/></a>
            </div>
            <div className="home-trust"><span><Check size={15}/> Personalize seus produtos</span><span><Check size={15}/> Gerencie seus pedidos</span></div>
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
      <footer className="home-footer"><a className="brand" href="/"><span className="brand-mark">F</span><span>FB3d2y <b>Menu</b></span></a><span>Cardápios próximos, pedidos simples.</span><a href="/menu/yamamoto-sushibar">Conhecer o SushiBar <ArrowLeft size={14}/></a></footer>
    </div>
  )
}

export default function App() {
  const path = window.location.pathname
  const [admin, setAdmin] = useState(() => path.startsWith('/admin'))
  if (admin) return <AdminView onBack={() => { window.history.pushState({}, '', '/'); setAdmin(false) }} />
  const slug = menuSlugFromPath(path)
  if (slug) return <MenuLoader slug={slug} />
  if (path === '/demo' || path === '/demo/') return <MenuLoader slug="yamamoto-sushibar" />
  return <HomePage />
}