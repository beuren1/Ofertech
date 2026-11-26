import { describe, expect, it } from 'vitest'
import {
  ART_TEMPLATES,
  ARTWORK_SIZE,
  clampArtworkElementRect,
  clampArtworkRect,
  changeArtworkTemplate,
  createArtworkConfig,
  getPhotoCompatibilityWarning,
  parseProductCsv,
  productFilename,
  templateForProduct,
} from './bulk'

describe('bulk product CSV', () => {
  it('parses semicolon-delimited Portuguese headers and quoted fields', () => {
    const products = parseProductCsv(
      '\uFEFFProduto;Preço original;Preço promocional;Desconto;imagem_url;Categoria\r\n"Caneca, edição especial";29,90;19,90;20% OFF;https://example.com/caneca.png;Casa\r\n',
    )
    expect(products).toEqual([
      {
        name: 'Caneca, edição especial',
        price: '19,90',
        originalPrice: '29,90',
        discount: '20% OFF',
        imageUrl: 'https://example.com/caneca.png',
        category: 'Casa',
      },
    ])
    expect(productFilename(products[0], 0)).toBe('01-caneca-edicao-especial.png')
    expect(ART_TEMPLATES).toEqual(['electronics', 'fashion', 'grocery', 'beauty', 'general', 'professional'])
    expect([0, 1, 2, 3, 4, 5].map(index => templateForProduct(products[0], index))).toEqual([
      ...ART_TEMPLATES.slice(0, -1), 'electronics',
    ])
  })

  it('rejects rows with missing product names instead of counting them', () => {
    expect(() => parseProductCsv('produto,preco\n,19.90')).toThrow(/linha 2.*sem nome/i)
  })

  it('supports the imagem column as an alternative image URL header', () => {
    expect(parseProductCsv('nome;imagem;categoria\nBatom;https://example.com/batom.png;Beleza')[0])
      .toMatchObject({
        name: 'Batom',
        imageUrl: 'https://example.com/batom.png',
        category: 'Beleza',
      })
  })

  it('chooses a matching category template and preserves product edits when changing layouts', () => {
    const product = {
      name: 'Fone sem fio',
      price: '199,90',
      discount: '20% OFF',
      imageUrl: 'https://example.com/fone.png',
      category: 'Eletrônicos',
    }
    const initial = createArtworkConfig(product, 4)
    const changed = changeArtworkTemplate(product, {
      ...initial,
      productName: 'Fone personalizado',
      salePrice: '179,90',
      callout: 'SÓ HOJE',
    }, 'fashion', 4)

    expect(initial.template).toBe('electronics')
    expect(changed).toMatchObject({
      template: 'fashion',
      productName: 'Fone personalizado',
      salePrice: '179,90',
      callout: 'SÓ HOJE',
    })
  })

  it('derives the offer percentage from original and promotional prices when CSV has no discount', () => {
    const config = createArtworkConfig({
      name: 'Liquidificador',
      price: '75,00',
      originalPrice: '100,00',
      discount: '',
      imageUrl: '',
      category: 'Eletrodoméstico',
    }, 0)

    expect(config).toMatchObject({
      originalPrice: '100,00',
      salePrice: '75,00',
      discount: '-25%',
      badgeStyle: 'burst',
    })
  })

  it('keeps the default offer badge clear of text and clamps resized elements to the canvas', () => {
    const config = createArtworkConfig({
      name: 'Tênis de corrida',
      price: '199,90',
      discount: '',
      imageUrl: '',
      category: 'Calçados',
    }, 0)
    const badge = config.positions.badge
    const callout = config.positions.callout
    const overlapsCallout = badge.x < callout.x + callout.width
      && badge.x + badge.width > callout.x
      && badge.y < callout.y + callout.height
      && badge.y + badge.height > callout.y
    const resized = clampArtworkRect({ x: 1040, y: 1050, width: 280, height: 300 })
    const oversizedBadge = clampArtworkElementRect('badge', { x: 1040, y: 1050, width: 600, height: 600 })
    const oversizedPhoto = clampArtworkElementRect('photo', { x: 0, y: 0, width: 4000, height: 4000 })

    expect(overlapsCallout).toBe(false)
    expect(resized.x + resized.width).toBeLessThanOrEqual(ARTWORK_SIZE)
    expect(resized.y + resized.height).toBeLessThanOrEqual(ARTWORK_SIZE)
    expect(resized).toEqual({ x: 792, y: 772, width: 280, height: 300 })
    expect(oversizedBadge).toEqual({ x: 792, y: 792, width: 280, height: 280 })
    expect(oversizedPhoto.x).toBeGreaterThanOrEqual(40)
    expect(oversizedPhoto.y).toBeGreaterThanOrEqual(40)
    expect(oversizedPhoto.x + oversizedPhoto.width).toBeLessThanOrEqual(1040)
    expect(oversizedPhoto.y + oversizedPhoto.height).toBeLessThanOrEqual(1040)
  })

  it('warns about a clearly mismatched photo without replacing it', () => {
    const product = {
      name: 'Camisa de linho',
      price: '99,90',
      discount: '',
      imageUrl: 'blob:local-image',
      imageName: 'fone-bluetooth.png',
      category: 'Moda',
    }

    expect(getPhotoCompatibilityWarning(product)).toMatch(/parece ser de outra categoria/i)
    expect(getPhotoCompatibilityWarning({ ...product, imageName: 'camisa-linho.png' })).toBeNull()
    expect(product.imageUrl).toBe('blob:local-image')
  })
})
