import { drawOfferBadge, formatPrice, professionalDefaults, roundedRect, type ArtworkConfig, type ArtRect } from './bulk'
import { flyerImageLayout, flyerTextBounds, paintFlyerDetails, paintFlyerPhoto, type FlyerLayerReporter, type FlyerPhotoSettings, type FlyerTextPositions, type PlaceFlyerDesignLayer } from './flyerOfferLayout'

type Context = CanvasRenderingContext2D
type Options = typeof professionalDefaults

function drawBackdrop(ctx: Context, config: ArtworkConfig, options: Options, height: number, paintBackground?: (height: number) => void, showHeaderOutline = true, bleed = 0) {
  if (bleed) {
    ctx.save()
    ctx.translate(-bleed, -bleed)
    ctx.scale(1 + 2 * bleed / 1080, 1 + 2 * bleed / height)
  }
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 1080, height)
  if (!bleed) {
    roundedRect(ctx, 0, 0, 1080, height, 40)
    ctx.clip()
  }
  ctx.fillStyle = config.backgroundColor
  ctx.fillRect(0, 0, 1080, height)
  const lighting = ctx.createRadialGradient(540, height * 0.56, 45, 540, height * 0.53, height * 0.68)
  lighting.addColorStop(0, 'rgba(255, 236, 90, 0.86)')
  lighting.addColorStop(0.56, 'rgba(255, 182, 6, 0.28)')
  lighting.addColorStop(1, 'rgba(178, 32, 0, 0.58)')
  ctx.fillStyle = lighting
  ctx.fillRect(0, 0, 1080, height)

  if (options.rays) {
    ctx.save()
    ctx.translate(540, height * 0.57)
    ctx.fillStyle = 'rgba(255, 227, 72, 0.18)'
    for (let index = 0; index < 18; index++) {
      ctx.rotate(Math.PI / 9)
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(height * 1.5, -height * 0.075)
      ctx.lineTo(height * 1.5, height * 0.075)
      ctx.fill()
    }
    ctx.restore()
  }
  paintBackground?.(height)
  ctx.beginPath()
  ctx.moveTo(-10, -10)
  ctx.lineTo(1090, -10)
  ctx.lineTo(1090, height * 0.145)
  ctx.quadraticCurveTo(1030, height * 0.195, 820, height * 0.17)
  ctx.quadraticCurveTo(540, height * 0.137, 250, height * 0.171)
  ctx.quadraticCurveTo(70, height * 0.192, -10, height * 0.15)
  ctx.closePath()
  ctx.fillStyle = options.headingColor
  ctx.fill()
  ctx.strokeStyle = options.outlineColor
  ctx.lineWidth = 10
  if (showHeaderOutline) ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(-10, height * 0.967)
  ctx.quadraticCurveTo(540, height * 1.035, 1090, height * 0.956)
  ctx.lineTo(1090, height + 12)
  ctx.lineTo(-10, height + 12)
  ctx.closePath()
  ctx.fillStyle = options.headingColor
  ctx.fill()
  ctx.stroke()
  if (bleed) ctx.restore()
}

function placeImage(ctx: Context, image: HTMLImageElement, rect: ArtRect, position?: (rect: ArtRect) => ArtRect) {
  const scale = Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight)
  const width = image.naturalWidth * scale
  const height = image.naturalHeight * scale
  const original = { x: rect.x + (rect.width - width) / 2, y: rect.y + (rect.height - height) / 2, width, height }
  const bounds = position?.(original) ?? original
  ctx.drawImage(image, bounds.x, bounds.y, width, height)
}

