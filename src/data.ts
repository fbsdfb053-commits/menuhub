export type ComplementOption = { id: number; name: string; price: number }
export type ComplementGroup = { id: number; name: string; description?: string; maxSelections?: number; options: ComplementOption[] }

export type Product = {
  id: number
  name: string
  description: string
  price: number
  category: string
  tone: string
  accent: string
  available: boolean
  imageUrl?: string
  complements?: ComplementGroup[]
}

export type Category = {
  id: string
  label: string
  count: number
}

export type Restaurant = {
  id: number
  name: string
  slug: string
  description: string
  location: string
  schedule: string
  instagram: string
  rating?: number
  reviewCount?: number
  isOpen: boolean
  logoLetter: string
  logoUrl?: string
  coverUrl?: string
  coverTone: string
  accent: string
}

export const demoRestaurant: Restaurant = {
  id: 1,
  name: 'Yamamoto Sushibar',
  slug: 'yamamoto-sushibar',
  description: 'Sushi artesanal, combinado fresquinho e carinho em cada pedido.',
  location: 'Centro · Mulungu',
  schedule: 'Hoje, das 12h às 22h',
  instagram: '@yamamoto_sushibar',
  rating: 4.9,
  reviewCount: 86,
  isOpen: true,
  logoLetter: 'Y',
  coverTone: 'linear-gradient(120deg, #3b211a 0%, #83533d 48%, #d29a64 100%)',
  accent: '#b8794d',
}

export const categories: Category[] = [
  { id: 'combos', label: 'Combinados', count: 6 },
  { id: 'temaki', label: 'Temakis', count: 4 },
  { id: 'bebidas', label: 'Bebidas', count: 5 },
  { id: 'extras', label: 'Extras', count: 5 },
]

export const products: Product[] = [
  { id: 1, name: 'Japinha', description: '20 peças para compartilhar sem pressa.', price: 40, category: 'combos', tone: 'sunset', accent: '#e59c54', available: true },
  { id: 2, name: 'Entusiasta', description: '15 peças com salmão, kani e crocantes.', price: 30, category: 'combos', tone: 'ocean', accent: '#9bc8bf', available: true },
  { id: 3, name: 'Samurai', description: '30 peças para matar a vontade de sushi.', price: 60, category: 'combos', tone: 'night', accent: '#dd8d6b', available: true },
  { id: 4, name: 'Hot ball', description: '10 unidades quentinhas e crocantes.', price: 25, category: 'combos', tone: 'ember', accent: '#efb05d', available: true },
  { id: 5, name: 'Temaki hot · Camarão', description: 'Camarão cremoso e toque picante.', price: 13, category: 'temaki', tone: 'coral', accent: '#f08d72', available: true },
  { id: 6, name: 'Temaki · Salmão', description: 'Salmão, arroz temperado e cebolinha.', price: 13, category: 'temaki', tone: 'salmon', accent: '#f3aa87', available: true },
  { id: 7, name: 'Coca-Cola lata', description: '350 ml bem gelada.', price: 5, category: 'bebidas', tone: 'cola', accent: '#e46e5e', available: true },
  { id: 8, name: 'Fanta Laranja', description: '350 ml bem gelada.', price: 5, category: 'bebidas', tone: 'orange', accent: '#e6a24d', available: true },
  { id: 9, name: 'Molho tarê', description: 'Porção extra.', price: 0.5, category: 'extras', tone: 'soy', accent: '#a67654', available: true },
  { id: 10, name: 'Wasabi', description: 'Raiz forte para completar.', price: 0.5, category: 'extras', tone: 'wasabi', accent: '#9dbb78', available: true },
]

export const orderExamples = [
  { id: '#1048', customer: 'Camila S.', items: 'Japinha · 1x', total: 40, status: 'Novo', time: 'agora' },
  { id: '#1047', customer: 'Rafael M.', items: 'Temaki hot · 2x', total: 26, status: 'Preparando', time: 'há 8 min' },
  { id: '#1046', customer: 'Lívia A.', items: 'Entusiasta · 1x + Coca · 1x', total: 35, status: 'Pronto', time: 'há 21 min' },
]
