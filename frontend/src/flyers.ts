import { changeArtworkTemplate, createArtworkConfig, loadProductImage, type ArtRect, type BulkProduct } from './bulk'
import { drawProfessionalOffer, fitOfferLines } from './professionalOffer'
import { flyerImageLayout, flyerTextBounds, paintFlyerDetails, paintFlyerPhoto, type FlyerLayer, type FlyerLayerReporter, type FlyerPhotoBounds, type FlyerPhotoSettings, type FlyerTextPositions, type OFFER_LABELS } from './flyerOfferLayout'
import type { FlyerDesignLayer, FlyerDesignPositions, PlaceFlyerDesignLayer } from './flyerOfferLayout'
import { DEFAULT_PRINT, LABEL_GAP, paperPixels, PRINT_DPI, printGrid, printPaper, type PrintSettings } from './printLayout'
import { DEFAULT_VIDEO, type VideoSettings } from './videoTimeline'

export const FLYER_LAYOUTS = [4, 6, 9, 12, 16] as const
export const FLYER_LIMIT = 100
export const FLYER_WIDTH = 1240
export const FLYER_HEIGHT = 1754
export const FLYER_EXPORT_SCALE = 2

export const FLYER_TEMPLATES = {
  professional: { label: 'Oferta Profissional', primary: '#064617', accent: '#ffe348', background: '#ff8c00', font: 'sans', border: 'strong', badge: 'pill' },
  grocery: { label: 'Supermercado', primary: '#166534', accent: '#dc2626', background: '#ecfdf5', font: 'sans', border: 'none', badge: 'pill' },
  fashion: { label: 'Moda', primary: '#431b32', accent: '#a52855', background: '#fff1f2', font: 'serif', border: 'thin', badge: 'square' },
  electronics: { label: 'Eletrônicos', primary: '#172554', accent: '#1d4ed8', background: '#e0f2fe', font: 'sans', border: 'thin', badge: 'square' },
  pharmacy: { label: 'Farmácia', primary: '#075985', accent: '#047857', background: '#ecfeff', font: 'sans', border: 'thin', badge: 'pill' },
  flash: { label: 'Ofertas Relâmpago', primary: '#18181b', accent: '#facc15', background: '#fef3c7', font: 'sans', border: 'strong', badge: 'burst' },
} as const

export type FlyerDesign = {
  title: string
  subtitle: string
  template: keyof typeof FLYER_TEMPLATES
  layout: typeof FLYER_LAYOUTS[number]
  arrangement: 'standard' | 'wide'
  font: 'sans' | 'serif' | 'mono'
  grouped: boolean
  primary: string
  accent: string
  background: string
  logo: string
  backgroundImage: string
  layerPositions?: FlyerDesignPositions
  lockedLayers?: FlyerDesignLayer[]
  headerTextColor?: string
  storeNameColor?: string
  subtitleColor?: string
  categoryTextColor?: string
  logoScale?: number
  productTextColor?: string
  storeName: string
  border: 'none' | 'thin' | 'strong'
  badge: 'pill' | 'square' | 'burst' | 'none'
  print?: PrintSettings
  video?: VideoSettings
}

export type FlyerProduct = Required<Pick<BulkProduct, 'name' | 'category' | 'price' | 'originalPrice' | 'discount' | 'imageUrl'>> & FlyerPhotoSettings & {
  featured?: boolean
  duration?: number
  detailPhotos?: string[]
  offerLabel?: (typeof OFFER_LABELS)[number]
  offerColor?: string
  discountColor?: string
  offerTextColor?: string
  discountTextColor?: string
  oldPriceColor?: string
  textPositions?: FlyerTextPositions
  cardPosition?: { x: number; y: number }
  lockedLayers?: FlyerLayer[]
}
export type Flyer = { name: string; design: FlyerDesign; products: FlyerProduct[] }
export type FlyerSummary = { id: number; name: string; updated_at: string; kind?: 'flyer' | 'print' | 'video' }
type OptionalLegacyDesign = 'storeName' | 'border' | 'badge'
export type SavedFlyer = Omit<Flyer, 'design'> & FlyerSummary & {
  design: Omit<FlyerDesign, OptionalLegacyDesign> & Partial<Pick<FlyerDesign, OptionalLegacyDesign>>
}
export type FlyerPage = { category: string; products: FlyerProduct[] }

export function createFlyer(print = false, video = false): Flyer {
  const { primary, accent, background, font, border, badge } = FLYER_TEMPLATES.grocery
  return {
    name: video ? 'Novo vídeo para TV' : print ? 'Novo projeto de impressão' : 'Novo encarte',
    design: {
      title: 'Ofertas da semana', subtitle: '', template: 'grocery', layout: 6,
      arrangement: 'standard', grouped: true, primary, accent, background, font,
      logo: '', backgroundImage: '', storeName: '', border, badge,
      ...(print ? { print: { ...DEFAULT_PRINT }, title: 'Oferta especial', grouped: false } : {}),
      ...(video ? { video: { ...DEFAULT_VIDEO }, grouped: false } : {}),
    },
    products: [],
  }
}

export function reopenFlyer(saved: SavedFlyer): Flyer {
  const { border, badge } = FLYER_TEMPLATES[saved.design.template]
  return { name: saved.name, design: { ...createFlyer().design, border, badge, ...saved.design }, products: saved.products }
}

