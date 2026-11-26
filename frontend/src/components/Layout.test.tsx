import { act, cleanup, render, screen } from '@testing-library/react'
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
  vi.unstubAllGlobals()
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
