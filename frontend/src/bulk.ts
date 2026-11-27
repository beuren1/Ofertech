import { drawProfessionalOffer } from './professionalOffer'
import { flyerImageLayout, OFFER_LABELS, paintFlyerDetails, paintFlyerPhoto, type FlyerPhotoSettings } from './flyerOfferLayout'

export type BulkProduct = {
  name: string
  price: string
  originalPrice?: string
  discount: string
  imageUrl: string
  imageName?: string
  category: string
  sourceImageUrl?: string
  localImageKey?: string
  imageAssetId?: number
  saleUnit?: string
  barcode?: string
  qrUrl?: string
  description?: string
}

const automaticTemplates = [
  'electronics',
  'fashion',
  'grocery',
  'beauty',
  'general',
] as const
export const ART_TEMPLATES = [...automaticTemplates, 'professional'] as const
export type ArtTemplate = (typeof ART_TEMPLATES)[number]
export type ArtElement = 'photo' | 'title' | 'callout' | 'originalPrice' | 'salePrice' | 'badge' | 'cta' | 'brandLogo'
export type ArtFormat = 'png' | 'jpeg'
export const ARTWORK_HEIGHTS = [1080, 1350, 1920] as const
export type ArtworkHeight = (typeof ARTWORK_HEIGHTS)[number]
export const professionalDefaults = {
  headingColor: '#10422d',
  outlineColor: '#ffe348',
  rays: true,
  shadow: true,
  glow: true,
  shadowStrength: 65,
  glowStrength: 70,
}
export type BadgeStyle = 'circle' | 'burst' | 'pill' | 'ribbon'
export type ArtRect = { x: number; y: number; width: number; height: number }
export const ARTWORK_SIZE = 1080
export type ArtworkBrand = {
  storeId: number
  name: string
  primaryColor: string
  secondaryColor: string
  instagram: string
  whatsapp: string
  website: string
  slogan: string
  logoUrl: string
  logoAssetId?: number
  showLogo: boolean
  showInstagram: boolean
  showWhatsapp: boolean
  showWebsite: boolean
}

export type ArtworkConfig = {
  template: ArtTemplate
  height?: ArtworkHeight
  professional?: Partial<typeof professionalDefaults>
  offerLogo?: string
  offerDetails?: string[]
  presentation?: ArtworkPresentation
  backgroundColor: string
  textColor: string
  buttonColor: string
  buttonTextColor: string
  badgeColor: string
  badgeTextColor: string
  productName: string
  callout: string
  cta: string
  originalPrice: string
  salePrice: string
  discount: string
  badgeStyle?: BadgeStyle
  brand?: ArtworkBrand
  fontFamily: string
  titleSize: number
  priceSize: number
  positions: Record<ArtElement, ArtRect>
}

export type ArtworkPresentation = FlyerPhotoSettings & {
  backgroundImage?: string
  storeName?: string
  subtitle?: string
  showCategory?: boolean
  categoryLabel?: string
  headerTextColor?: string
  storeNameColor?: string
  subtitleColor?: string
  categoryTextColor?: string
  oldPriceColor?: string
  offerColor?: string
  offerTextColor?: string
  offerLabel?: (typeof OFFER_LABELS)[number]
}

const palette: Record<ArtTemplate, Pick<ArtworkConfig,
  'backgroundColor' | 'textColor' | 'buttonColor' | 'buttonTextColor' | 'badgeColor' | 'badgeTextColor'>> = {
  professional: {
    backgroundColor: '#ff8c00', textColor: '#082b12', buttonColor: '#075619',
    buttonTextColor: '#ffffff', badgeColor: '#c51b2a', badgeTextColor: '#ffffff',
  },
  electronics: {
    backgroundColor: '#0f172a',
    textColor: '#f8fafc',
    buttonColor: '#22d3ee',
    buttonTextColor: '#082f49',
    badgeColor: '#f97316',
    badgeTextColor: '#ffffff',
  },
  fashion: {
    backgroundColor: '#fff1f2',
    textColor: '#4c1d2f',
    buttonColor: '#be185d',
    buttonTextColor: '#ffffff',
    badgeColor: '#fb7185',
    badgeTextColor: '#ffffff',
  },
  grocery: {
    backgroundColor: '#f0fdf4',
    textColor: '#14532d',
    buttonColor: '#15803d',
    buttonTextColor: '#ffffff',
    badgeColor: '#facc15',
    badgeTextColor: '#422006',
  },
  beauty: {
    backgroundColor: '#fdf2f8',
    textColor: '#701a45',
    buttonColor: '#a21caf',
    buttonTextColor: '#ffffff',
    badgeColor: '#e11d48',
    badgeTextColor: '#ffffff',
  },
  general: {
    backgroundColor: '#eef2ff',
    textColor: '#1e1b4b',
    buttonColor: '#4f46e5',
    buttonTextColor: '#ffffff',
    badgeColor: '#e11d48',
    badgeTextColor: '#ffffff',
  },
}

const templateNames: Record<ArtTemplate, string> = {
  professional: 'Oferta Profissional',
  electronics: 'Tech Impact',
  fashion: 'Moda Editorial',
  grocery: 'Feira Fresca',
  beauty: 'Beleza Premium',
  general: 'Oferta em Destaque',
}

function delimiterFor(text: string) {
  let commas = 0
  let semicolons = 0
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '"') {
      if (quoted && text[index + 1] === '"') index += 1
      else quoted = !quoted
    } else if (!quoted && (char === '\n' || char === '\r')) {
      break
    } else if (!quoted && char === ',') commas += 1
    else if (!quoted && char === ';') semicolons += 1
  }
  return semicolons > commas ? ';' : ','
}

function parseRows(text: string, delimiter: string) {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (!quoted && char === delimiter) {
      row.push(field.trim())
      field = ''
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(field.trim())
      if (row.some(value => value !== '')) rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }

  if (quoted) throw new Error('O CSV contém aspas sem fechamento.')
  row.push(field.trim())
  if (row.some(value => value !== '')) rows.push(row)
  return rows
}

