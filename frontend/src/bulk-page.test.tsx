import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './auth'
import { changeArtworkTemplate, createArtworkConfig, type BulkProduct } from './bulk'
import { BulkPage } from './pages/Bulk'

vi.mock('./campaigns', async importOriginal => {
  const actual = await importOriginal<typeof import('./campaigns')>()
  return {
    ...actual,
    createCampaignThumbnail: vi.fn(async () => new File(['thumbnail'], 'thumbnail.jpg', { type: 'image/jpeg' })),
  }
})

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  }
}

describe('bulk page batch restoration', () => {
  it('restores a saved batch under React StrictMode', async () => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: vi.fn(() => null),
    })
    const product: BulkProduct = {
      name: 'Produto restaurado',
      price: '29,90',
      discount: '10% OFF',
      imageUrl: '',
      category: 'Casa',
    }
    const editor = createArtworkConfig(product, 0)
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/auth/refresh/')) return jsonResponse({ access: 'test-access-token' })
      if (url.endsWith('/auth/me/')) {
        return jsonResponse({
          id: 1,
          username: 'test@example.com',
          email: 'test@example.com',
          name: 'Test User',
          profile: { company: '', phone: '', plan: 'starter', dark_mode: false },
        })
      }
      if (url.includes('/promotions/bulk/?batch_id=strict-batch')) {
        return jsonResponse({
          created: 1,
          promotions: [{
            id: 42,
            title: product.name,
            configuration: {
              batch_id: 'strict-batch',
              product_index: 0,
              product_name: product.name,
              category: product.category,
              price: product.price,
              discount: product.discount,
              image_url: '',
              local_image_key: '',
              image_warning: '',
              editor,
            },
          }],
        })
      }
      if (url.includes('/campaigns/?batch_id=strict-batch')) {
        return jsonResponse({ count: 0, next: null, previous: null, results: [] })
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    try {
      render(
        <StrictMode>
          <MemoryRouter initialEntries={['/bulk?batch_id=strict-batch']}>
            <AuthProvider>
              <BulkPage />
            </AuthProvider>
          </MemoryRouter>
        </StrictMode>,
      )

      expect(await screen.findByRole('heading', { name: 'Galeria de artes (1)' })).toBeTruthy()
      expect((screen.getByLabelText('Quantidade') as HTMLSelectElement).value).toBe('1')
      expect((screen.getByLabelText('Nome do produto') as HTMLInputElement).value).toBe(product.name)
      await waitFor(() => {
        expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/promotions/bulk/?batch_id=strict-batch'))).toBe(true)
      })
    } finally {
      cleanup()
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        configurable: true,
        value: originalGetContext,
      })
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
      vi.unstubAllGlobals()
    }
  })

  it('restores a saved campaign with its name, product, prices, and visual configuration', async () => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: vi.fn(() => null),
    })
    const product: BulkProduct = {
      name: 'Liquidificador',
      price: '79,90',
      originalPrice: '129,90',
      discount: '38% OFF',
      imageUrl: '',
      category: 'Eletrodoméstico',
    }
    const config = {
      ...changeArtworkTemplate(product, createArtworkConfig(product, 0), 'professional', 0),
      height: 1350 as const,
      professional: { rays: false, glowStrength: 55 },
      backgroundColor: '#112233',
      callout: 'OFERTA DA SEMANA',
    }
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/auth/refresh/')) return jsonResponse({ access: 'test-access-token' })
      if (url.endsWith('/auth/me/')) {
        return jsonResponse({
          id: 1,
          username: 'test@example.com',
          email: 'test@example.com',
          name: 'Test User',
          profile: { company: '', phone: '', plan: 'starter', dark_mode: false },
        })
      }
      if (url.includes('/campaigns/73/')) {
        if (url.endsWith('/thumbnail-upload/')) return jsonResponse({ id: 73 })
        if (init?.method === 'PATCH') return jsonResponse({ id: 73, name: 'Campanha de verão editada' })
        return jsonResponse({
          id: 73,
          name: 'Campanha de verão',
          batch_id: 'campaign-batch',
          artworks: [{
            promotion_id: 501,
            index: 0,
            product: {
              name: product.name,
              category: product.category,
              price: product.price,
              original_price: product.originalPrice,
              discount: product.discount,
              image_url: '',
              image_name: '',
              source_image_url: '',
            },
            config,
            status: 'ready',
            error: null,
            image_warning: null,
          }],
          thumbnail_url: null,
          created_at: '2026-11-23T12:00:00Z',
          updated_at: '2026-11-24T12:00:00Z',
        })
      }
      if (url.endsWith('/promotions/bulk/') && init?.method === 'PATCH') {
        return jsonResponse({ created: 1, promotions: [] })
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    try {
      render(
        <StrictMode>
          <MemoryRouter initialEntries={['/bulk?campaign_id=73&batch_id=campaign-batch']}>
            <AuthProvider>
              <BulkPage />
            </AuthProvider>
          </MemoryRouter>
        </StrictMode>,
      )

      expect(await screen.findByRole('heading', { name: 'Galeria de artes (1)' })).toBeTruthy()
      expect((screen.getByRole('textbox', { name: 'Nome da campanha' }) as HTMLInputElement).value).toBe('Campanha de verão')
      expect((screen.getByLabelText('Nome do produto') as HTMLInputElement).value).toBe('Liquidificador')
      expect((screen.getByLabelText('Preço promocional') as HTMLInputElement).value).toBe('79,90')
      expect((screen.getByLabelText('Cor fundo') as HTMLInputElement).value).toBe('#112233')
      expect((screen.getByLabelText('Dimensões da arte') as HTMLSelectElement).value).toBe('1350')
      expect((screen.getByLabelText('Raios') as HTMLInputElement).checked).toBe(false)
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/campaigns/73/'))).toBe(true)
      fireEvent.change(screen.getByRole('textbox', { name: 'Nome da campanha' }), {
        target: { value: 'Campanha de verão editada' },
      })
      await waitFor(() => {
        const update = fetchMock.mock.calls.find(([input, init]) =>
          String(input).endsWith('/campaigns/73/') && init?.method === 'PATCH',
        )
        expect(update).toBeTruthy()
        const body = JSON.parse(String(update?.[1]?.body))
        expect(body.name).toBe('Campanha de verão editada')
        expect(body.artworks[0].config).toMatchObject({
          template: 'professional',
          height: 1350,
          callout: 'OFERTA DA SEMANA',
          professional: { rays: false, glowStrength: 55 },
        })
      }, { timeout: 3000 })
    } finally {
      cleanup()
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        configurable: true,
        value: originalGetContext,
      })
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
      vi.unstubAllGlobals()
    }
  })
})
