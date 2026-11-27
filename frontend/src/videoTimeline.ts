export type VideoSettings = {
  orientation: 'horizontal' | 'vertical'
  transition: 'fade' | 'slide' | 'zoom'
  duration: number
  footerText?: string
  footerColor?: string
  footerTextColor?: string
  backgroundOpacity?: number
}

export const DEFAULT_VIDEO: VideoSettings = { orientation: 'horizontal', transition: 'fade', duration: 5 }
export const VIDEO_FPS = 30

export function videoSize(orientation: VideoSettings['orientation']) {
  return orientation === 'vertical' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 }
}

export function videoTimeline(products: { duration?: number }[], fallback: number) {
  let duration = 0
  const ends = products.map(product => {
    duration += (product.duration ?? fallback) * 1000
    return duration
  })
  return { duration, ends }
}

export function videoFrame(timeline: ReturnType<typeof videoTimeline>, elapsed: number) {
  const { duration, ends } = timeline
  if (!duration) return null
  const position = Math.max(0, elapsed) % duration
  const index = ends.findIndex(end => position < end)
  const slideDuration = ends[index] - (ends[index - 1] ?? 0)
  const transitionTime = Math.min(600, slideDuration / 3)
  const fraction = ends.length > 1 ? Math.max(0, 1 - (ends[index] - position) / transitionTime) : 0
  return { index, next: (index + 1) % ends.length, progress: fraction * fraction * (3 - 2 * fraction) }
}

export function videoRecordingFormat(
  supports: (mime: string) => boolean = mime => typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function' &&
    typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(mime),
) {
  for (const mimeType of ['video/mp4;codecs=avc1.420028', 'video/mp4;codecs=avc1.4d0028', 'video/mp4;codecs=avc1.640028']) {
    if (supports(mimeType)) return { mimeType, extension: 'mp4' } as const
  }
  for (const mimeType of ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm']) {
    if (supports(mimeType)) return { mimeType, extension: 'webm' } as const
  }
  return null
}
