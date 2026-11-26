import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './auth'
import { DashboardLayout } from './components/Layout'
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
      if (url.endsWith('/flyers/?kind=all')) return jsonResponse({ results: [{ id: 21, name: 'Vídeo da loja', kind: 'video', updated_at: '2026-11-25T12:00:00Z' }] })
      if (url.endsWith('/billing/')) return jsonResponse({ credits: 7 })
      if (url.endsWith('/campaigns/12/') && init?.method === 'PATCH') {
        campaignName = String(JSON.parse(String(init.body)).name)
        return jsonResponse({ id: 12, name: campaignName })
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('localStorage', { getItem: vi.fn(), setItem: vi.fn() })

    render(
      <MemoryRouter>
        <AuthProvider>
          <DashboardLayout><DashboardPage /></DashboardLayout>
        </AuthProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: /Pessoa Autenticada/ })).toBeTruthy()
    await waitFor(() => expect(screen.getByRole('link', { name: /Créditos restantes/ }).textContent).toContain('7'))
    expect(within(screen.getByRole('navigation', { name: 'Atalhos dos geradores' })).getAllByRole('link')).toHaveLength(5)
    const saved = within(screen.getByRole('region', { name: 'Minhas campanhas' }))
    expect(await saved.findByText('Campanha de teste')).toBeTruthy()
    const recent = within(screen.getByRole('region', { name: 'Projetos recentes' }))
    expect((await recent.findByRole('link', { name: 'Continuar editando Vídeo da loja' })).getAttribute('href')).toBe('/videos?project_id=21')
    expect(recent.getByRole('link', { name: 'Continuar editando Campanha de teste' }).getAttribute('href')).toBe('/bulk?campaign_id=12&batch_id=test-batch')
    expect(screen.getByText(/1 artes · criada/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Renomear/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Novo nome para Campanha de teste' }), {
      target: { value: 'Campanha renomeada' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nome' }))
    expect(await saved.findByText('Campanha renomeada')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Ordenar campanhas'), { target: { value: 'created_at' } })
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes('campaigns/?ordering=-created_at'))).toBe(true)
    })
  })
})
