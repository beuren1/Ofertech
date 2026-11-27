import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { apiBlobRequest, apiRequest } from './auth'
import { createFlyer, prepareFlyerImage, renderFlyerPage, type Flyer } from './flyers'
import { FlyerPageEditor } from './pages/Flyer'
import { FlyerBackgroundCarousel } from './components/FlyerBackgroundCarousel'

const testAuth = vi.hoisted(() => ({ plan: undefined as string | undefined }))

vi.mock('./auth', () => ({
  apiRequest: vi.fn(),
  apiBlobRequest: vi.fn(),
  getErrorMessage: String,
  useAuth: () => ({ accessToken: 'fixture-session', user: testAuth.plan ? { profile: { plan: testAuth.plan } } : undefined }),
}))

vi.mock('./flyers', async importOriginal => ({
  ...await importOriginal<typeof import('./flyers')>(),
  prepareFlyerImage: vi.fn(async () => 'data:image/webp;base64,AAAA'),
  renderFlyerPage: vi.fn(async () => 0),
}))

afterEach(() => {
  cleanup()
  testAuth.plan = undefined
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

it('slides automatically and lets the user navigate while paused', () => {
  vi.useFakeTimers()
  try {
    render(<FlyerBackgroundCarousel onSelect={vi.fn()} />)
    const track = screen.getByRole('button', { name: 'Supermercado verde' }).parentElement?.parentElement
    expect(track?.style.transform).toBe('translateX(-0%)')
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Supermercado verde' }))
    act(() => { vi.advanceTimersByTime(8000) })
    expect(track?.style.transform).toBe('translateX(-100%)')
    expect(screen.getByRole('button', { name: 'Eletrônicos azul' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Pausar carrossel' }))
    act(() => { vi.advanceTimersByTime(8000) })
    expect(track?.style.transform).toBe('translateX(-100%)')
    fireEvent.click(screen.getByRole('button', { name: 'Fundos anteriores' }))
    expect(track?.style.transform).toBe('translateX(-0%)')
    fireEvent.click(screen.getByRole('button', { name: 'Reproduzir carrossel' }))
    act(() => { vi.advanceTimersByTime(8000) })
    expect(track?.style.transform).toBe('translateX(-100%)')
  } finally {
    vi.useRealTimers()
  }
})

it('offers posters and labels to free accounts at two credits per page', async () => {
  testAuth.plan = 'free'
  vi.mocked(apiRequest).mockResolvedValue({ results: [], next: null })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  render(<FlyerPageEditor printMode />)
  expect(screen.getByRole('heading', { name: 'Criar Cartaz' })).toBeTruthy()
  expect(screen.getByText(/2 créditos por página/)).toBeTruthy()
  expect(screen.getByRole<HTMLOptionElement>('option', { name: 'Etiquetas de preço' }).disabled).toBe(false)
  expect(screen.queryByRole('button', { name: 'Exportar PDF' })).toBeNull()
  const zoom = screen.getByRole('slider', { name: 'Zoom da página 1' })
  fireEvent.change(zoom, { target: { value: '150' } })
  const preview = screen.getByRole('group', { name: 'Prévia ampliada da página 1' })
  expect(zoom.getAttribute('aria-valuetext')).toBe('150%')
  expect(preview.querySelector('canvas')?.style.width).toBe('150%')
  fireEvent.change(screen.getByLabelText('Logotipo'), { target: { files: [new File(['logo'], 'logo.png', { type: 'image/png' })] } })
  expect(await screen.findByRole('button', { name: 'Remover fundo do logotipo' })).toBeTruthy()
  await act(async () => {})
})

it.each([false, true])('preserves both manually added products in the preview and save (print mode: %s)', async printMode => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  const save = vi.fn()
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (path === 'flyers/' && options?.method === 'POST') {
      save(options.body)
      return { ...createFlyer(printMode), id: 12, updated_at: 'fixture-time' }
    }
    return { results: [], next: null }
  })
  render(<FlyerPageEditor printMode={printMode} />)

  for (const [name, price] of [['Café', '20,00'], ['Chá', '15,00']]) {
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    fireEvent.change(screen.getByLabelText('Nome do produto'), { target: { value: name } })
    fireEvent.change(screen.getByLabelText('Preço promocional'), { target: { value: price } })
  }
  expect(screen.getByText('2 produtos no projeto.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Café' }))
  expect(screen.getByLabelText<HTMLInputElement>('Preço promocional').value).toBe('20,00')

  if (printMode) {
    expect(screen.getByRole('option', { name: '2 · Chá' })).toBeTruthy()
    expect(renderFlyerPage).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      products: [expect.objectContaining({ name: 'Chá' })],
    }), expect.anything(), 1, 2, expect.anything(), expect.anything(), expect.anything())
    fireEvent.change(screen.getByLabelText('Geração'), { target: { value: 'single' } })
    expect(screen.getByRole('option', { name: 'Chá' })).toBeTruthy()
  } else {
    expect(renderFlyerPage).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      products: [expect.objectContaining({ name: 'Café' }), expect.objectContaining({ name: 'Chá' })],
    }), expect.anything(), 0, 1, expect.anything(), expect.anything(), expect.anything())
  }

  fireEvent.click(screen.getByRole('button', { name: printMode ? 'Salvar projeto' : 'Salvar encarte' }))
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({
    products: [
      expect.objectContaining({ name: 'Café', price: '20,00' }),
      expect.objectContaining({ name: 'Chá', price: '15,00' }),
    ],
  })))
})