export function flyerProduct(product: BulkProduct): FlyerProduct {
  return {
    name: product.name.slice(0, 180), category: product.category.slice(0, 80),
    price: product.price.slice(0, 36), originalPrice: (product.originalPrice ?? '').slice(0, 36),
    discount: product.discount.slice(0, 36), imageUrl: product.imageUrl,
  }
}

export function paginateFlyer(products: FlyerProduct[], design: Pick<FlyerDesign, 'grouped' | 'layout'>): FlyerPage[] {
  const groups = new Map<string, FlyerPage>()
  for (const product of products) {
    const category = design.grouped ? product.category.trim() || 'Sem categoria' : ''
    const key = category.toLocaleLowerCase('pt-BR')
    const group = groups.get(key) ?? { category, products: [] }
    group.products.push(product)
    groups.set(key, group)
  }
  const pages: FlyerPage[] = []
  for (const { category, products: items } of groups.values()) {
    const highlighted = items.find(product => product.featured)
    const group = highlighted ? [highlighted, ...items.filter(product => product !== highlighted)] : items
    for (let start = 0; start < group.length; start += design.layout) {
      pages.push({ category, products: group.slice(start, start + design.layout) })
    }
  }
  return pages
}

export function flyerGrid(layout: FlyerDesign['layout'], arrangement: FlyerDesign['arrangement'], featured = false, count: number = layout) {
  const columns = { 4: [2, 3], 6: [2, 3], 9: [3, 4], 12: [3, 4], 16: [4, 5] }[layout]
  const cols = columns[arrangement === 'wide' ? 1 : 0]
  return { cols, rows: Math.ceil(Math.max(layout, count + Number(featured)) / cols) }
}

export function priceNumber(value: string) {
  const cleaned = value.trim().replace(/^R\$\s*/, '')
  if (/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(cleaned)) return Number(cleaned.replace(/\./g, '').replace(',', '.'))
  if (/^\d{1,3}(?:\.\d{3})+$/.test(cleaned)) return Number(cleaned.replace(/\./g, ''))
  return /^\d+(?:\.\d{1,2})?$/.test(cleaned) ? Number(cleaned) : NaN
}

