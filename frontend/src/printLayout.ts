export const PAPER = {
  A3: { width: 297, height: 420 },
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
} as const

export type PaperSize = { width: number; height: number }
export const PRINT_DPI = 300
export const LABEL_GAP = 3

export type PrintSettings = {
  kind: 'poster' | 'labels'
  paper: keyof typeof PAPER
  orientation?: 'portrait' | 'landscape'
  mode: 'single' | 'bulk'
  margin: number
  labelWidth: number
  labelHeight: number
  copies: number
  selectedProduct: number
  photoPosition: 'top' | 'left' | 'right'
  textAlign: 'left' | 'center'
}

export const DEFAULT_PRINT: PrintSettings = {
  kind: 'poster', paper: 'A4', orientation: 'portrait', mode: 'bulk', margin: 8,
  labelWidth: 65, labelHeight: 40, copies: 1, selectedProduct: 0, photoPosition: 'top', textAlign: 'center',
}

export function printPaper(settings?: PrintSettings): PaperSize {
  if (settings?.kind !== 'poster') return PAPER.A4
  const paper = PAPER[settings.paper]
  return settings.orientation === 'landscape' ? { width: paper.height, height: paper.width } : paper
}

export function paperPixels(paper: PaperSize, dpi = PRINT_DPI) {
  return { width: Math.round(paper.width * dpi / 25.4), height: Math.round(paper.height * dpi / 25.4) }
}

export function printGrid(settings: PrintSettings) {
  const paper = printPaper(settings)
  if (settings.kind === 'poster') return { cols: 1, rows: 1, width: paper.width - settings.margin * 2, height: paper.height - settings.margin * 2 }
  const count = (available: number, size: number) => Math.max(0, Math.floor((available + LABEL_GAP + 1e-8) / (size + LABEL_GAP)))
  return {
    cols: count(paper.width - settings.margin * 2, settings.labelWidth),
    rows: count(paper.height - settings.margin * 2, settings.labelHeight),
    width: settings.labelWidth, height: settings.labelHeight,
  }
}

export function paginatePrint<T>(products: T[], settings: PrintSettings): T[][] {
  const { cols, rows } = printGrid(settings)
  const capacity = cols * rows
  if (!capacity) return []
  const selected = Math.min(settings.selectedProduct, products.length - 1)
  const selection = settings.mode === 'single' && selected >= 0 ? products.slice(selected, selected + 1) : products
  const copies = settings.kind === 'labels' ? settings.copies : 1
  const items = selection.flatMap(product => Array<T>(copies).fill(product))
  const pages: T[][] = []
  for (let start = 0; start < items.length; start += capacity) pages.push(items.slice(start, start + capacity))
  return pages
}

export function printSettingsError(settings: PrintSettings) {
  if (!Number.isFinite(settings.margin) || settings.margin < 3 || settings.margin > 20) return 'Informe uma margem entre 3 e 20 mm.'
  if (settings.kind === 'poster') return ''
  if (!Number.isInteger(settings.copies) || settings.copies < 1 || settings.copies > 10) return 'Informe de 1 a 10 cópias por produto.'
  if (!(settings.labelWidth >= 20 && settings.labelHeight >= 15)) return 'Use etiquetas de pelo menos 20 × 15 mm.'
  if (!printGrid(settings).cols || !printGrid(settings).rows) return 'As medidas da etiqueta precisam caber na folha A4 com a margem escolhida.'
  return ''
}
