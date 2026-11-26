import type * as OpenCV from '@techstark/opencv-js'

export type CutoutMark = { x: number; y: number; foreground: boolean }

function findConnectedBackground(mask: Uint8Array, width: number, height: number, background: number) {
  const visited = new Uint8Array(mask.length)
  const queue = new Int32Array(mask.length)
  let total = 0
  const visit = (index: number) => {
    if (visited[index] || (mask[index] & 1)) return
    visited[index] = 1
    queue[total++] = index
  }
  // Hard background seeds include the border, existing transparency and the user's marks.
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === background) visit(i)
  }
  for (let head = 0; head < total; head++) {
    const index = queue[head]
    const x = index % width
    if (x > 0) visit(index - 1)
    if (x + 1 < width) visit(index + 1)
    if (index >= width) visit(index - width)
    if (index < width * (height - 1)) visit(index + width)
  }
  return visited
}

export function segmentProduct(cv: typeof OpenCV, pixels: ImageData, margin: number, marks: CutoutMark[]) {
  const { width, height, data } = pixels
  const source = cv.matFromImageData(pixels)
  const rgb = new cv.Mat()
  const mask = new cv.Mat(height, width, cv.CV_8UC1)
  const bg = new cv.Mat()
  const fg = new cv.Mat()
  try {
    cv.cvtColor(source, rgb, cv.COLOR_RGBA2RGB)
    const mx = Math.max(1, Math.round(width * margin))
    const my = Math.max(1, Math.round(height * margin))
    const labels = mask.data
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x
        labels[i] = x < mx || y < my || x >= width - mx || y >= height - my || data[i * 4 + 3] === 0
          ? cv.GC_BGD : cv.GC_PR_FGD
      }
    }
    const radius = Math.max(2, Math.round(Math.min(width, height) * 0.025))
    for (const mark of marks) {
      const mx = Math.round(mark.x * (width - 1))
      const my = Math.round(mark.y * (height - 1))
      for (let y = Math.max(0, my - radius); y <= Math.min(height - 1, my + radius); y++) {
        for (let x = Math.max(0, mx - radius); x <= Math.min(width - 1, mx + radius); x++) {
          if ((x - mx) ** 2 + (y - my) ** 2 <= radius ** 2) labels[y * width + x] = mark.foreground ? cv.GC_FGD : cv.GC_BGD
        }
      }
    }
    cv.grabCut(rgb, mask, new cv.Rect(0, 0, width, height), bg, fg, 3, cv.GC_INIT_WITH_MASK)
    const background = findConnectedBackground(mask.data, width, height, cv.GC_BGD)
    let visible = 0
    for (let i = 0; i < width * height; i++) {
      if (background[i]) data[i * 4 + 3] = 0
      if (data[i * 4 + 3]) visible++
    }
    if (!visible) throw new Error('O produto não foi identificado. Marque uma parte do produto e tente novamente.')
    if (visible === width * height) throw new Error('O fundo não foi identificado. Marque uma área do fundo e tente novamente.')
    return pixels
  } finally {
    source.delete()
    rgb.delete()
    mask.delete()
    bg.delete()
    fg.delete()
  }
}
