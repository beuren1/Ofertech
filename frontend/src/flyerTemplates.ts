import type { FlyerDesign } from './flyers'

export const flyerCategories = ['Supermercado', 'Farmácia', 'Eletrônicos', 'Moda', 'Atacarejo', 'Datas comemorativas'] as const

type FlyerTemplate = [id: string, name: string, category: typeof flyerCategories[number], design: FlyerDesign['template'], title: string]

export const flyerTemplates: readonly FlyerTemplate[] = [
  ['01_supermercado_verde', 'Supermercado verde', 'Supermercado', 'grocery', 'Ofertas da semana'],
  ['02_supermercado_vermelho', 'Supermercado vermelho', 'Supermercado', 'grocery', 'Festival de preços'],
  ['03_eletronicos_azul', 'Eletrônicos azul', 'Eletrônicos', 'electronics', 'Festival de tecnologia'],
  ['04_eletronicos_roxo', 'Eletrônicos roxo', 'Eletrônicos', 'electronics', 'Ofertas gamer'],
  ['05_farmacia_verde', 'Farmácia verde', 'Farmácia', 'pharmacy', 'Saúde e bem-estar'],
  ['06_farmacia_azul', 'Farmácia azul', 'Farmácia', 'pharmacy', 'Cuidado em oferta'],
  ['07_moda_rosa', 'Moda rosa', 'Moda', 'fashion', 'Nova coleção'],
  ['08_moda_preto_dourado', 'Moda preto e dourado', 'Moda', 'fashion', 'Seleção de moda'],
  ['09_varejo_azul_laranja', 'Varejo azul e laranja', 'Atacarejo', 'grocery', 'Economia no atacado'],
  ['10_promocao_relampago', 'Promoção relâmpago', 'Datas comemorativas', 'flash', 'Black Friday'],
  ['10_promocao_relampago_natal', 'Ofertas de Natal', 'Datas comemorativas', 'flash', 'Ofertas de Natal'],
]

export function flyerTemplateImage(id: string) {
  const asset = id === '10_promocao_relampago_natal' ? '10_promocao_relampago' : id
  return `${import.meta.env.BASE_URL}flyer-backgrounds/${asset}.jpg`
}