function drawProduct(ctx: Context, rect: ArtRect, image: HTMLImageElement | null, options: Options) {
  const x = rect.x + rect.width / 2
  const y = rect.y + rect.height / 2
  if (options.glow) {
    const glow = ctx.createRadialGradient(x, y, 10, x, y, Math.min(rect.width, rect.height) * 0.7)
    glow.addColorStop(0, `rgba(255, 252, 207, ${Math.min(100, Math.max(0, options.glowStrength)) / 100})`)
    glow.addColorStop(1, 'rgba(255, 252, 207, 0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, 1080, rect.y + rect.height + 80)
    if (image && options.glowStrength > 0) {
      ctx.save()
      ctx.globalAlpha = options.glowStrength / 100
      ctx.beginPath()
      ctx.ellipse(x, rect.y + rect.height * 0.83, Math.min(rect.width * 0.44, rect.height * 0.58), rect.height * 0.145, 0, 0, Math.PI * 2)
      ctx.shadowColor = '#fff47d'
      ctx.shadowBlur = 25
      ctx.strokeStyle = '#fff79a'
      ctx.lineWidth = 6
      ctx.stroke()
      ctx.restore()
    }
  }
  if (image) {
    ctx.save()
    if (options.shadow) {
      ctx.shadowColor = `rgba(73, 26, 4, ${Math.min(100, Math.max(0, options.shadowStrength)) * 0.0055})`
      ctx.shadowBlur = 28
      ctx.shadowOffsetY = 16
    }
    placeImage(ctx, image, rect)
    ctx.restore()
  }
}

export function fitOfferLines(text: string, width: number, lines: number, measure: (value: string) => number) {
  const result: string[] = []
  let remaining = Array.from(text.trim().replace(/\s+/g, ' '))
  while (remaining.length && result.length < lines) {
    const lastLine = result.length === lines - 1
    let count = remaining.length
    if (measure(remaining.join('')) > width) {
      let low = 0
      let high = remaining.length - 1
      while (low < high) {
        const mid = Math.ceil((low + high) / 2)
        if (measure(remaining.slice(0, mid).join('') + (lastLine ? '…' : '')) <= width) low = mid
        else high = mid - 1
      }
      count = low
    }
    if (!count) break
    if (!lastLine && count < remaining.length) {
      const split = remaining.slice(0, count + 1).lastIndexOf(' ')
      if (split > 0) count = split
    }
    result.push(remaining.slice(0, count).join('') + (lastLine && count < remaining.length ? '…' : ''))
    remaining = Array.from(remaining.slice(count).join('').trimStart())
  }
  return result
}

function label(ctx: Context, text: string, rect: ArtRect, family: string, color: string, size: number, lines = 1, align: CanvasTextAlign = 'center', italic = false, position?: (rect: ArtRect) => ArtRect) {
  if (!text.trim()) return 0
  let fittedSize = Math.min(size, rect.height / (lines * 1.06))
  const font = (pixels: number) => `${italic ? 'italic ' : ''}900 ${pixels}px "${family}", Arial, sans-serif`
  ctx.font = font(fittedSize)
  if (lines === 1) {
    fittedSize *= Math.min(1, rect.width / Math.max(1, ctx.measureText(text).width))
    ctx.font = font(fittedSize)
  }
  const fitted = fitOfferLines(text, rect.width, lines, value => ctx.measureText(value).width)
  const width = fitted.length ? Math.min(rect.width, ctx.measureText(fitted[0]).width) : 0
  const center = rect.y + rect.height / 2
  const original = { x: align === 'left' ? rect.x : rect.x + (rect.width - width) / 2, y: center - fittedSize / 2, width, height: fittedSize }
  const bounds = width ? position?.(original) ?? original : original
  const x = align === 'left' ? bounds.x : bounds.x + bounds.width / 2
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.fillStyle = color
  fitted.forEach((line, index) => ctx.fillText(line, x, bounds.y + bounds.height / 2 + (index - (fitted.length - 1) / 2) * fittedSize * 1.06, rect.width))
  return width
}

function drawPrices(ctx: Context, config: ArtworkConfig, original: ArtRect, sale: ArtRect, options: Options, oldPriceBox?: ArtRect, oldPriceStyle?: { fill: string; ink: string }) {
  if (config.originalPrice.trim()) {
    const price = formatPrice(config.originalPrice)
    const mid = oldPriceBox ? oldPriceBox.x + oldPriceBox.width / 2 : original.x + original.width / 2
    const y = oldPriceBox ? oldPriceBox.y + oldPriceBox.height / 2 : original.y + original.height / 2
    if (oldPriceBox) {
      const { width, height } = oldPriceBox
      roundedRect(ctx, mid - width / 2, y - height / 2, width, height, height * 0.25)
      ctx.fillStyle = oldPriceStyle?.fill ?? '#fff8df'
      ctx.fill()
      ctx.strokeStyle = options.outlineColor
      ctx.lineWidth = 3
      ctx.stroke()
      const textWidth = label(ctx, price, { x: mid - width * 0.43, y: y - height / 2, width: width * 0.86, height }, config.fontFamily, oldPriceStyle?.ink ?? '#453723', height * 0.61, 1, 'center', true)
      ctx.fillStyle = oldPriceStyle?.ink ?? '#8d2a28'
      ctx.fillRect(mid - textWidth / 2, y, textWidth, 3)
    } else {
      const width = label(ctx, price, original, config.fontFamily, config.textColor, 49, 1, 'center', true)
      ctx.strokeStyle = options.headingColor
      ctx.lineWidth = 4
      ctx.beginPath()
      const rule = Math.min(135, (original.width - width) / 4 - 20)
      if (rule > 0) {
        ctx.moveTo(mid - width / 2 - 32 - rule, y)
        ctx.lineTo(mid - width / 2 - 32, y)
        ctx.moveTo(mid + width / 2 + 32, y)
        ctx.lineTo(mid + width / 2 + 32 + rule, y)
      }
      ctx.stroke()
      ctx.strokeStyle = '#d82319'
      ctx.beginPath()
      ctx.moveTo(mid - width / 2, y + 8)
      ctx.lineTo(mid + width / 2, y - 8)
      ctx.stroke()
    }
  }
  const inset = Math.min(36, sale.width * 0.06)
  ctx.save()
  ctx.transform(1, 0, -inset / sale.height, 1, sale.x + inset, sale.y)
  roundedRect(ctx, 0, 0, sale.width - inset, sale.height, Math.min(46, sale.height / 2))
  const plaque = ctx.createLinearGradient(0, 0, 0, sale.height)
  plaque.addColorStop(0, config.buttonColor)
  plaque.addColorStop(1, oldPriceBox ? config.buttonColor : '#042b12')
  ctx.fillStyle = plaque
  ctx.shadowColor = 'rgba(83, 28, 0, 0.58)'
  ctx.shadowBlur = 18
  ctx.shadowOffsetY = 10
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.lineWidth = 10
  ctx.strokeStyle = options.outlineColor
  ctx.stroke()
  ctx.restore()
  label(ctx, formatPrice(config.salePrice), { ...sale, x: sale.x + inset + 12, width: sale.width - 2 * inset - 24 }, config.fontFamily, config.buttonTextColor, config.priceSize)
}

function drawDiscountRibbon(ctx: Context, config: ArtworkConfig, rect: ArtRect, outline: string, offerLabel = 'OFERTA', useOfferColor = false) {
  const { x, y, width, height } = rect
  const notch = Math.min(24, width / 8)
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + width, y)
  ctx.lineTo(x + width - notch, y + height / 2)
  ctx.lineTo(x + width, y + height)
  ctx.lineTo(x, y + height)
  ctx.lineTo(x + notch, y + height / 2)
  ctx.closePath()
  const fill = ctx.createLinearGradient(0, y, 0, y + height)
  fill.addColorStop(0, config.badgeColor)
  fill.addColorStop(1, useOfferColor ? config.badgeColor : '#8d0a11')
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = outline
  ctx.lineWidth = 5
  ctx.stroke()
  const discount = config.discount.trim()
  const percent = /^-?\s*(\d+(?:[.,]\d+)?)\s*%$/.exec(discount)
  const text = percent ? `${percent[1]}% OFF • ${offerLabel}` : discount ? discount.toLocaleUpperCase('pt-BR') : offerLabel
  label(ctx, text, { x: x + 2 * notch, y, width: width - 4 * notch, height }, config.fontFamily, config.badgeTextColor, 54, 1, 'center', true)
}

