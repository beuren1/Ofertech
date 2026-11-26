import JSZip from 'jszip'
import { afterEach, expect, it, vi } from 'vitest'
import { bannerPdf, exportFlyer } from './flyerExport'
import { createFlyer, FLYER_EXPORT_SCALE, renderFlyerPage } from './flyers'

vi.mock('./flyers', async importOriginal => ({
  ...await importOriginal<typeof import('./flyers')>(),
  renderFlyerPage: vi.fn(async () => 0),
}))

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

it('keeps square and vertical banners at their own proportions in the same PDF', async () => {
  const bytes = Uint8Array.of(255, 216, 255, 217)
  const jpeg = Object.assign(new Blob([bytes], { type: 'image/jpeg' }), { arrayBuffer: async () => bytes.buffer })
  const pdf = await bannerPdf([{ jpeg, height: 1080 }, { jpeg, height: 1920 }])
  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsBinaryString(pdf)
  })
  expect(text).toContain('/MediaBox [0 0 259.2 259.2]')
  expect(text).toContain('/MediaBox [0 0 259.2 460.8]')
  expect(text).toContain('/Width 1080 /Height 1920')
})

it('exports the requested PNG and a ZIP with every PNG in page order', async () => {
  const bytes = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) => {
    const blob = Object.assign(new Blob([bytes], { type }), { arrayBuffer: async () => bytes.buffer })
    callback(blob)
  })
  const { design } = createFlyer()
  const pages = [{ category: 'Mercearia', products: [] }, { category: 'Hortifruti', products: [] }]
  const png = await exportFlyer(pages, design, 'png', 1)
  expect(png.extension).toBe('pagina-2.png')
  expect(png.blob.type).toBe('image/png')
  expect(renderFlyerPage).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), pages[1], design, 1, 2, FLYER_EXPORT_SCALE)

  const archive = await exportFlyer(pages, design, 'png')
  expect(archive.extension).toBe('zip')
  const archiveBytes = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = reject
    reader.readAsArrayBuffer(archive.blob)
  })
  const zip = await JSZip.loadAsync(archiveBytes)
  expect(Object.keys(zip.files)).toEqual(['pagina-01.png', 'pagina-02.png'])
  expect(await zip.file('pagina-01.png')!.async('uint8array')).toEqual(bytes)
})
