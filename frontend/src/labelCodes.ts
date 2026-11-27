import { create } from 'qrcode'

const odd = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
const parity = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']
const invert = (bits: string) => Array.from(bits, bit => bit === '0' ? '1' : '0').join('')

export function ean13Bits(value: string) {
  if (!/^\d{13}$/.test(value)) return null
  const digits = Array.from(value, Number)
  const sum = digits.slice(0, 12).reduce((total, digit, index) => total + digit * (index % 2 ? 3 : 1), 0)
  if ((10 - sum % 10) % 10 !== digits[12]) return null
  const left = digits.slice(1, 7).map((digit, index) => parity[digits[0]][index] === 'L'
    ? odd[digit] : Array.from(invert(odd[digit])).reverse().join('')).join('')
  return `101${left}01010${digits.slice(7).map(digit => invert(odd[digit])).join('')}101`
}

export function validLabelQr(value: string) {
  try {
    const url = new URL(value)
    return value.length <= 180 && ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
  } catch {
    return false
  }
}

export function drawLabelCodes(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, barcode?: string, qrUrl?: string) {
  const qr = qrUrl && validLabelQr(qrUrl) ? create(qrUrl, { errorCorrectionLevel: 'M' }).modules : undefined
  const bits = barcode && ean13Bits(barcode)
  if (qr) {
    const module = height / (qr.size + 8)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(x + width - height, y, height, height)
    ctx.fillStyle = '#000000'
    for (let row = 0; row < qr.size; row++) {
      for (let col = 0; col < qr.size; col++) {
        if (qr.get(row, col)) ctx.fillRect(x + width - height + (col + 4) * module, y + (row + 4) * module, module, module)
      }
    }
  }
  if (bits) {
    const area = width - (qr ? height + 1 : 0)
    const module = area / 113
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(x, y, area, height)
    ctx.fillStyle = '#000000'
    Array.from(bits).forEach((bit, index) => {
      if (bit === '1') ctx.fillRect(x + (index + 11) * module, y, module, height * 0.75)
    })
    ctx.font = `${height * 0.23}px monospace`
    ctx.textAlign = 'center'
    ctx.fillText(barcode!, x + area / 2, y + height * 0.95)
  }
}
