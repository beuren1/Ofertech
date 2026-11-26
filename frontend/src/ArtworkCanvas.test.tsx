import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ArtworkCanvas } from './components/ArtworkCanvas'
import { createArtworkConfig, type ArtworkConfig, type BulkProduct } from './bulk'

afterEach(cleanup)

function pointerEvent(type: string, pointerId: number, clientX: number, clientY: number) {
  const event = new MouseEvent(type, { bubbles: true, clientX, clientY })
  Object.defineProperty(event, 'pointerId', { value: pointerId })
  return event
}

describe('artwork canvas interaction', () => {
  const product: BulkProduct = {
    name: 'Fone de teste',
    price: '80,00',
    discount: '',
    imageUrl: '',
    category: 'Eletrônicos',
  }

  it('keeps moved and resized badges within the safe canvas area', () => {
    const config = createArtworkConfig(product, 0)
    const onConfigChange = vi.fn<(next: ArtworkConfig) => void>()
    const onDragStart = vi.fn()
    const onDragEnd = vi.fn()
    const originalGetContext = HTMLCanvasElement.prototype.getContext
    const originalSetCapture = HTMLCanvasElement.prototype.setPointerCapture
    const originalHasCapture = HTMLCanvasElement.prototype.hasPointerCapture
    const originalReleaseCapture = HTMLCanvasElement.prototype.releasePointerCapture
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: vi.fn(() => null),
    })
    Object.defineProperty(HTMLCanvasElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    })
    Object.defineProperty(HTMLCanvasElement.prototype, 'hasPointerCapture', {
      configurable: true,
      value: vi.fn(() => true),
    })
    Object.defineProperty(HTMLCanvasElement.prototype, 'releasePointerCapture', {
      configurable: true,
      value: vi.fn(),
    })

    try {
      render(
        <ArtworkCanvas
          product={product}
          config={config}
          selectedElement="badge"
          onSelectElement={vi.fn()}
          onConfigChange={onConfigChange}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        />,
      )
      const canvas = screen.getByLabelText('Editor visual da arte de Fone de teste')
      vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 1080,
        bottom: 1080,
        width: 1080,
        height: 1080,
        toJSON: () => ({}),
      })

      fireEvent(canvas, pointerEvent('pointerdown', 1, 900, 100))
      fireEvent(canvas, pointerEvent('pointermove', 1, 5000, 5000))
      fireEvent(canvas, pointerEvent('pointerup', 1, 5000, 5000))

      const moved = onConfigChange.mock.calls[onConfigChange.mock.calls.length - 1]?.[0].positions.badge
      expect(moved).toEqual({ x: 892, y: 892, width: 180, height: 180 })

      fireEvent(canvas, pointerEvent('pointerdown', 2, 1028, 220))
      fireEvent(canvas, pointerEvent('pointermove', 2, 5000, 5000))
      fireEvent(canvas, pointerEvent('pointerup', 2, 5000, 5000))

      const resized = onConfigChange.mock.calls[onConfigChange.mock.calls.length - 1]?.[0].positions.badge
      if (!resized) throw new Error('Resize did not emit an artwork configuration.')
      expect(resized.x + resized.width).toBeLessThanOrEqual(1072)
      expect(resized.y + resized.height).toBeLessThanOrEqual(1072)
      expect(resized.width).toBe(280)
      expect(resized.height).toBe(280)
      expect(onDragStart).toHaveBeenCalledTimes(2)
      expect(onDragEnd).toHaveBeenCalledTimes(2)
    } finally {
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: originalGetContext })
      Object.defineProperty(HTMLCanvasElement.prototype, 'setPointerCapture', { configurable: true, value: originalSetCapture })
      Object.defineProperty(HTMLCanvasElement.prototype, 'hasPointerCapture', { configurable: true, value: originalHasCapture })
      Object.defineProperty(HTMLCanvasElement.prototype, 'releasePointerCapture', { configurable: true, value: originalReleaseCapture })
    }
  })
})