it('moves and deletes an individual product from the flyer preview', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  vi.mocked(apiRequest).mockResolvedValue({ results: [], next: null })
  vi.mocked(renderFlyerPage).mockImplementation(async (_canvas, page, _design, _index, _total, _scale, report) => {
    page.products.forEach((product, index) => report?.(product, {
      safe: { x: 0, y: 100, width: 600, height: 700 },
      image: { x: index * 220, y: 100, width: 200, height: 200 },
    }, 'product'))
    return 0
  })
  render(<FlyerPageEditor />)
  for (const name of ['Café', 'Chá']) {
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    fireEvent.change(screen.getByLabelText('Nome do produto'), { target: { value: name } })
  }
  await screen.findByRole('button', { name: 'Editar camadas' })
  const canvas = screen.getByLabelText<HTMLCanvasElement>(/Prévia da página 1/)
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, canvas.width, canvas.height))
  canvas.setPointerCapture = vi.fn()
  const pointer = (type: string, x: number, y: number) => fireEvent(canvas, Object.assign(
    new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true }), { pointerId: 1 },
  ))
  pointer('pointerdown', 80, 150)
  pointer('pointermove', 120, 200)
  pointer('pointerup', 120, 200)
  expect(screen.getByLabelText<HTMLInputElement>('Nome do produto').value).toBe('Café')
  expect(renderFlyerPage).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    products: [
      expect.objectContaining({ name: 'Café', cardPosition: { x: -80, y: -80 } }),
      expect.not.objectContaining({ cardPosition: expect.anything() }),
    ],
  }), expect.anything(), 0, 1, expect.anything(), expect.anything(), expect.anything())
  fireEvent.click(await screen.findByRole('button', { name: 'Excluir Café da arte' }))
  expect(screen.queryByRole('button', { name: 'Café' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Chá' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
  expect(screen.getByRole('button', { name: 'Café' })).toBeTruthy()
})

it('imports CSV and campaign products, edits a price, saves and reopens the project', async () => {
  const designLayers = ['logo', 'storeName', 'subtitle', 'category', 'backgroundImage'] as const
  vi.mocked(renderFlyerPage).mockImplementation(async (_canvas, page, _design, _index, _total, _scale, onPhoto, onDesignLayer) => {
    designLayers.forEach((layer, index) => onDesignLayer?.(layer, {
      safe: { x: 200, y: index * 100, width: 100, height: 100 },
      image: { x: 225, y: 25 + index * 100, width: 50, height: 50 },
    }))
    for (const product of page.products.filter(item => item.imageUrl)) {
      onPhoto?.(product, { safe: { x: 0, y: 0, width: 200, height: 200 }, image: { x: 50, y: 50, width: 100, height: 100 } })
      const layerNames = ['name', 'originalPrice', 'offer'] as const
      layerNames.forEach((layer, index) => onPhoto?.(product, {
        safe: { x: 0, y: 200 + index * 200, width: 200, height: 200 },
        image: { x: 50, y: 250 + index * 200, width: 100, height: 100 },
      }, layer))
    }
    return 0
  })
  const context = { clearRect: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
  const project = vi.fn()
  const importedPhoto = new Blob(['test-photo'], { type: 'image/png' })
  vi.mocked(apiBlobRequest).mockResolvedValue(importedPhoto)
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (path === 'campaigns/?page=1') return { results: [{ id: 2, name: 'Campanha de roupas' }], next: null }
    if (path === 'campaigns/2/') return {
      id: 2, artworks: [{
        product: { name: 'Camiseta', category: 'Moda', price: '40,00', discount: '', image_asset_id: 7 },
        config: { salePrice: '35,00' },
      }],
    }
    if (path === 'flyers/?page=1') return { results: [{ id: 8, name: 'Encarte salvo' }], next: null }
    if (path === 'flyers/8/') return { ...createFlyer(), id: 8, name: 'Encarte salvo' }
    if (path === 'flyers/' && options?.method === 'POST') {
      project(options.body)
      return { ...createFlyer(), id: 9, name: 'Novo encarte', updated_at: 'fixture-time' }
    }
    throw new Error('Unexpected request')
  })
  render(<FlyerPageEditor />)
  const csv = new File(['produto;categoria;preco\nCafé;Mercearia;20,00'], 'produtos.csv', { type: 'text/csv' })
  Object.defineProperty(csv, 'text', { value: async () => 'produto;categoria;preco\nCafé;Mercearia;20,00' })
  fireEvent.change(screen.getByLabelText('Importar CSV'), { target: { files: [csv] } })
  await screen.findByRole('button', { name: /Café/ })
  await screen.findByRole('option', { name: 'Campanha de roupas' })
  fireEvent.change(screen.getByLabelText('Campanha salva'), { target: { value: '2' } })
  fireEvent.click(screen.getByRole('button', { name: 'Importar produtos' }))
  fireEvent.click(await screen.findByRole('button', { name: /Camiseta/ }))
  expect(apiBlobRequest).toHaveBeenCalledWith('campaigns/2/assets/7/content/', 'fixture-session')
  expect(prepareFlyerImage).toHaveBeenCalledWith(importedPhoto, 420, 15000)
  expect(screen.getByRole('button', { name: 'Remover fundo' })).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Escala da foto'), { target: { value: '160' } })
  fireEvent.change(screen.getByLabelText('Cor da faixa da oferta'), { target: { value: '#6837ad' } })
  fireEvent.change(screen.getByLabelText('Cor do selo de desconto'), { target: { value: '#ffd635' } })
  fireEvent.change(screen.getByLabelText('Texto da oferta'), { target: { value: '#222222' } })
  fireEvent.change(screen.getByLabelText('Cor da caixa do preço anterior'), { target: { value: '#557799' } })
  fireEvent.change(screen.getByLabelText('Texto da categoria'), { target: { value: '#ffee44' } })
  fireEvent.change(screen.getByLabelText('Logotipo'), { target: { files: [new File(['logo'], 'logo.png', { type: 'image/png' })] } })
  expect(await screen.findByRole('button', { name: 'Remover fundo do logotipo' })).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Tamanho do logotipo'), { target: { value: '150' } })
  fireEvent.change(screen.getByLabelText('Cor do nome da loja'), { target: { value: '#226644' } })
  fireEvent.change(screen.getByLabelText('Cor do subtítulo'), { target: { value: '#889966' } })
  const fetchBackground = vi.spyOn(window, 'fetch').mockResolvedValue(new Response('background', {
    headers: { 'Content-Type': 'image/jpeg' },
  }))
  fireEvent.click(screen.getByRole('button', { name: 'Próximos fundos' }))
  fireEvent.click(screen.getByRole('button', { name: 'Eletrônicos azul' }))
  await screen.findByRole('button', { name: 'Remover imagem de fundo' })
  expect(fetchBackground).toHaveBeenCalledWith('/flyer-backgrounds/03_eletronicos_azul.jpg')
  expect(prepareFlyerImage).toHaveBeenCalledWith(expect.objectContaining({ type: 'image/jpeg' }), 850, 132000)
  fireEvent.change(screen.getByLabelText('Cor do brilho'), { target: { value: '#44aaff' } })
  fireEvent.change(screen.getByLabelText('Intensidade do brilho'), { target: { value: '200' } })
  fireEvent.change(screen.getByLabelText('Difusão do brilho'), { target: { value: '7' } })
  fireEvent.click(screen.getByLabelText('Brilho do produto'))
  expect(screen.queryByLabelText('Cor do brilho')).toBeNull()
  fireEvent.click(screen.getByLabelText('Brilho do produto'))
  fireEvent.change(screen.getByLabelText('Etiqueta promocional'), { target: { value: 'IMPERDÍVEL' } })
  const price = screen.getByLabelText<HTMLInputElement>('Preço promocional')
  expect(price.value).toBe('35,00')
  fireEvent.change(price, { target: { value: '30,00' } })
  fireEvent.click(screen.getByLabelText('Marcar como oferta principal'))
  fireEvent.change(screen.getByLabelText('Nome da loja'), { target: { value: 'Loja Teste' } })
  fireEvent.change(screen.getByLabelText('Modelo visual'), { target: { value: 'professional' } })
  expect(screen.getByLabelText<HTMLInputElement>('Separar páginas por categoria').checked).toBe(true)
  const preview = screen.getByLabelText<HTMLCanvasElement>('Prévia da página 2 · Moda')
  vi.spyOn(preview, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: preview.width, height: preview.height } as DOMRect)
  Object.defineProperty(preview, 'setPointerCapture', { value: vi.fn() })
  await act(async () => {})
  const pointer = (type: string, x: number, y: number) => fireEvent(preview, Object.assign(
    new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true }), { pointerId: 1 },
  ))
  pointer('pointerdown', 100, 100)
  pointer('pointermove', 110, 90)
  pointer('pointermove', 125, 75)
  pointer('pointerup', 125, 75)
  expect(screen.getByLabelText<HTMLInputElement>('Posição horizontal').value).toBe('50')
  expect(screen.getByLabelText<HTMLInputElement>('Posição vertical').value).toBe('-50')
  fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
  expect(screen.getByLabelText<HTMLInputElement>('Posição horizontal').value).toBe('0')
  fireEvent.click(screen.getByRole('button', { name: 'Refazer' }))
  expect(screen.getByLabelText<HTMLInputElement>('Posição horizontal').value).toBe('50')
  for (const y of [300, 500, 700]) {
    await act(async () => {})
    pointer('pointerdown', 100, y)
    pointer('pointermove', 125, y - 25)
    pointer('pointerup', 125, y - 25)
  }
  for (const y of [50, 150, 250, 350, 450]) {
    await act(async () => {})
    pointer('pointerdown', 250, y)
    pointer('pointermove', 260, y - 10)
    pointer('pointerup', 260, y - 10)
  }
  await act(async () => {})
  fireEvent.click(screen.getByText('Camadas da página 2'))
  fireEvent.click(screen.getByRole('button', { name: 'Bloquear Foto · Camiseta' }))
  expect(screen.getByLabelText<HTMLInputElement>('Posição horizontal').disabled).toBe(true)
  await screen.findByRole('button', { name: 'Desbloquear Foto · Camiseta' })
  pointer('pointerdown', 100, 100)
  pointer('pointermove', 110, 100)
  pointer('pointerup', 110, 100)
  expect(screen.getByLabelText<HTMLInputElement>('Posição horizontal').value).toBe('50')
  const transfer = { setData: vi.fn(), effectAllowed: 'none', dropEffect: 'none' }
  fireEvent.dragStart(screen.getByLabelText('Arrastar Camiseta'), { dataTransfer: transfer })
  fireEvent.dragOver(screen.getByLabelText('Arrastar Café'), { dataTransfer: transfer })
  fireEvent.drop(screen.getByLabelText('Arrastar Café'), { dataTransfer: transfer })
  expect(transfer.dropEffect).toBe('move')
  fireEvent.click(screen.getByRole('button', { name: 'Salvar encarte' }))
  await screen.findByText('Encarte salvo.')
  expect(project).toHaveBeenCalledWith(expect.objectContaining({
    design: expect.objectContaining({
      storeName: 'Loja Teste', template: 'professional', border: 'strong', categoryTextColor: '#ffee44',
      logo: 'data:image/webp;base64,AAAA', logoScale: 150, storeNameColor: '#226644', subtitleColor: '#889966',
      backgroundImage: 'data:image/webp;base64,AAAA',
      layerPositions: Object.fromEntries(designLayers.map(layer => [layer, { x: 40, y: -40 }])),
    }),
    products: [expect.objectContaining({
      price: '30,00', featured: true, imageUrl: 'data:image/webp;base64,AAAA', photoScale: 160, photoX: 50, photoY: -50, offerLabel: 'IMPERDÍVEL', lockedLayers: ['photo'],
      offerColor: '#6837ad', discountColor: '#ffd635', offerTextColor: '#222222', oldPriceColor: '#557799',
      textPositions: { name: { x: 50, y: -50 }, originalPrice: { x: 50, y: -50 }, offer: { x: 50, y: -50 } },
      glow: { enabled: true, color: '#44aaff', intensity: 200, blur: 7 },
    }), expect.objectContaining({ name: 'Café' })],
  }))
  fireEvent.change(screen.getByLabelText('Projetos salvos'), { target: { value: '8' } })
  fireEvent.click(screen.getByRole('button', { name: 'Abrir' }))
  await waitFor(() => expect(screen.getByLabelText<HTMLInputElement>('Nome do projeto').value).toBe('Encarte salvo'))
}, 15_000)

