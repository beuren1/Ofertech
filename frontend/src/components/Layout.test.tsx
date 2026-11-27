import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { apiRequest } from '../auth'
import { checkArtworkCredits, confirmArtworks, creditOperation } from '../billing'
import { DashboardLayout } from './Layout'

vi.mock('../auth', () => ({
  apiRequest: vi.fn(),
  useAuth: () => ({ user: { id: 1, name: 'Loja Teste', profile: {} }, accessToken: 'token' }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

it('collapses the desktop sidebar and reopens it without resetting the editor', async () => {
  const setItem = vi.fn()
  vi.stubGlobal('localStorage', { getItem: vi.fn(), setItem })
  vi.mocked(apiRequest).mockResolvedValue({ credits: 10 })
  render(<MemoryRouter><DashboardLayout><input aria-label="Rascunho" /></DashboardLayout></MemoryRouter>)

  const draft = screen.getByRole<HTMLInputElement>('textbox', { name: 'Rascunho' })
  const workspace = screen.getByRole('main').parentElement
  fireEvent.change(draft, { target: { value: 'Minha oferta' } })
  fireEvent.click(screen.getByRole('button', { name: 'Recolher barra lateral' }))
  const expand = screen.getByRole('button', { name: 'Expandir barra lateral' })
  expect(expand.getAttribute('aria-expanded')).toBe('false')
  expect(workspace?.classList.contains('lg:pl-64')).toBe(false)
  expect(setItem).toHaveBeenCalledWith('sidebar', 'collapsed')

  fireEvent.click(expand)
  expect(screen.getByRole('button', { name: 'Recolher barra lateral' }).getAttribute('aria-expanded')).toBe('true')
  expect(workspace?.classList.contains('lg:pl-64')).toBe(true)
  expect(screen.getByRole('textbox', { name: 'Rascunho' })).toBe(draft)
  expect(draft.value).toBe('Minha oferta')
  await screen.findByRole('link', { name: '10 créditos' })
})

it('links to plans and refreshes the displayed balance only after credit confirmation', async () => {
  vi.stubGlobal('localStorage', { getItem: vi.fn(), setItem: vi.fn() })
  let credits = 10
  const request = vi.mocked(apiRequest)
  request.mockImplementation(async (path, options) => {
    if (path === 'billing/') return { credits }
    if (options?.body instanceof FormData) credits -= path === 'billing/artworks/' ? 1 : 2
    return {}
  })
  render(<MemoryRouter><DashboardLayout>Editor</DashboardLayout></MemoryRouter>)

  const balance = await screen.findByRole('link', { name: '10 créditos' })
  expect(balance.getAttribute('href')).toBe('/plans')
  expect(balance.nextElementSibling).toBe(screen.getByRole('button', { name: 'Alternar tema' }))
  const operation = { key: 'flyer', kind: 'flyer', count: 1, format: 'png' } as const
  await act(async () => {
    await checkArtworkCredits('token', 'banner', 1)
    await creditOperation('token', operation)
  })
  expect(request.mock.calls.filter(([path]) => path === 'billing/')).toHaveLength(1)

  const image = new Blob(['image'], { type: 'image/png' })
  await act(async () => { await confirmArtworks('token', 'banner', [image]) })
  expect(await screen.findByRole('link', { name: '9 créditos' })).toBeTruthy()
  await act(async () => { await creditOperation('token', operation, image) })
  expect(await screen.findByRole('link', { name: '7 créditos' })).toBeTruthy()
})
