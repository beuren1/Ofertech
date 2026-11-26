import type { ArtRect } from './bulk'

export const PHOTO_DEFAULTS = { photoScale: 100, photoX: 0, photoY: 0 }
export const MAX_FLYER_PHOTO_SCALE = 160
export const PRODUCT_GLOW_DEFAULTS = { enabled: true, color: '#67bfff', intensity: 38, blur: 5 }
export const MAX_GLOW_INTENSITY = 200
export const OFFER_LABELS = ['OFERTA', 'SUPER OFERTA', 'APROVEITE', 'IMPERDÍVEL'] as const
export type PhotoAdjustment = Partial<typeof PHOTO_DEFAULTS>
export type ProductGlow = typeof PRODUCT_GLOW_DEFAULTS
export type FlyerPhotoSettings = PhotoAdjustment & { glow?: ProductGlow; shadowStrength?: number }
export type FlyerPhotoBounds = { safe: ArtRect; image: ArtRect }
export type FlyerTextLayer = 'name' | 'originalPrice' | 'offer'
export type FlyerLayer = 'photo' | FlyerTextLayer
export type FlyerTextPositions = Partial<Record<FlyerTextLayer, { x: number; y: number }>>
export type FlyerLayerReporter = (bounds: FlyerPhotoBounds, layer?: FlyerLayer) => void
export type FlyerDesignLayer = 'logo' | 'storeName' | 'subtitle' | 'category' | 'backgroundImage'
export type FlyerDesignPositions = Partial<Record<FlyerDesignLayer, { x: number; y: number }>>
export type PlaceFlyerDesignLayer = (layer: FlyerDesignLayer, original: ArtRect, safe?: ArtRect) => ArtRect

export function flyerTextBounds(safe: ArtRect, original: ArtRect, position?: { x: number; y: number }): FlyerPhotoBounds {
  const align = (start: number, length: number, size: number, offset: number) =>
    start + Math.max(0, length - size) * (Math.max(-100, Math.min(100, offset)) + 100) / 200
  return {
    safe,
    image: position ? { ...original,
      x: align(safe.x, safe.width, original.width, position.x),
      y: align(safe.y, safe.height, original.height, position.y),
    } : original,
  }
}

export function dragFlyerPhoto({ safe, image }: FlyerPhotoBounds, dx: number, dy: number): PhotoAdjustment {
  const offset = (position: number, start: number, space: number) =>
    space > 0.001 ? Math.round(Math.max(-100, Math.min(100, ((position - start) / space - 0.5) * 200))) : 0
  return {
    photoX: offset(image.x + dx, safe.x, safe.width - image.width),
    photoY: offset(image.y + dy, safe.y, safe.height - image.height),
  }
}

export function flyerImageLayout(area: ArtRect, detailCount: number, photoScale = PHOTO_DEFAULTS.photoScale) {
  const extraZoom = Math.max(0, Math.min(1, (photoScale - 120) / (MAX_FLYER_PHOTO_SCALE - 120)))
  const padding = Math.min(area.width, area.height) * (0.06 - extraZoom * 0.05)
  const main = { x: area.x + padding, y: area.y + padding, width: area.width - padding * 2, height: area.height - padding * 2 }
  const count = Math.min(3, detailCount)
  if (!count) return { main, details: [] }
  const diameter = Math.min(main.width * 0.16, main.height / (count + (count - 1) * 0.18))
  const gap = diameter * 0.18
  const total = count * diameter + (count - 1) * gap
  const details = Array.from({ length: count }, (_, index) => ({
    x: main.x + main.width - diameter,
    y: main.y + (main.height - total) / 2 + index * (diameter + gap),
    width: diameter,
    height: diameter,
  }))
  return { main: { ...main, width: main.width - diameter - gap }, details }
}

