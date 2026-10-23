import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  ArrowLeft,
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Instagram,
  LayoutDashboard,
  MapPin,
  Minus,
  MoreHorizontal,
  Plus,
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
  type Product,
  type Restaurant,
} from './data'
import { hasSupabaseConfig, supabase } from './lib/supabase'
import { createOrder, fetchMenu, type MenuData, type OrderForm, type OrderItem } from './lib/api'
import type { Session } from '@supabase/supabase-js'

type CartLine = {
  product: Product
  quantity: number
}

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
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/admin` },
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
            {restaurant.rating !== undefined && <span><Star size={14} fill="currentColor" /> {restaurant.rating.toFixed(1)} {restaurant.reviewCount !== undefined && <small>({restaurant.reviewCount})</small>}</span>}
            {restaurant.location && <span><MapPin size={14} /> {restaurant.location}</span>}
            {instagramHandle && <a href={`https://instagram.com/${instagramHandle}`} target="_blank" rel="noopener noreferrer"><Instagram size={14} /> {restaurant.instagram}</a>}
          </div>
        </div>
        <span className={`status-pill ${restaurant.isOpen ? 'status-pill--open' : ''}`}><span /> {restaurant.isOpen ? 'Aberto agora' : 'Fechado'}</span>
      </div>
      {restaurant.description && <p className="restaurant-description">{restaurant.description}</p>}
      {restaurant.schedule && <div className="restaurant-hours"><Clock3 size={15} /> {restaurant.schedule}<span className="hours-separator" /> pedidos pelo menu</div>}
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

function CartDrawer({ cart, isDemo, onClose, onAdjust, onSubmit }: { cart: CartLine[]; isDemo: boolean; onClose: () => void; onAdjust: (productId: number, amount: number) => void; onSubmit: (form: OrderForm) => Promise<void> }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [deliveryType, setDeliveryType] = useState<OrderForm['deliveryType']>('Retirada')
  const [address, setAddress] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const total = cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0)
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0)
  const phoneDigits = phone.replace(/\D/g, '')
  const valid = name.trim().length >= 2 && phoneDigits.length >= 10 && phoneDigits.length <= 13 && (deliveryType === 'Retirada' || address.trim().length >= 5)

  const send = async () => {
    setSending(true)
    setError(null)
    try {
      await onSubmit({ name: name.trim(), phone, deliveryType, address: address.trim() })
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
            <div className="cart-line" key={line.product.id}>
              <ProductArtwork product={line.product} compact />
              <div className="cart-line__copy"><strong>{line.product.name}</strong><span>{formatPrice(line.product.price)}</span><div className="quantity-control"><button type="button" onClick={() => onAdjust(line.product.id, -1)} aria-label="Diminuir quantidade"><Minus size={14} /></button><b>{line.quantity}</b><button type="button" onClick={() => onAdjust(line.product.id, 1)} aria-label="Aumentar quantidade"><Plus size={14} /></button></div></div>
              <strong className="cart-line__total">{formatPrice(line.product.price * line.quantity)}</strong>
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
        </div>
        <div className="drawer-total"><span>Total do pedido</span><strong>{formatPrice(total)}</strong></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button primary-button--full" type="button" onClick={() => void send()} disabled={!valid || sending}><ShoppingBag size={18} /> {sending ? 'Enviando…' : 'Enviar pedido'}</button>
        <p className="privacy-note">{isDemo ? 'Nesta demonstração, o pedido não é enviado a ninguém.' : 'Seu pedido será enviado direto ao restaurante, que vai combinar o pagamento com você pelo WhatsApp.'}</p>
      </aside>
    </div>
  )
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
  const filteredProducts = useMemo(() => selectedCategory === 'all' ? menuProducts : menuProducts.filter((product) => product.category === selectedCategory), [selectedCategory, menuProducts])
  const total = cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0)
  const count = cart.reduce((sum, line) => sum + line.quantity, 0)

  useEffect(() => {
    if (!isDemo) document.title = `${restaurant.name} — Cardápio`
  }, [isDemo, restaurant.name])

  const addProduct = (product: Product) => {
    setConfirmation(null)
    setCart((current) => {
      const found = current.find((line) => line.product.id === product.id)
      return found ? current.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line) : [...current, { product, quantity: 1 }]
    })
  }
  const adjust = (productId: number, amount: number) => setCart((current) => current.flatMap((line) => line.product.id !== productId ? [line] : line.quantity + amount > 0 ? [{ ...line, quantity: line.quantity + amount }] : []))

  const submitOrder = async (form: OrderForm) => {
    const items = cart.map((line) => ({ productId: line.product.id, quantity: line.quantity }))
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
          {filteredProducts.length === 0 ? <p className="restaurant-description">Este menu ainda não tem produtos publicados.</p> : <div className="product-grid">{filteredProducts.map((product) => <ProductCard key={product.id} product={product} categoryLabel={categoryLabel(product.category)} canOrder={restaurant.isOpen} onAdd={addProduct} />)}</div>}
        </section>
      </main>
      <footer className="site-footer"><div><span className="brand brand--footer"><span className="brand-mark">F</span><span>FB3d2y <b>Menu</b></span></span><p>Cardápios próximos, pedidos simples.</p></div><span className="footer-note">feito para negócios locais · beta</span></footer>
      {confirmation && <div className="toast"><CheckCircle2 size={18} /><span>{confirmation}</span><button type="button" onClick={() => setConfirmation(null)} aria-label="Fechar aviso"><X size={15} /></button></div>}
      {count > 0 && !isCartOpen && <button className="floating-cart" type="button" onClick={() => setCartOpen(true)}><span><ShoppingBag size={18} /> Seu pedido</span><b>{formatPrice(total)} <span className="cart-count">{count}</span></b></button>}
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
  return <div className="auth-shell"><div className="auth-card"><div className="auth-mark">F</div><span className="eyebrow">área de gerenciamento</span><h1>Crie seu menu local.</h1><p>Entre com sua conta Google para criar restaurantes, personalizar produtos e acompanhar pedidos com segurança.</p><GoogleAccountButton className="google-button" /><button className="back-link auth-back" type="button" onClick={onBack}><ArrowLeft size={16} /> voltar ao menu</button><small className="auth-disclaimer">O Google confirma sua identidade. O FB3d2y Menu não vê sua senha.</small></div></div>
}

