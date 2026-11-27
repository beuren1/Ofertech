import { describe, expect, it, vi } from 'vitest'
import { parseProductCsv } from './bulk'
import { flyerPdf } from './flyerExport'
import { dragFlyerPhoto, flyerImageLayout, flyerPhotoRect, paintFlyerPhoto, PRODUCT_GLOW_DEFAULTS } from './flyerOfferLayout'
import { createFlyer, FLYER_LAYOUTS, flyerDiscount, flyerGrid, flyerProduct, paginateFlyer, priceNumber, renderFlyerPage, reopenFlyer, type SavedFlyer } from './flyers'

const products = parseProductCsv(`produto;categoria;preco_original;preco_promocional;imagem_url
Café;Mercearia;20,00;15,00;https://example.com/cafe.png
Camisa;Moda;50,00;40,00;
Arroz;Mercearia;20,00;17,90;`).map(flyerProduct)

describe('encartes', () => {
  it('draws the configurable glow with the photo alpha and keeps the base shadow when disabled', () => {
    const blurAtDraw: number[] = []
    const colorAtDraw: string[] = []
    const context = {
      shadowBlur: 0, shadowColor: 'transparent',
      save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(),
      translate: vi.fn(), scale: vi.fn(), fillRect: vi.fn(),
      createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      getTransform: vi.fn(() => ({ a: 2, b: 0 })),
      drawImage: vi.fn(() => {
        blurAtDraw.push(context.shadowBlur)
        colorAtDraw.push(context.shadowColor)
      }),
    }
    const ctx = context as unknown as CanvasRenderingContext2D
    const photo = { naturalWidth: 240, naturalHeight: 120 } as HTMLImageElement
    const safe = { x: 0, y: 0, width: 240, height: 120 }
    paintFlyerPhoto(ctx, photo, safe, { glow: { enabled: false, color: '#ff0077', intensity: 80, blur: 9 } })
    paintFlyerPhoto(ctx, photo, safe, { glow: { ...PRODUCT_GLOW_DEFAULTS, color: '#aaccff', intensity: 40, blur: 6 } })
    paintFlyerPhoto(ctx, photo, safe, { glow: { ...PRODUCT_GLOW_DEFAULTS, color: '#aaccff', intensity: 200, blur: 10 } })
    expect(blurAtDraw).toEqual([0, 12, 6.4, 20])
    expect(colorAtDraw).toEqual(['transparent', '#aaccff3a', '#aaccfff5', '#aaccfff5'])
    expect(context.createRadialGradient).toHaveBeenCalledTimes(3)
    expect(context.drawImage).toHaveBeenCalledTimes(4)
  })

  it.each([[80, 200], [200, 80], [2200, 2200], [32, 32]])('centers and safely fits a %i by %i photo', (width, height) => {
    const area = { x: 10, y: 20, width: 400, height: 300 }
    const { main, details } = flyerImageLayout(area, 3)
    const centered = flyerPhotoRect(main, width, height)
    const enlarged = flyerPhotoRect(flyerImageLayout(area, 3, 160).main, width, height, { photoScale: 160 })
    expect(centered.x + centered.width / 2).toBeCloseTo(main.x + main.width / 2)
    expect(centered.y + centered.height / 2).toBeCloseTo(main.y + main.height / 2)
    expect(centered.width / centered.height).toBeCloseTo(width / height)
    expect(enlarged.width).toBeGreaterThan(flyerPhotoRect(main, width, height, { photoScale: 120 }).width)
    const adjusted = flyerPhotoRect(main, width, height, { photoScale: 120, photoX: 100, photoY: -100 })
    expect(adjusted.x + adjusted.width).toBeCloseTo(main.x + main.width)
    expect(adjusted.y).toBeCloseTo(main.y)
    expect(details[0].x).toBeGreaterThan(main.x + main.width)
    expect(details[2].y + details[2].height).toBeLessThan(area.y + area.height)
    expect(dragFlyerPhoto({ safe: main, image: centered }, 1000, -1000)).toEqual({ photoX: 100, photoY: -100 })
  })

  it.each([
    ['Camisa', '40,00', '50,00', /R\$\s*40,00/],
    ['Arroz integral tipo um em embalagem familiar com grãos selecionados condição exclusiva desta semana para todas as lojas participantes da campanha', '1.499,90', '1.999,90', /R\$\s*1\.499,90/],
  ])('draws an offer plaque, discount and complete price for %s', async (name, price, originalPrice, renderedPrice) => {
    const canvas = document.createElement('canvas')
    const roundRect = vi.fn()
    const context = {
      scale: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), roundRect, fill: vi.fn(), stroke: vi.fn(),
      fillRect: vi.fn(), fillText: vi.fn(), measureText: (text: string) => ({ width: text.length * 20 }),
    } as unknown as CanvasRenderingContext2D
    const getContext = vi.spyOn(canvas, 'getContext').mockReturnValue(context)
    try {
      const { design } = createFlyer()
      const product = { ...products[1], name, price, originalPrice, discount: '', featured: true, offerLabel: 'SUPER OFERTA' as const }
      await renderFlyerPage(canvas, { category: '', products: [product] }, design, 0, 1)
      expect(roundRect).toHaveBeenCalledTimes(3)
      expect(context.fillText).toHaveBeenCalledWith(expect.stringMatching(renderedPrice), 620, expect.any(Number))
      expect(context.fillText).toHaveBeenCalledWith('SUPER OFERTA', expect.any(Number), expect.any(Number))
      expect(context.fillText).toHaveBeenCalledWith(expect.stringMatching(/(?:20|25)% OFF/), expect.any(Number), expect.any(Number))
      if (name.length > 50) expect(vi.mocked(context.fillText).mock.calls.some(([text]) => String(text).endsWith('…'))).toBe(true)
    } finally {
      getContext.mockRestore()
    }
  })

  it('covers the entire page with a square background, cropping the excess at both sides', async () => {
    const canvas = document.createElement('canvas')
    const context = {
      scale: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(),
      fillRect: vi.fn(), fillText: vi.fn(), measureText: () => ({ width: 100 }), drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D
    const getContext = vi.spyOn(canvas, 'getContext').mockReturnValue(context)
    vi.stubGlobal('Image', class {
      naturalWidth = 1080
      naturalHeight = 1080
      onload?: () => void
      set src(_value: string) { queueMicrotask(() => this.onload?.()) }
    })
    try {
      const { design } = createFlyer()
      design.backgroundImage = 'https://example.test/square-background.png'
      design.categoryTextColor = '#ffee44'
      await renderFlyerPage(canvas, { category: 'Informática', products: [] }, design, 0, 1)
      expect(context.drawImage).toHaveBeenCalledWith(expect.anything(), -257, 0, 1754, 1754)
      expect(context.rect).toHaveBeenCalledWith(0, 0, 1240, 1754)
      expect(context.fillRect).toHaveBeenCalledWith(0, 224, 1240, 49)
      expect(context.fillRect).not.toHaveBeenCalledWith(0, 224, 1240, 14)
      expect(context.fillText).toHaveBeenCalledWith('Informática', 48, 258)

      design.layerPositions = { category: { x: 100, y: 0 }, backgroundImage: { x: 50, y: 0 } }
      await renderFlyerPage(canvas, { category: 'Informática', products: [] }, design, 0, 1)
      expect(context.drawImage).toHaveBeenCalledWith(expect.anything(), 53, 0, 1754, 1754)
      expect(context.fillText).toHaveBeenCalledWith('Informática', 1140, expect.any(Number))
    } finally {
      getContext.mockRestore()
      vi.unstubAllGlobals()
    }
  })

  it('moves an entire flyer card while keeping the other card in its grid slot', async () => {
    const canvas = document.createElement('canvas')
    const context = {
      scale: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(),
      roundRect: vi.fn(), rect: vi.fn(), fill: vi.fn(), stroke: vi.fn(),
      fillRect: vi.fn(), fillText: vi.fn(), measureText: () => ({ width: 50 }),
      getTransform: () => ({ a: 1, d: 1, e: 0, f: 0 }),
    } as unknown as CanvasRenderingContext2D
    vi.spyOn(canvas, 'getContext').mockReturnValue(context)
    const { design } = createFlyer()
    const first = { ...products[0], imageUrl: '' }
    const second = { ...products[1], imageUrl: '' }
    const report = vi.fn()
    await renderFlyerPage(canvas, { category: '', products: [first, second] }, design, 0, 1, 1, report)
    const initial = report.mock.calls.filter(([, , layer]) => layer === 'product')
    report.mockClear()
    await renderFlyerPage(canvas, { category: '', products: [{ ...first, cardPosition: { x: 100, y: 100 } }, second] }, design, 0, 1, 1, report)
    const moved = report.mock.calls.filter(([, , layer]) => layer === 'product')
    expect(moved[0][1].image).toMatchObject({ width: initial[0][1].image.width, height: initial[0][1].image.height })
    expect(moved[0][1].image.y).toBeGreaterThan(initial[0][1].image.y)
    expect(moved[1]).toEqual(initial[1])
  })

  it('draws poster layers in their saved positions and reports them for dragging', async () => {
    const canvas = document.createElement('canvas')
    const fillText = vi.fn()
    const drawImage = vi.fn()
    const context = {
      scale: vi.fn(), translate: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(),
      roundRect: vi.fn(), rect: vi.fn(), clip: vi.fn(), fill: vi.fn(), stroke: vi.fn(), strokeRect: vi.fn(),
      fillRect: vi.fn(), fillText, drawImage, measureText: (value: string) => ({ width: value.length * 1.5 }),
      createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      getTransform: vi.fn(() => ({ a: 1, b: 0, d: 1, e: 0, f: 0 })),
    } as unknown as CanvasRenderingContext2D
    vi.spyOn(canvas, 'getContext').mockReturnValue(context)
    vi.stubGlobal('Image', class {
      naturalWidth = 120
      naturalHeight = 90
      onload?: () => void
      set src(_value: string) { queueMicrotask(() => this.onload?.()) }
    })
    try {
      const { design } = createFlyer(true)
      const image = 'https://example.test/photo.jpg'
      Object.assign(design, { logo: image, backgroundImage: image, storeName: 'Mercado', subtitle: 'Esta semana' })
      const product = { ...products[0], imageUrl: image, offerColor: '#006633', oldPriceColor: '#fff8df' }
      const page = { category: '', products: [product] }
      const reportProduct = vi.fn()
      const reportDesign = vi.fn()
      await renderFlyerPage(canvas, page, design, 0, 1, 1, reportProduct, reportDesign)
      expect(reportProduct.mock.calls.map(([, , layer]) => layer)).toEqual(['photo', 'name', 'originalPrice', 'offer'])
      expect(reportDesign.mock.calls.map(([layer]) => layer)).toEqual(['backgroundImage', 'logo', 'storeName', 'subtitle', 'category'])
      expect(fillText).toHaveBeenCalledWith('OFERTA', expect.any(Number), expect.any(Number))
      expect(fillText).toHaveBeenCalledWith('25% OFF', expect.any(Number), expect.any(Number))
      expect(context.stroke).toHaveBeenCalledTimes(2)
      expect(context.fillRect).toHaveBeenCalledWith(0, 0, 210, 8 + (297 - 16) * 0.17)
      expect(context.fillRect).toHaveBeenCalledWith(0, 289, 210, 8)
      expect(context.rect).toHaveBeenCalledWith(-21, expect.closeTo(-29.7), 252, expect.closeTo(356.4))
      const before = fillText.mock.calls.find(([label]) => label === 'Mercado')
      expect(before).toBeDefined()

      design.layerPositions = { storeName: { x: 100, y: 100 }, backgroundImage: { x: 100, y: 100 } }
      fillText.mockClear()
      drawImage.mockClear()
      vi.mocked(context.rect).mockClear()
      await renderFlyerPage(canvas, page, design, 0, 1)
      expect(fillText.mock.calls.find(([label]) => label === 'Mercado')?.[1]).toBeGreaterThan(before?.[1])
      expect(drawImage).toHaveBeenCalledTimes(3)
      const [x, y, width, height] = vi.mocked(context.rect).mock.calls[0]
      expect(x).toBeCloseTo(0)
      expect(y).toBeCloseTo(0)
      expect(width).toBeGreaterThan(210)
      expect(height).toBeGreaterThan(297)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('reuses the CSV parser and groups products in order of first category appearance', () => {
    const pages = paginateFlyer(products, { grouped: true, layout: 4 })
    expect(pages.map(page => [page.category, page.products.map(product => product.name)])).toEqual([
      ['Mercearia', ['Café', 'Arroz']], ['Moda', ['Camisa']],
    ])
    expect(pages[0].products[0].imageUrl).toBe('https://example.com/cafe.png')
    expect(flyerDiscount(pages[0].products[0])).toBe('25% OFF')
    expect(flyerDiscount({ ...products[0], discount: 'Oferta' })).toBe('25% · Oferta')
  })

  it('keeps a featured offer first in its category and retains the selected page capacity', () => {
    const catalog = Array.from({ length: 5 }, (_, index) => ({
      ...products[0], name: `Item ${index}`, category: index === 4 ? 'mercearia' : 'Mercearia', featured: index === 4,
    }))
    const pages = paginateFlyer(catalog, { grouped: true, layout: 4 })
    expect(pages.map(page => page.products.length)).toEqual([4, 1])
    expect(pages[0].products[0]).toBe(catalog[4])
    expect(flyerGrid(4, 'standard', true, 4)).toEqual({ cols: 2, rows: 3 })
  })

  it('supports Brazilian and decimal prices and handles invalid values', () => {
    expect(priceNumber('R$ 1.299,90')).toBe(1299.9)
    expect(priceNumber('1299.90')).toBe(1299.9)
    expect(priceNumber('17,99,1')).toBeNaN()
    expect(priceNumber('-2,00')).toBeNaN()
    expect(flyerDiscount({ ...products[0], price: 'inválido', discount: '150%' })).toBe('')
  })

  it('supplies new design fields when reopening old projects', () => {
    const { storeName, border, badge, ...legacyDesign } = createFlyer().design
    const saved: SavedFlyer = { id: 8, name: 'Antigo', design: { ...legacyDesign, grouped: false }, products, updated_at: '' }
    const reopened = reopenFlyer(saved)
    expect(reopened.design).toMatchObject({ storeName, border, badge, grouped: false })
    expect(reopened.products).toEqual(products)
  })

  it.each(FLYER_LAYOUTS)('creates pages with at most %i products and preserves ordering', layout => {
    const catalog = Array.from({ length: layout * 2 + 1 }, (_, index) => ({ ...products[0], name: `Produto ${index}` }))
    const pages = paginateFlyer(catalog, { grouped: false, layout })
    expect(pages.map(page => page.products.length)).toEqual([layout, layout, 1])
    expect(pages.flatMap(page => page.products)).toEqual(catalog)
    for (const arrangement of ['standard', 'wide'] as const) {
      const { cols, rows } = flyerGrid(layout, arrangement)
      expect(cols * rows).toBeGreaterThanOrEqual(layout)
    }
  })

  it('writes one PDF page per image and valid cross-reference offsets', async () => {
    const imageBytes = new Uint8Array([255, 216, 255, 217])
    const pdf = flyerPdf([imageBytes, imageBytes])
    expect(pdf.type).toBe('application/pdf')
    const bytes = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsBinaryString(pdf)
    })
    expect(bytes).toContain('/Count 2')
    expect(bytes).toContain('/MediaBox [0 0 595.2756 841.8898]')
    expect(bytes).toContain('/Width 2480 /Height 3508')
    expect(bytes.match(/\/Type \/Page\b/g)).toHaveLength(2)
    const start = Number(/startxref\n(\d+)/.exec(bytes)?.[1])
    expect(bytes.slice(start, start + 4)).toBe('xref')
    const entries = bytes.slice(start).split('\n').slice(3, 11)
    entries.forEach((entry, index) => {
      const offset = Number(entry.slice(0, 10))
      expect(bytes.slice(offset)).toMatch(new RegExp(`^${index + 1} 0 obj`))
    })
  })
})