function normalizeHeader(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

export function parseProductCsv(text: string): BulkProduct[] {
  const normalizedText = text.replace(/^\uFEFF/, '')
  const rows = parseRows(normalizedText, delimiterFor(normalizedText))
  if (rows.length < 2) throw new Error('O CSV precisa ter cabeçalho e ao menos um produto.')

  const headers = rows[0].map(normalizeHeader)
  const nameIndex = headers.findIndex(header =>
    ['produto', 'nome', 'name', 'product', 'title'].includes(header),
  )
  const salePriceIndex = headers.findIndex(header =>
    ['precopromocional', 'precooferta', 'saleprice', 'promotionalprice'].includes(header),
  )
  const originalPriceIndex = headers.findIndex(header =>
    ['precooriginal', 'precocheio', 'priceoriginal', 'regularprice', 'listprice'].includes(header),
  )
  const priceIndex = headers.findIndex(header =>
    ['preco', 'valor', 'price', 'saleprice'].includes(header),
  )
  const discountIndex = headers.findIndex(header =>
    ['desconto', 'discount', 'off'].includes(header),
  )
  const imageIndex = headers.findIndex(header =>
    ['imagemurl', 'imagem', 'imageurl', 'image'].includes(header),
  )
  const categoryIndex = headers.findIndex(header =>
    ['categoria', 'category'].includes(header),
  )
  const unitIndex = headers.findIndex(header => ['unidade', 'saleunit'].includes(header))
  const barcodeIndex = headers.findIndex(header => ['ean', 'ean13', 'codigodebarras', 'barcode'].includes(header))
  const qrIndex = headers.findIndex(header => ['qrcode', 'qrurl', 'urlqr'].includes(header))
  const descriptionIndex = headers.findIndex(header => ['descricao', 'description'].includes(header))
  if (nameIndex < 0) {
    throw new Error('Inclua uma coluna de produto com cabeçalho "produto" ou "nome".')
  }

  return rows.slice(1).map((cells, index) => {
    const name = cells[nameIndex]?.trim()
    if (!name) throw new Error(`O produto da linha ${index + 2} está sem nome.`)
    return {
      name,
      price: salePriceIndex >= 0
        ? cells[salePriceIndex] ?? ''
        : priceIndex < 0 ? '' : cells[priceIndex] ?? '',
      originalPrice: originalPriceIndex < 0 ? '' : cells[originalPriceIndex] ?? '',
      discount: discountIndex < 0 ? '' : cells[discountIndex] ?? '',
      imageUrl: imageIndex < 0 ? '' : cells[imageIndex] ?? '',
      category: categoryIndex < 0 ? '' : cells[categoryIndex] ?? '',
      ...(unitIndex >= 0 && cells[unitIndex] ? { saleUnit: cells[unitIndex].trim().toLowerCase() } : {}),
      ...(barcodeIndex >= 0 && cells[barcodeIndex] ? { barcode: cells[barcodeIndex].trim() } : {}),
      ...(qrIndex >= 0 && cells[qrIndex] ? { qrUrl: cells[qrIndex].trim() } : {}),
      ...(descriptionIndex >= 0 && cells[descriptionIndex] ? { description: cells[descriptionIndex].trim().slice(0, 280) } : {}),
    }
  })
}

export function templateForProduct(product: BulkProduct, index: number): ArtTemplate {
  return templateForText(product.category) ?? automaticTemplates[index % automaticTemplates.length]
}

function templateForText(value: string): ArtTemplate | null {
  const text = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (/eletron|tecnolog|celular|informat|fone|comput/.test(text)) return 'electronics'
  if (/moda|roupa|vestuario|calcado|fashion|tenis/.test(text)) return 'fashion'
  if (/supermerc|mercado|alimento|comida|bebida|food|mercearia/.test(text)) return 'grocery'
  if (/beleza|cosmet|perfume|skincare|maquiagem/.test(text)) return 'beauty'
  return null
}

function imageFilename(product: BulkProduct) {
  if (product.imageName) return product.imageName
  const source = product.imageUrl || product.sourceImageUrl || ''
  if (!source || source.startsWith('blob:') || source.startsWith('data:')) return ''
  try {
    const filename = new URL(source, 'https://promoforge.invalid').pathname.split('/').pop() || ''
    return decodeURIComponent(filename)
  } catch {
    return source.split(/[?#]/)[0].split(/[\\/]/).pop() || ''
  }
}

export function getPhotoCompatibilityWarning(product: BulkProduct) {
  if (!product.imageUrl) return null
  const filename = imageFilename(product)
  const imageTemplate = templateForText(filename)
  const productTemplate = templateForText(product.category) ?? templateForText(product.name)
  if (!filename || !imageTemplate || !productTemplate || imageTemplate === productTemplate) return null
  return `A foto "${filename}" parece ser de outra categoria. Ela foi mantida; confira ou substitua a imagem.`
}

function templatePositions(template: ArtTemplate): Record<ArtElement, ArtRect> {
  if (template === 'professional') return {
    callout: { x: 78, y: 31, width: 704, height: 115 },
    brandLogo: { x: 830, y: 25, width: 188, height: 118 },
    photo: { x: 112, y: 203, width: 856, height: 420 },
    badge: { x: 193, y: 957, width: 694, height: 75 },
    title: { x: 65, y: 620, width: 950, height: 106 },
    originalPrice: { x: 95, y: 727, width: 890, height: 52 },
    salePrice: { x: 96, y: 782, width: 888, height: 164 },
    cta: { x: 342, y: 1035, width: 396, height: 33 },
  }
  const photoPosition: Record<Exclude<ArtTemplate, 'professional'>, ArtRect> = {
    electronics: { x: 500, y: 220, width: 520, height: 640 },
    fashion: { x: 510, y: 210, width: 510, height: 660 },
    grocery: { x: 500, y: 260, width: 520, height: 600 },
    beauty: { x: 505, y: 220, width: 515, height: 650 },
    general: { x: 500, y: 230, width: 520, height: 640 },
  }
  return {
    photo: { ...photoPosition[template] },
    callout: { x: 72, y: 232, width: 410, height: 48 },
    title: { x: 72, y: 312, width: 405, height: 170 },
    originalPrice: { x: 72, y: 562, width: 405, height: 44 },
    salePrice: { x: 72, y: 636, width: 410, height: 100 },
    badge: { x: 850, y: 42, width: 180, height: 180 },
    cta: { x: 72, y: 838, width: 370, height: 88 },
    brandLogo: { x: 70, y: 56, width: 200, height: 100 },
  }
}

export function professionalOfferLayout(): Pick<ArtworkConfig, 'positions' | 'badgeStyle' | 'height' | 'priceSize' | 'titleSize'> {
  return { positions: templatePositions('professional'), badgeStyle: 'ribbon', height: 1350, priceSize: 150, titleSize: 80 }
}

export function defaultArtworkPhoto(template: ArtTemplate) {
  return templatePositions(template).photo
}

export function clampArtworkRect(
  rect: ArtRect,
  minimumWidth = 90,
  minimumHeight = 60,
  margin = 8,
  maximumWidth = ARTWORK_SIZE,
  maximumHeight = ARTWORK_SIZE,
): ArtRect {
  const maximumWidthInCanvas = Math.min(ARTWORK_SIZE - margin * 2, maximumWidth)
  const maximumHeightInCanvas = Math.min(ARTWORK_SIZE - margin * 2, maximumHeight)
  const dimension = (value: number, minimum: number) => {
    const safeValue = Number.isFinite(value) ? value : minimum
    return Math.max(minimum, Math.min(maximumWidthInCanvas, safeValue))
  }
  const width = dimension(rect.width, minimumWidth)
  const height = Math.max(
    minimumHeight,
    Math.min(maximumHeightInCanvas, Number.isFinite(rect.height) ? rect.height : minimumHeight),
  )
  const x = Number.isFinite(rect.x) ? rect.x : margin
  const y = Number.isFinite(rect.y) ? rect.y : margin
  return {
    x: Math.max(margin, Math.min(ARTWORK_SIZE - margin - width, x)),
    y: Math.max(margin, Math.min(ARTWORK_SIZE - margin - height, y)),
    width,
    height,
  }
}

const elementLimits: Record<ArtElement, { margin: number; width: number; height: number }> = {
  photo: { margin: 40, width: 1000, height: 1000 },
  callout: { margin: 8, width: 650, height: 140 },
  title: { margin: 8, width: 700, height: 400 },
  originalPrice: { margin: 8, width: 700, height: 150 },
  salePrice: { margin: 8, width: 700, height: 250 },
  badge: { margin: 8, width: 280, height: 280 },
  cta: { margin: 8, width: 650, height: 220 },
  brandLogo: { margin: 8, width: 500, height: 260 },
}

export function clampArtworkElementRect(element: ArtElement, rect: ArtRect, template?: ArtTemplate): ArtRect {
  const limits = elementLimits[element]
  if (template === 'professional') return clampArtworkRect(rect, 90, 32, limits.margin, 1000, limits.height)
  return clampArtworkRect(rect, 90, 60, limits.margin, limits.width, limits.height)
}

const artElements: ArtElement[] = [
  'photo',
  'callout',
  'title',
  'originalPrice',
  'salePrice',
  'badge',
  'cta',
  'brandLogo',
]

export function normalizeArtworkConfig(config: ArtworkConfig): ArtworkConfig {
  const defaults = templatePositions(config.template)
  const positions = Object.fromEntries(artElements.map(element => {
    const position = config.positions?.[element]
    return [element, position
      ? clampArtworkElementRect(element, position, config.template)
      : defaults[element]]
  })) as Record<ArtElement, ArtRect>
  return {
    ...config,
    height: config.template === 'professional' && ARTWORK_HEIGHTS.includes(config.height ?? 1080) ? config.height : undefined,
    professional: config.template === 'professional' ? { ...professionalDefaults, ...config.professional } : config.professional,
    presentation: config.presentation ?? (config.template === 'professional' ? {} : undefined),
    badgeStyle: config.badgeStyle ?? 'burst',
    brand: config.brand ? {
      ...config.brand,
      showLogo: config.brand.showLogo ?? true,
      showInstagram: config.brand.showInstagram ?? Boolean(config.brand.instagram),
      showWhatsapp: config.brand.showWhatsapp ?? Boolean(config.brand.whatsapp),
      showWebsite: config.brand.showWebsite ?? Boolean(config.brand.website),
    } : undefined,
    positions,
  }
}

export function formatPrice(value: string) {
  if (!value) return ''
  const digits = value.replace(/[^\d,.-]/g, '')
  const normalized = digits.includes(',')
    ? digits.replace(/\./g, '').replace(',', '.')
    : digits
  const amount = Number(normalized)
  return Number.isFinite(amount)
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount)
    : value
}

function priceAmount(value: string) {
  const digits = value.replace(/[^\d,.-]/g, '')
  const normalized = digits.includes(',')
    ? digits.replace(/\./g, '').replace(',', '.')
    : digits
  const amount = Number(normalized)
  return Number.isFinite(amount) ? amount : null
}

function initialDiscountLabel(discount: string, originalPrice: string, salePrice: string) {
  const amount = /(\d+(?:[.,]\d+)?)\s*%/.exec(discount)?.[1]
  if (amount) return `-${amount}%`
  if (/^\s*\d+(?:[.,]\d+)?\s*$/.test(discount)) return `-${discount.trim()}%`
  const original = priceAmount(originalPrice)
  const sale = priceAmount(salePrice)
  if (original && sale !== null && sale < original) {
    const percent = Math.round(((original - sale) / original) * 100)
    if (percent > 0) return `-${percent}%`
  }
  return 'OFERTA'
}

function readableTextColor(color: string) {
  const channels = /^#([0-9a-f]{6})$/i.exec(color)?.[1]
  if (!channels) return '#ffffff'
  const values = [0, 2, 4].map(offset =>
    Number.parseInt(channels.slice(offset, offset + 2), 16) / 255,
  ).map(value => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722 > 0.42
    ? '#111827'
    : '#ffffff'
}

export function applyStoreBrandToArtwork(config: ArtworkConfig, brand: ArtworkBrand): ArtworkConfig {
  return normalizeArtworkConfig({
    ...config,
    buttonColor: brand.primaryColor,
    buttonTextColor: readableTextColor(brand.primaryColor),
    badgeColor: brand.secondaryColor,
    badgeTextColor: readableTextColor(brand.secondaryColor),
    brand: { ...brand },
  })
}

export function createArtworkConfig(
  product: BulkProduct,
  index: number,
  brand?: ArtworkBrand,
): ArtworkConfig {
  const template = templateForProduct(product, index)
  const config: ArtworkConfig = {
    template,
    ...palette[template],
    productName: product.name,
    callout: product.discount ? 'OFERTA POR TEMPO LIMITADO' : 'DESTAQUE DA SEMANA',
    cta: 'COMPRE AGORA',
    originalPrice: product.originalPrice || '',
    salePrice: product.price,
    discount: initialDiscountLabel(product.discount, product.originalPrice || '', product.price),
    badgeStyle: 'burst',
    fontFamily: 'Arial',
    titleSize: 56,
    priceSize: 78,
    positions: templatePositions(template),
  }
  return brand ? applyStoreBrandToArtwork(config, brand) : config
}

export function changeArtworkTemplate(
  product: BulkProduct,
  current: ArtworkConfig,
  template: ArtTemplate,
  index: number,
): ArtworkConfig {
  const defaults = createArtworkConfig({ ...product, category: '' }, index)
  return {
    ...defaults,
    ...palette[template],
    ...(template === 'professional' ? professionalOfferLayout() : {}),
    template,
    productName: current.productName,
    callout: template === 'professional' && current.template !== template ? 'Oferta especial' : current.callout,
    cta: template === 'professional' && current.template !== template ? '' : current.cta,
    height: template === 'professional' ? current.height ?? 1350 : current.height,
    professional: current.professional,
    offerLogo: current.offerLogo,
    offerDetails: current.offerDetails,
    presentation: current.presentation ?? (template === 'professional' ? {} : undefined),
    originalPrice: current.originalPrice,
    salePrice: current.salePrice,
    discount: current.discount,
    badgeStyle: template === 'professional' ? 'ribbon' : current.badgeStyle === 'ribbon' ? 'burst' : current.badgeStyle ?? 'burst',
    brand: current.brand,
    buttonColor: (template !== 'professional' && current.brand?.primaryColor) || palette[template].buttonColor,
    buttonTextColor: current.brand && template !== 'professional'
      ? readableTextColor(current.brand.primaryColor)
      : palette[template].buttonTextColor,
    badgeColor: (template !== 'professional' && current.brand?.secondaryColor) || palette[template].badgeColor,
    badgeTextColor: current.brand && template !== 'professional'
      ? readableTextColor(current.brand.secondaryColor)
      : palette[template].badgeTextColor,
    positions: {
      ...templatePositions(template),
      brandLogo: template === 'professional' ? templatePositions(template).brandLogo : current.positions.brandLogo,
    },
  }
}

export function getElementBounds(config: ArtworkConfig): Record<ArtElement, ArtRect> {
  return normalizeArtworkConfig(config).positions
}

export function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath()
  context.moveTo(x + radius, y)
  context.lineTo(x + width - radius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + radius)
  context.lineTo(x + width, y + height - radius)
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  context.lineTo(x + radius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - radius)
  context.lineTo(x, y + radius)
  context.quadraticCurveTo(x, y, x + radius, y)
  context.closePath()
}

type LoadedProductImage = { image: HTMLImageElement | null; error: string | null }
const productImageCache = new Map<string, Promise<LoadedProductImage>>()
const PRODUCT_IMAGE_CACHE_LIMIT = 128

export function loadProductImage(url: string): Promise<LoadedProductImage> {
  if (!url) return Promise.resolve({ image: null, error: null })
  const cached = productImageCache.get(url)
  if (cached) {
    productImageCache.delete(url)
    productImageCache.set(url, cached)
    return cached
  }

  let parsedUrl: URL | null = null
  try {
    parsedUrl = new URL(url)
  } catch {
    const result = Promise.resolve({
      image: null,
      error: 'URL da imagem inválida.',
    })
    return result
  }
  const allowedProtocol = ['http:', 'https:', 'blob:'].includes(parsedUrl.protocol)
  const dataUrlAllowed = /^data:image\/(?:png|jpeg|webp);base64,/i.test(url)
  if (!allowedProtocol && !dataUrlAllowed) {
    return Promise.resolve({ image: null, error: 'Formato de URL de imagem não suportado.' })
  }

  let request: Promise<LoadedProductImage>
  request = new Promise(resolve => {
    const image = new Image()
    const timeout = window.setTimeout(() => {
      if (productImageCache.get(url) === request) productImageCache.delete(url)
      resolve({ image: null, error: 'A imagem demorou demais para carregar.' })
    }, 8000)
    image.crossOrigin = parsedUrl?.protocol === 'http:' || parsedUrl?.protocol === 'https:'
      ? 'anonymous'
      : ''
    image.onload = () => {
      window.clearTimeout(timeout)
      resolve({ image, error: null })
    }
    image.onerror = () => {
      window.clearTimeout(timeout)
      if (productImageCache.get(url) === request) productImageCache.delete(url)
      resolve({ image: null, error: 'Imagem indisponível ou bloqueada por CORS.' })
    }
    image.src = url
  })
  productImageCache.set(url, request)
  if (productImageCache.size > PRODUCT_IMAGE_CACHE_LIMIT) {
    const oldest = productImageCache.keys().next().value
    if (oldest !== undefined) productImageCache.delete(oldest)
  }
  return request
}

function drawTemplateBackground(
  context: CanvasRenderingContext2D,
  template: ArtTemplate,
  backgroundColor: string,
) {
  context.fillStyle = backgroundColor
  context.fillRect(0, 0, 1080, 1080)
  if (template === 'electronics') {
    context.globalAlpha = 0.18
    context.strokeStyle = '#22d3ee'
    context.lineWidth = 3
    for (let index = 0; index < 5; index += 1) {
      context.beginPath()
      context.moveTo(690 + index * 75, 0)
      context.lineTo(1080, 280 + index * 90)
      context.stroke()
    }
    context.globalAlpha = 1
    context.fillStyle = '#164e63'
    context.fillRect(0, 0, 1080, 34)
  } else if (template === 'fashion') {
    context.fillStyle = '#ffe4e6'
    context.beginPath()
    context.arc(1030, 190, 245, 0, Math.PI * 2)
    context.fill()
    context.strokeStyle = '#fda4af'
    context.lineWidth = 3
    context.beginPath()
    context.arc(1030, 190, 280, 0, Math.PI * 2)
    context.stroke()
  } else if (template === 'grocery') {
    context.fillStyle = '#dcfce7'
    context.fillRect(0, 0, 1080, 110)
    context.fillStyle = '#bbf7d0'
    context.beginPath()
    context.ellipse(975, 160, 115, 38, -0.5, 0, Math.PI * 2)
    context.fill()
  } else if (template === 'beauty') {
    context.fillStyle = '#fce7f3'
    context.beginPath()
    context.arc(1000, 80, 190, 0, Math.PI * 2)
    context.fill()
    context.fillStyle = '#fae8ff'
    context.beginPath()
    context.arc(510, 1040, 210, 0, Math.PI * 2)
    context.fill()
  } else {
    context.fillStyle = '#e0e7ff'
    context.beginPath()
    context.moveTo(0, 0)
    context.lineTo(370, 0)
    context.lineTo(0, 285)
    context.closePath()
    context.fill()
    context.strokeStyle = '#c7d2fe'
    context.lineWidth = 5
    context.beginPath()
    context.arc(1000, 1000, 245, Math.PI, Math.PI * 1.5)
    context.stroke()
  }
}

function drawImageCard(
  context: CanvasRenderingContext2D,
  position: ArtRect,
  image: HTMLImageElement | null,
  category: string,
) {
  context.save()
  context.shadowColor = 'rgba(15, 23, 42, .20)'
  context.shadowBlur = 28
  context.shadowOffsetY = 12
  roundedRect(context, position.x, position.y, position.width, position.height, 30)
  context.fillStyle = '#ffffff'
  context.fill()
  context.restore()

  context.save()
  roundedRect(context, position.x, position.y, position.width, position.height, 30)
  context.clip()
  const imageBackdrop = context.createLinearGradient(
    position.x,
    position.y,
    position.x + position.width,
    position.y + position.height,
  )
  imageBackdrop.addColorStop(0, '#ffffff')
  imageBackdrop.addColorStop(1, '#f1f5f9')
  context.fillStyle = imageBackdrop
  context.fillRect(position.x, position.y, position.width, position.height)
  if (image) {
    const scale = Math.min(
      (position.width - 24) / image.naturalWidth,
      (position.height - 24) / image.naturalHeight,
    )
    const width = image.naturalWidth * scale
    const height = image.naturalHeight * scale
    context.shadowColor = 'rgba(15, 23, 42, .20)'
    context.shadowBlur = 20
    context.shadowOffsetY = 12
    context.drawImage(
      image,
      position.x + (position.width - width) / 2,
      position.y + (position.height - height) / 2,
      width,
      height,
    )
  } else {
    const inset = 24
    roundedRect(
      context,
      position.x + inset,
      position.y + inset,
      position.width - inset * 2,
      position.height - inset * 2,
      24,
    )
    context.fillStyle = '#f8fafc'
    context.fill()
    context.setLineDash([12, 10])
    context.strokeStyle = '#cbd5e1'
    context.lineWidth = 3
    context.stroke()
    context.setLineDash([])

    const centerX = position.x + position.width / 2
    const centerY = position.y + position.height / 2 - 38
    const cameraWidth = Math.min(140, position.width * 0.29)
    const cameraHeight = Math.min(104, position.height * 0.18)
    context.strokeStyle = '#64748b'
    context.lineWidth = 7
    roundedRect(
      context,
      centerX - cameraWidth / 2,
      centerY - cameraHeight / 2,
      cameraWidth,
      cameraHeight,
      18,
    )
    context.stroke()
    context.beginPath()
    context.arc(centerX, centerY, 24, 0, Math.PI * 2)
    context.stroke()
    context.beginPath()
    context.arc(centerX + cameraWidth * 0.3, centerY - cameraHeight * 0.29, 6, 0, Math.PI * 2)
    context.fillStyle = '#64748b'
    context.fill()

    context.fillStyle = '#334155'
    context.textAlign = 'center'
    context.font = '800 27px Arial, sans-serif'
    context.fillText(
      `${category.toLocaleUpperCase('pt-BR') || 'PRODUTO'} · FOTO REAL`,
      centerX,
      position.y + position.height / 2 + 80,
      position.width * 0.84,
    )
    context.fillStyle = '#0f172a'
    context.font = '900 31px Arial, sans-serif'
    context.fillText('ADICIONE UMA FOTO', centerX, position.y + position.height / 2 + 132, position.width * 0.84)
    context.fillStyle = '#64748b'
    context.font = '500 20px Arial, sans-serif'
    context.fillText('PNG, JPG ou WebP', centerX, position.y + position.height / 2 + 170, position.width * 0.84)
  }
  context.restore()
}

function wrapText(context: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (line && context.measureText(next).width > width) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

function drawText(
  context: CanvasRenderingContext2D,
  text: string,
  position: ArtRect,
  color: string,
  font: string,
  fontSize: number,
  maxLines = 2,
) {
  if (!text) return
  context.fillStyle = color
  let fittedSize = fontSize
  context.font = `800 ${fittedSize}px "${font}", Arial, sans-serif`
  if (maxLines === 1) {
    while (
      fittedSize > 24
      && (context.measureText(text).width > position.width || fittedSize > position.height)
    ) {
      fittedSize -= 2
      context.font = `800 ${fittedSize}px "${font}", Arial, sans-serif`
    }
  }
  context.textAlign = 'left'
  const lineHeight = fittedSize * 1.12
  const firstBaseline = Math.min(position.y + fittedSize, ARTWORK_SIZE - 24)
  const boxLines = Math.max(1, Math.floor(position.height / lineHeight))
  const canvasLines = Math.max(1, Math.floor((ARTWORK_SIZE - 24 - firstBaseline) / lineHeight) + 1)
  const lines = (maxLines === 1 ? [text] : wrapText(context, text, position.width))
    .slice(0, Math.min(maxLines, boxLines, canvasLines))
  lines.forEach((line, index) => {
    context.fillText(line, position.x, firstBaseline + index * lineHeight, position.width)
  })
}

export function drawOfferBadge(context: CanvasRenderingContext2D, config: ArtworkConfig) {
  const badge = config.positions.badge
  const centerX = badge.x + badge.width / 2
  const centerY = badge.y + badge.height / 2
  const style = config.badgeStyle ?? 'burst'

  context.save()
  context.fillStyle = config.badgeColor
  context.beginPath()
  if (style === 'pill') {
    roundedRect(context, badge.x, badge.y, badge.width, badge.height, Math.min(badge.width, badge.height) / 2)
  } else if (style === 'circle') {
    context.ellipse(centerX, centerY, badge.width / 2, badge.height / 2, 0, 0, Math.PI * 2)
  } else {
    const points = 20
    for (let index = 0; index < points; index += 1) {
      const angle = -Math.PI / 2 + (index * Math.PI) / points
      const radius = index % 2 === 0 ? 1 : 0.88
      const x = centerX + Math.cos(angle) * badge.width * 0.5 * radius
      const y = centerY + Math.sin(angle) * badge.height * 0.5 * radius
      if (index === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    }
    context.closePath()
  }
  context.fill()
  context.strokeStyle = '#ffffff'
  context.lineWidth = 7
  context.stroke()

  const hasPercent = /%/.test(config.discount)
  context.fillStyle = config.badgeTextColor
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  if (hasPercent) {
    context.font = `800 ${Math.max(18, Math.min(24, badge.height * 0.11))}px "${config.fontFamily}", Arial, sans-serif`
    context.fillText('OFERTA', centerX, centerY - badge.height * 0.11, badge.width * 0.78)
    context.font = `900 ${Math.max(28, Math.min(52, badge.height * 0.24))}px "${config.fontFamily}", Arial, sans-serif`
    context.fillText(config.discount.toLocaleUpperCase('pt-BR'), centerX, centerY + badge.height * 0.1, badge.width * 0.82)
  } else {
    context.font = `900 ${Math.max(22, Math.min(40, badge.height * 0.18))}px "${config.fontFamily}", Arial, sans-serif`
    context.fillText(config.discount.toLocaleUpperCase('pt-BR'), centerX, centerY, badge.width * 0.82)
  }
  context.restore()
}

function drawBrandArtwork(
  context: CanvasRenderingContext2D,
  config: ArtworkConfig,
  logo: HTMLImageElement | null,
) {
  const brand = config.brand

  if (logo || brand?.showLogo) {
    const position = config.positions.brandLogo
    context.save()
    if (logo) {
      const scale = Math.min(
        (position.width - 24) / logo.naturalWidth,
        (position.height - 20) / logo.naturalHeight,
      )
      const width = logo.naturalWidth * scale
      const height = logo.naturalHeight * scale
      context.drawImage(
        logo,
        position.x + (position.width - width) / 2,
        position.y + (position.height - height) / 2,
        width,
        height,
      )
    } else if (brand) {
      context.fillStyle = '#0f172a'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.font = `800 ${Math.min(28, position.height * 0.32)}px "${config.fontFamily}", Arial, sans-serif`
      context.fillText(brand.name, position.x + position.width / 2, position.y + position.height / 2, position.width - 24)
    }
    context.restore()
  }
  if (!brand) return

  const contacts = [
    brand.showInstagram && brand.instagram
      ? `Instagram ${brand.instagram.startsWith('@') ? brand.instagram : `@${brand.instagram}`}`
      : '',
    brand.showWhatsapp && brand.whatsapp ? `WhatsApp ${brand.whatsapp}` : '',
    brand.showWebsite && brand.website
      ? brand.website.replace(/^https?:\/\//, '').replace(/\/$/, '')
      : '',
  ].filter(Boolean).join('  ·  ')
  if (!brand.slogan && !contacts) return

  const footerTextColor = readableTextColor(brand.primaryColor)
  context.save()
  context.fillStyle = brand.primaryColor
  context.fillRect(0, 962, ARTWORK_SIZE, 118)
  context.fillStyle = footerTextColor
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  if (brand.slogan) {
    context.font = `700 23px "${config.fontFamily}", Arial, sans-serif`
    context.fillText(brand.slogan, ARTWORK_SIZE / 2, 994, 980)
  }
  if (contacts) {
    context.font = `500 17px "${config.fontFamily}", Arial, sans-serif`
    context.fillText(contacts, ARTWORK_SIZE / 2, brand.slogan ? 1034 : 1020, 990)
  }
  context.restore()
}

function paintArtworkBackground(context: CanvasRenderingContext2D, image: HTMLImageElement, height: number) {
  const scale = Math.max(1080 / image.naturalWidth, height / image.naturalHeight)
  const width = image.naturalWidth * scale
  const imageHeight = image.naturalHeight * scale
  context.save()
  context.globalAlpha = 0.60
  context.drawImage(image, (1080 - width) / 2, (height - imageHeight) / 2, width, imageHeight)
  context.restore()
}

function paintArtworkHeading(context: CanvasRenderingContext2D, product: BulkProduct, config: ArtworkConfig) {
  const presentation = config.presentation
  if (!presentation) return
  const headerInk = presentation.headerTextColor ?? readableTextColor(config.backgroundColor)
  context.save()
  context.textAlign = 'left'
  context.textBaseline = 'middle'
  const withLogo = Boolean(config.offerLogo || (config.brand?.logoUrl && config.brand.showLogo))
  const logo = config.positions.brandLogo
  const left = withLogo && logo.y < 175 && logo.x < 480 ? Math.min(670, logo.x + logo.width + 26) : 70
  const width = withLogo && logo.y < 175 && logo.x >= 480 ? logo.x - left - 20 : 1008 - left
  context.fillStyle = presentation.storeNameColor ?? headerInk
  context.font = `800 42px "${config.fontFamily}", Arial, sans-serif`
  if (presentation.storeName) context.fillText(presentation.storeName, left, 78, width)
  context.fillStyle = presentation.subtitleColor ?? headerInk
  context.font = `500 26px "${config.fontFamily}", Arial, sans-serif`
  if (presentation.subtitle) context.fillText(presentation.subtitle, left, 134, width)
  const category = presentation.categoryLabel ?? product.category
  if (presentation.showCategory && category.trim()) {
    context.fillStyle = config.buttonColor
    context.fillRect(0, 168, 1080, 35)
    context.fillStyle = presentation.categoryTextColor ?? readableTextColor(config.buttonColor)
    context.font = `800 19px "${config.fontFamily}", Arial, sans-serif`
    context.fillText(category, 70, 185, 940)
  }
  context.restore()
}

function drawArtwork(
  context: CanvasRenderingContext2D,
  product: BulkProduct,
  config: ArtworkConfig,
  image: HTMLImageElement | null,
  logo: HTMLImageElement | null,
  background: HTMLImageElement | null,
  details: HTMLImageElement[],
  selectedElement: ArtElement | null,
) {
  context.clearRect(0, 0, 1080, 1080)
  drawTemplateBackground(context, config.template, config.backgroundColor)
  if (background) paintArtworkBackground(context, background, 1080)
  const presentation = config.presentation ?? {}

  context.save()
  roundedRect(context, 52, 202, 442, 738, 34)
  context.fillStyle = config.template === 'electronics'
    ? 'rgba(255, 255, 255, .07)'
    : 'rgba(255, 255, 255, .52)'
  context.fill()
  context.restore()

  if (image) {
    const layout = flyerImageLayout(config.positions.photo, details.length, presentation.photoScale)
    paintFlyerPhoto(context, image, layout.main, presentation)
    paintFlyerDetails(context, details, layout.details, config.badgeColor)
  } else drawImageCard(context, config.positions.photo, null, product.category)

  const callout = config.positions.callout
  context.save()
  context.font = `800 24px "${config.fontFamily}", Arial, sans-serif`
  const calloutText = config.callout.toLocaleUpperCase('pt-BR')
  const calloutWidth = Math.min(callout.width, context.measureText(calloutText).width + 42)
  roundedRect(context, callout.x, callout.y, calloutWidth, callout.height, callout.height / 2)
  context.fillStyle = config.badgeColor
  context.fill()
  context.fillStyle = presentation.headerTextColor ?? config.badgeTextColor
  context.textAlign = 'left'
  context.fillText(calloutText, callout.x + 21, callout.y + callout.height / 2 + 8, calloutWidth - 36)
  context.restore()

  drawText(context, config.productName, config.positions.title, config.textColor, config.fontFamily, config.titleSize, 3)

  if (config.originalPrice) {
    const position = config.positions.originalPrice
    const color = presentation.oldPriceColor ?? '#fff8df'
    const original = formatPrice(config.originalPrice)
    context.save()
    context.font = `600 ${Math.min(28, position.height * 0.47)}px "${config.fontFamily}", Arial, sans-serif`
    const width = Math.min(position.width, context.measureText(original).width + 34)
    roundedRect(context, position.x, position.y, width, position.height, 12)
    context.fillStyle = color
    context.fill()
    context.fillStyle = readableTextColor(color)
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    const x = position.x + width / 2
    const y = position.y + position.height / 2
    const textWidth = Math.min(context.measureText(original).width, width - 18)
    context.fillText(original, x, y, width - 18)
    context.fillRect(x - textWidth / 2, y, textWidth, 2)
    context.restore()
  }

  const sale = config.positions.salePrice
  const offerColor = presentation.offerColor ?? config.buttonColor
  const offerInk = presentation.offerTextColor ?? readableTextColor(offerColor)
  context.save()
  roundedRect(context, sale.x, sale.y, sale.width, sale.height, Math.min(28, sale.height / 4))
  context.fillStyle = offerColor
  context.fill()
  context.fillStyle = offerInk
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  const saleCenter = sale.x + sale.width / 2
  context.font = `800 ${Math.min(24, sale.height * 0.19)}px "${config.fontFamily}", Arial, sans-serif`
  context.fillText(presentation.offerLabel ?? 'OFERTA', saleCenter, sale.y + sale.height * 0.23, sale.width - 30)
  context.font = `900 ${Math.min(config.priceSize, sale.height * 0.56)}px "${config.fontFamily}", Arial, sans-serif`
  context.fillText(formatPrice(config.salePrice), saleCenter, sale.y + sale.height * 0.68, sale.width - 36)
  context.restore()

  drawOfferBadge(context, config)

  const button = config.positions.cta
  roundedRect(context, button.x, button.y, button.width, button.height, button.height / 2)
  context.fillStyle = config.buttonColor
  context.fill()
  context.fillStyle = config.buttonTextColor
  context.textAlign = 'center'
  context.font = `800 ${Math.min(32, button.height * 0.38)}px "${config.fontFamily}", Arial, sans-serif`
  context.fillText(config.cta.toLocaleUpperCase('pt-BR'), button.x + button.width / 2, button.y + button.height / 2 + 11, button.width - 24)

  drawBrandArtwork(context, config, logo)
  paintArtworkHeading(context, product, config)

  if (selectedElement) {
    const selected = config.positions[selectedElement]
    context.save()
    context.setLineDash([12, 8])
    context.strokeStyle = '#2563eb'
    context.lineWidth = 4
    context.strokeRect(selected.x, selected.y, selected.width, selected.height)
    context.setLineDash([])
    context.fillStyle = '#ffffff'
    context.strokeStyle = '#2563eb'
    context.lineWidth = 4
    context.beginPath()
    context.arc(selected.x + selected.width, selected.y + selected.height, 12, 0, Math.PI * 2)
    context.fill()
    context.stroke()
    context.restore()
  }
}

export async function renderArtworkCanvas(
  canvas: HTMLCanvasElement,
  product: BulkProduct,
  config: ArtworkConfig,
  selectedElement: ArtElement | null = null,
  imageOverride?: HTMLImageElement | null,
  pixelSize = 1080,
) {
  const normalized = normalizeArtworkConfig(config)
  const height = normalized.height ?? ARTWORK_SIZE
  canvas.width = pixelSize
  canvas.height = Math.round(pixelSize * height / ARTWORK_SIZE)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Não foi possível iniciar o renderizador de imagens.')
  const loaded = imageOverride === undefined
    ? await loadProductImage(product.imageUrl)
    : { image: imageOverride, error: null }
  let logo: HTMLImageElement | null = null
  const logoUrl = normalized.offerLogo || (normalized.brand?.showLogo ? normalized.brand.logoUrl : '')
  if (logoUrl) {
    const loadedLogo = await loadProductImage(logoUrl)
    if (!loadedLogo.image) {
      throw new Error(loadedLogo.error || 'Não foi possível carregar o logotipo.')
    }
    logo = loadedLogo.image
  }
  const [background, ...secondary] = await Promise.all(
    [normalized.presentation?.backgroundImage ?? '', ...(normalized.offerDetails ?? []).slice(0, 3)].map(loadProductImage),
  )
  const details = secondary.flatMap(detail => detail.image ? [detail.image] : [])
  const presentation = normalized.presentation
  const category = presentation?.categoryLabel ?? product.category
  context.scale(pixelSize / 1080, pixelSize / 1080)
  if (normalized.template === 'professional') {
    const colors = presentation?.offerColor ? { ...normalized, buttonColor: presentation.offerColor } : normalized
    drawProfessionalOffer(context, {
      ...colors, buttonTextColor: presentation?.offerTextColor ?? (presentation?.offerColor ? readableTextColor(presentation.offerColor) : normalized.buttonTextColor),
      cta: presentation?.subtitle || normalized.cta,
    }, height, loaded.image, logo, details, presentation && {
      photo: { ...presentation, shadowStrength: normalized.professional?.shadow === false ? 0 : normalized.professional?.shadowStrength },
      label: presentation.offerLabel ?? 'OFERTA', storeName: presentation.storeName ?? normalized.brand?.name,
      headerTextColor: presentation.headerTextColor, storeNameColor: presentation.storeNameColor, subtitleColor: presentation.subtitleColor,
      category: presentation.showCategory && category.trim() ? {
        label: category, color: presentation.categoryTextColor ?? '#ffffff',
      } : undefined,
      oldPriceStyle: presentation.oldPriceColor ? { fill: presentation.oldPriceColor, ink: readableTextColor(presentation.oldPriceColor) } : undefined,
      paintBackground: background.image ? pageHeight => paintArtworkBackground(context, background.image!, pageHeight) : undefined,
    })
    if (selectedElement) {
      const rect = normalized.positions[selectedElement]
      const ratio = height / ARTWORK_SIZE
      context.strokeStyle = '#2563eb'
      context.lineWidth = 4
      context.setLineDash([12, 8])
      context.strokeRect(rect.x, rect.y * ratio, rect.width, rect.height * ratio)
      context.setLineDash([])
      context.fillStyle = '#ffffff'
      context.beginPath()
      context.arc(rect.x + rect.width, (rect.y + rect.height) * ratio, 12, 0, Math.PI * 2)
      context.fill()
      context.stroke()
    }
  } else {
    drawArtwork(context, product, normalized, loaded.image, logo, background.image, details, selectedElement)
  }
  return { usedProductImage: Boolean(loaded.image), imageError: loaded.error || background.error || secondary.find(item => item.error)?.error || null }
}

export async function renderArtworkBlob(
  product: BulkProduct,
  config: ArtworkConfig,
  format: ArtFormat = 'png',
): Promise<{ blob: Blob; usedProductImage: boolean; imageError: string | null }> {
  const canvas = document.createElement('canvas')
  const result = await renderArtworkCanvas(canvas, product, config)
  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png'
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mimeType, 0.94))
  if (!blob || blob.size === 0) {
    throw new Error(`Falha ao exportar "${config.productName}" como ${format.toUpperCase()}.`)
  }
  return { blob, ...result }
}

export function productFilename(product: BulkProduct, index: number, extension = 'png') {
  const slug = product.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${String(index + 1).padStart(2, '0')}-${slug || 'produto'}.${extension}`
}

export function templateName(template: ArtTemplate) {
  return templateNames[template]
}
