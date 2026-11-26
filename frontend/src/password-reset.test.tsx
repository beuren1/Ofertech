import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import App from './App'

function response(status: number, payload: object) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('opens recovery from login and displays the same generic confirmation', async () => {
  const fetchMock = vi.fn(async (url: string) => url.endsWith('/auth/password-reset/')
    ? response(202, {})
    : response(401, { detail: 'Sessão não encontrada.' }))
  vi.stubGlobal('fetch', fetchMock)
  render(<MemoryRouter initialEntries={['/login']}><App /></MemoryRouter>)
  fireEvent.click(screen.getByRole('link', { name: 'Esqueci minha senha' }))
  fireEvent.change(await screen.findByLabelText('E-mail'), { target: { value: 'conta@example.test' } })
  fireEvent.click(screen.getByRole('button', { name: 'Enviar link' }))
  expect((await screen.findByRole('status')).textContent).toContain('Se houver uma conta')
  expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/auth\/password-reset\/$/), expect.objectContaining({
    method: 'POST', body: JSON.stringify({ email: 'conta@example.test' }),
  }))
})

it('validates matching passwords and redirects to login after a successful reset', async () => {
  const fetchMock = vi.fn(async (url: string) => url.endsWith('/auth/password-reset/confirm/')
    ? response(200, {})
    : response(401, { detail: 'Sessão não encontrada.' }))
  vi.stubGlobal('fetch', fetchMock)
  render(<MemoryRouter initialEntries={['/reset-password#uid=dGVzdA&token=fixture']}><App /></MemoryRouter>)
  fireEvent.change(await screen.findByLabelText('Nova senha', { exact: true }), { target: { value: 'Senha-teste-123!' } })
  fireEvent.change(screen.getByLabelText('Confirme a nova senha'), { target: { value: 'Senha-teste-456!' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }))
  expect(screen.getByRole('alert').textContent).toContain('As senhas precisam ser iguais.')
  expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('password-reset/confirm/'), expect.anything())
  fireEvent.change(screen.getByLabelText('Confirme a nova senha'), { target: { value: 'Senha-teste-123!' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }))
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeTruthy())
  expect(screen.getByRole('status').textContent).toContain('Senha redefinida')
  expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/auth\/password-reset\/confirm\/$/), expect.objectContaining({
    body: JSON.stringify({ uid: 'dGVzdA', token: 'fixture', password: 'Senha-teste-123!' }),
  }))
})

it('offers a new link when the reset link is incomplete', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => response(401, {})))
  render(<MemoryRouter initialEntries={['/reset-password']}><App /></MemoryRouter>)
  expect((await screen.findByRole('alert')).textContent).toContain('link está incompleto')
  expect(screen.getByRole('link', { name: 'Solicitar um novo link' })).toBeTruthy()
})

it('shows the friendly error from the API for an expired token', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/auth/password-reset/confirm/')
    ? response(400, { detail: 'Este link é inválido, já foi usado ou expirou. Solicite um novo link.' })
    : response(401, {})))
  render(<MemoryRouter initialEntries={['/reset-password#uid=fixture&token=expired']}><App /></MemoryRouter>)
  fireEvent.change(await screen.findByLabelText('Nova senha', { exact: true }), { target: { value: 'Senha-teste-123!' } })
  fireEvent.change(screen.getByLabelText('Confirme a nova senha'), { target: { value: 'Senha-teste-123!' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }))
  expect((await screen.findByRole('alert')).textContent).toContain('expirou')
  expect(screen.getByRole('link', { name: 'Solicitar um novo link' })).toBeTruthy()
})