it('opens a recent project link in its editor', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  vi.mocked(apiRequest).mockImplementation(async path => path === 'flyers/21/'
    ? { ...createFlyer(true), id: 21, name: 'Cartaz da loja' }
    : { results: [], next: null })
  render(<FlyerPageEditor printMode initialSearch="?project_id=21" />)
  await waitFor(() => expect(screen.getByLabelText<HTMLInputElement>('Nome do projeto').value).toBe('Cartaz da loja'))
  expect(apiRequest).toHaveBeenCalledWith('flyers/21/', { accessToken: 'fixture-session' })
})

it('applies the gallery template and its background to a new project', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  vi.mocked(apiRequest).mockResolvedValue({ results: [], next: null })
  const fetchBackground = vi.spyOn(window, 'fetch').mockResolvedValue(new Response('preview', { headers: { 'Content-Type': 'image/jpeg' } }))
  render(<FlyerPageEditor initialSearch="?template=06_farmacia_azul" />)
  await waitFor(() => expect(screen.getByLabelText<HTMLInputElement>('Nome do projeto').value).toBe('Farmácia azul'))
  expect(screen.getByLabelText<HTMLSelectElement>('Modelo visual').value).toBe('pharmacy')
  expect(fetchBackground).toHaveBeenCalledWith('/flyer-backgrounds/06_farmacia_azul.jpg')
  expect(screen.getByRole('button', { name: 'Remover imagem de fundo' })).toBeTruthy()
})

