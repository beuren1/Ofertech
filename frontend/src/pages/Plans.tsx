import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest, getErrorMessage, useAuth } from '../auth'
import { creditCost, type Billing, type Plan } from '../billing'
import { BrandLink } from '../components/Brand'
import { Check } from 'lucide-react'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const number = new Intl.NumberFormat('pt-BR')
const panel = 'rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900'
const button = 'rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-50'
const subscriptionLabels: Record<string, string> = {
  submitting: 'Criação em confirmação',
  pending_payment: 'Aguardando checkout',
  authorized: 'Cobrança recorrente autorizada',
  paused: 'Assinatura pausada',
  cancelled: 'Assinatura cancelada',
  failed: 'Falha ao criar a assinatura',
}
const paymentLabels: Record<string, string> = {
  approved: 'Pagamento aprovado',
  rejected: 'Pagamento recusado',
  cancelled: 'Pagamento cancelado',
  canceled: 'Pagamento cancelado',
  refunded: 'Pagamento estornado',
  refund_review: 'Estorno em análise',
  charged_back: 'Pagamento contestado',
}

const checkoutStatusId = 'test-checkout-status'
const checkoutBlockerMessages: Record<string, string> = {
  mode_disabled: 'O checkout de teste está desligado no servidor. Em homologação, configure MP_MODE=test.',
  access_token_missing: 'O token de acesso do Mercado Pago de teste está ausente no servidor.',
  webhook_secret_missing: 'A chave de assinatura do webhook de teste está ausente no servidor.',
  test_seller_invalid: 'O identificador da conta vendedora de teste está ausente ou não é numérico.',
  test_buyer_invalid: 'O endereço da conta compradora de teste está ausente ou usa um domínio diferente de testuser.com.',
  return_url_invalid: 'O endereço de retorno do checkout de teste deve ser uma URL HTTPS válida, sem credenciais.',
  buyer_mismatch: 'A conta atual não corresponde à conta compradora configurada para testes. Saia e entre com a conta compradora de teste da Ofertech.',
}
const basicBenefits = [
  'Banners, encartes, cartazes, etiquetas, stories, cardápios, vídeos e TV de Ofertas',
  'Remoção de fundo',
  'Templates básicos, PNG e vídeo conforme o navegador',
]
const paidBenefits = [
  'Banners, encartes, cartazes, etiquetas, stories, cardápios, vídeos e TV de Ofertas',
  'Templates básicos e Oferta Profissional',
  'Remoção de fundo',
  'PNG, JPG e PDF. MP4 quando o navegador é compatível',
  'Geração e exportação em massa',
]

const creditUnits = {
  banner: 'banner', flyer: 'página de encarte', poster: 'página de cartaz',
  labels: 'folha de etiquetas', video: 'vídeo exportado', cutout: 'recorte',
  story: 'story', menu: 'página de cardápio',
} as const

