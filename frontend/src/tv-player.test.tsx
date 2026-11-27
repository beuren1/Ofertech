import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { prepareVideo } from './videoCanvas'
import { TvPlayerPage } from './pages/TvPlayer'
import { createFlyer } from './flyers'

vi.mock('./videoCanvas', () => ({ prepareVideo: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('retains the current frame offline, preloads updates and stops when the link is revoked', async () => {
  vi.useFakeTimers()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  const design = createFlyer(false, true).design
  const product = { name: 'Café', price: '15,00', originalPrice: '', discount: '', category: '', imageUrl: '' }
  const playlist = (revision: string, name: string) => ({ kind: 'tv', name: 'Vitrine', revision, design, products: [{ ...product, name }] })
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json(playlist('1', 'Café')))
    .mockRejectedValueOnce(new TypeError('offline'))
    .mockResolvedValueOnce(Response.json(playlist('2', 'Chá')))
    .mockResolvedValueOnce(Response.json({ detail: 'Link indisponível.' }, { status: 404 }))
  vi.stubGlobal('fetch', fetch)
  vi.mocked(prepareVideo).mockResolvedValue({ missing: 0, timeline: { duration: 5000, ends: [5000] }, render: vi.fn() })
  await act(async () => {
    render(<MemoryRouter initialEntries={['/tv/player/device']}><Routes>
      <Route path="/tv/player/:token" element={<TvPlayerPage />} />
    </Routes></MemoryRouter>)
  })
  expect(screen.getByLabelText('Playlist de ofertas em reprodução')).toBeTruthy()
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
  expect(screen.getByLabelText('Playlist de ofertas em reprodução')).toBeTruthy()
  expect(screen.getByRole('status').textContent).toContain('Conexão temporariamente indisponível')
  expect(fetch.mock.calls[1][0]).toContain('?revision=1')
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
  expect(prepareVideo).toHaveBeenLastCalledWith(expect.any(HTMLCanvasElement), [expect.objectContaining({ name: 'Chá' })], design)
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
  expect(screen.queryByLabelText('Playlist de ofertas em reprodução')).toBeNull()
  expect(screen.getByRole('status').textContent).toContain('revogado')
})
