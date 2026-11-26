import { expect, it } from 'vitest'
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
