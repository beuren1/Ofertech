import type { ArtTemplate, BulkProduct } from './bulk'
import type { FlyerDesign } from './flyers'

export const modelTypes = [
  ['/generator', 'Banners'],
  ['/bulk', 'Criação em massa'],
  ['/flyers', 'Encartes'],
  ['/print', 'Cartazes'],
  ['/labels', 'Etiquetas'],
  ['/stories', 'Stories'],
  ['/menus', 'Cardápios'],
  ['/videos', 'Vídeos'],
  ['/tv', 'TV de Ofertas'],
] as const

const themes = {
  mercado: { segment: 'Supermercado', artwork: 'grocery', flyer: 'grocery', background: '01_supermercado_verde' },
  moda: { segment: 'Moda', artwork: 'fashion', flyer: 'fashion', background: '08_moda_preto_dourado' },
  tech: { segment: 'Eletrônicos', artwork: 'electronics', flyer: 'electronics', background: '04_eletronicos_roxo' },
  farmacia: { segment: 'Farmácia', artwork: 'beauty', flyer: 'pharmacy', background: '06_farmacia_azul' },
  restaurante: { segment: 'Restaurantes', artwork: 'grocery', flyer: 'flash', background: '10_promocao_relampago' },
  lojas: { segment: 'Lojas', artwork: 'general', flyer: 'grocery', background: '09_varejo_azul_laranja' },
} satisfies Record<string, { segment: string; artwork: ArtTemplate; flyer: FlyerDesign['template']; background: string }>

