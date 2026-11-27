import { apiRequest, canRetryApiRequest } from './auth'

export const CREDIT_BALANCE_CHANGED = 'ofertei:credit-balance-changed'

export type Plan = {
  code: string
  name: string
  monthly_price: string
  monthly_credits: number
  pix_available?: boolean
  pix_selected?: boolean
  limits?: { stores: number; batch: number; features: string[]; formats: string[] }
  costs?: Record<keyof typeof CREDIT_COSTS, number>
}

export type Billing = {
  plan: Plan
  credits: number
  monthly_limit: number
  used: number
  period: string
  checkout_available: boolean
  pix_available?: boolean
  pix_selected?: boolean
  pix_legacy_paid?: boolean
  pix_customer_registered?: boolean
  pix_order?: PixOrder | null
  checkout_blockers?: string[]
  subscription_plan: string | null
  subscription_status: string | null
  payment_status: string | null
  payment_overdue: boolean
  paid_until: string | null
  cancel_at_period_end: boolean
  history: { id: number; kind: string; amount: number; balance: number; created_at: string }[]
}

export type PixOrder = {
  id: string
  plan: Plan
  amount: string
  currency: 'BRL'
  status: 'waiting' | 'processing' | 'approved' | 'expired' | 'cancelled' | 'rejected' | 'refunded' | 'refund_review'
  due_on: string
  qr_expires_at: string | null
  paid_until: string | null
  can_cancel: boolean
  open: boolean
}

export function checkArtworkCredits(token: string, key: string, count: number, format = 'png', premium = false, bulk = false) {
  return apiRequest('billing/artworks/', { method: 'POST', body: { key, count, ...(format === 'png' ? {} : { format }), ...(premium ? { premium } : {}), ...(bulk ? { bulk } : {}) }, accessToken: token })
}


export async function confirmArtworks(token: string, key: string, artworks: Blob[], premium = false, bulk = false) {
  const body = new FormData()
  body.set('key', key)
  body.set('count', String(artworks.length))
  if (premium) body.set('premium', 'true')
  if (bulk) body.set('bulk', 'true')
  for (const artwork of artworks) {
    body.append('file', artwork, artwork.type === 'image/jpeg' ? 'artwork.jpg' : 'artwork.png')
  }
  const request = () => apiRequest('billing/artworks/', { method: 'POST', body, accessToken: token })
  try {
    await request()
  } catch (reason) {
    if (!canRetryApiRequest(reason)) throw reason
    await request()
  }
  window.dispatchEvent(new Event(CREDIT_BALANCE_CHANGED))
}

export const CREDIT_COSTS = { banner: 1, flyer: 2, poster: 1, labels: 1, video: 5, cutout: 1, story: 1, menu: 2 } as const
export function creditCost(kind: keyof typeof CREDIT_COSTS, plan?: string) {
  if (plan === 'free' && (kind === 'poster' || kind === 'labels' || kind === 'video')) return 2
  return CREDIT_COSTS[kind]
}
export type CreditOperation = { key: string; kind: Exclude<keyof typeof CREDIT_COSTS, 'banner'>; count: number; format: string; premium?: boolean }

export async function creditOperation(token: string, operation: CreditOperation, file?: Blob) {
  let body: CreditOperation | FormData = operation
  if (file) {
    const data = new FormData()
    Object.entries(operation).forEach(([key, value]) => data.set(key, String(value)))
    data.set('file', file, `arte.${operation.format}`)
    body = data
  }
  const request = () => apiRequest('billing/operations/', { method: 'POST', accessToken: token, body })
  const result = await request().catch(error => {
    if (!file || !canRetryApiRequest(error)) throw error
    return request()
  })
  if (file) window.dispatchEvent(new Event(CREDIT_BALANCE_CHANGED))
  return result
}
