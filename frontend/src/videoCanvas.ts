import { loadProductImage } from './bulk'
import { contrast, drawImage, drawProductName, fitText, flyerDiscount, priceNumber, priceText, type FlyerDesign, type FlyerProduct } from './flyers'
import { VIDEO_FPS, videoFrame, videoRecordingFormat, videoSize, videoTimeline } from './videoTimeline'

export async function prepareVideo(canvas: HTMLCanvasElement, products: FlyerProduct[], design: FlyerDesign) {
  const settings = design.video
  if (!settings || !products.length) throw new Error('Adicione um produto para montar o vídeo.')
  const { transition } = settings
  const [logo, background, ...photos] = await Promise.all(
    [design.logo, design.backgroundImage, ...products.map(product => product.imageUrl)].map(loadProductImage),
  )
  const { width, height } = videoSize(settings.orientation)
  canvas.width = width
  canvas.height = height
  const drawing = canvas.getContext('2d')
  if (!drawing) throw new Error('Não foi possível iniciar a prévia de vídeo.')
  const context = drawing
  const vertical = settings.orientation === 'vertical'
  const timeline = videoTimeline(products, settings.duration)
  const family = { sans: 'Arial, sans-serif', serif: 'Georgia, serif', mono: 'Courier New, monospace' }[design.font]
  const font = (size: number, weight = 700) => { context.font = `${weight} ${size}px ${family}` }
  const block = (color: string, x: number, y: number, w: number, h: number, radius = 0) => {
    context.fillStyle = color
    context.beginPath()
    context.roundRect(x, y, w, h, radius)
    context.fill()
  }
  const pad = 64
  const photo = vertical ? { x: pad, y: 208, w: width - pad * 2, h: 820 } : { x: pad, y: 188, w: 790, h: 820 }
  const textLeft = vertical ? pad : 925
  const textWidth = width - textLeft - pad
  const nameY = vertical ? 1190 : 385

  function slide(index: number, alpha: number, x: number, scale: number) {
    const product = products[index]
    context.save()
    context.globalAlpha = alpha
    context.translate(x + width / 2, height / 2)
    context.scale(scale, scale)
    context.translate(-width / 2, -height / 2)
    block(design.background, 0, 0, width, height)
    if (background.image) {
      context.globalAlpha = alpha * 0.20
      drawImage(context, background.image, 0, 0, width, height, true)
      context.globalAlpha = alpha
    }
    block(design.primary, 0, 0, width, 153)
    const headerInk = design.headerTextColor ?? contrast(design.primary)
    const logoScale = (design.logoScale ?? 100) / 100
    const logoWidth = logo.image ? 108 * logoScale : 0
    const titleWidth = width - pad * 2 - (logoWidth ? logoWidth + 62 : 0)
    context.fillStyle = design.storeName ? design.storeNameColor ?? headerInk : headerInk
    font(55)
    fitText(context, design.storeName || design.title, pad, design.storeName ? 59 : 89, titleWidth)
    if (design.storeName) {
      context.fillStyle = headerInk
      font(32, 500)
      fitText(context, design.title, pad, 102, titleWidth)
    }
    if (product.category.trim()) {
      context.fillStyle = design.categoryTextColor ?? headerInk
      font(24, 600)
      fitText(context, product.category, pad, 135, titleWidth)
    }
    if (logo.image) {
      const logoHeight = Math.min(137, 87 * logoScale)
      drawImage(context, logo.image, width - pad - logoWidth, (153 - logoHeight) / 2, logoWidth, logoHeight)
    }
    const radius = design.template === 'fashion' || design.template === 'electronics' ? 6 : 34
    block('#ffffff', photo.x, photo.y, photo.w, photo.h, radius)
    if (design.border !== 'none') {
      context.strokeStyle = design.primary
      context.lineWidth = design.border === 'strong' ? 7 : 3
      context.stroke()
    }
    const image = photos[index].image
    if (image) drawImage(context, image, photo.x + 32, photo.y + 32, photo.w - 64, photo.h - 64)
    else {
      context.fillStyle = '#475569'
      font(36, 500)
      fitText(context, 'Foto indisponível', photo.x + 36, photo.y + photo.h / 2, photo.w - 72)
    }
    block('#ffffff', textLeft - 24, nameY - (vertical ? 155 : 180), textWidth + 24, vertical ? 647 : 648, radius)
    if (design.subtitle) {
      context.fillStyle = design.subtitleColor ?? design.primary
      font(34, 500)
      fitText(context, design.subtitle, textLeft, nameY - 109, textWidth - 24)
    }
    context.fillStyle = design.productTextColor ?? '#111827'
    font(vertical && product.name.length > 30 ? 68 : 83)
    drawProductName(context, product.name, textLeft, nameY - 42, textWidth - 24, 91)
    if (Number.isFinite(priceNumber(product.originalPrice))) {
      const oldPrice = priceText(product.originalPrice)
      context.fillStyle = '#475569'
      font(50, 500)
      fitText(context, oldPrice, textLeft, nameY + 143, textWidth - 24)
      context.fillRect(textLeft, nameY + 128, Math.min(textWidth - 24, context.measureText(oldPrice).width), 4)
    }
    const offer = priceText(product.price)
    context.fillStyle = design.primary
    font(135, 800)
    font(Math.min(135, 135 * (textWidth - 36) / context.measureText(offer).width), 800)
    fitText(context, offer, textLeft, nameY + 296, textWidth - 24)
    const discount = flyerDiscount(product)
    if (discount && design.badge !== 'none') {
      font(43, 800)
      const badgeWidth = Math.min(textWidth - 24, context.measureText(discount).width + 56)
      block(design.accent, textLeft, nameY + 338, badgeWidth, 87, design.badge === 'pill' ? 44 : 8)
      context.fillStyle = contrast(design.accent)
      fitText(context, discount, textLeft + 27, nameY + 394, badgeWidth - 54)
    }
    context.restore()
  }

  function render(elapsed: number) {
    const frame = videoFrame(timeline, elapsed)
    if (!frame) return
    const { index, next, progress } = frame
    slide(index, 1, transition === 'slide' ? -width * progress : 0, 1)
    if (progress) {
      if (transition === 'slide') slide(next, 1, width * (1 - progress), 1)
      else slide(next, progress, 0, transition === 'zoom' ? 1 + (1 - progress) * 0.08 : 1)
    }
    return index
  }

  return { timeline, render, missing: [logo, background, ...photos].filter(image => image.error).length }
}