export function printProductErrors(product: FlyerProduct, forExport = false) {
  const errors: Partial<Record<keyof FlyerProduct, string>> = {}
  const price = priceNumber(product.price)
  const previous = priceNumber(product.originalPrice)
  const validPrice = (value: number) => Number.isSafeInteger(Math.round(value * 100))
  if (!product.name.trim() || product.name.length > 180) errors.name = 'Informe um nome com até 180 caracteres.'
  if (product.price.trim() ? !validPrice(price) : forExport) errors.price = 'Informe um preço promocional válido, como 19,90.'
  if (product.originalPrice.trim() && !validPrice(previous)) errors.originalPrice = 'Informe um preço anterior válido, como 24,90.'
  if (validPrice(price) && validPrice(previous) && price > previous) errors.price = 'O preço promocional deve ser menor ou igual ao anterior.'
  const photo = product.imageUrl.trim()
  if (photo && !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(photo)) {
    try {
      const url = new URL(photo)
      if (!/^https?:\/\//.test(photo) || url.username || url.password) throw new Error()
    } catch {
      errors.imageUrl = 'Use uma URL HTTP(S) sem credenciais ou envie uma imagem PNG, JPEG ou WebP.'
    }
  }
  return errors
}

export function flyerDiscount(product: FlyerProduct) {
  const label = product.discount.trim()
  const manual = /^(\d{1,3})\s*%?(?:\s*OFF)?$/i.exec(label)
  const original = priceNumber(product.originalPrice)
  const offer = priceNumber(product.price)
  const percent = Math.round((1 - offer / original) * 100)
  if (percent > 0 && percent <= 100) return label && !manual ? `${percent}% · ${label}` : `${percent}% OFF`
  if (manual) return Number(manual[1]) <= 100 ? `${manual[1]}% OFF` : ''
  return label
}

const fontFamily = { sans: 'Arial, sans-serif', serif: 'Georgia, serif', mono: 'Courier New, monospace' }
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function priceText(value: string) {
  const numeric = priceNumber(value)
  return Number.isFinite(numeric) ? money.format(numeric) : 'Preço sob consulta'
}

export function fitText(context: CanvasRenderingContext2D, value: string, x: number, y: number, width: number) {
  if (!value) return
  if (context.measureText(value).width <= width) {
    context.fillText(value, x, y)
    return
  }
  const chars = Array.from(value)
  while (chars.length && context.measureText(chars.join('') + '…').width > width) chars.pop()
  context.fillText(chars.join('') + '…', x, y)
}

export function drawProductName(context: CanvasRenderingContext2D, name: string, x: number, y: number, width: number, lineHeight: number) {
  if (context.measureText(name).width <= width) {
    fitText(context, name, x, y + lineHeight, width)
    return
  }
  const words = name.split(/\s+/)
  let first = words.shift() ?? ''
  while (words.length && context.measureText(`${first} ${words[0]}`).width <= width) first += ` ${words.shift()}`
  fitText(context, first, x, y, width)
  fitText(context, words.join(' '), x, y + lineHeight, width)
}

export function drawImage(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, w: number, h: number, cover = false) {
  const ratio = cover ? Math.max(w / image.naturalWidth, h / image.naturalHeight) : Math.min(w / image.naturalWidth, h / image.naturalHeight)
  const width = image.naturalWidth * ratio
  const height = image.naturalHeight * ratio
  context.save()
  context.beginPath()
  context.rect(x, y, w, h)
  context.clip()
  context.drawImage(image, x + (w - width) / 2, y + (h - height) / 2, width, height)
  context.restore()
}

function card(context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, radius: number, border?: { color: string; width: number }) {
  context.beginPath()
  context.roundRect(x, y, w, h, radius)
  context.fillStyle = color
  context.fill()
  if (border) {
    context.strokeStyle = border.color
    context.lineWidth = border.width
    context.stroke()
  }
}

function discountBadge(context: CanvasRenderingContext2D, kind: FlyerDesign['badge'], x: number, y: number, width: number, height: number, color: string) {
  if (kind !== 'burst') {
    card(context, x, y, width, height, color, kind === 'pill' ? height / 2 : 3)
    return
  }
  context.beginPath()
  for (let point = 0; point < 28; point++) {
    const angle = point * Math.PI / 14
    const radius = point % 2 ? 0.89 : 1
    const px = x + width / 2 + Math.cos(angle) * width / 2 * radius
    const py = y + height / 2 + Math.sin(angle) * height / 2 * radius
    if (point === 0) context.moveTo(px, py)
    else context.lineTo(px, py)
  }
  context.closePath()
  context.fillStyle = color
  context.fill()
}

const OFFER_CARD = { image: 0.55, nameStart: 0.56, oldPrice: 0.715, plaqueTop: 0.75, plaqueHeight: 0.23 }

function drawFlyerOffer(
  context: CanvasRenderingContext2D, design: FlyerDesign, product: FlyerProduct,
  x: number, y: number, width: number, height: number,
  report?: FlyerLayerReporter,
  printText?: { area: ArtRect; align: PrintSettings['textAlign'] },
) {
  const innerWidth = width * 0.88
  const leftAligned = printText?.align === 'left'
  const center = leftAligned ? x + width * 0.025 + innerWidth / 2 : x + width / 2
  const horizontalPosition = (size: number) => leftAligned ? x + width * 0.025 : center - size / 2
  const unit = printText ? width / FLYER_WIDTH : 1
  const ink = design.productTextColor ?? contrast(design.background)
  const setFont = (size: number, weight: number) => { context.font = `${weight} ${size}px ${fontFamily[design.font]}` }
  const nameSize = Math.min(width * 0.074, height * 0.061)
  context.save()
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = ink
  context.shadowColor = ink === '#ffffff' ? '#141b14' : '#ffffff'
  context.shadowBlur = 5
  setFont(nameSize, 850)
  const lines = fitOfferLines(product.name, innerWidth, 2, line => context.measureText(line).width)
  const safe = printText?.area ?? { x: x + width * 0.025, y, width: width * 0.95, height }
  const nameWidth = Math.min(innerWidth, Math.max(0, ...lines.map(line => context.measureText(line).width)) + nameSize * 0.35)
  const name = flyerTextBounds(safe, { x: horizontalPosition(nameWidth), y: y + height * OFFER_CARD.nameStart, width: nameWidth, height: nameSize * lines.length }, product.textPositions?.name)
  lines.forEach((line, index) => fitText(context, line, name.image.x + nameWidth / 2, name.image.y + nameSize * (index + 0.55), nameWidth))
  if (lines.length) report?.(name, 'name')

  if (Number.isFinite(priceNumber(product.originalPrice))) {
    const old = priceText(product.originalPrice)
    const boxHeight = height * 0.056
    const fontSize = Math.min(nameSize * 0.64, boxHeight * 0.68)
    setFont(fontSize, 600)
    const boxWidth = Math.min(innerWidth, context.measureText(old).width + boxHeight * 0.85)
    const bounds = flyerTextBounds(safe, { x: horizontalPosition(boxWidth), y: y + height * OFFER_CARD.oldPrice - boxHeight / 2, width: boxWidth, height: boxHeight }, product.textPositions?.originalPrice)
    const oldX = bounds.image.x + boxWidth / 2
    const oldY = bounds.image.y + boxHeight / 2
    const oldColor = product.oldPriceColor ?? '#fff8df'
    const oldInk = product.oldPriceColor ? contrast(oldColor) : '#453723'
    context.shadowBlur = 0
    card(context, bounds.image.x, bounds.image.y, boxWidth, boxHeight, oldColor, boxHeight * 0.26,
      { color: design.accent, width: Math.max(unit, boxHeight * 0.045) })
    const maxTextWidth = boxWidth - boxHeight * 0.5
    setFont(fontSize * Math.min(1, maxTextWidth / Math.max(1, context.measureText(old).width) * 0.98), 600)
    context.fillStyle = oldInk
    fitText(context, old, oldX, oldY, maxTextWidth)
    const textWidth = Math.min(maxTextWidth, context.measureText(old).width)
    context.fillStyle = product.oldPriceColor ? oldInk : '#8d2a28'
    context.fillRect(oldX - textWidth / 2, oldY, textWidth, Math.max(unit, nameSize * 0.045))
    report?.(bounds, 'originalPrice')
  }
  context.shadowBlur = 0

  const offer = flyerTextBounds(safe, { x: center - innerWidth / 2, y: y + height * OFFER_CARD.plaqueTop, width: innerWidth, height: height * OFFER_CARD.plaqueHeight }, product.textPositions?.offer)
  const plaque = offer.image
  const offerColor = product.offerColor ?? design.primary
  const discountColor = product.discountColor ?? design.accent
  const offerCenter = plaque.x + innerWidth / 2
  const radius = Math.min(plaque.height * 0.24, innerWidth * 0.07)
  card(context, plaque.x, plaque.y, innerWidth, plaque.height, offerColor, radius, { color: design.accent, width: Math.max(2 * unit, width * 0.006) })
  context.fillStyle = product.offerTextColor ?? contrast(offerColor)
  const labelY = plaque.y + plaque.height * 0.20
  const label = product.offerLabel ?? 'OFERTA'
  const discount = design.badge !== 'none' ? flyerDiscount(product) : ''
  setFont(Math.min(width * 0.033, plaque.height * 0.16), 800)
  const labelWidth = discount ? innerWidth * 0.47 : innerWidth * 0.84
  fitText(context, label, discount ? plaque.x + innerWidth * 0.315 : offerCenter, labelY, labelWidth)
  if (discount) {
    setFont(Math.min(width * 0.033, plaque.height * 0.16), 850)
    const badgeHeight = plaque.height * 0.26
    const badgeWidth = Math.min(innerWidth * 0.34, context.measureText(discount).width + badgeHeight * 0.85)
    const badgeX = plaque.x + innerWidth * 0.92 - badgeWidth
    discountBadge(context, design.badge, badgeX, labelY - badgeHeight / 2, badgeWidth, badgeHeight, discountColor)
    context.fillStyle = product.discountTextColor ?? contrast(discountColor)
    const available = badgeWidth * 0.84
    const size = Math.min(width * 0.033, plaque.height * 0.16)
    setFont(size * Math.min(1, available / Math.max(1, context.measureText(discount).width) * 0.98), 850)
    fitText(context, discount, badgeX + badgeWidth / 2, labelY, available)
  }
  const price = priceText(product.price)
  const priceWidth = innerWidth * 0.84
  const priceSize = Math.min(plaque.height * 0.61, width * 0.17)
  setFont(priceSize, 900)
  setFont(priceSize * Math.min(1, priceWidth / Math.max(1, context.measureText(price).width) * 0.98), 900)
  context.fillStyle = product.offerTextColor ?? contrast(offerColor)
  fitText(context, price, offerCenter, plaque.y + plaque.height * 0.66, priceWidth)
  report?.(offer, 'offer')
  context.restore()
}

export function contrast(hex: string) {
  const [red, green, blue] = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
  const linear = (value: number) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue) > 0.179 ? '#111827' : '#ffffff'
}

