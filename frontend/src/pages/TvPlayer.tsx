import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ApiError, apiRequest } from '../auth'
import type { Flyer } from '../flyers'
import { prepareVideo } from '../videoCanvas'

type PublishedPlaylist = Flyer & { kind: 'tv'; revision: string }
type FrameSource = { buffer: HTMLCanvasElement; render: (time: number) => void }
const REFRESH_INTERVAL = 30_000

export function TvPlayerPage() {
  const { token = '' } = useParams()
  const screen = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [source, setSource] = useState<FrameSource>()
  const [message, setMessage] = useState('Carregando playlist…')
  const [fullScreenError, setFullScreenError] = useState(false)
  const [fullScreen, setFullScreen] = useState(false)

  useEffect(() => {
    let active = true
    let timer = 0
    let controller: AbortController | undefined
    let revision = ''
    let hasSource = false
    setSource(undefined)
    setMessage('Carregando playlist…')

    async function refresh() {
      let retry = true
      const request = new AbortController()
      controller = request
      const timeout = window.setTimeout(() => request.abort(), 12_000)
      try {
        const query = revision ? `?revision=${encodeURIComponent(revision)}` : ''
        const playlist = await apiRequest<PublishedPlaylist | undefined>(`public/projects/${encodeURIComponent(token)}/${query}`, { signal: request.signal })
        if (!active) return
        if (!playlist) {
          setMessage(hasSource ? '' : 'A playlist está sem ofertas.')
          return
        }
        if (playlist.kind !== 'tv') throw new ApiError('Link indisponível.', 404)
        if (!playlist.products.length) {
          setSource(undefined)
          hasSource = false
          revision = playlist.revision
          setMessage('A playlist está sem ofertas.')
          return
        }
        const buffer = document.createElement('canvas')
        const video = await prepareVideo(buffer, playlist.products, playlist.design)
        if (!active) return
        if (video.missing && hasSource) {
          setMessage('Algumas imagens estão indisponíveis. Exibindo a última playlist carregada.')
          return
        }
        video.render(0)
        setSource({ buffer, render: video.render })
        hasSource = !video.missing
        if (hasSource) revision = playlist.revision
        setMessage(video.missing ? 'Algumas imagens estão indisponíveis. Tentando novamente…' : '')
      } catch (reason) {
        if (!active) return
        if (reason instanceof ApiError && [404, 410].includes(reason.status)) {
          retry = false
          setSource(undefined)
          setMessage('O link desta TV está indisponível ou foi revogado.')
        } else {
          setMessage('Conexão temporariamente indisponível. Tentando novamente…')
        }
      } finally {
        window.clearTimeout(timeout)
        if (active && retry) timer = window.setTimeout(() => void refresh(), REFRESH_INTERVAL)
      }
    }

    void refresh()
    return () => {
      active = false
      controller?.abort()
      window.clearTimeout(timer)
    }
  }, [token])

  useEffect(() => {
    if (!source) return
    const context = canvas.current?.getContext('2d', { alpha: false })
    if (!context) return
    const started = performance.now()
    let frame = 0
    const draw = (time: number) => {
      source.render(Math.max(0, time - started))
      context.drawImage(source.buffer, 0, 0)
      frame = requestAnimationFrame(draw)
    }
    draw(started)
    return () => cancelAnimationFrame(frame)
  }, [source])

  useEffect(() => {
    const sync = () => setFullScreen(document.fullscreenElement === screen.current)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  async function enterFullScreen() {
    try {
      if (!screen.current?.requestFullscreen) throw new Error()
      await screen.current.requestFullscreen()
    } catch {
      setFullScreenError(true)
    }
  }

  return (
    <main ref={screen} className="relative grid min-h-screen place-items-center bg-black text-white" aria-label="TV de Ofertas">
      {source && <canvas ref={canvas} width={source.buffer.width} height={source.buffer.height}
        className="block max-h-screen max-w-full object-contain" aria-label="Playlist de ofertas em reprodução" />}
      {(message || fullScreenError) && <p role="status" className={`${source ? 'absolute bottom-4 left-4' : ''} rounded-md bg-black/80 p-3 text-sm`}>
        {message || 'Use o modo tela cheia do navegador, se disponível.'}
      </p>}
      {source && !fullScreen && <button type="button" onClick={() => void enterFullScreen()}
        className="absolute right-4 top-4 rounded-lg bg-slate-900/80 px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2">
        Tela cheia
      </button>}
    </main>
  )
}