function AdminView({ onBack }: { onBack: () => void }) {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    let active = true
    if (!hasSupabaseConfig) {
      setAuthLoading(false)
      return
    }
    void supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session)
        setAuthLoading(false)
      }
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession)
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])
  if (authLoading) return <div className="auth-shell"><div className="auth-card auth-card--loading"><div className="auth-mark">F</div><p>Verificando sua conta…</p></div></div>
  if (!session) return <AdminLoginScreen onBack={onBack} />
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar"><div className="admin-brand"><span className="brand-mark">F</span><div><b>FB3d2y</b><span>Menu</span></div></div><div className="workspace-label">meus menus</div><div className="restaurant-switcher"><span className="restaurant-switcher__avatar">Y</span><div><strong>Yamamoto Sushibar</strong><span>menu ativo</span></div><ChevronRight size={16} /></div><nav className="admin-nav"><button className={activeTab === 'dashboard' ? 'admin-nav__link admin-nav__link--active' : 'admin-nav__link'} onClick={() => setActiveTab('dashboard')} type="button"><LayoutDashboard size={17} /> Visão geral</button><button className={activeTab === 'menu' ? 'admin-nav__link admin-nav__link--active' : 'admin-nav__link'} onClick={() => setActiveTab('menu')} type="button"><Utensils size={17} /> Meu cardápio</button><button className={activeTab === 'restaurants' ? 'admin-nav__link admin-nav__link--active' : 'admin-nav__link'} onClick={() => setActiveTab('restaurants')} type="button"><Store size={17} /> Restaurantes</button></nav><div className="sidebar-bottom"><button className="admin-nav__link" type="button"><Bell size={17} /> Notificações <span className="notification-dot" /></button><div className="profile-chip"><span>RL</span><div><strong>Rafael Lima</strong><small>administrador</small></div><MoreHorizontal size={16} /></div></div></aside>
      <main className="admin-main"><header className="admin-topbar"><button className="back-link" type="button" onClick={onBack}><ArrowLeft size={17} /> Ver menu público</button><div className="admin-topbar__right"><span className="private-tag"><span /> espaço privado</span><GoogleAccountButton className="account-link" /><button className="icon-button" type="button" aria-label="Notificações"><Bell size={18} /></button><div className="mini-avatar">RL</div></div></header>
        {activeTab === 'dashboard' && <div className="admin-content"><div className="admin-heading"><div><span className="eyebrow">terça-feira, 23 de outubro</span><h1>Bom dia, Rafael.</h1><p>Veja o que está acontecendo no seu menu hoje.</p></div><button className="primary-button" type="button"><Plus size={17} /> Novo restaurante</button></div><div className="stats-grid"><StatCard value="18" label="pedidos este mês" icon={<ShoppingBag size={17} />} /><StatCard value="R$ 846" label="faturamento estimado" icon={<span className="currency-icon">R$</span>} /><StatCard value="4,9" label="avaliação média" icon={<Star size={17} />} /></div><div className="admin-panels"><section className="admin-panel orders-panel"><div className="panel-heading"><div><span className="eyebrow">movimento recente</span><h2>Pedidos de hoje</h2></div><button className="link-button" type="button">Ver todos <ChevronRight size={15} /></button></div><div className="order-list">{orderExamples.map((order) => <div className="admin-order" key={order.id}><div className={`order-status order-status--${order.status.toLowerCase()}`}><span /></div><div className="admin-order__main"><strong>{order.id} · {order.customer}</strong><span>{order.items}</span></div><div className="admin-order__right"><strong>{formatPrice(order.total)}</strong><span>{order.time}</span></div><button className="more-button" type="button" aria-label="Mais opções"><MoreHorizontal size={17} /></button></div>)}</div></section><section className="admin-panel menu-panel"><div className="panel-heading"><div><span className="eyebrow">seu menu</span><h2>Visão rápida</h2></div><button className="more-button" type="button" aria-label="Mais opções"><MoreHorizontal size={17} /></button></div><div className="menu-preview-card"><div className="menu-preview-card__cover" style={{ background: demoRestaurant.coverTone }}><span>Y</span></div><div><strong>{demoRestaurant.name}</strong><span>menu digital · ativo</span></div><span className="active-label"><span /> ativo</span></div><div className="quick-lines"><div><span>produtos publicados</span><strong>20</strong></div><div><span>categorias</span><strong>4</strong></div><div><span>link do menu</span><strong className="green-text">copiar</strong></div></div><button className="secondary-button secondary-button--full" type="button" onClick={() => setActiveTab('menu')}>Editar cardápio <ChevronRight size={16} /></button></section></div></div>}
        {activeTab === 'menu' && <MenuEditor saved={saved} onSave={() => { setSaved(true); setTimeout(() => setSaved(false), 2500) }} />}
        {activeTab === 'restaurants' && <RestaurantsView />}
      </main>
    </div>
  )
}