export function flyerCanvasSize(design: FlyerDesign, scale: number) {
  return design.print
    ? paperPixels(printPaper(design.print), PRINT_DPI * scale / FLYER_EXPORT_SCALE)
    : { width: FLYER_WIDTH * scale, height: FLYER_HEIGHT * scale }
}

function drawProfessionalProduct(
  context: CanvasRenderingContext2D, design: FlyerDesign, product: FlyerProduct,
  x: number, y: number, width: number, height: number,
  photo: HTMLImageElement | null, logo: HTMLImageElement | null, details: HTMLImageElement[] = [],
  report?: FlyerLayerReporter,
  background?: HTMLImageElement | null,
  category?: string,
  placeLayer?: PlaceFlyerDesignLayer,
  bleed = 0,
) {
  const artwork = changeArtworkTemplate(product, createArtworkConfig(product, 0), 'professional', 0)
  const discount = flyerDiscount(product).replace(/^(\d+%) OFF$/, '$1')
  context.save()
  context.translate(x, y)
  context.scale(width / 1080, width / 1080)
  drawProfessionalOffer(context, {
    ...artwork,
    callout: design.title,
    cta: design.subtitle,
    backgroundColor: design.background,
    buttonColor: product.offerColor ?? design.primary,
    buttonTextColor: product.offerTextColor ?? contrast(product.offerColor ?? design.primary),
    ...(product.discountColor ? { badgeColor: product.discountColor } : {}),
    badgeTextColor: product.discountTextColor ?? contrast(product.discountColor ?? artwork.badgeColor),
    textColor: design.productTextColor ?? artwork.textColor,
    ...(design.print ? {} : { priceSize: 170 }),
    fontFamily: { sans: 'Arial', serif: 'Georgia', mono: 'Courier New' }[design.font],
    discount: design.badge === 'none' ? '' : discount,
    professional: { headingColor: design.primary, outlineColor: design.accent },
  }, height * 1080 / width, photo, logo, details, {
    photo: product, label: product.offerLabel ?? 'OFERTA', textPositions: product.textPositions, report,
    headerTextColor: design.headerTextColor ?? contrast(design.primary),
    storeName: design.storeName,
    storeNameColor: design.storeNameColor,
    subtitleColor: design.subtitleColor,
    logoScale: design.logoScale,
    oldPriceStyle: product.oldPriceColor ? { fill: product.oldPriceColor, ink: contrast(product.oldPriceColor) } : undefined,
    category: category ? { label: category, color: design.categoryTextColor ?? design.headerTextColor ?? contrast(design.primary) } : undefined,
    placeLayer,
    bleed: bleed * 1080 / width,
    paintBackground: background ? (canvasHeight: number) => drawFlyerBackground(context, background, 1080, canvasHeight, placeLayer, 0.5, Boolean(bleed)) : undefined,
  })
  context.restore()
}