const examples = [
  ['/generator', 'oferta-do-dia', 'Oferta do dia', 'mercado', [['Café especial', '18,90']]],
  ['/generator', 'nova-colecao', 'Nova coleção', 'moda', [['Tênis casual', '129,90']]],
  ['/generator', 'upgrade-gamer', 'Upgrade gamer', 'tech', [['Headset gamer', '159,90']]],
  ['/bulk', 'cesta-economica', 'Cesta econômica', 'mercado', [['Arroz 5 kg', '24,90'], ['Feijão 1 kg', '7,49'], ['Macarrão 500 g', '3,99']]],
  ['/bulk', 'rotina-de-cuidado', 'Rotina de cuidado', 'farmacia', [['Sabonete líquido', '12,90'], ['Creme hidratante', '26,90'], ['Protetor solar', '49,90']]],
  ['/bulk', 'acessorios-em-oferta', 'Acessórios em oferta', 'tech', [['Mouse sem fio', '59,90'], ['Teclado compacto', '99,90'], ['Cabo USB-C', '24,90']]],
  ['/flyers', 'encarte-do-mercado', 'Ofertas do mercado', 'mercado', [['Leite integral', '5,49'], ['Café torrado', '17,90'], ['Pão de forma', '8,90'], ['Suco de laranja', '9,90']]],
  ['/flyers', 'encarte-de-moda', 'Seleção de moda', 'moda', [['Vestido midi', '119,90'], ['Blusa de linho', '69,90'], ['Saia jeans', '79,90'], ['Bolsa pequena', '89,90']]],
  ['/flyers', 'encarte-de-tecnologia', 'Festival de tecnologia', 'tech', [['Monitor 24″', '549,90'], ['Webcam Full HD', '99,90'], ['Fone Bluetooth', '129,90'], ['SSD 480 GB', '189,90']]],
  ['/print', 'preco-da-semana', 'Preço da semana', 'mercado', [['Azeite extravirgem', '34,90']]],
  ['/print', 'vitrine-especial', 'Vitrine especial', 'moda', [['Jaqueta jeans', '149,90']]],
  ['/print', 'tecnologia-em-destaque', 'Tecnologia em destaque', 'tech', [['Caixa de som Bluetooth', '119,90']]],
  ['/labels', 'etiquetas-do-mercado', 'Preços do mercado', 'mercado', [['Arroz 5 kg', '24,90'], ['Feijão 1 kg', '7,49']]],
  ['/labels', 'etiquetas-de-farmacia', 'Preços de farmácia', 'farmacia', [['Sabonete líquido', '12,90'], ['Protetor solar', '49,90']]],
  ['/labels', 'etiquetas-de-moda', 'Preços de vitrine', 'moda', [['Camiseta básica', '39,90'], ['Calça jeans', '89,90']]],
  ['/stories', 'story-do-mercado', 'Oferta fresca', 'mercado', [['Morango 250 g', '8,90']]],
  ['/stories', 'story-da-farmacia', 'Cuidado todos os dias', 'farmacia', [['Kit de cuidados', '49,90']]],
  ['/stories', 'story-de-tecnologia', 'Tecnologia da semana', 'tech', [['Fone sem fio', '89,90']]],
  ['/stories', 'story-de-moda', 'Vitrine de moda', 'moda', [['Vestido floral', '129,90']]],
  ['/stories', 'story-de-restaurante', 'Especial da casa', 'restaurante', [['Hambúrguer artesanal', '32,90']]],
  ['/stories', 'story-de-loja', 'Achado do dia', 'lojas', [['Kit para presente', '79,90']]],
  ['/menus', 'menu-bistro', 'Bistrô da casa', 'restaurante', [['Risoto de cogumelos', '45,90'], ['Salada da casa', '27,90']]],
  ['/menus', 'menu-pizzaria', 'Forno da pizzaria', 'restaurante', [['Pizza margherita', '49,90'], ['Pizza calabresa', '52,90']]],
  ['/menus', 'menu-hamburgueria', 'Hambúrgueres e combos', 'restaurante', [['Combo artesanal', '39,90'], ['Batata crocante', '15,90']]],
  ['/menus', 'menu-bar', 'Petiscos do bar', 'restaurante', [['Porção de mandioca', '24,90'], ['Limonada', '9,90']]],
  ['/menus', 'menu-cafeteria', 'Café e companhia', 'restaurante', [['Capuccino', '12,90'], ['Bolo de chocolate', '13,90']]],
  ['/menus', 'menu-lanchonete', 'Lanches da tarde', 'restaurante', [['Sanduíche natural', '18,90'], ['Suco de laranja', '9,90']]],
  ['/videos', 'feira-de-ofertas', 'Feira de ofertas', 'mercado', [['Manga por kg', '5,90'], ['Uva sem sementes', '9,90'], ['Abacaxi', '6,49']]],
  ['/videos', 'passarela-de-precos', 'Passarela de preços', 'moda', [['Camiseta básica', '39,90'], ['Calça jeans', '89,90'], ['Bolsa tiracolo', '69,90']]],
  ['/videos', 'bem-estar-na-tv', 'Bem-estar na TV', 'farmacia', [['Shampoo suave', '19,90'], ['Kit de higiene', '29,90'], ['Hidratante corporal', '32,90']]],
  ['/tv', 'tv-hortifruti', 'Feira do dia na TV', 'mercado', [['Tomate por kg', '8,90'], ['Banana prata', '6,90']]],
  ['/tv', 'tv-tecnologia', 'Vitrine de tecnologia na TV', 'tech', [['Fone sem fio', '89,90'], ['Teclado gamer', '149,90']]],
  ['/tv', 'tv-farmacia', 'Cuidados em oferta na TV', 'farmacia', [['Protetor solar', '49,90'], ['Creme para mãos', '14,90']]],
] as const

export const galleryModels = examples.map(([path, id, name, theme, items]) => ({
  path, id, name, ...themes[theme],
  products: items.map(([name, price]): BulkProduct => ({
    name, price, originalPrice: '', category: themes[theme].segment, discount: '', imageUrl: '',
  })),
}))

export function findGalleryModel(path: string, search: string) {
  const id = new URLSearchParams(search).get('template')
  return galleryModels.find(model => model.path === path && model.id === id)
}
