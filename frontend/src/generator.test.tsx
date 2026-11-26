import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './auth'
import { renderArtworkBlob } from './bulk'
import { GeneratorPage } from './pages/Generator'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.mocked(renderArtworkBlob).mockReset()
})

vi.mock('./components/ArtworkCanvas', () => ({
  ArtworkCanvas: ({ config }: { config: { productName: string; salePrice: string; discount: string; template: string } }) => (
    <output data-testid="art-preview">
      {config.productName}|{config.salePrice}|{config.discount}|{config.template}
    </output>
  ),
}))

vi.mock('./bulk', async importOriginal => ({
  ...await importOriginal<typeof import('./bulk')>(),
  renderArtworkBlob: vi.fn(),
}))

function AuthenticatedGenerator() {
  const { accessToken } = useAuth()
  return accessToken ? <GeneratorPage /> : null
}

describe('promotion generator', () => {
  const renderGenerator = () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ detail: 'Sessão não encontrada.' }),
    })))
    return render(
      <AuthProvider>
        <GeneratorPage />
      </AuthProvider>,
    )
  }

  it('shows the campaign save action and default name', () => {
    renderGenerator()
    expect((screen.getByRole('textbox', { name: 'Nome da campanha' }) as HTMLInputElement).value).toBe('Nova campanha')
    expect(screen.getByRole('button', { name: 'Salvar campanha' })).toBeTruthy()
  })

  it('updates the live artwork from price and template controls', () => {
    renderGenerator()

    fireEvent.change(screen.getByLabelText('Preço original'), { target: { value: '399,90' } })
    fireEvent.change(screen.getByLabelText('Preço promocional'), { target: { value: '199,90' } })
    expect(screen.getByTestId('art-preview').textContent).toBe('Tênis de corrida|199,90|-50%|fashion')

    fireEvent.change(screen.getByLabelText('Template da arte'), { target: { value: 'beauty' } })
    expect(screen.getByTestId('art-preview').textContent).toBe('Tênis de corrida|199,90|-50%|beauty')
  })

  it('keeps a custom offer badge when prices change', () => {
    renderGenerator()

    fireEvent.change(screen.getByLabelText('Texto do selo / desconto'), { target: { value: 'BLACK FRIDAY' } })
    fireEvent.change(screen.getByLabelText('Preço promocional'), { target: { value: '149,90' } })
    expect(screen.getByTestId('art-preview').textContent).toBe('Tênis de corrida|149,90|BLACK FRIDAY|fashion')
  })

  it('shares encarte composition controls with basic banners', () => {
    renderGenerator()
    fireEvent.change(screen.getByLabelText('Nome da loja na arte'), { target: { value: 'Mercado Azul' } })
    fireEvent.click(screen.getByLabelText('Exibir faixa de categoria'))
    fireEvent.change(screen.getByLabelText('Categoria na faixa'), { target: { value: 'Informática' } })
    fireEvent.change(screen.getByLabelText('Escala da foto'), { target: { value: '160' } })
    fireEvent.change(screen.getByLabelText('Template da arte'), { target: { value: 'professional' } })
    expect(screen.getByLabelText<HTMLInputElement>('Nome da loja na arte').value).toBe('Mercado Azul')
    expect(screen.getByLabelText<HTMLInputElement>('Categoria na faixa').value).toBe('Informática')
    expect(screen.getByLabelText<HTMLInputElement>('Escala da foto').value).toBe('160')
  })
})

describe('artwork credits', () => {
  async function renderSignedIn(status = 200) {
    const billing = vi.fn(async (_body: RequestInit['body']) => ({
      ok: status === 200,
      status,
      json: async () => status === 200 ? { credits: 9 } : { detail: 'Créditos insuficientes.' },
    }))
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/billing/artworks/')) return billing(init?.body)
      return {
        ok: true,
        status: 200,
        json: async () => url.endsWith('/auth/refresh/') ? { access: 'token' } : {
          id: 1,
          name: 'Cliente',
          email: 'cliente@example.org',
          profile: { company: '', phone: '', plan: 'pro', dark_mode: false },
        },
      }
    }))
    render(<AuthProvider><AuthenticatedGenerator /></AuthProvider>)
    await screen.findByRole('button', { name: 'Baixar PNG' })
    return billing
  }

  it('blocks rendering when the API reports insufficient credits', async () => {
    const billing = await renderSignedIn(409)
    fireEvent.click(screen.getByRole('button', { name: 'Baixar PNG' }))
    await screen.findByText('Créditos insuficientes.')
    expect(billing).toHaveBeenCalledTimes(1)
    expect(renderArtworkBlob).not.toHaveBeenCalled()
  })

  it('does not confirm a failed render', async () => {
    vi.mocked(renderArtworkBlob).mockRejectedValue(new Error('Falha no canvas.'))
    const billing = await renderSignedIn()
    fireEvent.click(screen.getByRole('button', { name: 'Baixar PNG' }))
    await screen.findByText('Falha no canvas.')
    expect(billing).toHaveBeenCalledTimes(1)
  })

  it('confirms before downloading and reuses the credit for a second format', async () => {
    const blob = new Blob(['art'], { type: 'image/png' })
    vi.mocked(renderArtworkBlob).mockResolvedValue({ blob, imageError: null, usedProductImage: false })
    vi.stubGlobal('URL', Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:test'),
      revokeObjectURL: vi.fn(),
    }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const billing = await renderSignedIn()
    fireEvent.click(screen.getByRole('button', { name: 'Baixar PNG' }))
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1))
    const preflight = JSON.parse(billing.mock.calls[0][0] as string)
    const confirmation = billing.mock.calls[1][0] as FormData
    expect(confirmation.get('key')).toBe(preflight.key)
    expect(confirmation.getAll('file')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Baixar JPG' }))
    await waitFor(() => expect(click).toHaveBeenCalledTimes(2))
    expect(billing).toHaveBeenCalledTimes(3)
    expect(JSON.parse(billing.mock.calls[2][0] as string)).toMatchObject({ key: preflight.key, format: 'jpeg' })
  })
})
