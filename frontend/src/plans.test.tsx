import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
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
    })

  render(<PlansPage />)

  const explanation = await screen.findByText(/a configuração do Mercado Pago de teste ainda não foi concluída/i)
  expect(screen.getByText('Mais popular').closest('article')?.textContent).toContain('Pro')
  expect(screen.getByText('Plano atual')).toBeTruthy()
  expect(screen.getByText(/equipes e atendimento prioritário/i).closest('article')).toBeNull()
  for (const name of ['Assinar Pro em teste', 'Assinar Business em teste']) {
    const button = screen.getByRole<HTMLButtonElement>('button', { name })
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('aria-describedby')).toBe(explanation.id)
    fireEvent.click(button)
  }
  expect(apiRequest).not.toHaveBeenCalledWith('billing/change/', expect.anything())
})