function MenuEditor({ saved, onSave }: { saved: boolean; onSave: () => void }) {
  return <div className="admin-content"><div className="admin-heading"><div><span className="eyebrow">personalização</span><h1>Meu cardápio</h1><p>Deixe o menu com a cara do seu restaurante.</p></div><button className="primary-button" type="button" onClick={onSave}>{saved ? <><Check size={17} /> Salvo</> : 'Salvar alterações'}</button></div><div className="editor-layout"><section className="admin-panel editor-form"><div className="panel-heading"><div><span className="eyebrow">identidade</span><h2>Informações do menu</h2></div></div><div className="media-fields"><label className="media-field"><span className="media-thumb media-thumb--profile">Y</span><span><b>Foto de perfil</b><small>Quadrado com cantos suaves</small><input type="file" accept="image/*" /></span></label><label className="media-field"><span className="media-thumb media-thumb--cover" style={{ background: demoRestaurant.coverTone }} /><span><b>Capa do menu</b><small>Imagem que aparece no topo</small><input type="file" accept="image/*" /></span></label></div><label>Nome do restaurante<input defaultValue={demoRestaurant.name} /></label><label>Descrição<textarea defaultValue={demoRestaurant.description} rows={3} /></label><div className="form-row"><label>Localização<input defaultValue={demoRestaurant.location} /></label><label>Instagram<input defaultValue={demoRestaurant.instagram} /></label></div><div className="form-row"><label>Horário de funcionamento<input defaultValue={demoRestaurant.schedule} /></label><label>Cor de destaque<div className="color-picker"><span style={{ background: demoRestaurant.accent }} /> <input defaultValue={demoRestaurant.accent} /></div></label></div><div className="panel-heading panel-heading--products"><div><span className="eyebrow">itens do menu</span><h2>Produtos e preços</h2></div><button className="link-button" type="button"><Plus size={14} /> adicionar item</button></div><div className="product-editor-list">{products.slice(0, 4).map((product) => <div className="product-editor-row" key={product.id}><span className={`product-mini product-mini--${product.tone}`} /><div><input defaultValue={product.name} aria-label={`Nome de ${product.name}`} /><small>{categories.find((category) => category.id === product.category)?.label}</small></div><input className="price-input" defaultValue={product.price.toFixed(2).replace('.', ',')} aria-label={`Preço de ${product.name}`} /><button className="toggle-availability" type="button" aria-label={`Disponibilidade de ${product.name}`}><span /></button></div>)}</div></section><section className="admin-panel editor-preview"><div className="panel-heading"><div><span className="eyebrow">prévia</span><h2>Como seus clientes veem</h2></div></div><div className="phone-preview"><div className="phone-preview__top"><span className="phone-notch" /></div><div className="phone-preview__cover" style={{ background: demoRestaurant.coverTone }}><span>{demoRestaurant.logoLetter}</span></div><div className="phone-preview__body"><strong>{demoRestaurant.name}</strong><span>{demoRestaurant.location}</span><div className="preview-line" /><b>O que vai ser hoje?</b><div className="preview-product"><span /><div><strong>Japinha</strong><small>20 peças para compartilhar</small></div><b>R$ 40</b></div></div></div></section></div></div>
}