export async function recordVideo(
  products: FlyerProduct[], design: FlyerDesign, format: NonNullable<ReturnType<typeof videoRecordingFormat>>,
  signal: AbortSignal, onProgress: (progress: number) => void,
) {
  const canvas = document.createElement('canvas')
  const video = await prepareVideo(canvas, products, design)
  signal.throwIfAborted()
  video.render(0)
  const stream = canvas.captureStream(VIDEO_FPS)
  let frame = 0
  try {
    const recorder = new MediaRecorder(stream, { mimeType: format.mimeType, videoBitsPerSecond: 8_000_000 })
    const chunks: Blob[] = []
    return await new Promise<Blob>((resolve, reject) => {
      const abort = () => fail(new Error('Gravação cancelada.'))
      const visibility = () => { if (document.hidden) fail(new Error('Mantenha a aba aberta e visível durante a gravação.')) }
      function cleanup() {
        cancelAnimationFrame(frame)
        signal.removeEventListener('abort', abort)
        document.removeEventListener('visibilitychange', visibility)
      }
      function fail(error: Error) {
        cleanup()
        if (recorder.state !== 'inactive') recorder.stop()
        reject(error)
      }
      recorder.ondataavailable = ({ data }) => { if (data.size) chunks.push(data) }
      recorder.onerror = () => fail(new Error('Este navegador não conseguiu codificar a gravação. Use a reprodução em tela cheia.'))
      recorder.onstop = () => {
        cleanup()
        const type = recorder.mimeType.split(';')[0]
        if (!chunks.length || type !== `video/${format.extension}`) {
          reject(new Error('O navegador não gerou um arquivo válido no formato selecionado.'))
          return
        }
        resolve(new Blob(chunks, { type }))
      }
      signal.addEventListener('abort', abort, { once: true })
      document.addEventListener('visibilitychange', visibility)
      try {
        recorder.start(1000)
        const started = performance.now()
        function draw(timestamp: number) {
          const elapsed = timestamp - started
          if (elapsed >= video.timeline.duration) {
            cleanup()
            recorder.stop()
            return
          }
          video.render(elapsed)
          onProgress(Math.max(0, elapsed) / video.timeline.duration)
          frame = requestAnimationFrame(draw)
        }
        frame = requestAnimationFrame(draw)
      } catch {
        cleanup()
        reject(new Error('Não foi possível iniciar a gravação neste navegador.'))
      }
    })
  } finally {
    stream.getTracks().forEach(track => track.stop())
  }
}
