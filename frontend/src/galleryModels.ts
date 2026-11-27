import type { ArtTemplate, BulkProduct } from './bulk'
import type { FlyerDesign } from './flyers'

export const modelTypes = [
  ['/generator', 'Banners'],
  ['/bulk', 'Criação em massa'],
  ['/flyers', 'Encartes'],
  ['/print', 'Cartazes'],
  ['/videos', 'Vídeos'],
] as const

const themes = {
  mercado: { segment: 'Supermercado', artwork: 'grocery', flyer: 'grocery', background: '01_supermercado_verde' },
  moda: { segment: 'Moda', artwork: 'fashion', flyer: 'fashion', background: '08_moda_preto_dourado' },
  tech: { segment: 'Eletrônicos', artwork: 'electronics', flyer: 'electronics', background: '04_eletronicos_roxo' },
  farmacia: { segment: 'Farmácia', artwork: 'beauty', flyer: 'pharmacy', background: '06_farmacia_azul' },
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
  ['/videos', 'feira-de-ofertas', 'Feira de ofertas', 'mercado', [['Manga por kg', '5,90'], ['Uva sem sementes', '9,90'], ['Abacaxi', '6,49']]],
  ['/videos', 'passarela-de-precos', 'Passarela de preços', 'moda', [['Camiseta básica', '39,90'], ['Calça jeans', '89,90'], ['Bolsa tiracolo', '69,90']]],
  ['/videos', 'bem-estar-na-tv', 'Bem-estar na TV', 'farmacia', [['Shampoo suave', '19,90'], ['Kit de higiene', '29,90'], ['Hidratante corporal', '32,90']]],
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
