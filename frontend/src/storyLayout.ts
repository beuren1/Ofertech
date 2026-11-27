export const STORY_WIDTH = 1080
export const STORY_HEIGHT = 1920
export const STORY_SAFE = { x: 48, y: 220, width: 984, height: 1420 }
export const STORY_CHANNELS = [
  ['whatsapp', 'WhatsApp Status'],
  ['instagram', 'Instagram Stories'],
  ['facebook', 'Facebook Stories'],
] as const
export type StoryChannel = typeof STORY_CHANNELS[number][0]
