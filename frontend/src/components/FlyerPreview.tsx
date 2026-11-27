import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { Lock, Trash2, Unlock } from 'lucide-react'
import { dragFlyerPhoto, type FlyerDesignLayer, type FlyerLayer, type FlyerPhotoBounds, type PhotoAdjustment } from '../flyerOfferLayout'
import { flyerCanvasSize, renderFlyerPage, type FlyerDesign, type FlyerPage, type FlyerProduct } from '../flyers'

const previewScale = 0.5
const secondary = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50 dark:border-slate-700'

type PreviewLayer = { bounds: FlyerPhotoBounds } & (
  { product: FlyerProduct; layer: FlyerLayer } | { designLayer: FlyerDesignLayer }
)

const layerNames = {
  logo: 'Logotipo', storeName: 'Nome da loja', subtitle: 'Subtítulo', category: 'Categoria', backgroundImage: 'Fundo',
  photo: 'Foto', name: 'Nome do produto', originalPrice: 'Preço anterior', offer: 'Oferta',
}

export function FlyerPreview({ page, design, index, total, onExport, onMoveLayer, onMoveDesignLayer, onToggleLock, activeProduct, onSelectProduct, onMoveProduct, onRemoveProduct, showGuides, busy }: {
  page: FlyerPage; design: FlyerDesign; index: number; total: number; onExport?: () => void; busy: boolean
  onMoveLayer?: (product: FlyerProduct, layer: FlyerLayer) => ((adjustment: PhotoAdjustment, group?: symbol) => void) | undefined
  onMoveDesignLayer?: (layer: FlyerDesignLayer, adjustment: PhotoAdjustment, group?: symbol) => void
  onToggleLock?: (layer: PreviewLayer) => void
  activeProduct?: FlyerProduct
  onSelectProduct?: (product: FlyerProduct) => void
  onMoveProduct?: (product: FlyerProduct) => ((adjustment: PhotoAdjustment, group?: symbol) => void) | undefined
  onRemoveProduct?: (product: FlyerProduct) => void
  showGuides?: boolean
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [layers, setLayers] = useState<PreviewLayer[]>([])
  const [boxes, setBoxes] = useState<{ product: FlyerProduct; bounds: FlyerPhotoBounds }[]>([])
  const [editLayers, setEditLayers] = useState(false)
  const [selection, setSelection] = useState<string>()
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({})
  const drag = useRef<{
    pointer: number; x: number; y: number; bounds: FlyerPhotoBounds
    move: (adjustment: PhotoAdjustment, group?: symbol) => void; last: PhotoAdjustment; group: symbol
  } | null>(null)
  const [status, setStatus] = useState('')
  const [zoom, setZoom] = useState(100)
  const size = flyerCanvasSize(design, previewScale)
  const aspect = size.width / size.height
  const reportDesignLayers = Boolean(onMoveDesignLayer)
  const previewStyle = {
    width: `${zoom}%`,
    '--preview-max-width': `max(${0.12 * zoom}rem, calc(${zoom * aspect}dvh - ${0.15 * zoom * aspect}rem))`,
  } as CSSProperties
  useEffect(() => {
    let active = true
    const buffer = document.createElement('canvas')
    const zones: PreviewLayer[] = []
    const cards: typeof boxes = []
    void renderFlyerPage(buffer, page, design, index, total, previewScale,
      (product, bounds, layer = 'photo') => {
        if (layer === 'product') cards.push({ product, bounds })
        else zones.push({ product, bounds, layer })
      },
      reportDesignLayers ? (designLayer, bounds) => zones.push({ designLayer, bounds }) : undefined).then(missing => {
      if (!active || !canvas.current) return
      const context = canvas.current.getContext('2d')
      context?.clearRect(0, 0, canvas.current.width, canvas.current.height)
      context?.drawImage(buffer, 0, 0)
      setLayers(zones)
      setBoxes(cards)
      setStatus(missing ? 'Algumas imagens não puderam ser carregadas. Envie os arquivos ou use URLs que permitam CORS.' : '')
    }).catch(() => {
      if (active) {
        setLayers([])
        setBoxes([])
        setStatus('Não foi possível renderizar a página.')
      }
    })
    return () => { active = false }
  }, [page, design, index, total, reportDesignLayers])

  function canvasPoint(event: PointerEvent<HTMLCanvasElement>) {
    const target = event.currentTarget
    const rect = target.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) * target.width / rect.width,
      y: (event.clientY - rect.top) * target.height / rect.height,
    }
  }

  function layerAt(x: number, y: number) {
    return [...layers].reverse().find(layer => {
      const { image } = layer.bounds
      return !isLocked(layer) && x >= image.x && x <= image.x + image.width && y >= image.y && y <= image.y + image.height
    })
  }

  function layerKey(layer: PreviewLayer) {
    return 'designLayer' in layer ? layer.designLayer : `${page.products.indexOf(layer.product)}:${layer.layer}`
  }

  function isLocked(layer: PreviewLayer) {
    return 'designLayer' in layer ? design.lockedLayers?.includes(layer.designLayer) : layer.product.lockedLayers?.includes(layer.layer)
  }

  function moveLayer(layer: PreviewLayer) {
    if (isLocked(layer)) return undefined
    return 'designLayer' in layer
      ? (adjustment: PhotoAdjustment, group?: symbol) => onMoveDesignLayer?.(layer.designLayer, adjustment, group)
      : onMoveLayer?.(layer.product, layer.layer)
  }

  function startDrag(event: PointerEvent<HTMLCanvasElement>) {
    if (!onMoveLayer || busy || drag.current || event.button !== 0) return
    const { x, y } = canvasPoint(event)
    const hit = boxAt(x, y)
    if (hit) {
      const move = onMoveProduct?.(hit.product)
      if (!move) return
      setSelection(undefined)
      onSelectProduct?.(hit.product)
      drag.current = { pointer: event.pointerId, x, y, bounds: hit.bounds, move,
        last: dragFlyerPhoto(hit.bounds, 0, 0), group: Symbol() }
      event.currentTarget.setPointerCapture(event.pointerId)
      event.currentTarget.style.cursor = 'grabbing'
      return
    }
    const layer = layerAt(x, y)
    if (!layer) return
    const move = moveLayer(layer)
    if (!move) return
    drag.current = {
      pointer: event.pointerId, x, y, bounds: layer.bounds, move,
      last: dragFlyerPhoto(layer.bounds, 0, 0), group: Symbol(),
    }
    setSelection(layerKey(layer))
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.style.cursor = 'grabbing'
  }

  function boxAt(x: number, y: number) {
    if (!onMoveProduct || editLayers) return undefined
    return [...boxes].reverse().find(({ bounds: { image } }) =>
      x >= image.x && x <= image.x + image.width && y >= image.y && y <= image.y + image.height)
  }

  function moveDrag(event: PointerEvent<HTMLCanvasElement>) {
    if (!onMoveLayer || busy) return
    const { x, y } = canvasPoint(event)
    const active = drag.current
    if (!active) {
      event.currentTarget.style.cursor = boxAt(x, y) || layerAt(x, y) ? 'grab' : ''
      return
    }
    if (active.pointer !== event.pointerId) return
    const next = dragFlyerPhoto(active.bounds, x - active.x, y - active.y)
    if (showGuides) {
      const { safe, image } = active.bounds
      const left = safe.x + Math.max(0, safe.width - image.width) * ((next.photoX ?? 0) + 100) / 200
      const top = safe.y + Math.max(0, safe.height - image.height) * ((next.photoY ?? 0) + 100) / 200
      const tolerance = size.width * 0.012
      setGuides({
        x: [size.width / 2, safe.x, safe.x + safe.width / 2, safe.x + safe.width].find(guide =>
          [left, left + image.width / 2, left + image.width].some(edge => Math.abs(edge - guide) <= tolerance)),
        y: [size.height / 2, safe.y, safe.y + safe.height / 2, safe.y + safe.height].find(guide =>
          [top, top + image.height / 2, top + image.height].some(edge => Math.abs(edge - guide) <= tolerance)),
      })
    }
    if (next.photoX === active.last.photoX && next.photoY === active.last.photoY) return
    active.last = next
    active.move(next, active.group)
  }

  function endDrag(event: PointerEvent<HTMLCanvasElement>) {
    if (drag.current?.pointer !== event.pointerId) return
    if (event.type === 'pointerup') moveDrag(event)
    drag.current = null
    setGuides({})
    event.currentTarget.style.cursor = ''
  }

  const selected = layers.find(layer => layerKey(layer) === selection)
  const selectedMove = selected && moveLayer(selected)
  const selectedProduct = !editLayers && !selected ? boxes.find(box => box.product === activeProduct) : undefined
  const box = selectedProduct?.bounds.image ?? selected?.bounds.image
  return (
    <figure className="min-w-0 space-y-2">
      {onMoveLayer && <label className="flex flex-wrap items-center gap-2 text-sm">
        <span>Zoom da página {index + 1}</span>
        <input type="range" min={100} max={200} step={25} value={zoom}
          aria-valuetext={`${zoom}%`} onChange={event => setZoom(Number(event.target.value))} />
        <span aria-hidden="true">{zoom}%</span>
      </label>}
      {onMoveProduct && boxes.length > 0 && <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={secondary} aria-pressed={editLayers} onClick={() => {
          setEditLayers(value => !value)
          setSelection(undefined)
        }}>Editar camadas</button>
        {selectedProduct && onRemoveProduct && <button type="button" className={secondary} disabled={busy}
          onClick={() => onRemoveProduct(selectedProduct.product)}>
          <Trash2 size={16} aria-hidden="true" /> Excluir {selectedProduct.product.name} da arte
        </button>}
      </div>}
      <div className={onMoveLayer ? 'overflow-x-auto p-1' : undefined} tabIndex={onMoveLayer && zoom > 100 ? 0 : undefined}
        role={onMoveLayer && zoom > 100 ? 'group' : undefined} aria-label={onMoveLayer && zoom > 100 ? `Prévia ampliada da página ${index + 1}` : undefined}>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)]">
        <canvas ref={canvas} width={size.width} height={size.height}
        aria-label={`Prévia da página ${index + 1}${page.category ? ` · ${page.category}` : ''}`}
        style={onMoveLayer ? previewStyle : undefined}
        className={`mx-auto block h-auto w-full bg-white shadow-md [grid-area:1/1] ${design.print?.kind === 'poster' ? '' : 'rounded-lg'} ${onMoveLayer ? 'max-w-none touch-none xl:max-w-[var(--preview-max-width)]' : ''}`}
        onPointerDown={startDrag} onPointerMove={moveDrag}
        onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag} />
        {onMoveLayer && (box || guides.x !== undefined || guides.y !== undefined) && <div aria-hidden="true" style={previewStyle}
          className="pointer-events-none relative mx-auto max-w-none overflow-hidden [grid-area:1/1] xl:max-w-[var(--preview-max-width)]">
          {box && <span className="absolute border-2 border-dashed border-indigo-500" style={{
            left: `${100 * box.x / size.width}%`, top: `${100 * box.y / size.height}%`, width: `${100 * box.width / size.width}%`, height: `${100 * box.height / size.height}%`,
          }} />}
          {showGuides && guides.x !== undefined && <span className="absolute inset-y-0 border-l-2 border-cyan-500" style={{ left: `${100 * guides.x / size.width}%` }} />}
          {showGuides && guides.y !== undefined && <span className="absolute inset-x-0 border-t-2 border-cyan-500" style={{ top: `${100 * guides.y / size.height}%` }} />}
        </div>}
        </div>
      </div>
      <figcaption className="flex items-center justify-between gap-2 text-sm">
        <span>{total ? `Página ${index + 1}${page.category ? ` · ${page.category}` : ''}` : 'Prévia do modelo'}</span>
        {onExport && <button type="button" className={secondary} disabled={busy} onClick={onExport}>Baixar PNG</button>}
      </figcaption>
      {onToggleLock && layers.length > 0 && <details className="rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700">
        <summary className="cursor-pointer font-semibold">Camadas da página {index + 1}</summary>
        <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
          {[...layers].reverse().map(layer => {
            const key = layerKey(layer)
            const name = 'designLayer' in layer ? layerNames[layer.designLayer] : `${layerNames[layer.layer]} · ${layer.product.name}`
            const locked = isLocked(layer)
            return <li key={key} className="flex items-center gap-1">
              <button type="button" aria-pressed={selection === key} className="min-w-0 flex-1 truncate rounded px-2 py-2 text-left aria-pressed:bg-indigo-100 aria-pressed:text-indigo-900"
                onClick={() => setSelection(selection === key ? undefined : key)}>{name}</button>
              <button type="button" disabled={busy} aria-label={`${locked ? 'Desbloquear' : 'Bloquear'} ${name}`} onClick={() => onToggleLock(layer)} className="grid size-9 shrink-0 place-items-center rounded border border-slate-300 dark:border-slate-700">
                {locked ? <Lock aria-hidden="true" size={15} /> : <Unlock aria-hidden="true" size={15} />}
              </button>
            </li>
          })}
        </ul>
        {selected && <div className="mt-2 flex flex-wrap gap-1" aria-label="Mover camada selecionada" role="group">
          {([['esquerda', '←', -3, 0], ['cima', '↑', 0, -3], ['baixo', '↓', 0, 3], ['direita', '→', 3, 0]] as const).map(([label, icon, dx, dy]) => (
            <button type="button" key={label} aria-label={`Mover para ${label}`} disabled={busy || !selectedMove} className={secondary}
              onClick={() => selectedMove?.(dragFlyerPhoto(selected.bounds, dx, dy))}>{icon}</button>
          ))}
        </div>}
      </details>}
      {status && <p role="status" className="text-sm text-amber-700 dark:text-amber-300">{status}</p>}
    </figure>
  )
}