it('imports a print catalog, edits paper and label settings, and persists the individual selection', async () => {
  const context = { clearRect: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
  let saved = createFlyer(true)
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (path === 'campaigns/?page=1' || path === 'flyers/?page=1&kind=print') return { results: [], next: null }
    if (path === 'flyers/' && options?.method === 'POST') saved = options.body as Flyer
    else if (path !== 'flyers/12/') throw new Error('Unexpected request')
    return { ...saved, id: 12, updated_at: 'fixture-time' }
  })
  render(<FlyerPageEditor printMode />)
  expect(screen.getByRole('heading', { name: 'Criar Cartaz' })).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Cor do subtítulo'), { target: { value: '#8833cc' } })
  fireEvent.change(screen.getByLabelText('Logotipo'), { target: { files: [new File(['logo'], 'logo.png', { type: 'image/png' })] } })
  expect(await screen.findByRole('button', { name: 'Remover fundo do logotipo' })).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Tamanho do logotipo'), { target: { value: '140' } })
  const csv = new File([], 'produtos.csv', { type: 'text/csv' })
  Object.defineProperty(csv, 'text', { value: async () => 'produto;preco\nCafé;20,00\nChá;15,00' })
  fireEvent.change(screen.getByLabelText('Importar CSV'), { target: { files: [csv] } })
  await screen.findByRole('button', { name: 'Café' })
  fireEvent.change(screen.getByLabelText('Modelo visual'), { target: { value: 'professional' } })
  fireEvent.click(screen.getByRole('button', { name: 'Café' }))
  fireEvent.change(screen.getByLabelText('Enviar foto do produto'), { target: { files: [new File(['photo'], 'cafe.png', { type: 'image/png' })] } })
  expect(await screen.findByRole('button', { name: 'Remover fundo' })).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Papel'), { target: { value: 'A3' } })
  expect(screen.getByText(/2 páginas · A3 · 297 × 420 mm/)).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Orientação'), { target: { value: 'landscape' } })
  expect(screen.getByText(/2 páginas · A3 · 420 × 297 mm/)).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Tipo de material'), { target: { value: 'labels' } })
  fireEvent.change(screen.getByLabelText('Largura da etiqueta (mm)'), { target: { value: '60' } })
  fireEvent.change(screen.getByLabelText('Geração'), { target: { value: 'single' } })
  fireEvent.change(screen.getByLabelText('Produto para impressão'), { target: { value: '1' } })
  fireEvent.change(screen.getByLabelText('Posição da foto'), { target: { value: 'right' } })
  expect(screen.getByText(/18 etiquetas por folha A4/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Salvar projeto' }))
  await screen.findByText('Projeto salvo.')
  expect(saved.design.template).toBe('professional')
  expect(saved.design).toMatchObject({ subtitleColor: '#8833cc', logoScale: 140 })
  expect(saved.design.print).toMatchObject({ kind: 'labels', orientation: 'landscape', labelWidth: 60, selectedProduct: 1, photoPosition: 'right' })
  fireEvent.click(screen.getByRole('button', { name: 'Novo' }))
  fireEvent.change(screen.getByLabelText('Projetos salvos'), { target: { value: '12' } })
  fireEvent.click(screen.getByRole('button', { name: 'Abrir' }))
  await waitFor(() => expect(screen.getByLabelText<HTMLSelectElement>('Produto para impressão').value).toBe('1'))
})