export function PlansPage() {
  const { accessToken, syncPlan } = useAuth()
  const [plans, setPlans] = useState<Plan[]>([])
  const [billing, setBilling] = useState<Billing | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const subscriptionOpen = Boolean(billing?.subscription_status && ['submitting', 'pending_payment', 'authorized', 'paused'].includes(billing.subscription_status))
  const resumablePlan = billing && ['submitting', 'pending_payment'].includes(billing.subscription_status ?? '')
    ? billing.subscription_plan
    : null
  const checkoutAvailable = Boolean(accessToken && billing?.checkout_available)
  const checkoutReasons = accessToken ? billing?.checkout_blockers?.flatMap(code => checkoutBlockerMessages[code] ? [checkoutBlockerMessages[code]] : []) ?? [] : []
  const checkoutStatus = !accessToken
    ? 'Entre com a conta compradora de teste para contratar.'
    : billing
      ? 'Checkout de teste indisponível para esta conta. As assinaturas comerciais ainda não foram abertas.'
      : 'A contratação depende da confirmação da disponibilidade do checkout de teste.'

  useEffect(() => {
    let active = true
    void Promise.allSettled([
      apiRequest<Plan[]>('plans/'),
      accessToken ? apiRequest<Billing>('billing/', { accessToken }) : Promise.resolve(null),
    ]).then(([catalog, account]) => {
      if (active) {
        if (catalog.status === 'fulfilled') setPlans(catalog.value)
        if (account.status === 'fulfilled') {
          setBilling(account.value)
          if (account.value && accessToken) syncPlan?.(account.value.plan, accessToken)
        }
        const failure = [catalog, account].find(result => result.status === 'rejected')
        setError(failure?.status === 'rejected' ? getErrorMessage(failure.reason) : '')
      }
    })
    return () => { active = false }
  }, [accessToken, syncPlan])

  async function update(plan?: string) {
    if (!accessToken || busy) return
    if (plan && plan !== 'free' && !checkoutAvailable) return
    setBusy(true)
    setError('')
    try {
      if (plan) {
        const result = await apiRequest<{ checkout_url?: string }>('billing/change/', { method: 'POST', body: { plan }, accessToken })
        if (result.checkout_url) {
          window.location.assign(result.checkout_url)
          return
        }
      }
      const account = await apiRequest<Billing>('billing/', { accessToken })
      setBilling(account)
      syncPlan?.(account.plan, accessToken)
    } catch (reason) {
      setError(getErrorMessage(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {!accessToken && <BrandLink />}
      <h1 className="text-3xl font-black">Planos e créditos</h1>
      {!accessToken && <p className="text-slate-600">Compare os planos da Ofertech e veja quantas artes você pode criar por mês.</p>}
      {error && <p role="alert" className="text-red-600">{error}</p>}
      {!plans.length && !error && <p role="status">Carregando planos…</p>}
      {billing && (
        <section className={panel}>
          <h2 className="text-xl font-bold">Plano atual · {billing.plan.name}</h2>
          <p>{number.format(billing.credits)} créditos disponíveis</p>
          <p>{number.format(billing.used)} créditos usados no ciclo atual · {number.format(billing.monthly_limit)} créditos na cota mensal</p>
          {billing.credits <= Math.ceil(billing.monthly_limit * 0.1) && (
            <p role="status" className="mt-2 font-semibold text-amber-700 dark:text-amber-400">
              {billing.credits ? 'Seus créditos estão acabando.' : 'Você atingiu o limite mensal de créditos.'}
            </p>
          )}
          {billing.subscription_status && (
            <div className="mt-3 space-y-1">
              <p>{plans.find(plan => plan.code === billing.subscription_plan)?.name} · {subscriptionLabels[billing.subscription_status]}</p>
              {billing.payment_status && <p>{paymentLabels[billing.payment_status] ?? 'Pagamento pendente'}</p>}
              {!billing.payment_status && billing.subscription_status === 'authorized' && <p>Aguardando confirmação do primeiro pagamento.</p>}
              {billing.payment_overdue && <p role="status" className="text-amber-700 dark:text-amber-400">Pagamento em atraso.</p>}
            </div>
          )}
          {billing.paid_until && <p>{billing.cancel_at_period_end ? 'Acesso pago até' : 'Ciclo pago até'} {new Date(billing.paid_until + 'T12:00:00').toLocaleDateString('pt-BR')}.</p>}
          {subscriptionOpen && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="rounded-xl border px-4 py-2 font-semibold" disabled={busy} onClick={() => void update()}>Atualizar situação</button>
              <button className="rounded-xl border px-4 py-2 font-semibold" disabled={busy} onClick={() => void update('free')}>
                {billing.subscription_status === 'authorized' || billing.subscription_status === 'paused' ? 'Cancelar assinatura' : 'Cancelar solicitação'}
              </button>
            </div>
          )}
        </section>
      )}
      {!checkoutAvailable && plans.some(plan => plan.code !== 'free') && (
        <div id={checkoutStatusId} role="status" className="space-y-1 text-sm text-slate-600 dark:text-slate-400">
          <p>{checkoutStatus}</p>
          {checkoutReasons.length > 0 && <ul className="list-disc space-y-1 pl-5">
            {checkoutReasons.map(reason => <li key={reason}>{reason}</li>)}
          </ul>}
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-3">
        {plans.map(plan => (
          <article key={plan.code} className={`flex flex-col ${panel} ${plan.code === 'pro' ? 'ring-2 ring-indigo-500' : ''}`}>
            {plan.code === 'pro' && <span className="mb-2 self-start rounded-full bg-indigo-100 px-3 py-1 text-sm font-semibold text-indigo-800">Mais popular</span>}
            <h2 className="text-xl font-bold">{plan.name}</h2>
            <p className="mt-4"><span className="text-3xl font-black">{currency.format(Number(plan.monthly_price))}</span>/mês</p>
            <p className="mt-2 font-semibold">{number.format(plan.monthly_credits)} créditos por mês</p>
            <ul className="my-4 flex-1 space-y-2 text-sm">
              {[
                ...(plan.code === 'free' ? basicBenefits : paidBenefits),
                plan.limits?.stores === 1 || plan.code === 'free' ? '1 identidade visual de loja' : `Até ${plan.limits?.stores ?? (plan.code === 'business' ? 10 : 3)} identidades visuais de lojas`,
                `Até ${number.format(Math.min(plan.limits?.batch ?? (plan.code === 'free' ? 5 : plan.code === 'pro' ? 50 : 100), 100))} banners por lote no editor`,
                ...(plan.code === 'business' ? ['Templates de banner personalizados e reutilizáveis', 'Organização de campanhas por loja'] : []),
              ].map(benefit => <li className="flex items-start gap-2" key={benefit}><Check size={16} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden />{benefit}</li>)}
            </ul>
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold">Consumo de créditos</summary>
              <ul className="mt-2 space-y-1">
                {(Object.keys(creditUnits) as (keyof typeof creditUnits)[]).map(kind => {
                  const cost = plan.costs?.[kind] ?? creditCost(kind, plan.code)
                  return <li key={kind}>{cost} {cost === 1 ? 'crédito' : 'créditos'} por {creditUnits[kind]}</li>
                })}
              </ul>
            </details>
            {plan.code !== 'free' && <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">Assinatura mensal com renovação automática. Cancele pelo painel antes da próxima cobrança.</p>}
            {plan.code !== 'free' && (!checkoutAvailable || !subscriptionOpen || resumablePlan === plan.code) && (
              <button
                className={`mt-5 ${button}`}
                disabled={busy || !checkoutAvailable}
                aria-describedby={checkoutAvailable ? undefined : checkoutStatusId}
                onClick={() => void update(plan.code)}
              >
                {resumablePlan === plan.code ? 'Continuar para o checkout' : `Assinar ${plan.name} em teste`}
              </button>
            )}
            {!accessToken && plan.code === 'free' && <Link className={`mt-5 inline-block ${button}`} to="/register">Criar conta</Link>}
            {billing?.plan.code === plan.code && <p className="mt-5 font-semibold text-indigo-600">Plano atual</p>}
          </article>
        ))}
      </div>
      <section className={panel} aria-labelledby="billing-faq">
        <h2 id="billing-faq" className="text-xl font-bold">Perguntas sobre planos e créditos</h2>
        <div className="mt-3 space-y-3 text-sm">
          <details><summary className="cursor-pointer font-semibold">Quando recebo os créditos do plano?</summary><p className="mt-2">No Grátis, a cota é renovada a cada mês. Nos planos pagos, a cota do novo ciclo é liberada quando o provedor confirma o pagamento. A cota mensal é renovada sem acumular o saldo anterior.</p></details>
          <details><summary className="cursor-pointer font-semibold">Quanto custa exportar?</summary><p className="mt-2">O custo varia por arte, folha ou página. Veja a tabela de cada plano. A reprodução pelo link da TV de Ofertas não é uma exportação de vídeo.</p></details>
          <details><summary className="cursor-pointer font-semibold">Como cancelar ou solicitar reembolso?</summary><p className="mt-2">Use Cancelar assinatura no painel. Veja o procedimento em <Link to="/cancelamentos" className="underline">Cancelamentos e reembolsos</Link>.</p></details>
        </div>
      </section>
      {billing && (
        <section className={panel}>
          <h2 className="text-xl font-bold">Histórico de créditos</h2>
          <ul className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
            {billing.history.map(item => (
              <li key={item.id} className="flex flex-wrap justify-between gap-2 py-3">
                <span>{new Date(item.created_at).toLocaleDateString('pt-BR')} · {({
                  renewal: 'Renovação mensal', adjustment: 'Ajuste administrativo', generation: 'Banners',
                  flyer: 'Exportação de encarte', poster: 'Exportação de cartaz', labels: 'Exportação de etiquetas',
                  video: 'Exportação de vídeo', cutout: 'Remoção de fundo', story: 'Exportação de story', menu: 'Exportação de cardápio',
                } as Record<string, string>)[item.kind] ?? 'Movimento de créditos'}</span>
                <span>{item.amount > 0 ? '+' : ''}{number.format(item.amount)} · saldo {number.format(item.balance)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

