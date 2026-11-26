import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth'
import { AuthPage } from './pages/Auth'

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  }
}

describe('authentication form', () => {
  it('creates an account through the API and authenticates it', async () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }
    vi.stubGlobal('localStorage', storage)
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/auth/refresh/')) return jsonResponse({ detail: 'Sessão não encontrada.' }, 401)
      if (url.endsWith('/auth/register/')) {
        return jsonResponse({ id: 1, access: 'temporary-access-token' }, 201)
      }
      if (url.endsWith('/auth/me/')) {
        expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer temporary-access-token')
        return jsonResponse({
          id: 1,
          username: 'ana@example.com',
          email: 'ana@example.com',
          name: 'Ana Silva',
          profile: { company: '', phone: '', plan: 'starter', dark_mode: false },
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/register']}>
          <Routes>
            <Route path="/register" element={<AuthPage mode="register" />} />
            <Route path="/dashboard" element={<h1>Painel autenticado</h1>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    )

    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Ana Silva' } })
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@example.com' } })
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-forte-987' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta grátis' }))

    expect(await screen.findByText('Painel autenticado')).toBeTruthy()
    const registration = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/auth/register/'))
    expect(JSON.parse(String(registration?.[1]?.body))).toEqual({
      name: 'Ana Silva',
      email: 'ana@example.com',
      password: 'senha-forte-987',
    })
    expect(storage.setItem).not.toHaveBeenCalled()
  })
})
