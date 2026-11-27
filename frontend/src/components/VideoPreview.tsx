import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { FlyerDesign, FlyerProduct } from '../flyers'
import { getErrorMessage, useAuth } from '../auth'
import { useCreationLogin } from '../creationLogin'
import { creditCost, creditOperation, type CreditOperation } from '../billing'
import { prepareVideo, recordVideo } from '../videoCanvas'
import { videoRecordingFormat, videoSize, type VideoSettings } from '../videoTimeline'

const button = 'rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50 dark:border-slate-700'
const field = 'mt-1 block w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-700 dark:bg-slate-900'

export function VideoControls({ settings, onChange }: {
  settings: VideoSettings; onChange: (changes: Partial<VideoSettings>) => void
}) {
  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="font-bold">Reprodução para TV</h2>
      <label className="block text-sm font-medium">Orientação
        <select className={field} value={settings.orientation} onChange={event => onChange({ orientation: event.target.value as VideoSettings['orientation'] })}>
          <option value="horizontal">Horizontal · 1920 × 1080</option><option value="vertical">Vertical · 1080 × 1920</option>
        </select>
      </label>
      <label className="block text-sm font-medium">Transição
        <select className={field} value={settings.transition} onChange={event => onChange({ transition: event.target.value as VideoSettings['transition'] })}>
          <option value="fade">Dissolver (fade)</option><option value="slide">Deslizar</option><option value="zoom">Zoom suave</option>
        </select>
      </label>
      <label className="block text-sm font-medium">Duração padrão por oferta (segundos)
        <input type="number" className={field} min={1} max={60} step={1} value={Number.isFinite(settings.duration) ? settings.duration : ''}
          onChange={event => onChange({ duration: event.target.valueAsNumber })} />
      </label>
      <label className="block text-sm font-medium">Texto do rodapé
        <input className={field} maxLength={160} value={settings.footerText ?? ''}
          onChange={event => onChange({ footerText: event.target.value })} />
      </label>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">Cor do rodapé
          <input type="color" className="h-8 w-12" value={settings.footerColor ?? '#0f172a'}
            onChange={event => onChange({ footerColor: event.target.value })} />
        </label>
        <label className="flex items-center gap-2 text-sm">Cor do texto do rodapé
          <input type="color" className="h-8 w-12" value={settings.footerTextColor ?? '#ffffff'}
            onChange={event => onChange({ footerTextColor: event.target.value })} />
        </label>
      </div>
    </section>
  )
}

