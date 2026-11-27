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
    expect(screen.getByRole('heading', { name: 'Exemplos para cada tipo de loja' })).toBeTruthy()
    const comment = screen.getByRole('button', { name: 'Ver exemplo para lojas de moda' })
    fireEvent.click(comment)
    expect(comment.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('figure').textContent).toContain('Lojas de moda')
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

  it('takes guests from a paid plan to login and checks billing on return', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() })
    const plan = { code: 'pro', name: 'Pro', monthly_price: '19.99', monthly_credits: 200 }
    const fetchRequest = vi.fn(async (url: string) => {
      if (url.endsWith('/plans/')) return Response.json([plan])
      if (url.endsWith('/auth/login/')) return Response.json({ access: 'test-token' })
      if (url.endsWith('/auth/logout/')) return new Response(null, { status: 205 })
      if (url.endsWith('/auth/me/')) return Response.json({ id: 1, name: 'Cliente', profile: { plan: 'free' } })
      if (url.endsWith('/billing/')) return Response.json({
        plan, credits: 0, monthly_limit: 200, used: 0, history: [], checkout_available: false, checkout_blockers: ['buyer_mismatch'],
      })
      return Response.json({}, { status: 401 })
    })
    vi.stubGlobal('fetch', fetchRequest)
    render(<MemoryRouter initialEntries={['/plans']}><App /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('link', { name: 'Entrar para testar Pro' }))
    expect(fetchRequest.mock.calls.some(([url]) => url.endsWith('/billing/'))).toBe(false)
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'cliente@example.com' } })
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha1234' } })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText(/a conta atual não corresponde à conta compradora/i)).toBeTruthy()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Assinar Pro em teste' }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Trocar para a conta de teste' }))
    expect(await screen.findByRole('heading', { name: 'Bem-vindo de volta' })).toBeTruthy()
  })

  it('opens the preliminary privacy policy from the public footer', async () => {
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>)
    fireEvent.click(screen.getByRole('link', { name: 'Política de Privacidade' }))
    expect(await screen.findByRole('heading', { name: 'Política de Privacidade' }, { timeout: 5000 })).toBeTruthy()
    expect(screen.getByText(/versão preliminar/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Exclusão de conta e dados' }).getAttribute('href')).toBe('/excluir-conta')
  }, 10000)

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
