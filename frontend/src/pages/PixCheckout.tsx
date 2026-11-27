import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiRequest, getErrorMessage, useAuth } from '../auth'
import type { Billing, PixOrder, Plan } from '../billing'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const date = (value: string) => new Date(value + 'T12:00:00').toLocaleDateString('pt-BR')
const primary = 'rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-50'
const secondary = 'rounded-xl border border-slate-300 px-4 py-2 font-semibold dark:border-slate-600 disabled:opacity-50'
const labels: Record<PixOrder['status'], string> = {
  waiting: 'Aguardando pagamento',
  processing: 'Em processamento',
  approved: 'Pagamento aprovado',
  expired: 'Cobrança expirada',
  cancelled: 'Cobrança cancelada',
  rejected: 'Cobrança recusada',
  refunded: 'Pagamento estornado',
  refund_review: 'Estorno ou contestação em análise',
}

type PixCode = { encoded_image: string; payload: string; expires_at: string }

export function PixCheckoutPage() {
  const { accessToken, syncPlan } = useAuth()
  const { planCode, orderId } = useParams()
  const navigate = useNavigate()
  const key = useRef<string | null>(null)
  const sending = useRef(false)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [billing, setBilling] = useState<Billing | null>(null)
  const [order, setOrder] = useState<PixOrder | null>(null)
  const [pix, setPix] = useState<PixCode | null>(null)
  const [name, setName] = useState('')
  const [document, setDocument] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const current = order?.id === orderId ? order : null
  const path = `billing/pix/${orderId}/`

  useEffect(() => {
    if (!accessToken || !planCode) return
    let active = true
    key.current = null
    setError('')
    setPlan(null)
    void Promise.all([apiRequest<Plan[]>('plans/'), apiRequest<Billing>('billing/', { accessToken })])
      .then(([plans, account]) => {
        if (!active) return
        if (account.pix_order) {
          navigate(`/plans/pix/pedido/${account.pix_order.id}`, { replace: true })
          return
        }
        const selected = plans.find(item => item.code === planCode && item.code !== 'free')
        if (!selected || !account.pix_available || account.pix_legacy_paid) {
          setError('O checkout Pix está indisponível para este plano.')
          return
        }
        setPlan(selected)
        setBilling(account)
      })
      .catch(reason => { if (active) setError(getErrorMessage(reason)) })
    return () => { active = false }
  }, [accessToken, planCode, navigate])

  const terminal = current?.open === false
  useEffect(() => {
    if (!accessToken || !orderId || terminal) return
    let active = true
    let timer: ReturnType<typeof setTimeout>
    async function poll(token: string) {
      try {
        const result = await apiRequest<PixOrder>(path, { accessToken: token })
        if (active) setOrder(result)
      } catch (reason) {
        if (active) setError(getErrorMessage(reason))
      } finally {
        if (active) timer = setTimeout(() => void poll(token), 6000)
      }
    }
    void poll(accessToken)
    return () => { active = false; clearTimeout(timer) }
  }, [accessToken, orderId, path, terminal])

  const status = current?.status
  const canShowQr = status === 'waiting' && current?.open
  useEffect(() => {
    setPix(null)
    setCopied(false)
    if (!accessToken || !orderId || !canShowQr) return
    let active = true
    void apiRequest<PixCode>(path + 'qr/', { method: 'POST', accessToken })
      .then(result => { if (active) setPix(result) })
      .catch(reason => { if (active) setError(getErrorMessage(reason)) })
    return () => { active = false }
  }, [accessToken, orderId, path, canShowQr])

  useEffect(() => {
    if (!accessToken || status !== 'approved') return
    let active = true
    void apiRequest<Billing>('billing/', { accessToken })
      .then(account => { if (active) syncPlan?.(account.plan, accessToken) })
      .catch(reason => { if (active) setError(getErrorMessage(reason)) })
    return () => { active = false }
  }, [accessToken, status, syncPlan])

  async function create(event: FormEvent) {
    event.preventDefault()
    if (!accessToken || !plan || sending.current) return
    sending.current = true
    setBusy(true)
    setError('')
    try {
      key.current ??= crypto.randomUUID()
      const result = await apiRequest<PixOrder>('billing/pix/', {
        method: 'POST', accessToken,
        body: { plan: plan.code, key: key.current, ...(billing?.pix_customer_registered ? {} : { name, document }) },
      })
      setName('')
      setDocument('')
      setOrder(result)
      navigate(`/plans/pix/pedido/${result.id}`, { replace: true })
    } catch (reason) {
      setError(getErrorMessage(reason))
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  async function action(type: 'refresh' | 'cancel') {
    if (!accessToken || !orderId || sending.current) return
    sending.current = true
    setBusy(true)
    setError('')
    try {
      const result = await apiRequest<PixOrder>(path + type + '/', { method: 'POST', accessToken })
      setOrder(result)
      if (type === 'refresh' && result.status === 'waiting' && status === 'waiting' && !pix) {
        setPix(await apiRequest<PixCode>(path + 'qr/', { method: 'POST', accessToken }))
      }
    } catch (reason) {
      setError(getErrorMessage(reason))
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  async function copy() {
    if (!pix) return
    try {
      await navigator.clipboard.writeText(pix.payload)
      setCopied(true)
    } catch {
      setError('Selecione e copie o código Pix no campo abaixo.')
    }
  }

  const selected = current?.plan ?? plan
  return (
    <section className="mx-auto max-w-xl space-y-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-8">
      <Link to="/plans" className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">Voltar para planos</Link>
      <h1 className="text-3xl font-black">Pagamento Pix</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">Ambiente de testes. Use dados fictícios válidos e simule o pagamento no Asaas Sandbox.</p>
      {selected && <div>
        <h2 className="text-xl font-bold">{selected.name} · {currency.format(Number(current?.amount ?? selected.monthly_price))}</h2>
        <p>Pagamento avulso por 30 dias, sem renovação automática.</p>
      </div>}
      {error && <p role="alert" className="text-red-600">{error}</p>}
      {!current && !plan && !error && <p role="status">Carregando checkout…</p>}
      {!orderId && plan && billing && <form className="space-y-4" onSubmit={event => void create(event)}>
        {!billing.pix_customer_registered && <>
          <label className="block">Nome do pagador
            <input className="mt-1 block w-full rounded-lg border bg-transparent p-2" value={name} onChange={event => setName(event.target.value)} maxLength={100} required />
          </label>
          <label className="block">CPF ou CNPJ
            <input className="mt-1 block w-full rounded-lg border bg-transparent p-2" value={document} onChange={event => setDocument(event.target.value)} maxLength={18} required />
          </label>
        </>}
        <button className={primary} disabled={busy}>{busy ? 'Gerando cobrança…' : 'Gerar cobrança Pix'}</button>
      </form>}
      {current && <>
        <p role="status" className="font-bold">{labels[current.status]}</p>
        <p className="text-sm">Vencimento da cobrança em {date(current.due_on)}.</p>
        {current.status === 'approved' && current.paid_until && <p>Plano ativado e créditos liberados. O acesso pago termina em {date(current.paid_until)}.</p>}
        {current.status === 'processing' && <p>O Asaas ainda está confirmando a cobrança ou o recebimento.</p>}
        {canShowQr && pix && <div className="space-y-3">
          <p>Escaneie o código ou copie o Pix para pagar. No sandbox, use a confirmação simulada do Asaas.</p>
          <img className="mx-auto w-52 max-w-full rounded-lg bg-white p-2" src={`data:image/png;base64,${pix.encoded_image}`} alt="QR Code Pix da cobrança" />
          <p className="text-sm">QR Code válido até {new Date(pix.expires_at).toLocaleString('pt-BR')}.</p>
          <label className="block text-sm font-semibold">Pix Copia e Cola
            <input className="mt-1 w-full rounded-lg border bg-transparent p-2 font-mono" readOnly value={pix.payload} onFocus={event => event.target.select()} />
          </label>
          <button className={primary} onClick={() => void copy()}>{copied ? 'Código copiado' : 'Copiar código Pix'}</button>
        </div>}
        {current.open && <div className="flex flex-wrap gap-2">
          <button className={secondary} disabled={busy} onClick={() => void action('refresh')}>Consultar no Asaas</button>
          {current.can_cancel && <button className={secondary} disabled={busy} onClick={() => void action('cancel')}>Cancelar cobrança</button>}
        </div>}
      </>}
    </section>
  )
}
