import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { apiRequest } from './auth'
import { createFlyer, type Flyer } from './flyers'
import { FlyerPageEditor } from './pages/Flyer'
import { videoFrame, videoTimeline } from './videoTimeline'

vi.mock('./auth', () => ({
  apiRequest: vi.fn(), apiBlobRequest: vi.fn(), getErrorMessage: String,
  useAuth: () => ({ accessToken: 'fixture-session' }),
}))

vi.mock('./videoCanvas', () => ({
  prepareVideo: vi.fn(async (_canvas: HTMLCanvasElement, products: Flyer['products'], design: Flyer['design']) => {
    const timeline = videoTimeline(products, design.video!.duration)
    return { timeline, render: (time: number) => videoFrame(timeline, time)?.index, missing: 0 }
  }),
  recordVideo: vi.fn(),
}))

vi.mock('./flyers', async importOriginal => ({
  ...await importOriginal<typeof import('./flyers')>(),
  prepareFlyerImage: vi.fn(async () => 'data:image/webp;base64,AAAA'),
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('imports, edits, reorders and reopens a video and plays it in loop without MP4 support', async () => {
  vi.stubGlobal('MediaRecorder', undefined)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
  let tick: FrameRequestCallback | undefined
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { tick = callback; return 1 })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  vi.spyOn(performance, 'now').mockReturnValue(0)
  let saved = createFlyer(false, true)
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (path === 'flyers/?page=1&kind=video') return { results: [], next: null }
    if (path === 'campaigns/?page=1') return { results: [{ id: 5, name: 'Campanha da loja' }], next: null }
    if (path === 'campaigns/5/') return {
      id: 5, artworks: [{ product: { name: 'Café', category: '', price: '20,00', original_price: '', discount: '' }, config: {} }],
    }
    if (path === 'flyers/' && options?.method === 'POST') saved = options.body as Flyer
    else if (path !== 'flyers/15/') throw new Error('Unexpected request')
    return { ...saved, id: 15, updated_at: 'fixture-time' }
  })

  render(<FlyerPageEditor videoMode />)
  expect(screen.getByRole('heading', { name: 'Criar Vídeo' })).toBeTruthy()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('background', { headers: { 'Content-Type': 'image/jpeg' } })))
  fireEvent.click(screen.getByRole('button', { name: 'Supermercado verde' }))
  await screen.findByRole('button', { name: 'Remover imagem de fundo' })
  fireEvent.change(screen.getByLabelText('Intensidade da imagem de fundo'), { target: { value: '70' } })
  fireEvent.change(screen.getByLabelText('Texto do rodapé'), { target: { value: 'Consulte as ofertas na loja' } })
  fireEvent.change(screen.getByLabelText('Cor do rodapé'), { target: { value: '#103b32' } })
  fireEvent.change(screen.getByLabelText('Cor do texto do rodapé'), { target: { value: '#f2faf4' } })
  const zoom = screen.getByRole('slider', { name: 'Zoom da prévia' })
  fireEvent.change(zoom, { target: { value: '150' } })
  expect(zoom.getAttribute('aria-valuetext')).toBe('150%')
  fireEvent.change(screen.getByLabelText('Cor do nome da loja'), { target: { value: '#99ee11' } })
  fireEvent.change(screen.getByLabelText('Cor do subtítulo'), { target: { value: '#8833cc' } })
  fireEvent.change(screen.getByLabelText('Texto da categoria'), { target: { value: '#cccc44' } })
  const csv = new File([], 'lista.csv')
  Object.defineProperty(csv, 'text', { value: async () => 'produto;preco\nChá;15,00' })
  fireEvent.change(screen.getByLabelText('Importar CSV'), { target: { files: [csv] } })
  await screen.findByRole('button', { name: 'Chá' })
  await screen.findByRole('option', { name: 'Campanha da loja' })
  fireEvent.change(screen.getByLabelText('Campanha salva'), { target: { value: '5' } })
  fireEvent.click(screen.getByRole('button', { name: 'Importar produtos' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Café' }))
  fireEvent.change(screen.getByLabelText('Preço promocional'), { target: { value: '19,90' } })
  fireEvent.change(screen.getByLabelText('Duração desta oferta (segundos)'), { target: { value: '2' } })
  fireEvent.click(screen.getByRole('button', { name: 'Subir' }))
  fireEvent.change(screen.getByLabelText('Orientação'), { target: { value: 'vertical' } })
  fireEvent.change(screen.getByLabelText('Transição'), { target: { value: 'zoom' } })
  await screen.findByText('1080 × 1920 · 7 s por ciclo')
  act(() => tick?.(2500))
  expect(screen.getByText('Oferta 2 de 2 · Loop contínuo')).toBeTruthy()
  act(() => tick?.(7100))
  expect(screen.getByText('Oferta 1 de 2 · Loop contínuo')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Tela cheia em loop' }))
  expect(await screen.findByRole('button', { name: 'Sair da tela cheia' })).toBeTruthy()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.queryByRole('button', { name: 'Sair da tela cheia' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Exportar MP4' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Salvar projeto' }))
  await screen.findByText('Projeto salvo.')
  expect(saved.design.video).toMatchObject({ transition: 'zoom', orientation: 'vertical' })
  expect(saved.design.video).toMatchObject({
    backgroundOpacity: 70, footerText: 'Consulte as ofertas na loja', footerColor: '#103b32', footerTextColor: '#f2faf4',
  })
  expect(saved.design.backgroundImage).toBe('data:image/webp;base64,AAAA')
  expect(saved.design).toMatchObject({ storeNameColor: '#99ee11', subtitleColor: '#8833cc', categoryTextColor: '#cccc44' })
  expect(saved.products[0]).toMatchObject({ name: 'Café', price: '19,90', duration: 2 })
  fireEvent.click(screen.getByRole('button', { name: 'Novo' }))
  fireEvent.change(screen.getByLabelText('Projetos salvos'), { target: { value: '15' } })
  fireEvent.click(screen.getByRole('button', { name: 'Abrir' }))
  await screen.findByText('1080 × 1920 · 7 s por ciclo')
})
