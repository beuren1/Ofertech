import { expect, it, vi } from 'vitest'
import { createFlyer } from './flyers'
import { prepareVideo } from './videoCanvas'
import { videoFrame, videoRecordingFormat, videoSize, videoTimeline } from './videoTimeline'

it('uses default and individual durations and loops in the selected order', () => {
  const timeline = videoTimeline([{}, { duration: 2 }, { duration: 1 }], 5)
  expect(timeline).toEqual({ duration: 8000, ends: [5000, 7000, 8000] })
  expect(videoFrame(timeline, 1000)).toMatchObject({ index: 0, progress: 0 })
  expect(videoFrame(timeline, 4700)).toEqual({ index: 0, next: 1, progress: 0.5 })
  expect(videoFrame(timeline, 5000)).toMatchObject({ index: 1, progress: 0 })
  expect(videoFrame(timeline, 7900)).toMatchObject({ index: 2, next: 0 })
  expect(videoFrame(timeline, 8000)).toMatchObject({ index: 0 })
  expect(videoFrame(videoTimeline([{}], 2), 1800)?.progress).toBe(0)
})

it('selects MP4 only when H.264 is supported and falls back honestly', () => {
  expect(videoRecordingFormat(mime => mime.includes('avc1'))?.extension).toBe('mp4')
  expect(videoRecordingFormat(mime => mime.includes('vp8'))?.extension).toBe('webm')
  expect(videoRecordingFormat(() => false)).toBeNull()
  expect(videoSize('horizontal')).toEqual({ width: 1920, height: 1080 })
  expect(videoSize('vertical')).toEqual({ width: 1080, height: 1920 })
})

it.each(['horizontal', 'vertical'] as const)('draws the saved footer and offer on %s video frames', async orientation => {
  const canvas = document.createElement('canvas')
  const context = {
    save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn(),
    beginPath: vi.fn(), roundRect: vi.fn(), fill: vi.fn(), fillText: vi.fn(),
    measureText: (value: string) => ({ width: value.length * 20 }),
  }
  vi.spyOn(canvas, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  const { design } = createFlyer(false, true)
  design.video = { orientation, transition: 'fade', duration: 5, footerText: 'Consulte a loja' }
  const video = await prepareVideo(canvas, [{
    name: 'Café', price: '19,90', originalPrice: '', discount: '', category: '', imageUrl: '',
    offerLabel: 'SUPER OFERTA',
  }], design)
  video.render(0)
  const { width, height } = videoSize(orientation)
  expect(context.roundRect).toHaveBeenCalledWith(0, height - 68, width, 68, 0)
  expect(context.fillText).toHaveBeenCalledWith('Consulte a loja', width / 2, height - 24)
  expect(context.fillText).toHaveBeenCalledWith('SUPER OFERTA', expect.any(Number), expect.any(Number))
})
