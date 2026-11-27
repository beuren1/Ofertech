import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { apiRequest } from './auth'
import type { PixOrder } from './billing'
import { PixCheckoutPage } from './pages/PixCheckout'

const { syncPlan } = vi.hoisted(() => ({ syncPlan: vi.fn() }))
vi.mock('./auth', () => ({
  apiRequest: vi.fn(),
  getErrorMessage: String,
  useAuth: () => ({ accessToken: 'session', syncPlan }),
}))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const plan = { code: 'pro', name: 'Pro', monthly_price: '19.99', monthly_credits: 200 }
const waiting: PixOrder = {
  id: 'test-order', plan, status: 'waiting', amount: '19.99', currency: 'BRL', due_on: '2026-11-27',
  qr_expires_at: null, paid_until: null, can_cancel: true, open: true,
}

it('opens the hosted sandbox invoice in a separate tab while the order is pending', async () => {
  const invoice = 'https://sandbox.asaas.com/i/test-invoice'
  vi.mocked(apiRequest).mockImplementation(async path => path.endsWith('/qr/') ? { invoice_url: invoice } : waiting)
  render(<MemoryRouter initialEntries={['/plans/pix/pedido/test-order']}>
    <Routes><Route path="/plans/pix/pedido/:orderId" element={<PixCheckoutPage />} /></Routes>
  </MemoryRouter>)
  const link = await screen.findByRole('link', { name: 'Abrir fatura no Asaas Sandbox' })
  expect(link.getAttribute('href')).toBe(invoice)
  expect(link.getAttribute('target')).toBe('_blank')
  expect(link.getAttribute('rel')).toContain('noreferrer')
  expect(screen.getByText('Aguardando pagamento')).toBeTruthy()
  expect(syncPlan).not.toHaveBeenCalled()
})

it('shows the Pix QR and copy code, then updates after webhook confirmation', async () => {
  let current = waiting
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { clipboard: { writeText } }))
  vi.mocked(apiRequest).mockImplementation(async (path) => {
    if (path === 'billing/') return { plan }
    if (path.endsWith('/qr/')) return { encoded_image: 'YWJj', payload: 'pix-code', expires_at: '2026-11-27T23:59:00-03:00' }
    return current
  })
  vi.useFakeTimers()
  render(<MemoryRouter initialEntries={['/plans/pix/pedido/test-order']}>
    <Routes><Route path="/plans/pix/pedido/:orderId" element={<PixCheckoutPage />} /></Routes>
  </MemoryRouter>)
  await act(async () => {})
  expect(screen.getByText('Aguardando pagamento')).toBeTruthy()
  expect(screen.getByRole('img', { name: 'QR Code Pix da cobrança' }).getAttribute('src')).toBe('data:image/png;base64,YWJj')
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copiar código Pix' })) })
  expect(writeText).toHaveBeenCalledWith('pix-code')

  current = { ...waiting, status: 'approved', paid_until: '2026-12-27', can_cancel: false, open: false }
  await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
  expect(screen.getByText('Pagamento aprovado')).toBeTruthy()
  expect(screen.getByText(/plano ativado e créditos liberados/i)).toBeTruthy()
  expect(screen.queryByRole('img', { name: 'QR Code Pix da cobrança' })).toBeNull()
  expect(syncPlan).toHaveBeenCalledWith(plan, 'session')
})