function drawDetailPhotos(ctx: Context, photos: HTMLImageElement[], box: ArtRect, options: Options) {
  const diameter = Math.min(154, box.width * 0.18, (box.height - 16) / 3)
  photos.forEach((photo, index) => {
    const x = box.x + box.width - diameter / 2
    const y = box.y + box.height / 2 + (index - (photos.length - 1) / 2) * (diameter + 8)
    ctx.save()
    ctx.beginPath()
    ctx.ellipse(x, y, diameter / 2, diameter / 2, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#ffe6ad'
    ctx.fill()
    ctx.clip()
    const scale = diameter / Math.min(photo.naturalWidth, photo.naturalHeight)
    const width = photo.naturalWidth * scale
    const height = photo.naturalHeight * scale
    ctx.drawImage(photo, x - width / 2, y - height / 2, width, height)
    ctx.restore()
    ctx.strokeStyle = options.headingColor
    ctx.lineWidth = 9
    ctx.stroke()
    ctx.strokeStyle = options.outlineColor
    ctx.lineWidth = 4
    ctx.stroke()
  })
}

export function drawProfessionalOffer(ctx: Context, config: ArtworkConfig, height: number, image: HTMLImageElement | null, logo: HTMLImageElement | null, details: HTMLImageElement[] = [], flyer?: { photo: FlyerPhotoSettings; label: string; textPositions?: FlyerTextPositions; report?: FlyerLayerReporter; placeLayer?: PlaceFlyerDesignLayer; paintBackground?: (height: number) => void; bleed?: number; headerTextColor?: string; storeName?: string; storeNameColor?: string; subtitleColor?: string; logoScale?: number; category?: { label: string; color: string }; oldPriceStyle?: { fill: string; ink: string } }) {
  const options = { ...professionalDefaults, ...config.professional }
  const place = flyer?.placeLayer
  const ratio = height / 1080
  const box = (key: keyof ArtworkConfig['positions']) => {
    const rect = config.positions[key]
    return { ...rect, y: rect.y * ratio, height: rect.height * ratio }
  }
  ctx.save()
  drawBackdrop(ctx, config, options, height, flyer?.paintBackground, !flyer, flyer?.bleed)
  const photo = box('photo')
  const categoryTop = height * 0.18
  const categoryHeight = height * 0.033
  if (flyer?.category) {
    ctx.fillStyle = options.headingColor
    ctx.fillRect(0, categoryTop, 1080, categoryHeight)
    const nextTop = categoryTop + categoryHeight
    if (photo.y < nextTop && photo.y + photo.height > nextTop) {
      photo.height -= nextTop - photo.y
      photo.y = nextTop
    }
  }
  if (flyer) {
    const layout = flyerImageLayout(photo, details.length, flyer.photo.photoScale)
    if (image) {
      const bounds = paintFlyerPhoto(ctx, image, layout.main, flyer.photo)
      flyer.report?.(bounds, 'photo')
    }
    paintFlyerDetails(ctx, details, layout.details, options.outlineColor)
  } else {
    drawProduct(ctx, { ...photo, width: photo.width * (details.length ? 0.77 : 1) }, image, options)
    drawDetailPhotos(ctx, details, photo, options)
  }
  const heading = box('callout')
  const plate = box('brandLogo')
  if (flyer && logo && flyer.logoScale !== undefined) {
    const scale = flyer.logoScale / 100
    const newWidth = plate.width * scale
    plate.x += plate.width - newWidth
    plate.width = newWidth
    const newHeight = Math.min(plate.height * scale, height * 0.148)
    plate.y = Math.max(height * 0.01, plate.y + (plate.height - newHeight) / 2)
    plate.height = newHeight
    heading.width = Math.min(heading.width, plate.x - heading.x - 18)
  }
  if (flyer?.storeName) {
    const storeHeight = height * 0.027
    label(ctx, flyer.storeName, { x: heading.x, y: height * 0.018, width: heading.width, height: storeHeight },
      config.fontFamily, flyer.storeNameColor ?? flyer.headerTextColor ?? '#fff', 25, 1, 'left', false, place && (rect => place('storeName', rect)))
    heading.y += storeHeight * 0.65
    heading.height -= storeHeight * 0.65
  }
  const textWidth = label(ctx, config.callout, heading, config.fontFamily, flyer?.headerTextColor ?? '#ffffff', 94, 1, 'left', true)
  if (textWidth && !flyer) {
    ctx.beginPath()
    ctx.moveTo(heading.x + 24, heading.y + heading.height * 0.91)
    ctx.quadraticCurveTo(heading.x + textWidth * 0.40, heading.y + heading.height * 0.69, heading.x + textWidth * 0.65, heading.y + heading.height * 0.83)
    ctx.strokeStyle = options.outlineColor
    ctx.lineWidth = 9
    ctx.lineCap = 'round'
    ctx.stroke()
  }
  if (logo) {
    if (!flyer) {
      roundedRect(ctx, plate.x, plate.y, plate.width, plate.height, 22)
      ctx.fillStyle = '#fff'
      ctx.fill()
    }
    placeImage(ctx, logo, { x: plate.x + 12, y: plate.y + 10, width: plate.width - 24, height: plate.height - 20 },
      place && (rect => place('logo', rect)))
  }
  const safe = { x: 32, y: height * 0.19, width: 1016, height: height * 0.78 }
  const title = box('title')
  const nominal = Math.min(config.titleSize, title.height / 1.06)
  ctx.font = `italic 900 ${nominal}px "${config.fontFamily}", Arial, sans-serif`
  const measured = ctx.measureText(config.productName).width
  const lines = measured > title.width ? 2 : 1
  const nameWidth = Math.min(title.width, measured + 24)
  const name = flyerTextBounds(safe, { ...title, x: title.x + (title.width - nameWidth) / 2, width: nameWidth }, flyer?.textPositions?.name)
  label(ctx, config.productName, flyer ? name.image : title, config.fontFamily, config.textColor, config.titleSize, lines, 'center', true)
  if (config.productName.trim()) flyer?.report?.(name, 'name')
  const original = box('originalPrice')
  const oldHeight = Math.min(original.height, 58)
  const oldWidth = Math.min(original.width, Math.max(oldHeight * 3, Array.from(formatPrice(config.originalPrice)).length * oldHeight * 0.55 + oldHeight))
  const old = flyerTextBounds(safe, { x: original.x + (original.width - oldWidth) / 2, y: original.y + (original.height - oldHeight) / 2, width: oldWidth, height: oldHeight }, flyer?.textPositions?.originalPrice)
  const sale = box('salePrice')
  const ribbon = box('badge')
  const offer = flyerTextBounds(safe, { ...sale, height: ribbon.y + ribbon.height - sale.y }, flyer?.textPositions?.offer)
  const dx = flyer ? offer.image.x - sale.x : 0
  const dy = flyer ? offer.image.y - sale.y : 0
  drawPrices(ctx, config, original, { ...sale, x: sale.x + dx, y: sale.y + dy }, options, flyer ? old.image : undefined, flyer?.oldPriceStyle)
  if (config.originalPrice.trim()) flyer?.report?.(old, 'originalPrice')
  if (config.discount.trim() || flyer?.label) {
    const badge = box('badge')
    badge.y += (badge.height - config.positions.badge.height) / 2
    badge.height = config.positions.badge.height
    if (config.badgeStyle === 'ribbon') drawDiscountRibbon(ctx, config, { ...ribbon, x: ribbon.x + dx, y: ribbon.y + dy }, options.outlineColor, flyer?.label, Boolean(flyer))
    else {
      if (config.badgeStyle !== 'pill' && badge.width > badge.height) {
        badge.x += (badge.width - badge.height) / 2
        badge.width = badge.height
      }
      drawOfferBadge(ctx, { ...config, positions: { ...config.positions, badge } })
    }
  }
  flyer?.report?.(offer, 'offer')
  label(ctx, config.cta, box('cta'), config.fontFamily, flyer?.subtitleColor ?? flyer?.headerTextColor ?? '#ffffff', 24,
    1, 'center', false, place && (rect => place('subtitle', rect)))
  if (flyer?.category) {
    label(ctx, flyer.category.label, { x: 42, y: categoryTop, width: 996, height: categoryHeight },
      config.fontFamily, flyer.category.color, 29, 1, 'left', false, place && (rect => place('category', rect)))
  }
  ctx.restore()
}
