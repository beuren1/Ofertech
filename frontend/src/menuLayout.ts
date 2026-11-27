import { PAPER, PRINT_DPI, paperPixels } from './printLayout'

export const MENU_FORMATS = [
  ['a4', 'A4 para impressão'],
  ['mobile', 'Digital vertical'],
  ['tv', 'Horizontal para TV'],
] as const
export type MenuFormat = typeof MENU_FORMATS[number][0]
export const MENU_CATEGORIES = ['Pratos', 'Bebidas', 'Sobremesas', 'Combos', 'Adicionais']

export function menuPaper(format: MenuFormat) {
  if (format === 'a4') return PAPER.A4
  const mm = (px: number) => px * 25.4 / PRINT_DPI
  return { width: mm(format === 'tv' ? 1920 : 1080), height: mm(format === 'tv' ? 1080 : 1920) }
}

export function menuCanvasSize(format: MenuFormat) {
  return paperPixels(menuPaper(format))
}