export function VideoPreview({ products, design, settings, name, invalid, busy, playbackOnly = false }: {
  products: FlyerProduct[]; design: FlyerDesign; settings: VideoSettings; name: string; invalid: boolean; busy: boolean; playbackOnly?: boolean
}) {
  const { accessToken, user } = useAuth()
  const requestLogin = useCreationLogin()
  const player = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const elapsed = useRef(0)
  const recording = useRef<AbortController | null>(null)
  const lastRecording = useRef<{ products: FlyerProduct[]; design: FlyerDesign; operation: CreditOperation; blob: Blob; confirmed: boolean }>()
  const [prepared, setPrepared] = useState<Awaited<ReturnType<typeof prepareVideo>> | null>(null)
  const [playing, setPlaying] = useState(true)
  const [index, setIndex] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [zoom, setZoom] = useState(100)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [format] = useState(() => playbackOnly ? null : videoRecordingFormat())
  const { width, height } = videoSize(settings.orientation)

  useEffect(() => {
    let active = true
    if (!products.length) {
      elapsed.current = 0
      setIndex(0)
    }
    setPrepared(null)
    setError('')
    if (products.length && !invalid) {
      const buffer = document.createElement('canvas')
      void prepareVideo(buffer, products, design).then(video => {
        if (!active) return
        setPrepared({ ...video, render: time => {
          const current = video.render(time)
          canvas.current?.getContext('2d')?.drawImage(buffer, 0, 0)
          return current
        } })
      }).catch(() => { if (active) setError('Não foi possível preparar a prévia.') })
    }
    return () => { active = false; recording.current?.abort() }
  }, [products, design, invalid])

  useEffect(() => {
    if (!prepared) return
    let frame = 0
    const started = performance.now() - elapsed.current
    const render = (timestamp: number) => {
      const time = playing ? Math.max(0, timestamp - started) : elapsed.current
      const next = prepared.render(time)
      elapsed.current = time % prepared.timeline.duration
      if (next !== undefined) setIndex(current => current === next ? current : next)
      if (playing) frame = requestAnimationFrame(render)
    }
    frame = requestAnimationFrame(render)
    return () => cancelAnimationFrame(frame)
  }, [prepared, playing])

  useEffect(() => () => recording.current?.abort(), [])
  useEffect(() => {
    if (!expanded) return
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [expanded])

  async function fullscreen() {
    if (!prepared) return
    setPlaying(true)
    try {
      if (!player.current?.requestFullscreen) throw new Error()
      await player.current.requestFullscreen()
    } catch {
      setExpanded(true)
    }
  }

  async function download() {
    if (!format || !prepared || recording.current) return
    if (!accessToken) return requestLogin()
    const controller = new AbortController()
    recording.current = controller
    setProgress(0)
    setError('')
    const resume = playing
    setPlaying(false)
    try {
      let entry = lastRecording.current
      if (!entry || entry.design !== design || entry.products !== products || entry.operation.format !== format.extension) {
        const operation: CreditOperation = { kind: 'video', count: 1, format: format.extension, key: crypto.randomUUID() }
        await creditOperation(accessToken, operation)
        const blob = await recordVideo(products, design, format, controller.signal, setProgress)
        controller.signal.throwIfAborted()
        entry = { design, products, operation, blob, confirmed: false }
        lastRecording.current = entry
      }
      if (!entry.confirmed) {
        await creditOperation(accessToken, entry.operation, entry.blob)
        entry.confirmed = true
      }
      const { blob } = entry
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${name.trim().replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-|-$/g, '') || 'video-ofertech'}.${format.extension}`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      if (!controller.signal.aborted) setError(getErrorMessage(error))
    } finally {
      recording.current = null
      setProgress(null)
      setPlaying(resume)
    }
  }

  return (
    <section aria-label="Prévia do vídeo" className="min-w-0 space-y-4 rounded-2xl bg-slate-200/70 p-4 dark:bg-slate-900 sm:p-6 xl:sticky xl:top-24 xl:max-h-[calc(100dvh-7rem)] xl:overflow-y-auto">
      {!playbackOnly && <p className="text-sm">Exportação de vídeo · {creditCost('video', user?.profile.plan)} créditos. <a href="/plans" className="underline">Ver planos</a></p>}
      <div className="flex flex-wrap justify-between gap-2">
        <h2 className="font-bold">Prévia do vídeo</h2>
        <span className="text-sm text-slate-600 dark:text-slate-400">{width} × {height}{prepared && ` · ${prepared.timeline.duration / 1000} s por ciclo`}</span>
      </div>
      <label className="flex flex-wrap items-center gap-2 text-sm">Zoom da prévia
        <input type="range" min={100} max={200} step={25} value={zoom} aria-valuetext={`${zoom}%`}
          onChange={event => setZoom(event.target.valueAsNumber)} />
        <span aria-hidden="true">{zoom}%</span>
      </label>
      <div ref={player} className={expanded
        ? 'fixed inset-0 z-50 grid place-items-center bg-black p-2'
        : 'relative overflow-auto rounded-lg bg-black [&:fullscreen]:grid [&:fullscreen]:place-items-center [&:fullscreen]:w-screen [&:fullscreen]:h-screen [&:fullscreen]:rounded-none'}>
        {expanded && <button type="button" onClick={() => setExpanded(false)} className="absolute right-4 top-4 z-10 rounded bg-white px-3 py-2 text-sm text-slate-900">Sair da tela cheia</button>}
        <canvas ref={canvas} width={width} height={height} aria-label="Ofertas em reprodução contínua"
          style={{ '--video-preview-width': `${expanded ? 100 : zoom}%` } as CSSProperties}
          className={`block w-[var(--video-preview-width)] max-w-none object-contain [:fullscreen_&]:max-h-screen [:fullscreen_&]:w-full ${zoom === 100 || expanded ? 'max-h-[75vh]' : ''}`} />
        {!prepared && <p className="absolute inset-x-4 top-1/2 -translate-y-1/2 text-center text-sm text-white">{invalid ? 'Corrija a duração para visualizar.' : products.length ? 'Preparando prévia…' : 'Adicione produtos para visualizar o vídeo.'}</p>}
      </div>
      {prepared && <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">Oferta {index + 1} de {products.length} · Loop contínuo</p>
        {products.length > 1 && <label className="min-w-0 text-sm font-medium">Oferta na prévia
          <select className={field} value={index} disabled={busy || progress !== null} onChange={event => {
            const next = Number(event.target.value)
            elapsed.current = prepared.timeline.ends[next - 1] ?? 0
            setPlaying(false)
            setIndex(next)
            prepared.render(elapsed.current)
          }}>
            {products.map((product, position) => <option key={position} value={position}>{product.name}</option>)}
          </select>
        </label>}
      </div>}
      {prepared?.missing ? <p className="text-sm text-amber-700 dark:text-amber-300">Algumas imagens estão indisponíveis. Substitua o arquivo ou use uma URL que permita CORS.</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={!prepared || progress !== null || busy} onClick={() => setPlaying(value => !value)}>{playing ? 'Pausar' : 'Reproduzir'}</button>
        <button type="button" className={button} disabled={!prepared || progress !== null || busy} onClick={() => void fullscreen()}>Tela cheia em loop</button>
        {format && <button type="button" className={button} disabled={!prepared || progress !== null || busy} onClick={() => void download()}>Exportar {format.extension.toUpperCase()}</button>}
        {progress !== null && <button type="button" className={button} onClick={() => recording.current?.abort()}>Cancelar gravação</button>}
      </div>
      {!playbackOnly && format?.extension !== 'mp4' && <p className="text-sm text-slate-600 dark:text-slate-400">{format
        ? 'MP4 (H.264) indisponível neste navegador. Exporte WebM ou use a tela cheia em loop.'
        : 'Exportação de vídeo indisponível neste navegador. Use a tela cheia em loop.'}</p>}
      {progress !== null && <p role="status" className="text-sm">Gravando em tempo real… {Math.floor(progress * 100)}%. Mantenha esta aba visível.</p>}
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
    </section>
  )
}
