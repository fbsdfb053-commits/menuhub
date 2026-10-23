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
import { createOrder, fetchMenu, uploadMenuImage, type MenuData, type OrderForm, type OrderItem } from './lib/api'
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
    // Use the canonical production URL so OAuth never returns to a Vercel preview or alternate domain.
    const redirectTo = window.location.hostname === 'localhost'
      ? `${window.location.origin}/admin`
      : 'https://menuhub-one.vercel.app/admin'
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

type AdminRestaurant = { id:number; nome:string; slug:string; descricao:string|null; localizacao:string|null; horario:string|null; instagram:string|null; cor_destaque:string|null; logo_url:string|null; capa_url:string|null; ativo:boolean; aceita_pedidos:boolean }
type AdminCategory = { id:number; nome:string; ordem:number }
type AdminProduct = { id:number; nome:string; descricao:string|null; preco:number; categoria_id:number|null; imagem_url:string|null; disponivel:boolean; ordem:number }
type AdminOrder = { id:number; cliente_nome:string; cliente_whatsapp:string; total:number; status:string; tipo_entrega:string; endereco_entrega:string|null; criado_em:string }
function makeSlug(value:string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,55) }
function AdminView({ onBack }: { onBack: () => void }) {
  const [session,setSession]=useState<Session|null>(null), [authLoading,setAuthLoading]=useState(true), [activeTab,setActiveTab]=useState('dashboard')
  const [restaurants,setRestaurants]=useState<AdminRestaurant[]>([]), [selectedId,setSelectedId]=useState<number|null>(null)
  const [cats,setCats]=useState<AdminCategory[]>([]), [items,setItems]=useState<AdminProduct[]>([]), [orders,setOrders]=useState<AdminOrder[]>([])
  const [busy,setBusy]=useState(false), [notice,setNotice]=useState(''), [noticeError,setNoticeError]=useState(false)
  const [showCreate,setShowCreate]=useState(false), [newName,setNewName]=useState(''), [newDesc,setNewDesc]=useState(''), [newLocation,setNewLocation]=useState('')
  const [newCat,setNewCat]=useState(''), [newItem,setNewItem]=useState({nome:'',descricao:'',preco:'',categoria_id:'',imagem_url:''})
  const selected=restaurants.find(r=>r.id===selectedId)??null
  const notify=(message:string,error=false)=>{setNotice(message);setNoticeError(error);window.setTimeout(()=>setNotice(''),5000)}
  useEffect(()=>{let alive=true;if(!hasSupabaseConfig){setAuthLoading(false);return}void supabase.auth.getSession().then(({data})=>{if(alive){setSession(data.session);setAuthLoading(false)}});const {data:listener}=supabase.auth.onAuthStateChange((_event,next)=>{if(alive){setSession(next);setAuthLoading(false)}});return()=>{alive=false;listener.subscription.unsubscribe()}},[])
  const loadRestaurants=async()=>{setBusy(true);const {data,error}=await supabase.from('empresas').select('id,nome,slug,descricao,localizacao,horario,instagram,cor_destaque,logo_url,capa_url,ativo,aceita_pedidos').order('criado_em',{ascending:false});setBusy(false);if(error){notify('Erro ao carregar restaurantes. Confira se o SQL do projeto foi executado no Supabase.',true);return}const list=(data??[]) as AdminRestaurant[];setRestaurants(list);setSelectedId(old=>old&&list.some(r=>r.id===old)?old:(list[0]?.id??null))}
  useEffect(()=>{if(session)void loadRestaurants()},[session])
  const loadDetails=async(id:number)=>{setBusy(true);const [c,p,o]=await Promise.all([supabase.from('categorias').select('id,nome,ordem').eq('empresa_id',id).order('ordem'),supabase.from('produtos').select('id,nome,descricao,preco,categoria_id,imagem_url,disponivel,ordem').eq('empresa_id',id).order('ordem'),supabase.from('pedidos').select('id,cliente_nome,cliente_whatsapp,total,status,tipo_entrega,endereco_entrega,criado_em').eq('empresa_id',id).order('criado_em',{ascending:false}).limit(100)]);setBusy(false);if(c.error||p.error||o.error){notify('Erro ao carregar os dados. Verifique a estrutura do banco no Supabase.',true);return}setCats((c.data??[]) as AdminCategory[]);setItems((p.data??[]) as AdminProduct[]);setOrders((o.data??[]) as AdminOrder[])}
  useEffect(()=>{if(session&&selectedId!==null)void loadDetails(selectedId);else{setCats([]);setItems([]);setOrders([])}},[session,selectedId])
  const createRestaurant=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!session?.user||newName.trim().length<2)return;setBusy(true);const base=makeSlug(newName)||'meu-menu';let slug=base,n=2;while(restaurants.some(r=>r.slug===slug)){slug=base+'-'+n++}const {data,error}=await supabase.from('empresas').insert({nome:newName.trim(),slug,descricao:newDesc.trim()||null,localizacao:newLocation.trim()||null,dono_id:session.user.id,cor_destaque:'#0e4f59',ativo:true,aceita_pedidos:true}).select('id,nome,slug,descricao,localizacao,horario,instagram,cor_destaque,logo_url,capa_url,ativo,aceita_pedidos').single();setBusy(false);if(error){notify('Não foi possível criar: '+error.message,true);return}const r=data as AdminRestaurant;setRestaurants(old=>[r,...old]);setSelectedId(r.id);setNewName('');setNewDesc('');setNewLocation('');setShowCreate(false);setActiveTab('menu');notify('Restaurante criado!')}
  const saveRestaurant=async(e:React.FormEvent<HTMLFormElement>,form:Record<string,unknown>)=>{e.preventDefault();if(!selected)return;setBusy(true);const {error}=await supabase.from('empresas').update(form).eq('id',selected.id);setBusy(false);if(error){notify('Erro ao salvar: '+error.message,true);return}setRestaurants(old=>old.map(r=>r.id===selected.id?{...r,...form} as AdminRestaurant:r));notify('Informações salvas.')}
  const addCategory=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!selected||!newCat.trim())return;const {data,error}=await supabase.from('categorias').insert({empresa_id:selected.id,nome:newCat.trim(),ordem:cats.length+1}).select('id,nome,ordem').single();if(error){notify('Erro ao criar categoria: '+error.message,true);return}setCats(old=>[...old,data as AdminCategory]);setNewCat('');notify('Categoria criada.')}
  const addProduct=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!selected||!newItem.nome.trim()||!Number.isFinite(Number(newItem.preco.replace(',','.')))||Number(newItem.preco.replace(',','.'))<0){notify('Informe nome e preço válido.',true);return}setBusy(true);const {data,error}=await supabase.from('produtos').insert({empresa_id:selected.id,nome:newItem.nome.trim(),descricao:newItem.descricao.trim()||null,preco:Number(newItem.preco.replace(',','.')),categoria_id:newItem.categoria_id?Number(newItem.categoria_id):null,imagem_url:newItem.imagem_url.trim()||null,disponivel:true,ordem:items.length+1}).select('id,nome,descricao,preco,categoria_id,imagem_url,disponivel,ordem').single();setBusy(false);if(error){notify('Erro ao cadastrar produto: '+error.message,true);return}setItems(old=>[...old,data as AdminProduct]);setNewItem({nome:'',descricao:'',preco:'',categoria_id:'',imagem_url:''});notify('Produto cadastrado.')}
  const updateProduct=async(p:AdminProduct,patch:Partial<AdminProduct>)=>{const {error}=await supabase.from('produtos').update(patch).eq('id',p.id);if(error){notify('Erro ao atualizar produto: '+error.message,true);return}setItems(old=>old.map(x=>x.id===p.id?{...x,...patch}:x));notify('Produto atualizado.')}
  const deleteProduct=async(p:AdminProduct)=>{if(!window.confirm('Excluir o produto '+p.nome+'?'))return;const {error}=await supabase.from('produtos').delete().eq('id',p.id);if(error){notify('Erro ao excluir: '+error.message,true);return}setItems(old=>old.filter(x=>x.id!==p.id));notify('Produto excluído.')}
  const updateOrder=async(o:AdminOrder,status:string)=>{const {error}=await supabase.from('pedidos').update({status}).eq('id',o.id);if(error){notify('Erro ao atualizar pedido: '+error.message,true);return}setOrders(old=>old.map(x=>x.id===o.id?{...x,status}:x))}
  if(authLoading)return <div className="auth-shell"><div className="auth-card auth-card--loading"><div className="auth-mark">F</div><p>Verificando sua conta…</p></div></div>
  if(!hasSupabaseConfig)return <StatusScreen message="Configure SUPABASE_URL e SUPABASE_ANON_KEY nas variáveis da Vercel."/>
  if(!session)return <AdminLoginScreen onBack={onBack}/>
  const nav=(id:string,label:string,icon:React.ReactNode)=><button className={activeTab===id?'admin-nav__link admin-nav__link--active':'admin-nav__link'} onClick={()=>setActiveTab(id)} type="button">{icon}{label}</button>
  return <div className="admin-shell">
    <aside className="admin-sidebar"><div className="admin-brand"><span className="brand-mark">F</span><div><b>FB3d2y</b><span>Menu</span></div></div><div className="workspace-label">meus menus</div><div className="restaurant-switcher"><span className="restaurant-switcher__avatar">{selected?.nome.charAt(0)??'+'}</span><div><strong>{selected?.nome??'Nenhum restaurante'}</strong><span>{selected?.slug??'Crie seu menu'}</span></div></div><nav className="admin-nav">{nav('dashboard','Visão geral',<LayoutDashboard size={17}/>)}{nav('menu','Meu cardápio',<Utensils size={17}/>)}{nav('restaurants','Restaurantes',<Store size={17}/>)}{nav('orders','Pedidos',<ShoppingBag size={17}/>)}</nav><div className="sidebar-bottom"><div className="profile-chip"><span>{(session.user.email??'U').charAt(0).toUpperCase()}</span><div><strong>{session.user.user_metadata?.full_name??session.user.email}</strong><small>conta conectada</small></div></div><button className="admin-nav__link" type="button" onClick={()=>void supabase.auth.signOut()}><ArrowLeft size={17}/> Sair da conta</button></div></aside>
    <main className="admin-main"><header className="admin-topbar"><button className="back-link" type="button" onClick={onBack}><ArrowLeft size={17}/> Ver menu público</button><div className="admin-topbar__right"><span className="private-tag"><span/> espaço privado</span><span className="account-link">{session.user.email}</span></div></header>
    {notice&&<div className="admin-content"><p className={noticeError?'form-error':'green-text'}>{notice}</p></div>}{busy&&<div className="admin-content"><small>Atualizando dados…</small></div>}
    {activeTab==='dashboard'&&<div className="admin-content"><div className="admin-heading"><div><span className="eyebrow">painel de controle</span><h1>Seus menus, em um só lugar.</h1><p>Gerencie restaurantes, produtos e pedidos.</p></div><button className="primary-button" type="button" onClick={()=>{setShowCreate(true);setActiveTab('restaurants')}}><Plus size={17}/> Novo restaurante</button></div><div className="stats-grid"><StatCard value={String(restaurants.length)} label="restaurantes" icon={<Store size={17}/>} /><StatCard value={String(items.length)} label="produtos neste menu" icon={<Utensils size={17}/>} /><StatCard value={String(orders.filter(o=>!['Concluído','Cancelado'].includes(o.status)).length)} label="pedidos em andamento" icon={<ShoppingBag size={17}/>} /></div><div className="admin-panels"><section className="admin-panel orders-panel"><div className="panel-heading"><div><span className="eyebrow">atividade</span><h2>Pedidos recentes</h2></div><button className="link-button" type="button" onClick={()=>setActiveTab('orders')}>Ver todos <ChevronRight size={15}/></button></div>{orders.length===0?<p>Ainda não há pedidos neste restaurante.</p>:orders.slice(0,5).map(o=><div className="admin-order" key={o.id}><div className="order-status"><span/></div><div className="admin-order__main"><strong>#{o.id} · {o.cliente_nome}</strong><span>{o.tipo_entrega} · {new Date(o.criado_em).toLocaleString('pt-BR')}</span></div><div className="admin-order__right"><strong>{formatPrice(Number(o.total))}</strong><span>{o.status}</span></div></div>)}</section><section className="admin-panel menu-panel"><div className="panel-heading"><div><span className="eyebrow">menu selecionado</span><h2>{selected?.nome??'Comece por aqui'}</h2></div></div>{selected?<><p>Link do cardápio:</p><a className="green-text" href={'/menu/'+selected.slug} target="_blank" rel="noreferrer">{window.location.origin+'/menu/'+selected.slug}</a><button className="secondary-button secondary-button--full" type="button" onClick={()=>setActiveTab('menu')}>Editar cardápio <ChevronRight size={16}/></button></>:<button className="primary-button" type="button" onClick={()=>{setShowCreate(true);setActiveTab('restaurants')}}>Criar primeiro restaurante</button>}</section></div></div>}
    {activeTab==='restaurants'&&<div className="admin-content"><div className="admin-heading"><div><span className="eyebrow">seus negócios</span><h1>Restaurantes</h1><p>Crie e gerencie os cardápios dos seus negócios.</p></div><button className="primary-button" type="button" onClick={()=>setShowCreate(v=>!v)}><Plus size={17}/> Criar restaurante</button></div>{showCreate&&<form className="admin-panel admin-create-form" onSubmit={e=>void createRestaurant(e)}><h2>Novo restaurante</h2><label>Nome<input required minLength={2} maxLength={255} value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Ex.: Cantinho da Pizza"/></label><label>Descrição<textarea value={newDesc} onChange={e=>setNewDesc(e.target.value)} maxLength={1000}/></label><label>Localização<input value={newLocation} onChange={e=>setNewLocation(e.target.value)} maxLength={255} placeholder="Bairro, cidade"/></label><div className="form-row"><button className="primary-button" type="submit" disabled={busy}>Criar menu</button><button className="secondary-button" type="button" onClick={()=>setShowCreate(false)}>Cancelar</button></div></form>}{restaurants.length===0?<section className="admin-panel"><p>Você ainda não criou um restaurante. Clique em “Criar restaurante” para começar.</p></section>:<div className="restaurant-grid">{restaurants.map(r=><article className={r.id===selectedId?'restaurant-admin-card restaurant-admin-card--active':'restaurant-admin-card'} key={r.id}><div className="restaurant-admin-card__cover" style={{background:r.capa_url?'url('+r.capa_url+') center/cover':(r.cor_destaque??'#0e4f59')}}><span>{r.nome.charAt(0).toUpperCase()}</span><b>{r.ativo?'ativo':'inativo'}</b></div><div className="restaurant-admin-card__body"><div><strong>{r.nome}</strong><span>{r.localizacao||'Localização não informada'}</span><small>/menu/{r.slug}</small></div><div className="restaurant-admin-card__footer"><button className="link-button" type="button" onClick={()=>{setSelectedId(r.id);setActiveTab('menu')}}>Gerenciar <ChevronRight size={14}/></button><a className="link-button" href={'/menu/'+r.slug} target="_blank" rel="noreferrer">Ver menu</a></div></div></article>)}</div>}</div>}
    {activeTab==='menu'&&<div className="admin-content"><div className="admin-heading"><div><span className="eyebrow">personalização</span><h1>Meu cardápio</h1><p>Edite as informações e os produtos do menu.</p></div>{selected&&<a className="secondary-button" href={'/menu/'+selected.slug} target="_blank" rel="noreferrer">Ver menu público</a>}</div>{restaurants.length>1&&<label className="restaurant-select-label">Restaurante<select value={selectedId??''} onChange={e=>setSelectedId(Number(e.target.value))}>{restaurants.map(r=><option key={r.id} value={r.id}>{r.nome}</option>)}</select></label>}{!selected?<section className="admin-panel"><p>Crie um restaurante na aba Restaurantes para começar.</p><button className="primary-button" type="button" onClick={()=>{setShowCreate(true);setActiveTab('restaurants')}}>Criar restaurante</button></section>:<><RestaurantSettings key={selected.id} restaurant={selected} saving={busy} onSave={saveRestaurant}/><section className="admin-panel admin-data-panel"><div className="panel-heading"><div><span className="eyebrow">organização</span><h2>Categorias</h2></div></div><form className="inline-create-form" onSubmit={e=>void addCategory(e)}><input value={newCat} onChange={e=>setNewCat(e.target.value)} placeholder="Nome da categoria" maxLength={100} required/><button className="primary-button" type="submit"><Plus size={16}/> Adicionar</button></form>{cats.map(c=><div className="category-admin-row" key={c.id}><span>{c.nome}</span><button className="link-button" type="button" onClick={async()=>{const name=window.prompt('Novo nome da categoria:',c.nome);if(!name?.trim())return;const {error}=await supabase.from('categorias').update({nome:name.trim()}).eq('id',c.id);if(error)notify(error.message,true);else{setCats(old=>old.map(x=>x.id===c.id?{...x,nome:name.trim()}:x));notify('Categoria renomeada.')}}}>Renomear</button><button className="link-button" type="button" onClick={async()=>{if(!window.confirm('Excluir a categoria '+c.nome+'?'))return;const {error}=await supabase.from('categorias').delete().eq('id',c.id);if(error)notify(error.message,true);else{setCats(old=>old.filter(x=>x.id!==c.id));setItems(old=>old.map(p=>p.categoria_id===c.id?{...p,categoria_id:null}:p));notify('Categoria excluída.')}}}>Excluir</button></div>)}</section><section className="admin-panel admin-data-panel"><div className="panel-heading"><div><span className="eyebrow">itens do menu</span><h2>Produtos e preços</h2></div><span>{items.length} produtos</span></div><form className="admin-product-form" onSubmit={e=>void addProduct(e)}><h3>Adicionar produto</h3><label>Nome<input required maxLength={255} value={newItem.nome} onChange={e=>setNewItem({...newItem,nome:e.target.value})} placeholder="Ex.: Pizza calabresa"/></label><label>Descrição<textarea maxLength={1000} value={newItem.descricao} onChange={e=>setNewItem({...newItem,descricao:e.target.value})}/></label><div className="form-row"><label>Preço (R$)<input required inputMode="decimal" value={newItem.preco} onChange={e=>setNewItem({...newItem,preco:e.target.value})} placeholder="29,90"/></label><label>Categoria<select value={newItem.categoria_id} onChange={e=>setNewItem({...newItem,categoria_id:e.target.value})}><option value="">Sem categoria</option>{cats.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></label></div><label>URL da foto (opcional)<input type="url" value={newItem.imagem_url} onChange={e=>setNewItem({...newItem,imagem_url:e.target.value})} placeholder="https://..."/></label><label>Ou enviar foto do computador (máx. 5 MB)<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={async e=>{const file=e.target.files?.[0];if(!file||!selected)return;try{setBusy(true);const url=await uploadMenuImage(file,selected.id);setNewItem(old=>({...old,imagem_url:url}));notify('Foto enviada. Salve o produto para aplicar.')}catch(err){notify(err instanceof Error?err.message:'Erro ao enviar foto.',true)}finally{setBusy(false);e.target.value=''}}}/></label><button className="primary-button" type="submit" disabled={busy}><Plus size={16}/> Cadastrar produto</button></form>{items.length===0?<p>Nenhum produto cadastrado ainda.</p>:items.map(p=><ProductAdminRow key={p.id} product={p} restaurantId={selected.id} categories={cats} onSave={updateProduct} onDelete={deleteProduct}/>)}</section></>}</div>}
    {activeTab==='orders'&&<div className="admin-content"><div className="admin-heading"><div><span className="eyebrow">acompanhamento</span><h1>Pedidos</h1><p>Pedidos recebidos pelo restaurante selecionado.</p></div><button className="secondary-button" type="button" onClick={()=>selectedId!==null&&void loadDetails(selectedId)}>Atualizar</button></div>{restaurants.length>1&&<label className="restaurant-select-label">Restaurante<select value={selectedId??''} onChange={e=>setSelectedId(Number(e.target.value))}>{restaurants.map(r=><option key={r.id} value={r.id}>{r.nome}</option>)}</select></label>}{orders.length===0?<section className="admin-panel">Nenhum pedido recebido ainda.</section>:<section className="admin-panel">{orders.map(o=><article className="admin-order-card" key={o.id}><div><span className="eyebrow">pedido #{o.id} · {new Date(o.criado_em).toLocaleString('pt-BR')}</span><h3>{o.cliente_nome}</h3><p>{o.cliente_whatsapp} · {o.tipo_entrega}{o.endereco_entrega?' · '+o.endereco_entrega:''}</p><strong>{formatPrice(Number(o.total))}</strong></div><label>Status<select value={o.status} onChange={e=>void updateOrder(o,e.target.value)}>{['Novo','Preparando','Pronto','Concluído','Cancelado'].map(s=><option key={s}>{s}</option>)}</select></label></article>)}</section>}</div>}
    </main></div>
}
function RestaurantSettings({restaurant,saving,onSave}:{restaurant:AdminRestaurant;saving:boolean;onSave:(e:React.FormEvent<HTMLFormElement>,form:Record<string,unknown>)=>Promise<void>}) {
  const [form,setForm]=useState({nome:restaurant.nome,descricao:restaurant.descricao??'',localizacao:restaurant.localizacao??'',horario:restaurant.horario??'',instagram:restaurant.instagram??'',cor_destaque:restaurant.cor_destaque??'#0e4f59',logo_url:restaurant.logo_url??'',capa_url:restaurant.capa_url??'',aceita_pedidos:restaurant.aceita_pedidos,ativo:restaurant.ativo})
  useEffect(()=>{setForm({nome:restaurant.nome,descricao:restaurant.descricao??'',localizacao:restaurant.localizacao??'',horario:restaurant.horario??'',instagram:restaurant.instagram??'',cor_destaque:restaurant.cor_destaque??'#0e4f59',logo_url:restaurant.logo_url??'',capa_url:restaurant.capa_url??'',aceita_pedidos:restaurant.aceita_pedidos,ativo:restaurant.ativo})},[restaurant])
  const textField=(key:'nome'|'descricao'|'localizacao'|'horario'|'instagram'|'logo_url'|'capa_url',label:string,placeholder='')=><label>{label}{key==='descricao'?<textarea value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})} rows={3}/>:<input value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})} placeholder={placeholder}/>}</label>
  return <form className="admin-panel admin-settings-form" onSubmit={e=>void onSave(e,form)}><div className="panel-heading"><div><span className="eyebrow">identidade</span><h2>Informações do menu</h2></div><span>/menu/{restaurant.slug}</span></div>{textField('nome','Nome do restaurante')}{textField('descricao','Descrição')}<div className="form-row">{textField('localizacao','Localização')}{textField('instagram','Instagram','@seurestaurante')}</div>{textField('horario','Horário de funcionamento','Seg a sáb, 18h às 23h')}<div className="form-row">{textField('logo_url','URL da foto de perfil','https://...')}{textField('capa_url','URL da imagem de capa','https://...')}</div><div className="form-row"><label>Enviar foto de perfil<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{const url=await uploadMenuImage(file,restaurant.id);setForm(old=>({...old,logo_url:url}));notifyUploadDone()}catch(err){window.alert(err instanceof Error?err.message:'Erro ao enviar imagem.')}finally{e.target.value=''}}}/></label><label>Enviar imagem de capa<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{const url=await uploadMenuImage(file,restaurant.id);setForm(old=>({...old,capa_url:url}));notifyUploadDone()}catch(err){window.alert(err instanceof Error?err.message:'Erro ao enviar imagem.')}finally{e.target.value=''}}}/></label></div><div className="form-row"><label>Cor de destaque<input type="color" value={/^#[0-9a-f]{6}$/i.test(form.cor_destaque)?form.cor_destaque:'#0e4f59'} onChange={e=>setForm({...form,cor_destaque:e.target.value})}/></label><label className="admin-check-label"><input type="checkbox" checked={form.aceita_pedidos} onChange={e=>setForm({...form,aceita_pedidos:e.target.checked})}/> Aceitar pedidos</label><label className="admin-check-label"><input type="checkbox" checked={form.ativo} onChange={e=>setForm({...form,ativo:e.target.checked})}/> Menu publicado</label></div><button className="primary-button" type="submit" disabled={saving}>{saving?'Salvando…':'Salvar informações'}</button></form>
}
function ProductAdminRow({product,restaurantId,categories,onSave,onDelete}:{product:AdminProduct;restaurantId:number;categories:AdminCategory[];onSave:(p:AdminProduct,patch:Partial<AdminProduct>)=>Promise<void>;onDelete:(p:AdminProduct)=>Promise<void>}) {
  const [editing,setEditing]=useState(false),[form,setForm]=useState({nome:product.nome,descricao:product.descricao??'',preco:String(product.preco).replace('.',','),categoria_id:product.categoria_id?String(product.categoria_id):'',imagem_url:product.imagem_url??'',disponivel:product.disponivel})
  useEffect(()=>{setForm({nome:product.nome,descricao:product.descricao??'',preco:String(product.preco).replace('.',','),categoria_id:product.categoria_id?String(product.categoria_id):'',imagem_url:product.imagem_url??'',disponivel:product.disponivel})},[product])
  return <article className="admin-product-row">{product.imagem_url?<img className="admin-product-image" src={product.imagem_url} alt=""/>:<span className="admin-product-placeholder"><Utensils size={17}/></span>}<div className="admin-product-row__content">{editing?<><label>Nome<input value={form.nome} onChange={e=>setForm({...form,nome:e.target.value})}/></label><label>Descrição<textarea value={form.descricao} onChange={e=>setForm({...form,descricao:e.target.value})}/></label><div className="form-row"><label>Preço<input value={form.preco} onChange={e=>setForm({...form,preco:e.target.value})}/></label><label>Categoria<select value={form.categoria_id} onChange={e=>setForm({...form,categoria_id:e.target.value})}><option value="">Sem categoria</option>{categories.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></label></div><label>URL da foto<input value={form.imagem_url} onChange={e=>setForm({...form,imagem_url:e.target.value})}/></label><label>Ou enviar foto (máx. 5 MB)<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{const url=await uploadMenuImage(file,restaurantId);setForm(old=>({...old,imagem_url:url}));window.alert('Foto enviada. Clique em Salvar para aplicar.')}catch(err){window.alert(err instanceof Error?err.message:'Erro ao enviar foto.')}finally{e.target.value=''}}}/></label><label className="admin-check-label"><input type="checkbox" checked={form.disponivel} onChange={e=>setForm({...form,disponivel:e.target.checked})}/> Disponível no menu</label><div className="form-row"><button className="primary-button" type="button" onClick={()=>{const price=Number(form.preco.replace(',','.'));if(!form.nome.trim()||!Number.isFinite(price)||price<0){notifyProductError();return}void onSave(product,{nome:form.nome.trim(),descricao:form.descricao.trim()||null,preco:price,categoria_id:form.categoria_id?Number(form.categoria_id):null,imagem_url:form.imagem_url.trim()||null,disponivel:form.disponivel}).then(()=>setEditing(false))}}>Salvar</button><button className="secondary-button" type="button" onClick={()=>setEditing(false)}>Cancelar</button></div></>:<><div className="admin-product-row__heading"><strong>{product.nome}</strong><b>{formatPrice(Number(product.preco))}</b></div><p>{product.descricao||'Sem descrição'}</p><small>{categories.find(c=>c.id===product.categoria_id)?.nome??'Sem categoria'} · {product.disponivel?'Disponível':'Indisponível'}</small><div className="admin-product-actions"><button className="link-button" type="button" onClick={()=>setEditing(true)}>Editar</button><button className="link-button" type="button" onClick={()=>void onDelete(product)}>Excluir</button></div></>}</div></article>
}
function notifyProductError(){window.alert('Informe o nome e um preço válido.')} function notifyUploadDone(){window.alert('Imagem enviada. Clique em “Salvar informações” para guardar a alteração.')}
function HomePage() {
  useEffect(() => { document.title = 'FB3d2y Menu — Seu cardápio digital' }, [])
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
              <a className="home-secondary-button" href="/demo">Ver exemplo de cardápio</a>
            </div>
            <div className="home-trust"><span><Check size={15}/> Personalize seus produtos</span><span><Check size={15}/> Gerencie seus pedidos</span></div>
          </div>
          <div className="home-preview" aria-label="Prévia ilustrativa do painel">
            <div className="preview-window">
              <div className="preview-top"><span className="preview-dots"><i/><i/><i/></span><span>SEU ESPAÇO DE TRABALHO</span><span className="preview-live"><i/> online</span></div>
              <div className="preview-content">
                <div className="preview-welcome"><span className="eyebrow">PAINEL DO SEU NEGÓCIO</span><h2>Bom ter você por aqui.</h2><p>Seu cardápio começa com uma ideia.</p></div>
                <div className="preview-stats"><div><span>MENUS</span><strong>01</strong><small>seu negócio</small></div><div><span>PRODUTOS</span><strong>12</strong><small>no cardápio</small></div></div>
                <div className="preview-menu-row"><span className="preview-menu-icon"><Utensils size={18}/></span><div><strong>Meu cardápio</strong><small>Produtos, preços e categorias</small></div><ChevronRight size={17}/></div>
                <div className="preview-menu-row"><span className="preview-menu-icon preview-menu-icon--gold"><ShoppingBag size={18}/></span><div><strong>Pedidos</strong><small>Acompanhe cada novo pedido</small></div><ChevronRight size={17}/></div>
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
      <footer className="home-footer"><a className="brand" href="/"><span className="brand-mark">F</span><span>FB3d2y <b>Menu</b></span></a><span>Cardápios próximos, pedidos simples.</span><a href="/demo">Conhecer o exemplo <ArrowLeft size={14}/></a></footer>
    </div>
  )
}

export default function App() {
  const path = window.location.pathname
  const [admin, setAdmin] = useState(() => path.startsWith('/admin'))
  if (admin) return <AdminView onBack={() => { window.history.pushState({}, '', '/'); setAdmin(false) }} />
  const slug = menuSlugFromPath(path)
  if (slug) return <MenuLoader slug={slug} />
  if (path === '/demo' || path === '/demo/') return <MenuView data={demoMenu} isDemo />
  return <HomePage />
}
