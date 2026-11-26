import cvRuntime from '@techstark/opencv-js'
import { segmentProduct, type CutoutMark } from './productCutout'

const ready = Promise.resolve(cvRuntime)
self.onmessage = async (event: MessageEvent<{ pixels: ImageData; marks: CutoutMark[]; margin: number }>) => {
  try {
    const cv = await ready
    const { pixels, marks, margin } = event.data
    const result = segmentProduct(cv, pixels, margin, marks)
    self.postMessage({ result }, { transfer: [result.data.buffer] })
  } catch (reason) {
    self.postMessage({ error: reason instanceof Error ? reason.message : 'Não foi possível calcular o recorte. Revise as marcações.' })
  }
}
