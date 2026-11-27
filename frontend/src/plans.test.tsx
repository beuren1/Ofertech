import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { apiRequest } from './auth'
import { PlansPage } from './pages/Plans'

vi.mock('./auth', () => ({
  apiRequest: vi.fn(),
  getErrorMessage: String,
  useAuth: () => ({ accessToken: 'fixture-session' }),
}))

afterEach(() => {
  cleanup()
  vi.mocked(apiRequest).mockReset()
})

it('shows disabled paid plan buttons when the test checkout is unavailable', async () => {
  const free = { code: 'free', name: 'Grátis', monthly_price: '0.00', monthly_credits: 10 }
  vi.mocked(apiRequest)
    .mockResolvedValueOnce([
      free,
      { code: 'pro', name: 'Pro', monthly_price: '19.99', monthly_credits: 200 },
      { code: 'business', name: 'Business', monthly_price: '39.99', monthly_credits: 1000 },
    ])
    .mockResolvedValueOnce({
      plan: free, credits: 10, monthly_limit: 10, used: 0, history: [], checkout_available: false,
      checkout_blockers: ['buyer_mismatch'],
    })

  render(<MemoryRouter><PlansPage /></MemoryRouter>)

  const explanations = await screen.findAllByText(/a conta atual não corresponde à conta compradora/i)
  expect(explanations).toHaveLength(2)
  expect(screen.getByText('Mais popular').closest('article')?.textContent).toContain('Pro')
  expect(screen.getByText('Plano atual')).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Perguntas sobre planos e créditos' })).toBeTruthy()
  expect(screen.getAllByText(/página de cardápio/i)).toHaveLength(3)
  for (const name of ['Assinar Pro em teste', 'Assinar Business em teste']) {
    const button = screen.getByRole<HTMLButtonElement>('button', { name })
    expect(button.disabled).toBe(true)
    const explanation = document.getElementById(button.getAttribute('aria-describedby') ?? '')
    expect(explanation?.textContent).toMatch(/a conta atual não corresponde à conta compradora/i)
    fireEvent.click(button)
  }
  expect(apiRequest).not.toHaveBeenCalledWith('billing/change/', expect.anything())
})

it('links to one-off Pix checkout when the sandbox is enabled', async () => {
  const pro = { code: 'pro', name: 'Pro', monthly_price: '19.99', monthly_credits: 200 }
  vi.mocked(apiRequest).mockResolvedValueOnce([pro]).mockResolvedValueOnce({
    plan: pro, credits: 200, monthly_limit: 200, used: 0, history: [], pix_available: true, checkout_available: false,
  })
  render(<MemoryRouter><PlansPage /></MemoryRouter>)
  expect((await screen.findByRole('link', { name: 'Pagar com Pix' })).getAttribute('href')).toBe('/plans/pix/pro')
  expect(screen.getByText(/sem renovação automática/i)).toBeTruthy()
  expect(screen.queryByRole('button', { name: /assinar/i })).toBeNull()
})

it('shows Pix as unavailable without falling back to a subscription', async () => {
  const pro = { code: 'pro', name: 'Pro', monthly_price: '19.99', monthly_credits: 200 }
  vi.mocked(apiRequest).mockResolvedValueOnce([pro]).mockResolvedValueOnce({
    plan: pro, credits: 10, monthly_limit: 10, used: 0, history: [],
    pix_selected: true, pix_available: false, checkout_available: false,
  })
  render(<MemoryRouter><PlansPage /></MemoryRouter>)
  expect(await screen.findByText('Pagamento Pix indisponível no momento.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: /assinar/i })).toBeNull()
})