function drawFlyerBackground(context: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number, placeLayer?: PlaceFlyerDesignLayer, opacity = 0.5, keepCovered = false) {
  const travelX = width * (keepCovered ? 0.1 : 0.5)
  const travelY = height * (keepCovered ? 0.1 : 0.5)
  const original = { x: 0, y: 0, width, height }
  const area = placeLayer?.('backgroundImage', original, {
    x: -travelX, y: -travelY, width: width + travelX * 2, height: height + travelY * 2,
  }) ?? original
  const extraX = keepCovered ? travelX : 0
  const extraY = keepCovered ? travelY : 0
  context.save()
  context.globalAlpha = opacity
  drawImage(context, image, area.x - extraX, area.y - extraY, width + extraX * 2, height + extraY * 2, true)
  context.restore()
}

function drawPrintPage(
  context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, page: FlyerPage, design: FlyerDesign,
  settings: PrintSettings, logo: HTMLImageElement | null, background: HTMLImageElement | null,
  photos: Awaited<ReturnType<typeof loadProductImage>>[],
  details: HTMLImageElement[][],
  reportLayer: (product: FlyerProduct) => FlyerLayerReporter | undefined,
  placeDesignLayer: (width: number, height: number) => PlaceFlyerDesignLayer,
) {
  const paper = printPaper(settings)
  const { cols, width, height } = printGrid(settings)
  context.scale(canvas.width / paper.width, canvas.height / paper.height)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, paper.width, paper.height)
  if (!cols || width <= 0 || height <= 0) return
  const placeholder: FlyerProduct = { name: 'Nome do produto', originalPrice: '29,90', price: '19,90', discount: '', imageUrl: '', category: '' }
  const products = page.products.length ? page.products : [placeholder]
  const poster = settings.kind === 'poster'
  if (poster && design.template === 'professional') {
    const product = products[0]
    drawProfessionalProduct(context, design, product, settings.margin, settings.margin, width, height, photos[0]?.image ?? null, logo, details[0],
      reportLayer(product), background, product.category, placeDesignLayer(1080, height * 1080 / width), settings.margin)
    return
  }
  const placeLayer = poster ? placeDesignLayer(width, height) : undefined
  const radius = design.template === 'fashion' || design.template === 'electronics' ? 0 : Math.min(4, height * 0.05)
  const pad = Math.min(width, height) * 0.045
  const headerHeight = height * 0.17
  if (poster) {
    context.fillStyle = design.background
    context.fillRect(0, 0, paper.width, paper.height)
    if (background) drawFlyerBackground(context, background, paper.width, paper.height, placeDesignLayer(paper.width, paper.height), 0.22, true)
    context.fillStyle = design.primary
    context.fillRect(0, 0, paper.width, settings.margin + headerHeight)
    context.fillRect(0, paper.height - settings.margin, paper.width, settings.margin)
  }
  const stacked = settings.photoPosition === 'top'
  const light = contrast(design.primary)
  const font = (size: number, weight = 700) => { context.font = `${weight} ${size}px ${fontFamily[design.font]}` }
  products.forEach((product, index) => {
    const x = settings.margin + (index % cols) * (width + LABEL_GAP)
    const y = settings.margin + Math.floor(index / cols) * (height + LABEL_GAP)
    context.save()
    context.translate(x, y)
    if (!poster) {
      context.beginPath()
      context.roundRect(0, 0, width, height, radius)
      context.clip()
      context.fillStyle = design.background
      context.fillRect(0, 0, width, height)
      if (background) drawFlyerBackground(context, background, width, height, undefined, 0.22)
      context.fillStyle = design.primary
      context.fillRect(0, 0, width, headerHeight)
    }
    const scale = (design.logoScale ?? 100) / 100
    const logoWidth = logo ? Math.min(width * 0.35, Math.min(width * 0.23, headerHeight * 1.3) * scale) : 0
    const headingColor = design.headerTextColor ?? light
    const heading = [
      { layer: 'storeName', text: design.storeName, color: design.storeNameColor ?? headingColor },
      { layer: 'title', text: design.title, color: headingColor },
      { layer: 'subtitle', text: design.subtitle, color: design.subtitleColor ?? headingColor },
      { layer: 'category', text: product.category, color: design.categoryTextColor ?? headingColor },
    ] as const
    const visibleHeading = heading.filter(line => line.text.trim())
    const rowHeight = headerHeight * 0.94 / Math.max(1, visibleHeading.length)
    const photoWidth = stacked ? width - pad * 2 : width * 0.40
    const photoHeight = stacked ? height * 0.36 : height - headerHeight - pad * 2
    const photoLeft = settings.photoPosition === 'right' ? width - photoWidth - pad : pad
    const photoTop = headerHeight + pad
    const photo = photos[index]?.image
    const photoArea = { x: photoLeft + pad / 2, y: photoTop + pad / 2, width: photoWidth - pad, height: photoHeight - pad }
    const report = poster ? reportLayer(product) : undefined
    if (photo && poster) {
      const layout = flyerImageLayout(photoArea, details[index].length, product.photoScale)
      const bounds = paintFlyerPhoto(context, photo, layout.main, product)
      report?.(bounds, 'photo')
      paintFlyerDetails(context, details[index], layout.details, design.accent)
    } else if (photo) drawImage(context, photo, photoArea.x, photoArea.y, photoArea.width, photoArea.height)
    else {
      card(context, photoLeft, photoTop, photoWidth, photoHeight, '#ffffff', radius)
      context.fillStyle = '#475569'
      font(Math.min(photoHeight * 0.17, photoWidth * 0.14), 500)
      fitText(context, 'Sem foto', photoLeft + pad, photoTop + photoHeight * 0.55, photoWidth - pad * 2)
    }
    const textLeft = settings.photoPosition === 'left' ? photoLeft + photoWidth + pad : pad
    const textWidth = stacked ? width - pad * 2 : width - photoWidth - pad * 3
    const textTop = stacked ? photoTop + photoHeight + pad : headerHeight + pad
    const textHeight = height - textTop - pad
    if (poster) {
      const offerHeight = textHeight / (1 - OFFER_CARD.nameStart)
      drawFlyerOffer(context, design, product, textLeft, textTop - offerHeight * OFFER_CARD.nameStart,
        textWidth, offerHeight, report, { area: { x: textLeft, y: textTop, width: textWidth, height: textHeight }, align: settings.textAlign })
    } else {
      const centered = settings.textAlign === 'center'
      const textX = centered ? textLeft + textWidth / 2 : textLeft
      context.textAlign = settings.textAlign
      context.fillStyle = design.productTextColor ?? '#111827'
      font(Math.min(textHeight * 0.15, textWidth * 0.10))
      drawProductName(context, product.name, textX, textTop + textHeight * 0.13, textWidth, textHeight * 0.16)
      if (Number.isFinite(priceNumber(product.originalPrice))) {
        context.fillStyle = '#475569'
        font(Math.min(textHeight * 0.14, textWidth * 0.088), 500)
        const oldPrice = priceText(product.originalPrice)
        const oldWidth = Math.min(textWidth, context.measureText(oldPrice).width)
        fitText(context, oldPrice, textX, textTop + textHeight * 0.49, textWidth)
        context.fillRect(centered ? textX - oldWidth / 2 : textX, textTop + textHeight * 0.445, oldWidth, textHeight * 0.014)
      }
      context.fillStyle = design.primary
      const price = priceText(product.price)
      const priceSize = Math.min(textHeight * 0.32, textWidth * 0.20)
      font(priceSize)
      font(Math.min(priceSize, priceSize * textWidth / context.measureText(price).width))
      fitText(context, price, textX, textTop + textHeight * 0.79, textWidth)
      const discount = flyerDiscount(product)
      if (discount && design.badge !== 'none') {
        font(Math.min(textHeight * 0.12, textWidth * 0.08))
        const badgeWidth = Math.min(textWidth, context.measureText(discount).width + pad * 2)
        card(context, textLeft + (centered ? (textWidth - badgeWidth) / 2 : 0),
          textTop + textHeight * 0.83, badgeWidth, textHeight * 0.17, design.accent, design.badge === 'pill' ? textHeight * 0.085 : 0)
        context.fillStyle = contrast(design.accent)
        fitText(context, discount, textX + (centered ? 0 : pad), textTop + textHeight * 0.955, badgeWidth - pad * 2)
      }
    }
    context.textAlign = 'left'
    if (logo) {
      const logoHeight = Math.min(headerHeight * 0.91, headerHeight * 0.64 * scale)
      const ratio = Math.min(logoWidth / logo.naturalWidth, logoHeight / logo.naturalHeight)
      const w = logo.naturalWidth * ratio
      const h = logo.naturalHeight * ratio
      const original = { x: width - pad - (logoWidth + w) / 2, y: (headerHeight - h) / 2, width: w, height: h }
      const rect = placeLayer?.('logo', original) ?? original
      drawImage(context, logo, rect.x, rect.y, rect.width, rect.height)
    }
    visibleHeading.forEach((line, row) => {
      const isTitle = line.layer === 'title'
      const size = Math.min(rowHeight * (isTitle ? 0.84 : 0.72), width * 0.072)
      const maxWidth = width - pad * 3 - logoWidth
      const baseline = rowHeight * (row + 0.81)
      context.fillStyle = line.color
      font(size, isTitle ? 800 : 600)
      const original = { x: pad, y: baseline - size, width: Math.min(maxWidth, context.measureText(line.text).width), height: size * 1.2 }
      const rect = line.layer === 'title' ? original : placeLayer?.(line.layer, original) ?? original
      fitText(context, line.text, rect.x, rect.y + size, maxWidth)
    })
    if (design.border !== 'none') {
      context.lineWidth = design.border === 'strong' ? 0.9 : 0.35
      context.strokeStyle = design.primary
      const bleed = poster ? settings.margin : 0
      context.strokeRect(-bleed, -bleed, width + bleed * 2, height + bleed * 2)
    }
    context.restore()
    if (settings.kind === 'labels') {
      context.save()
      context.strokeStyle = '#64748b'
      context.lineWidth = 0.15
      context.setLineDash([1, 1])
      context.strokeRect(x, y, width, height)
      context.restore()
    }
  })
}

