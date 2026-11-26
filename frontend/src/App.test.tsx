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
    vi.unstubAllGlobals()
  })

  it('renders the landing page', () => {
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Sua oferta merece destaque.' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Cartazes e etiquetas' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Vídeos para TV da loja' })).toBeTruthy()
    expect(screen.getByText('10 créditos grátis por mês')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ver exemplos' }).getAttribute('href')).toBe('#exemplos')
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

  it('redirects unauthenticated visitors away from private pages', async () => {
    render(<MemoryRouter initialEntries={['/dashboard']}><App /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText(/Bem-vindo de volta/i)).toBeTruthy())
    expect(screen.queryByText(/Olá,/i)).toBeNull()
  })
})