export function flyerPhotoRect(box: ArtRect, width: number, height: number, adjustment: PhotoAdjustment = {}): ArtRect {
  const clamp = (value: number, min: number, max: number, fallback: number) =>
    Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
  const zoom = clamp(adjustment.photoScale ?? 100, 50, 120, 100) / 120
  const fit = Math.min(box.width / width, box.height / height) * zoom
  const w = width * fit
  const h = height * fit
  return {
    x: box.x + (box.width - w) * (0.5 + clamp(adjustment.photoX ?? 0, -100, 100, 0) / 200),
    y: box.y + (box.height - h) * (0.5 + clamp(adjustment.photoY ?? 0, -100, 100, 0) / 200),
    width: w, height: h,
  }
}

export function paintFlyerPhoto(ctx: CanvasRenderingContext2D, photo: HTMLImageElement, safe: ArtRect, adjustment: FlyerPhotoSettings) {
  const image = flyerPhotoRect(safe, photo.naturalWidth, photo.naturalHeight, adjustment)
  const glow = adjustment.glow ?? PRODUCT_GLOW_DEFAULTS
  ctx.save()
  ctx.beginPath()
  ctx.rect(safe.x, safe.y, safe.width, safe.height)
  ctx.clip()

  ctx.save()
  ctx.translate(image.x + image.width / 2, image.y + image.height * 0.96)
  ctx.scale(image.width * 0.42, image.height * 0.13)
  const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
  const shadowOpacity = Math.max(0, Math.min(100, adjustment.shadowStrength ?? 55)) * 0.004
  shadow.addColorStop(0, `rgba(19, 32, 53, ${shadowOpacity})`)
  shadow.addColorStop(1, 'rgba(19, 32, 53, 0)')
  ctx.fillStyle = shadow
  ctx.fillRect(-1, -1, 2, 2)
  ctx.restore()

  if (glow.enabled && glow.intensity > 0) {
    const color = /^#[\da-f]{6}$/i.test(glow.color) ? glow.color : PRODUCT_GLOW_DEFAULTS.color
    const intensity = Math.min(MAX_GLOW_INTENSITY, glow.intensity)
    const alphaHex = (opacity: number) => Math.round(opacity * 255).toString(16).padStart(2, '0')
    const transform = ctx.getTransform()
    const deviceScale = Math.hypot(transform.a, transform.b)
    const photoSize = Math.min(image.width, image.height)
    const diffusion = photoSize * Math.min(10, Math.max(1, glow.blur)) / 100
    // Canvas shadows follow the source alpha. Blur is measured in device pixels.
    if (intensity > 55) {
      // Draw only the narrow shadow inside the clip by offsetting its source.
      const shift = safe.width + image.width
      ctx.shadowColor = `${color}${alphaHex(Math.min(0.96, (intensity - 55) / 150))}`
      ctx.shadowBlur = Math.max(1, Math.min(diffusion * 0.4, photoSize * 0.032) * deviceScale)
      ctx.shadowOffsetX = -shift * deviceScale
      ctx.shadowOffsetY = 0
      ctx.drawImage(photo, image.x + shift, image.y, image.width, image.height)
    }
    ctx.shadowColor = `${color}${alphaHex(Math.min(0.96, intensity * 1.45 / 255))}`
    ctx.shadowBlur = diffusion * deviceScale
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0
  }
  ctx.drawImage(photo, image.x, image.y, image.width, image.height)
  ctx.restore()
  return { safe, image }
}

export function paintFlyerDetails(ctx: CanvasRenderingContext2D, photos: HTMLImageElement[], boxes: ArtRect[], accent: string) {
  boxes.forEach(({ x, y, width }, index) => {
    const photo = photos[index]
    const fit = width / Math.min(photo.naturalWidth, photo.naturalHeight)
    const w = photo.naturalWidth * fit
    const h = photo.naturalHeight * fit
    ctx.save()
    ctx.beginPath()
    ctx.arc(x + width / 2, y + width / 2, width / 2, 0, Math.PI * 2)
    ctx.clip()
    ctx.fillStyle = '#fff8df'
    ctx.fillRect(x, y, width, width)
    ctx.drawImage(photo, x + (width - w) / 2, y + (width - h) / 2, w, h)
    ctx.restore()
    ctx.strokeStyle = accent
    ctx.lineWidth = Math.max(2, width * 0.035)
    ctx.stroke()
  })
}