function RestaurantsView() {
  return <div className="admin-content"><div className="admin-heading"><div><span className="eyebrow">seus restaurantes</span><h1>Restaurantes</h1><p>Restaurantes e menus que você administra por aqui.</p></div><button className="primary-button" type="button"><Plus size={17} /> Criar restaurante</button></div><div className="restaurant-grid"><div className="restaurant-admin-card restaurant-admin-card--active"><div className="restaurant-admin-card__cover" style={{ background: demoRestaurant.coverTone }}><span>Y</span><b>ativo</b></div><div className="restaurant-admin-card__body"><div><strong>{demoRestaurant.name}</strong><span>{demoRestaurant.location}</span></div><button className="more-button" type="button" aria-label="Mais opções"><MoreHorizontal size={17} /></button><div className="restaurant-admin-card__footer"><span>20 produtos</span><span>18 pedidos</span><button className="link-button" type="button">Abrir <ChevronRight size={14} /></button></div></div></div><button className="new-restaurant-card" type="button"><span><Plus size={20} /></span><strong>Adicionar restaurante</strong><small>Para adicionar um novo negócio</small></button></div></div>
}

export default function App() {
  const [admin, setAdmin] = useState(() => window.location.pathname.startsWith('/admin'))
  if (admin) return <AdminView onBack={() => { window.history.pushState({}, '', '/'); setAdmin(false) }} />
  const slug = menuSlugFromPath(window.location.pathname)
  if (slug) return <MenuLoader slug={slug} />
  return <MenuView data={demoMenu} isDemo />
}
