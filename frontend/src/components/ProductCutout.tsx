import { useEffect, useRef, useState } from 'react'
import { loadProductImage } from '../bulk'
import type { CutoutMark } from '../productCutout'
import { useAuth } from '../auth'
import { creditOperation, type CreditOperation } from '../billing'

export function ProductCutout({ url, onApply, buttonLabel = 'Remover fundo' }: { url: string; onApply: (file: File) => Promise<void>; buttonLabel?: string }) {
  const { accessToken } = useAuth()
  const last = useRef<{ request: string; operation: CreditOperation; result: ImageData; file: Blob; confirmed: boolean }>()
  const worker = useRef<Worker | null>(null)
  const preview = useRef<HTMLCanvasElement>(null)
  const [open, setOpen] = useState(false)
  const [foreground, setForeground] = useState(true)
  const [marks, setMarks] = useState<CutoutMark[]>([])
  const [margin, setMargin] = useState(3)
  const [result, setResult] = useState<ImageData | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => () => worker.current?.terminate(), [])
  useEffect(() => {
    if (!preview.current || !result) return
    preview.current.width = result.width
    preview.current.height = result.height
    preview.current.getContext('2d')?.putImageData(result, 0, 0)
  }, [result])

  async function process() {
    if (!accessToken) return
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const request = JSON.stringify([url, margin, marks])
      const cached = last.current
      if (cached?.request === request) {
        if (!cached.confirmed) {
          await creditOperation(accessToken, cached.operation, cached.file)
          cached.confirmed = true
        }
        setResult(cached.result)
        return
      }
      const operation: CreditOperation = { key: crypto.randomUUID(), kind: 'cutout', count: 1, format: 'png' }
      await creditOperation(accessToken, operation)
      const { image } = await loadProductImage(url)
      if (!image) throw new Error('Abra uma foto que possa ser lida pelo navegador ou envie o arquivo original.')
      const scale = Math.min(1, 720 / Math.max(image.naturalWidth, image.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      if (Math.min(canvas.width, canvas.height) < 12) throw new Error('Use uma foto com pelo menos 12 pixels em cada lado.')
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('O navegador não conseguiu abrir a ferramenta de recorte.')
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
      const segmenter = worker.current ??= new Worker(new URL('../productCutout.worker.ts', import.meta.url), { type: 'module' })
      const cutout = await new Promise<ImageData>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          segmenter.terminate()
          worker.current = null
          reject(new Error('O recorte excedeu o tempo disponível neste dispositivo.'))
        }, 45_000)
        segmenter.onmessage = ({ data }) => {
          window.clearTimeout(timeout)
          if (data.result) resolve(data.result)
          else reject(new Error(data.error))
        }
        segmenter.onerror = () => {
          window.clearTimeout(timeout)
          segmenter.terminate()
          worker.current = null
          reject(new Error('O motor de recorte local não pôde ser iniciado neste navegador.'))
        }
        segmenter.postMessage({ pixels, marks, margin: margin / 100 }, [pixels.data.buffer])
      })
      context.putImageData(cutout, 0, 0)
      const file = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
      if (!file) throw new Error('Não foi possível concluir a imagem do recorte.')
      const entry = { request, operation, result: cutout, file, confirmed: false }
      last.current = entry
      await creditOperation(accessToken, operation, file)
      entry.confirmed = true
      setResult(cutout)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao remover o fundo.')
    } finally {
      setBusy(false)
    }
  }

  async function apply() {
    setBusy(true)
    setError('')
    try {
      if (!result || !preview.current) throw new Error('Gere uma prévia do recorte.')
      const { width, height, data } = result
      let left = width
      let right = 0
      let top = height
      let bottom = 0
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (!data[(y * width + x) * 4 + 3]) continue
          left = Math.min(left, x)
          right = Math.max(right, x)
          top = Math.min(top, y)
          bottom = Math.max(bottom, y)
        }
      }
      if (left > right || top > bottom) throw new Error('O recorte ficou vazio. Ajuste as marcações.')
      const cropped = document.createElement('canvas')
      cropped.width = right - left + 1
      cropped.height = bottom - top + 1
      const context = cropped.getContext('2d')
      if (!context) throw new Error('Não foi possível preparar o recorte.')
      context.drawImage(preview.current, left, top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height)
      const blob = await new Promise<Blob | null>(resolve => {
        cropped.toBlob(resolve, 'image/png')
      })
      if (!blob) throw new Error('Não foi possível salvar o recorte.')
      await onApply(new File([blob], 'produto-recortado.png', { type: 'image/png' }))
      setOpen(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível aplicar o recorte.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return <div><p className="text-xs text-slate-500">1 crédito por recorte concluído</p><button type="button" className="w-full rounded-lg border px-3 py-2 text-sm" onClick={() => {
    setOpen(true)
    void process()
  }}>{buttonLabel}</button></div>
  return (
    <div className="space-y-2 rounded-lg border p-3 text-sm">
      <p>Ajustes processados com sucesso custam 1 crédito. <a href="/plans" className="underline">Ver planos</a></p>
      <p>Marque na foto as partes que deseja manter ou remover e gere uma prévia.</p>
      <label className="block">Tipo de marcação
        <select className="ml-2 rounded border bg-transparent" disabled={busy} value={foreground ? 'product' : 'background'} onChange={event => setForeground(event.target.value === 'product')}>
          <option value="product">Manter produto</option>
          <option value="background">Remover fundo</option>
        </select>
      </label>
      <div className="relative mx-auto w-fit max-w-full">
        <img src={url} alt="Foto original do produto para marcação" className="max-h-56 max-w-full cursor-crosshair" onClick={event => {
          if (busy) return
          const rect = event.currentTarget.getBoundingClientRect()
          const mark = { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height, foreground }
          setMarks([...marks, mark])
          setResult(null)
        }} />
        {marks.map((mark, index) => <span key={index} className={`pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white ${mark.foreground ? 'bg-green-700' : 'bg-red-700'}`} style={{ left: `${mark.x * 100}%`, top: `${mark.y * 100}%` }} />)}
      </div>
      <label className="block">Margem de fundo ({margin}%)
        <input className="ml-2 align-middle" type="range" disabled={busy} min={1} max={22} value={margin} onChange={event => { setMargin(Number(event.target.value)); setResult(null) }} />
      </label>
      {marks.length > 0 && <button type="button" disabled={busy} className="underline" onClick={() => { setMarks(marks.slice(0, -1)); setResult(null) }}>Desfazer marcação</button>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} className="rounded-lg border px-2 py-1" onClick={() => void process()}>{busy ? 'Processando…' : 'Gerar prévia do recorte'}</button>
        <button type="button" disabled={busy} className="rounded-lg border px-2 py-1" onClick={() => { setOpen(false); setMarks([]); setResult(null); setError('') }}>Manter original</button>
      </div>
      {result && <>
        <canvas ref={preview} aria-label="Prévia do recorte" className="mx-auto max-h-56 max-w-full bg-slate-200 dark:bg-slate-700" />
        <button type="button" disabled={busy} className="rounded-lg bg-indigo-600 px-3 py-2 text-white" onClick={() => void apply()}>Aplicar recorte</button>
      </>}
      {error && <p role="alert" className="text-red-600">{error}</p>}
    </div>
  )
}
