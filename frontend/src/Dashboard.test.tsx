import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './auth'
import { DashboardPage } from './pages/Dashboard'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  }
}

describe('saved campaigns dashboard', () => {
  it('loads real campaigns, renames them, and requests creation-date ordering', async () => {
    let campaignName = 'Campanha de teste'
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/auth/refresh/')) return jsonResponse({ access: 'dashboard-token' })
      if (url.endsWith('/auth/me/')) {
        return jsonResponse({
          id: 8,
          username: 'owner@example.com',
          email: 'owner@example.com',
          name: 'Pessoa Autenticada',
          profile: { company: '', phone: '', plan: 'starter', dark_mode: false },
        })
      }
      if (url.includes('/campaigns/?ordering=')) {
        return jsonResponse({
          count: 1,
          next: null,
          previous: null,
          results: [{
            id: 12,
            name: campaignName,
            batch_id: 'test-batch',
            artworks: [{
              index: 0,
              product: { name: 'Fone real' },
              config: { backgroundColor: '#112233' },
            }],
            thumbnail_url: null,
            created_at: '2026-11-23T12:00:00Z',
            updated_at: '2026-11-24T12:00:00Z',
          }],
        })
      }
      if (url.endsWith('/campaigns/12/') && init?.method === 'PATCH') {
        campaignName = String(JSON.parse(String(init.body)).name)
        return jsonResponse({ id: 12, name: campaignName })
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter>
        <AuthProvider>
          <DashboardPage />
        </AuthProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: /Pessoa Autenticada/ })).toBeTruthy()
    expect(await screen.findByText('Campanha de teste')).toBeTruthy()
    expect(screen.getByText(/1 artes · criada/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Renomear/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Novo nome para Campanha de teste' }), {
      target: { value: 'Campanha renomeada' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nome' }))
    expect(await screen.findByText('Campanha renomeada')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Ordenar campanhas'), { target: { value: 'created_at' } })
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes('campaigns/?ordering=-created_at'))).toBe(true)
    })
  })
})
