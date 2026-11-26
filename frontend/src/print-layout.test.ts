import { expect, it } from 'vitest'
import { flyerPdf, pngPrintDensity } from './flyerExport'
import { DEFAULT_PRINT, LABEL_GAP, PAPER, paperPixels, paginatePrint, printGrid, printPaper, printSettingsError, type PrintSettings } from './printLayout'
import { createFlyer, flyerCanvasSize, printProductErrors } from './flyers'

const formats = (Object.keys(PAPER) as PrintSettings['paper'][]).flatMap(format => (['portrait', 'landscape'] as const).map(orientation => ({ format, orientation })))

it.each(formats)('writes the physical dimensions of $format $orientation on every PDF page', ({ format, orientation }) => {
  const portrait = PAPER[format]
  const expected = orientation === 'portrait' ? portrait : { width: portrait.height, height: portrait.width }
  const settings = { ...DEFAULT_PRINT, paper: format, orientation }
  const paper = printPaper(settings)
  expect(paper).toEqual(expected)
  const pdf = flyerPdf([new Uint8Array([255, 216, 255, 217]), new Uint8Array([255, 216, 255, 217])], paper)
  return new Promise<void>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = () => {
      try {
        const text = reader.result as string
        const boxes = [...text.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)]
        expect(boxes).toHaveLength(2)
        for (const [, width, height] of boxes) {
          expect(Number(width) * 25.4 / 72).toBeCloseTo(paper.width, 3)
          expect(Number(height) * 25.4 / 72).toBeCloseTo(paper.height, 3)
        }
        const pixels = paperPixels(paper)
        expect(text).toContain(`/Width ${pixels.width} /Height ${pixels.height}`)
        expect(flyerCanvasSize({ ...createFlyer(true).design, print: settings }, 2)).toEqual(pixels)
        resolve()
      } catch (error) { reject(error) }
    }
    reader.readAsText(pdf)
  })
})

it('uses physical label sizes, margins and gutters when filling A4', () => {
  const labels = { ...DEFAULT_PRINT, kind: 'labels', labelWidth: 60, labelHeight: 40, margin: 8, copies: 2 } as const
  const grid = printGrid(labels)
  expect(grid).toEqual({ cols: 3, rows: 6, width: 60, height: 40 })
  expect(grid.cols * grid.width + (grid.cols - 1) * LABEL_GAP + 2 * labels.margin).toBeLessThanOrEqual(PAPER.A4.width)
  expect(grid.rows * grid.height + (grid.rows - 1) * LABEL_GAP + 2 * labels.margin).toBeLessThanOrEqual(PAPER.A4.height)
  expect(paginatePrint(Array.from({ length: 10 }, (_, index) => index), labels).map(page => page.length)).toEqual([18, 2])
  expect(paginatePrint([1, 2], { ...labels, mode: 'single', selectedProduct: 1 })).toEqual([[2, 2]])
  expect(printSettingsError({ ...labels, labelWidth: 200 })).toMatch(/caber/)
  expect(paginatePrint([1, 2], { ...DEFAULT_PRINT, paper: 'A3' })).toEqual([[1], [2]])
  expect(printPaper({ ...labels, orientation: 'landscape' })).toEqual(PAPER.A4)
  expect(printPaper({ ...DEFAULT_PRINT, orientation: undefined })).toEqual(PAPER.A4)
})

it('validates prices and safe photo formats while allowing an unfinished draft', () => {
  const product = { name: 'Café', category: '', price: '', originalPrice: '', discount: '', imageUrl: '' }
  expect(printProductErrors(product)).toEqual({})
  expect(printProductErrors(product, true)).toHaveProperty('price')
  expect(printProductErrors({ ...product, price: '-2,00', imageUrl: 'javascript:alert(1)' })).toMatchObject({
    price: expect.any(String), imageUrl: expect.any(String),
  })
  expect(printProductErrors({ ...product, price: '23,00', originalPrice: '20,00' })).toHaveProperty('price')
  expect(printProductErrors({ ...product, price: '19,90', originalPrice: '20,00', imageUrl: 'https://example.com/cafe.png' }, true)).toEqual({})
})

it('sets the PNG physical resolution to 300 DPI', async () => {
  const fixture = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5uoAAAAASUVORK5CYII='), letter => letter.charCodeAt(0))
  const png = pngPrintDensity(fixture)
  const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.readAsArrayBuffer(png)
  })
  const view = new DataView(bytes)
  expect(view.getUint32(33)).toBe(9)
  expect(view.getUint32(37)).toBe(0x70485973)
  expect(view.getUint32(41)).toBe(11811)
  expect(view.getUint32(45)).toBe(11811)
  expect(view.getUint8(49)).toBe(1)
})
