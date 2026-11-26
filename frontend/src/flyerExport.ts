import JSZip from 'jszip'
import { FLYER_EXPORT_SCALE, renderFlyerPage, type FlyerDesign, type FlyerPage } from './flyers'
import { PAPER, paperPixels, PRINT_DPI, printPaper, type PaperSize } from './printLayout'

export function flyerPdf(images: Uint8Array[], paper: PaperSize = PAPER.A4, pageSizes?: PaperSize[]) {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  const offsets = [0]
  let length = 0
  const points = (millimeters: number) => (millimeters * 72 / 25.4).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
  function write(value: string | Uint8Array) {
    const bytes = typeof value === 'string' ? encoder.encode(value) : value
    chunks.push(bytes)
    length += bytes.length
  }
  function object(id: number, body: string, stream?: Uint8Array) {
    offsets[id] = length
    write(`${id} 0 obj\n${body}\n`)
    if (stream) {
      write('stream\n')
      write(stream)
      write('\nendstream\n')
    }
    write('endobj\n')
  }

  write('%PDF-1.6\n')
  object(1, '<< /Type /Catalog /Pages 2 0 R /ViewerPreferences << /PrintScaling /None >> >>')
  const pageIds = images.map((_, index) => 3 + index * 3)
  object(2, `<< /Type /Pages /Count ${images.length} /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] >>`)
  images.forEach((image, index) => {
    const size = pageSizes?.[index] ?? paper
    const width = points(size.width)
    const height = points(size.height)
    const pixels = paperPixels(size)
    const id = pageIds[index]
    object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Artwork ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`)
    object(id + 1, `<< /Type /XObject /Subtype /Image /Width ${pixels.width} /Height ${pixels.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>`, image)
    const content = encoder.encode(`q\n${width} 0 0 ${height} 0 0 cm\n/Artwork Do\nQ\n`)
    object(id + 2, `<< /Length ${content.length} >>`, content)
  })
  const xref = length
  write(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`)
  for (const offset of offsets.slice(1)) write(`${String(offset).padStart(10, '0')} 00000 n \n`)
  write(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  return new Blob(chunks, { type: 'application/pdf' })
}

export async function bannerPdf(pages: { jpeg: Blob; height: number }[]) {
  const mm = (pixels: number) => pixels * 25.4 / PRINT_DPI
  const sizes = pages.map(page => ({ width: mm(1080), height: mm(page.height) }))
  const images = await Promise.all(pages.map(async page => new Uint8Array(await page.jpeg.arrayBuffer())))
  return flyerPdf(images, PAPER.A4, sizes)
}

export function pngPrintDensity(bytes: Uint8Array) {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const chunk = new Uint8Array(21)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, 9)
  chunk.set([112, 72, 89, 115], 4)
  const density = Math.round(PRINT_DPI / 0.0254)
  view.setUint32(8, density)
  view.setUint32(12, density)
  chunk[16] = 1
  let crc = 0xffffffff
  for (const byte of chunk.subarray(4, 17)) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  view.setUint32(17, (crc ^ 0xffffffff) >>> 0)
  const parts = [bytes.subarray(0, 8)]
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const type = data.getUint32(offset + 4)
    const end = offset + 12 + data.getUint32(offset)
    if (end > bytes.length) throw new Error('Não foi possível preparar o PNG para impressão.')
    if (type !== 0x70485973) parts.push(bytes.subarray(offset, end))
    if (type === 0x49484452) parts.push(chunk)
    offset = end
  }
  return new Blob(parts, { type: 'image/png' })
}

async function renderFile(canvas: HTMLCanvasElement, page: FlyerPage, design: FlyerDesign, index: number, total: number, type: string) {
  const missing = await renderFlyerPage(canvas, page, design, index, total, FLYER_EXPORT_SCALE)
  if (missing) throw new Error('Uma ou mais imagens não carregaram. Revise as fotos antes de exportar.')
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('Não foi possível exportar a página.'))
    }, type, 0.96)
  })
  return design.print && type === 'image/png' ? pngPrintDensity(new Uint8Array(await blob.arrayBuffer())) : blob
}

export async function exportFlyer(pages: FlyerPage[], design: FlyerDesign, format: 'png' | 'pdf' | 'zip', index?: number) {
  const canvas = document.createElement('canvas')
  if (index !== undefined || (format === 'png' && pages.length === 1)) {
    const page = index ?? 0
    return {
      blob: await renderFile(canvas, pages[page], design, page, pages.length, 'image/png'),
      extension: index === undefined ? 'png' : `pagina-${page + 1}.png`,
    }
  }
  const zip = new JSZip()
  const images: Uint8Array[] = []
  for (const [page, content] of pages.entries()) {
    const blob = await renderFile(canvas, content, design, page, pages.length, format === 'pdf' ? 'image/jpeg' : 'image/png')
    if (format === 'pdf') images.push(new Uint8Array(await blob.arrayBuffer()))
    else zip.file(`pagina-${String(page + 1).padStart(2, '0')}.png`, await blob.arrayBuffer())
  }
  return format === 'pdf'
    ? { blob: flyerPdf(images, printPaper(design.print)), extension: 'pdf' }
    : { blob: await zip.generateAsync({ type: 'blob' }), extension: 'zip' }
}
