import { afterEach, describe, expect, it, vi } from 'vitest'
import { changeArtworkTemplate, createArtworkConfig, normalizeArtworkConfig, renderArtworkBlob, renderArtworkCanvas } from './bulk'
import { toCampaignArtworkSnapshot } from './campaigns'
import { fitOfferLines } from './professionalOffer'

const product = {
  name: 'Café especial em grãos torrado, embalagem econômica de um quilo',
  imageUrl: '', price: '1.999,99', originalPrice: '2.999,99', discount: '', category: 'Mercado',
}
const professional = changeArtworkTemplate(product, createArtworkConfig(product, 0), 'professional', 0)

afterEach(() => vi.restoreAllMocks())

describe('Oferta Profissional', () => {
  it('fits long names and unbroken words inside the reserved lines', () => {
    const measure = (text: string) => text.length
    expect(fitOfferLines(product.name, 18, 2, measure)).toEqual(['Café especial em', 'grãos torrado, em…'])
    expect(fitOfferLines('SUPERCALIFRAGILISTIC', 8, 2, measure)).toEqual(['SUPERCAL', 'IFRAGIL…'])
  })

  it('keeps the configuration when saving, serializing and reopening in the editor', () => {
    expect(professional).toMatchObject({ callout: 'Oferta especial', discount: '-33%' })
    const config = normalizeArtworkConfig({
      ...professional, height: 1920, offerLogo: 'data:image/webp;base64,example', offerDetails: ['data:image/webp;base64,detail'],
      professional: { headingColor: '#064e3b', outlineColor: '#fde047', rays: false, shadow: false, glow: true },
      presentation: { storeName: 'Mercado', subtitle: 'Esta semana', oldPriceColor: '#442211', photoScale: 160, offerLabel: 'SUPER OFERTA', showCategory: true },
    })
    const snapshot = toCampaignArtworkSnapshot({ key: '1', index: 0, product, config, status: 'ready', error: null, imageWarning: null })
    const restored = normalizeArtworkConfig(JSON.parse(JSON.stringify(snapshot)).config)
    expect(restored).toEqual(config)
    expect(restored.positions.title.width).toBe(950)
  })

  it.each([1080, 1350, 1920] as const)('renders and encodes the same proportional layout at 1080×%i', async height => {
    const gradient = { addColorStop: vi.fn() }
    const drawImage = vi.fn()
    const fillText = vi.fn()
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createLinearGradient: () => gradient, createRadialGradient: () => gradient,
      save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(), closePath: vi.fn(), clip: vi.fn(), rect: vi.fn(), fillRect: vi.fn(),
      translate: vi.fn(), rotate: vi.fn(), fill: vi.fn(), stroke: vi.fn(), scale: vi.fn(), ellipse: vi.fn(), transform: vi.fn(),
      drawImage, fillText, getTransform: () => ({ a: 1, b: 0 }), measureText: (value: string) => ({ width: value.length * 24 }),
    } as unknown as CanvasRenderingContext2D)
    const exported = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback, mime) {
      exported(this.width, this.height, mime)
      callback(new Blob(['image'], { type: mime }))
    })
    const photo = { naturalWidth: 50, naturalHeight: 100 } as HTMLImageElement
    const preview = document.createElement('canvas')
    const config = { ...professional, height }
    await renderArtworkCanvas(preview, product, config, null, photo, 360)
    expect([preview.width, preview.height]).toEqual([360, height / 3])
    const [, , , width, photoHeight] = drawImage.mock.calls[0]
    expect(width / photoHeight).toBeCloseTo(0.5)
    expect(fillText.mock.calls.some(([label]) => /1\.999,99/.test(label))).toBe(true)
    expect(fillText.mock.calls.some(([label]) => label === '33% OFF • OFERTA')).toBe(true)
    await renderArtworkBlob(product, config, 'png')
    await renderArtworkBlob(product, config, 'jpeg')
    expect(exported.mock.calls).toEqual([[1080, height, 'image/png'], [1080, height, 'image/jpeg']])
    expect(getContext).toHaveBeenCalledTimes(3)
  })
})
