// @vitest-environment node
import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
import { segmentProduct } from './productCutout'

const cvRuntime = createRequire(import.meta.url)('@techstark/opencv-js') as Promise<typeof import('@techstark/opencv-js')>

it.each([48, 144])('separates a white background from white parts of a product at %i pixels', async size => {
  const cv = await Promise.resolve(cvRuntime)
  const data = new Uint8ClampedArray(size * size * 4).fill(255)
  const alpha = (x: number, y: number) => data[(y * size + x) * 4 + 3]
  const center = size / 2
  for (let y = size / 4; y < size * 3 / 4; y++) {
    for (let x = size / 4; x < size * 3 / 4; x++) {
      if (Math.hypot(x - center, y - center) < size / 9) continue
      const index = (y * size + x) * 4
      data.set([15, 75, 170, 255], index)
    }
  }
  segmentProduct(cv, { data, width: size, height: size, colorSpace: 'srgb' }, 0.08, [
    { x: 0.5, y: 0.5, foreground: true },
    { x: 0.15, y: 0.15, foreground: false },
  ])
  expect(alpha(0, 0)).toBe(0)
  expect(alpha(Math.floor(size * 0.15), Math.floor(size * 0.15))).toBe(0)
  expect(alpha(center, center)).toBe(255)
  expect(alpha(center + Math.floor(size / 13), center)).toBe(255)
  expect(alpha(center, size / 3)).toBe(255)
}, 20000)
