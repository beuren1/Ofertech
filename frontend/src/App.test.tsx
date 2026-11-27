import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

describe('Ofertech', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ detail: 'Sessão não encontrada.' }),
    })))
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders the landing page', () => {
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Sua oferta merece destaque.' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Cartazes e etiquetas' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Vídeos para TV da loja' })).toBeTruthy()
    expect(screen.getByText('10 créditos grátis por mês')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ver exemplos' }).getAttribute('href')).toBe('/templates')
    for (const [name, path] of [
      ['Banners promocionais', '/generator'], ['Criação em massa', '/bulk'],
      ['Encartes de ofertas', '/flyers'], ['Cartazes e etiquetas', '/print'],
      ['Vídeos para TV da loja', '/videos'], ['Identidade da sua loja', '/store'],
      ['Etiquetas de preço', '/labels'], ['Stories promocionais', '/stories'],
      ['Cardápios digitais e impressos', '/menus'], ['TV de Ofertas', '/tv'],
    ]) {
      expect(screen.getByRole('link', { name }).getAttribute('href')).toBe(path)
    }
    expect(screen.getByRole('heading', { name: 'Comentários de lojistas' })).toBeTruthy()
    expect(screen.getByText('Nomes e relatos fictícios.')).toBeTruthy()
    const comment = screen.getByRole('button', { name: 'Ver comentário de vitrine flor de linho' })
    fireEvent.click(comment)
    expect(comment.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('figure').textContent).toContain('Vitrine Flor de Linho')
    expect(document.title).toBe('Ofertech | Sua oferta merece destaque.')
    expect(screen.getByRole('contentinfo').textContent).toContain('Ofertech')
  })

  it('updates the title and search description when navigating to plans', async () => {
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>)
    fireEvent.click(screen.getByRole('link', { name: 'Planos' }))
    await waitFor(() => expect(document.title).toBe('Planos e créditos | Ofertech'))
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toContain('Grátis, Pro e Business')
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe(document.title)
  })

  it('renders authentication page', () => {
    render(<MemoryRouter initialEntries={['/login']}><App /></MemoryRouter>)
    expect(screen.getByText(/Bem-vindo de volta/i)).toBeTruthy()
  })

  it('opens creation for guests and keeps the draft through login', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/auth/login/')) return Response.json({ access: 'test-token' })
      if (url.endsWith('/auth/me/')) return Response.json({
        id: 1, name: 'Cliente', email: 'cliente@example.com', profile: { plan: 'free' },
      })
      if (url.endsWith('/billing/')) return Response.json({ credits: 10 })
      return Response.json({}, { status: 401 })
    }))
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>)
    fireEvent.click(screen.getByRole('link', { name: 'Começar grátis' }))
    const campaign = await screen.findByRole('textbox', { name: 'Nome da campanha' }, { timeout: 6000 })
    fireEvent.change(campaign, { target: { value: 'Oferta da semana' } })
    fireEvent.click(screen.getByRole('button', { name: 'Baixar PNG' }))
    expect(screen.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'Nome da campanha' })).toBeNull()
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'cliente@example.com' } })
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha1234' } })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    const resumedCampaign = await screen.findByRole<HTMLInputElement>('textbox', { name: 'Nome da campanha' }, { timeout: 6000 })
    expect(resumedCampaign.value).toBe('Oferta da semana')
  }, 15000)

  it('redirects unauthenticated visitors away from private pages', async () => {
    render(<MemoryRouter initialEntries={['/dashboard']}><App /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText(/Bem-vindo de volta/i)).toBeTruthy())
    expect(screen.queryByText(/Olá,/i)).toBeNull()
  })
})
