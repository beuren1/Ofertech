import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import {
  ARTWORK_SIZE,
  clampArtworkElementRect,
  getElementBounds,
  normalizeArtworkConfig,
  renderArtworkCanvas,
  type ArtElement,
  type ArtworkConfig,
  type BulkProduct,
} from '../bulk'

type Props = {
  product: BulkProduct
  config: ArtworkConfig
  selectedElement: ArtElement | null
  onSelectElement: (element: ArtElement | null) => void
  onConfigChange: (config: ArtworkConfig) => void
  onDragStart: () => void
  onDragEnd: () => void
}

type DragState = {
  element: ArtElement
  startX: number
  startY: number
  original: ArtworkConfig
  resizing: boolean
}

const dragOrder: ArtElement[] = [
  'brandLogo',
  'cta',
  'badge',
  'salePrice',
  'originalPrice',
  'title',
  'callout',
  'photo',
]

export function ArtworkCanvas({
  product,
  config,
  selectedElement,
  onSelectElement,
  onConfigChange,
  onDragStart,
  onDragEnd,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drag = useRef<DragState | null>(null)
  const renderId = useRef(0)
  const [renderError, setRenderError] = useState<string | null>(null)
  const aspect = ARTWORK_SIZE / (config.template === 'professional' ? config.height ?? ARTWORK_SIZE : ARTWORK_SIZE)
  const previewStyle = { '--art-preview-width': `max(12rem, calc(${100 * aspect}dvh - ${16 * aspect}rem))` } as CSSProperties

  useEffect(() => {
    const currentRender = ++renderId.current
    const canvas = canvasRef.current
    if (!canvas) return
    const renderCanvas = document.createElement('canvas')
    setRenderError(null)
    void renderArtworkCanvas(
      renderCanvas,
      product,
      config,
      selectedElement,
    ).then(() => {
      if (currentRender !== renderId.current) return
      canvas.width = renderCanvas.width
      canvas.height = renderCanvas.height
      const context = canvas.getContext('2d')
      if (!context) {
        setRenderError('Não foi possível iniciar o renderizador de imagens.')
        return
      }
      context.drawImage(renderCanvas, 0, 0)
    }).catch(reason => {
      if (currentRender === renderId.current) {
        setRenderError(reason instanceof Error ? reason.message : 'Falha ao renderizar a arte.')
      }
    })
  }, [product, config, selectedElement])

  const pointFromEvent = (event: PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return {
      x: (event.clientX - bounds.left) * (ARTWORK_SIZE / bounds.width),
      y: (event.clientY - bounds.top) * (ARTWORK_SIZE / bounds.height),
    }
  }

  const startDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    const point = pointFromEvent(event)
    const bounds = getElementBounds(config)
    const element = dragOrder.find(key => {
      if (key === 'brandLogo' && !config.offerLogo && !config.brand?.showLogo) return false
      if (config.template === 'professional' && (
        (key === 'cta' && !config.cta.trim())
        || (key === 'originalPrice' && !config.originalPrice.trim())
        || (key === 'badge' && !config.discount.trim())
      )) return false
      const rect = bounds[key]
      return point.x >= rect.x && point.x <= rect.x + rect.width
        && point.y >= rect.y && point.y <= rect.y + rect.height
    })
    if (!element) {
      onSelectElement(null)
      return
    }

    const rect = bounds[element]
    const resizing = selectedElement === element
      && Math.abs(point.x - (rect.x + rect.width)) < 26
      && Math.abs(point.y - (rect.y + rect.height)) < 26
    onSelectElement(element)
    onDragStart()
    drag.current = {
      element,
      startX: point.x,
      startY: point.y,
      original: normalizeArtworkConfig(config),
      resizing,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const moveDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    const current = drag.current
    if (!current) return
    const point = pointFromEvent(event)
    const dx = point.x - current.startX
    const dy = point.y - current.startY
    const oldRect = current.original.positions[current.element]
    const candidate = current.resizing
      ? {
          ...oldRect,
          width: oldRect.width + dx,
          height: oldRect.height + dy,
        }
      : {
          ...oldRect,
          x: oldRect.x + dx,
          y: oldRect.y + dy,
        }
    const rect = clampArtworkElementRect(current.element, candidate, current.original.template)
    onConfigChange({
      ...current.original,
      positions: { ...current.original.positions, [current.element]: rect },
    })
  }

  const stopDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    onDragEnd()
  }

  return (
    <div style={previewStyle} className="relative mx-auto w-full max-w-[620px] xl:max-w-[min(620px,var(--art-preview-width))]">
      <canvas
        ref={canvasRef}
        aria-label={`Editor visual da arte de ${config.productName}`}
        className="block h-auto w-full touch-none rounded-xl shadow-xl"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      />
      {renderError && <p role="alert" className="mt-2 text-sm text-red-600">{renderError}</p>}
      <p className="mt-2 text-center text-xs text-slate-500">Arraste para mover. Arraste a alça azul para redimensionar.</p>
    </div>
  )
}