export async function renderFlyerPage(canvas: HTMLCanvasElement, page: FlyerPage, design: FlyerDesign, index: number, total: number, scale = 1,
  onLayer?: (product: FlyerProduct, bounds: FlyerPhotoBounds, layer?: FlyerLayer | 'product') => void,
  onDesignLayer?: (layer: FlyerDesignLayer, bounds: FlyerPhotoBounds) => void,
) {
  const [logo, background, ...photos] = await Promise.all(
    [design.logo, design.backgroundImage, ...page.products.map(product => product.imageUrl)].map(loadProductImage),
  )
  const dimensions = flyerCanvasSize(design, scale)
  canvas.width = dimensions.width
  canvas.height = dimensions.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('O navegador não conseguiu preparar o encarte.')
  const detailResults = await Promise.all(page.products.map(product =>
    Promise.all((design.print?.kind === 'labels' ? [] : product.detailPhotos ?? []).slice(0, 3).map(loadProductImage))))
  const details = detailResults.map(items => items.flatMap(item => item.image ? [item.image] : []))
  const imageErrors = [...photos, ...detailResults.flat()].filter(item => item.error).length
  const canvasBounds = ({ safe, image }: FlyerPhotoBounds): FlyerPhotoBounds => {
    const matrix = context.getTransform()
    const toCanvas = ({ x, y, width, height }: FlyerPhotoBounds['image']) =>
      ({ x: x * matrix.a + matrix.e, y: y * matrix.d + matrix.f, width: width * matrix.a, height: height * matrix.d })
    return { safe: toCanvas(safe), image: toCanvas(image) }
  }
  const reportLayer = (product: FlyerProduct): FlyerLayerReporter | undefined =>
    onLayer && ((bounds, layer) => onLayer(product, canvasBounds(bounds), layer))
  const setFont = (size: number, weight = 700) => { context.font = `${weight} ${size}px ${fontFamily[design.font]}` }
  const width = FLYER_WIDTH
  const height = FLYER_HEIGHT
  const placeDesignLayer = (pageWidth: number, pageHeight: number): PlaceFlyerDesignLayer =>
    (layer, original, safe = { x: 0, y: 0, width: pageWidth, height: pageHeight }) => {
      const bounds = flyerTextBounds(safe, original, design.layerPositions?.[layer])
      if (onDesignLayer) onDesignLayer(layer, canvasBounds(bounds))
      return bounds.image
    }
  if (design.print) {
    drawPrintPage(context, canvas, page, design, design.print, logo.image, background.image, photos, details, reportLayer, placeDesignLayer)
    return Number(Boolean(logo.error)) + Number(Boolean(background.error)) + imageErrors
  }
  context.scale(scale, scale)
  const professional = design.template === 'professional'
  if (professional && page.products.length === 1) {
    drawProfessionalProduct(context, design, page.products[0], 0, 0, width, height, photos[0].image, logo.image, details[0], reportLayer(page.products[0]), background.image, page.category,
      placeDesignLayer(1080, height * 1080 / width))
    return Number(Boolean(logo.error)) + Number(Boolean(background.error)) + imageErrors
  }
  const grocery = design.template === 'grocery'
  const fashion = design.template === 'fashion'
  const pharmacy = design.template === 'pharmacy'
  const flash = design.template === 'flash'
  const footerTop = height - 58
  const headerText = design.headerTextColor ?? contrast(design.primary)
  const logoScale = (design.logoScale ?? 100) / 100
  const logoWidth = logo.image ? 108 * logoScale : 0
  const placeLayer = placeDesignLayer(width, height)
  const drawDesignText = (layer: FlyerDesignLayer, value: string, x: number, baseline: number, maxWidth: number, size: number) => {
    if (!value.trim()) return
    const rect = placeLayer(layer, { x, y: baseline - size, width: Math.min(maxWidth, context.measureText(value).width), height: size * 1.2 })
    fitText(context, value, rect.x, rect.y + size, maxWidth)
  }
  context.fillStyle = design.background
  context.fillRect(0, 0, width, height)
  if (background.image) drawFlyerBackground(context, background.image, width, height, placeLayer)
  context.fillStyle = design.primary
  context.fillRect(0, 0, width, 224)
  if (flash || pharmacy) {
    context.fillStyle = design.accent
    context.globalAlpha = 0.16
    context.beginPath()
    context.moveTo(width * 0.68, 0)
    context.lineTo(width, 0)
    context.lineTo(width, 224)
    context.lineTo(width * 0.52, 224)
    context.closePath()
    context.fill()
    context.globalAlpha = 1
  }
  const titleWidth = width - 96 - (logo.image ? logoWidth + 54 : 0)
  context.fillStyle = headerText
  setFont(fashion ? 75 : 80)
  fitText(context, design.title, 48, design.storeName ? 147 : design.subtitle ? 119 : 147, titleWidth)

  const categoryTop = 224
  const categoryHeight = 49
  const startY = page.category ? categoryTop + categoryHeight + 20 : 270
  if (page.category) {
    context.fillStyle = design.primary
    context.fillRect(0, categoryTop, width, categoryHeight)
  }
  const single = page.products.length === 1
  const hasFeatured = !single && Boolean(page.products[0]?.featured)
  const { cols, rows } = flyerGrid(design.layout, design.arrangement, hasFeatured, page.products.length)
  const gap = 20
  const productArea = { x: 44, y: startY, width: width - 88, height: height - 85 - startY }
  const columnWidth = (width - 88 - (cols - 1) * gap) / cols
  const tileH = single ? height - 85 - startY : (height - 85 - startY - (rows - 1) * gap) / rows
  page.products.forEach((product, position) => {
    const featured = hasFeatured && position === 0
    const slot = position + Number(hasFeatured && !featured)
    const tileW = single ? width - 88 : featured ? columnWidth * 2 + gap : columnWidth
    const bounds = flyerTextBounds(productArea, {
      x: 44 + (slot % cols) * (columnWidth + gap),
      y: startY + Math.floor(slot / cols) * (tileH + gap),
      width: tileW, height: tileH,
    }, single ? undefined : product.cardPosition)
    const { x, y } = bounds.image
    if (!single) onLayer?.(product, canvasBounds(bounds), 'product')
    const radius = grocery || pharmacy ? 24 : fashion || flash ? 3 : 12
    const borderWidth = featured || design.border === 'strong' ? 6 : design.border === 'thin' ? 2 : 0
    if (professional) {
      drawProfessionalProduct(context, { ...design, title: product.category || 'Oferta especial', subtitle: '', storeName: '' },
        product, x, y, tileW, tileH, photos[position].image, null, details[position], reportLayer(product))
      return
    }
    const imageHeight = tileH * OFFER_CARD.image
    if (!single && borderWidth) {
      card(context, x, y, tileW, tileH, 'transparent', radius, {
        color: featured ? design.accent : design.primary, width: borderWidth,
      })
    }
    const photo = photos[position].image
    const layout = flyerImageLayout({ x, y, width: tileW, height: imageHeight }, details[position].length, product.photoScale)
    if (photo) {
      const bounds = paintFlyerPhoto(context, photo, layout.main, product)
      reportLayer(product)?.(bounds, 'photo')
    }
    else {
      context.fillStyle = contrast(design.background)
      context.globalAlpha = 0.7
      setFont(23, 400)
      fitText(context, 'Sem foto', x + 25, y + imageHeight / 2 + 9, tileW - 50)
      context.globalAlpha = 1
    }
    paintFlyerDetails(context, details[position], layout.details, design.accent)
    drawFlyerOffer(context, design, product, x, y, tileW, tileH, reportLayer(product))
  })
  context.fillStyle = design.primary
  context.fillRect(0, footerTop, width, height - footerTop)
  context.fillStyle = headerText
  setFont(24)
  context.textAlign = 'right'
  context.fillText(`${index + 1} / ${total}`, width - 48, height - 20)

  context.textAlign = 'left'
  context.textBaseline = 'alphabetic'
  if (logo.image) {
    const logoHeight = 126 * logoScale
    const ratio = Math.min(logoWidth / logo.image.naturalWidth, logoHeight / logo.image.naturalHeight)
    const w = logo.image.naturalWidth * ratio
    const h = logo.image.naturalHeight * ratio
    const rect = placeLayer('logo', { x: width - 57 - (logoWidth + w) / 2, y: (220 - h) / 2, width: w, height: h })
    drawImage(context, logo.image, rect.x, rect.y, rect.width, rect.height)
  }
  context.fillStyle = design.storeNameColor ?? headerText
  setFont(25)
  drawDesignText('storeName', design.storeName, 50, 56, titleWidth, 25)
  context.fillStyle = design.subtitleColor ?? headerText
  setFont(30, 400)
  drawDesignText('subtitle', design.subtitle, 50, design.storeName ? 192 : 171, titleWidth, 30)
  context.fillStyle = design.categoryTextColor ?? headerText
  setFont(28)
  drawDesignText('category', page.category, 48, categoryTop + 34, width - 96, 28)
  return Number(Boolean(logo.error)) + Number(Boolean(background.error)) + imageErrors
}

export async function prepareFlyerImage(file: Blob, maxSize: number, maxLength: number) {
  if (!/^image\/(?:png|jpeg|webp)$/i.test(file.type) || file.size > 10 * 1024 * 1024) {
    throw new Error('Selecione uma imagem PNG, JPEG ou WebP de até 10 MB.')
  }
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Não foi possível preparar a imagem.')
    for (let size = maxSize; size >= 64; size = Math.floor(size * 0.72)) {
      const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height))
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const image = canvas.toDataURL('image/webp', 0.76)
      if (image.length <= maxLength) return image
    }
  } finally {
    bitmap.close()
  }
  throw new Error('Não foi possível compactar a imagem para o encarte.')
}
