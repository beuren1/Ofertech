import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { apiBlobRequest, apiRequest, useAuth } from './auth'
import { CommercialDashboard } from './pages/CommercialDashboard'

vi.mock('./auth', () => ({
  apiRequest: vi.fn(), apiBlobRequest: vi.fn(), useAuth: vi.fn(), getErrorMessage: String,
}))

const usage = { registrations: 2, banners: 3, flyers: 1, posters: 0, labels: 0, video_projects: 1, video_exports: 1, poster_exports: 0, label_exports: 0 }
const period = { start: '2026-11-01', end: '2026-11-25' }
const overview = {
  period, totals: usage, total_users: 5, active_users: 2, credits_consumed: 3, plans: [],
  days: [{ ...usage, date: '2026-11-25', active_users: 2, credits_consumed: 3 }],
  months: [{ month: '2026-11', registrations: 2 }],
}
const page = <T,>(results: T[]) => ({ count: results.length, next: null, previous: null, results })

function mount(isAdmin: boolean) {
  vi.mocked(useAuth).mockReturnValue({
    accessToken: 'fixture-session', user: { commercial_admin: isAdmin },
  } as ReturnType<typeof useAuth>)
  return render(<MemoryRouter><CommercialDashboard /></MemoryRouter>)
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.resetAllMocks()
  vi.unstubAllGlobals()
})

it('keeps commercial requests out of the workspace of a regular customer', () => {
  mount(false)
  expect(screen.getByRole('alert').textContent).toContain('Acesso restrito')
  expect(apiRequest).not.toHaveBeenCalled()
})

it('renders usage and sends the selected period to the CSV endpoint', async () => {
  vi.mocked(apiRequest).mockResolvedValue(overview)
  vi.mocked(apiBlobRequest).mockResolvedValue(new Blob(['data,cadastros'], { type: 'text/csv' }))
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL() { return 'blob:fixture' }
    static revokeObjectURL() {}
  })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  mount(true)
  await screen.findByRole('heading', { name: 'Cadastros por dia' })
  expect(screen.getByRole('heading', { name: 'Créditos consumidos por dia' })).toBeTruthy()
  vi.mocked(apiRequest).mockResolvedValue({ ...overview, period: { ...period, start: '2026-11-05' } })
  fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-11-05' } })
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar período' }))
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('admin-dashboard/overview/?start=2026-11-05&end=2026-11-25', { accessToken: 'fixture-session' }))
  await screen.findByRole('heading', { name: 'Cadastros por dia' })
  fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }))
  await waitFor(() => expect(apiBlobRequest).toHaveBeenCalledWith('admin-dashboard/reports.csv?start=2026-11-05&end=2026-11-25', 'fixture-session'))
})

it('searches in the request body and submits a justified credit adjustment', async () => {
  const user = { id: 9, name: 'Cliente de teste', email: 'customer@example.test', plan: 'free', credits: 10, enabled: true, registered_at: '2026-11-01' }
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (path.startsWith('admin-dashboard/overview/')) return overview
    if (path === 'admin-dashboard/users/?page=1') return page([user])
    if (path === 'admin-dashboard/users/9/history/?page=1') return page([])
    if (path === 'admin-dashboard/users/9/adjust/' && options?.method === 'POST') return { balance: 15 }
    throw new Error('Unexpected request')
  })
  mount(true)
  fireEvent.click(screen.getByRole('button', { name: 'Usuários' }))
  fireEvent.change(screen.getByLabelText('Buscar por nome, e-mail ou ID'), { target: { value: user.email } })
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('admin-dashboard/users/?page=1', {
    accessToken: 'fixture-session', method: 'POST', body: { search: user.email },
  }))
  fireEvent.click(await screen.findByRole('button', { name: 'Ver histórico' }))
  fireEvent.change(screen.getByLabelText('Quantidade com sinal'), { target: { value: '5' } })
  fireEvent.change(screen.getByLabelText('Justificativa'), { target: { value: 'Correção de saldo' } })
  fireEvent.click(screen.getByRole('button', { name: 'Registrar ajuste' }))
  expect(await screen.findByText(/Novo saldo: 15 créditos/)).toBeTruthy()
  expect(apiRequest).toHaveBeenCalledWith('admin-dashboard/users/9/adjust/', expect.objectContaining({
    body: expect.objectContaining({ amount: 5, reason: 'Correção de saldo', operation: expect.any(String) }),
  }))
})
