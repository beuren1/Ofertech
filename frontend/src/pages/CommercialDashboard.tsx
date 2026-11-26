import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { apiBlobRequest, apiRequest, getErrorMessage, useAuth } from '../auth'
import type { Plan } from '../billing'
import { BrandLink } from '../components/Brand'

type Period = { start: string; end: string }
type Usage = {
  registrations: number; banners: number; flyers: number; posters: number; labels: number;
  video_projects: number; video_exports: number; poster_exports: number; label_exports: number;
}
type Day = Usage & { date: string; active_users: number; credits_consumed: number }
type Overview = {
  period: Period; total_users: number; active_users: number; credits_consumed: number; totals: Usage;
  days: Day[]; months: { month: string; registrations: number }[];
  plans: (Plan & { users: number })[];
  billing: { confirmed_payments: number; confirmed_test_volume: string; commercial_revenue: null; applied_cycles: number; applied_renewals: number; cancelled_subscriptions: number };
}
type Page<T> = { count: number; next: string | null; previous: string | null; results: T[] }
type Customer = { id: number; name: string; email: string; registered_at: string; enabled: boolean; plan: string; credits: number }
type Movement = {
  id: number; date: string; kind: string; amount: number; balance: number;
  adjustment: { actor_id: number; reason: string; previous_balance: number } | null;
}
type Subscription = { id: number; user_id: number; plan: string; state: string; created_at: string; paid_until: string | null; cancel_at_period_end: boolean }
type Payment = { date: string; user_id: number; plan: string; amount: string; renewal_applied: boolean }

const number = new Intl.NumberFormat('pt-BR')
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const date = (value: string) => value.slice(0, 10).split('-').reverse().join('/')
const panel = 'min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6'
const button = 'rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-45'
const primary = 'rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-45'
const field = 'block min-w-0 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm'
const states: Record<string, string> = {
  submitting: 'Em envio', pending_payment: 'Pagamento pendente', authorized: 'Autorizada',
  paused: 'Pausada', cancelled: 'Cancelada', failed: 'Falhou',
}
const movementLabels: Record<string, string> = { renewal: 'Créditos do ciclo', generation: 'Geração de arte', adjustment: 'Ajuste administrativo' }

function queryPath(path: string, params: Record<string, string | number>) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value !== '') query.set(key, String(value))
  return query.size ? `${path}?${query}` : path
}

function useCommercial<T>(path: string, token: string, version = 0, search = '') {
  const [result, setResult] = useState<{ path: string; version: number; search: string; data: T | null; error: string } | null>(null)
  useEffect(() => {
    let active = true
    void apiRequest<T>(path, { accessToken: token, ...(search ? { method: 'POST', body: { search } } : {}) }).then(data => {
      if (active) setResult({ path, version, search, data, error: '' })
    }).catch(reason => {
      if (active) setResult({ path, version, search, data: null, error: getErrorMessage(reason) })
    })
    return () => { active = false }
  }, [path, token, version, search])
  return result?.path === path && result.version === version && result.search === search ? result : { data: null, error: '' }
}

function Alert({ children }: { children: ReactNode }) {
  return <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{children}</p>
}

function Table({ columns, children }: { columns: string[]; children: ReactNode }) {
  return <div className="overflow-x-auto">
    <table className="w-full min-w-[560px] border-collapse text-left text-sm">
      <thead className="bg-slate-50 text-slate-600"><tr>{columns.map(column => <th key={column} scope="col" className="px-3 py-3 font-semibold">{column}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100 [&_td]:px-3 [&_td]:py-3">{children}</tbody>
    </table>
  </div>
}

function Pagination({ page, data, onChange }: { page: number; data: Page<unknown>; onChange: (page: number) => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 pt-3 text-sm text-slate-600">
    <span>Página {page} · {number.format(data.count)} registros</span>
    <div className="flex gap-2">
      <button type="button" className={button} disabled={!data.previous} onClick={() => onChange(page - 1)}>Anterior</button>
      <button type="button" className={button} disabled={!data.next} onClick={() => onChange(page + 1)}>Próxima</button>
    </div>
  </div>
}

function SparkChart({ title, points, color }: { title: string; points: { label: string; value: number }[]; color: string }) {
  const max = Math.max(1, ...points.map(point => point.value))
  return <section className={panel}>
    <h2 className="font-bold">{title}</h2>
    <div className="mt-4 overflow-x-auto" tabIndex={0} aria-label={title}>
      <div className="flex h-36 items-end gap-1 border-b border-slate-200 pb-1" style={{ minWidth: Math.max(200, points.length * 7) }}>
        {points.map(point => <div key={point.label} title={`${point.label} · ${number.format(point.value)}`} aria-label={`${point.label}: ${point.value}`} role="img"
          className={`min-w-1 flex-1 rounded-t ${point.value ? color : 'bg-slate-200'}`}
          style={{ height: `${point.value ? Math.max(5, point.value / max * 100) : 2}%` }} />)}
      </div>
    </div>
    <div className="mt-2 flex justify-between text-xs text-slate-500"><span>{points[0]?.label}</span><span>{points[points.length - 1]?.label}</span></div>
  </section>
}

function OverviewContent({ data }: { data: Overview }) {
  const tiles: [string, number][] = [
    ['Usuários cadastrados', data.total_users], ['Novos cadastros no período', data.totals.registrations],
    ['Usuários ativos no período', data.active_users], ['Banners gerados', data.totals.banners],
    ['Créditos consumidos', data.credits_consumed], ['Vídeos exportados', data.totals.video_exports],
    ['Encartes salvos', data.totals.flyers], ['Cartazes salvos', data.totals.posters],
    ['Projetos de etiquetas', data.totals.labels], ['Projetos de vídeo', data.totals.video_projects],
    ['Cartazes exportados', data.totals.poster_exports], ['Etiquetas exportadas', data.totals.label_exports],
  ]
  return <div className="space-y-5">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {tiles.map(([label, value]) => <div key={label} className={panel}><p className="text-sm text-slate-600">{label}</p><p className="mt-2 text-2xl font-black tabular-nums">{number.format(value)}</p></div>)}
    </div>
    <div className="grid gap-4 md:grid-cols-2">
      <SparkChart title="Cadastros por dia" color="bg-indigo-600" points={data.days.map(day => ({ label: date(day.date), value: day.registrations }))} />
      <SparkChart title="Cadastros por mês" color="bg-indigo-500" points={data.months.map(month => ({ label: month.month.split('-').reverse().join('/'), value: month.registrations }))} />
      <SparkChart title="Créditos consumidos por dia" color="bg-emerald-600" points={data.days.map(day => ({ label: date(day.date), value: day.credits_consumed }))} />
      <SparkChart title="Vídeos exportados por dia" color="bg-violet-600" points={data.days.map(day => ({ label: date(day.date), value: day.video_exports }))} />
    </div>
    <section className={panel}>
      <h2 className="mb-3 font-bold">Distribuição por plano</h2>
      <Table columns={['Plano', 'Usuários', 'Créditos por mês', 'Mensalidade']}>
        {data.plans.map(plan => <tr key={plan.code}><td>{plan.name}</td><td>{number.format(plan.users)}</td><td>{number.format(plan.monthly_credits)}</td><td>{currency.format(Number(plan.monthly_price))}</td></tr>)}
      </Table>
    </section>
    <p className="text-sm text-slate-600">Usuários ativos são contas que abriram uma sessão no período. Banners e créditos vêm dos débitos de geração. Os projetos vêm dos registros salvos. As exportações são informadas pelo navegador a partir desta versão.</p>
  </div>
}

function AdjustmentForm({ token, user, onSuccess }: { token: string; user: Customer; onSuccess: () => void }) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const operation = useRef<{ signature: string; id: string } | null>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const delta = Number(amount)
    if (!Number.isInteger(delta) || !delta || reason.trim().length < 5) {
      setError('Informe um ajuste inteiro diferente de zero e uma justificativa com pelo menos 5 caracteres.')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const signature = JSON.stringify([delta, reason.trim()])
      if (operation.current?.signature !== signature) operation.current = { signature, id: crypto.randomUUID() }
      const response = await apiRequest<{ balance: number }>(`admin-dashboard/users/${user.id}/adjust/`, {
        method: 'POST', accessToken: token, body: { amount: delta, reason: reason.trim(), operation: operation.current.id },
      })
      operation.current = null
      setAmount('')
      setReason('')
      setNotice(`Ajuste registrado. Novo saldo: ${response.balance} créditos.`)
      onSuccess()
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }
  return <form onSubmit={event => void submit(event)} className="mt-5 space-y-3 border-t border-slate-100 pt-5">
    <h3 className="font-bold">Ajustar créditos</h3>
    {error && <Alert>{error}</Alert>}
    {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
    <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
      <label className="space-y-1 text-sm font-medium"><span>Quantidade com sinal</span><input className={field} required type="number" step={1} placeholder="Ex.: 10 ou -5" value={amount} onChange={event => setAmount(event.target.value)} /></label>
      <label className="space-y-1 text-sm font-medium"><span>Justificativa</span><input className={field} required minLength={5} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label>
    </div>
    <button type="submit" disabled={busy} className={primary}>{busy ? 'Registrando…' : 'Registrar ajuste'}</button>
  </form>
}

function CustomerHistory({ token, user, version, onChange }: { token: string; user: Customer; version: number; onChange: () => void }) {
  const [page, setPage] = useState(1)
  const { data, error } = useCommercial<Page<Movement>>(queryPath(`admin-dashboard/users/${user.id}/history/`, { page }), token, version)
  return <section className={panel}>
    <h2 className="font-bold">Histórico de créditos · {user.name || user.email || `#${user.id}`}</h2>
    {error && <Alert>{error}</Alert>}
    {data ? <>
      <Table columns={['Data', 'Operação', 'Variação', 'Saldo', 'Auditoria']}>
        {data.results.map(item => <tr key={item.id}>
          <td>{date(item.date)}</td><td>{movementLabels[item.kind] ?? item.kind}</td><td>{item.amount > 0 ? '+' : ''}{item.amount}</td><td>{item.balance}</td>
          <td className="max-w-sm whitespace-normal break-words">{item.adjustment ? <>
            <span>{item.adjustment.reason}</span><span className="block text-xs text-slate-500">Administrador #{item.adjustment.actor_id} · saldo anterior {item.adjustment.previous_balance}</span>
          </> : '—'}</td>
        </tr>)}
        {!data.results.length && <tr><td colSpan={5}>Nenhuma movimentação registrada.</td></tr>}
      </Table>
      <Pagination page={page} data={data} onChange={setPage} />
    </> : !error && <p role="status">Carregando histórico…</p>}
    <AdjustmentForm token={token} user={user} onSuccess={() => { setPage(1); onChange() }} />
  </section>
}

function Customers({ token }: { token: string }) {
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Customer | null>(null)
  const [version, setVersion] = useState(0)
  const { data, error } = useCommercial<Page<Customer>>(queryPath('admin-dashboard/users/', { page }), token, version, search)
  return <div className="space-y-5">
    <section className={panel}>
      <h2 className="font-bold">Usuários cadastrados</h2>
      <form className="my-4 flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); setPage(1); setSearch(draft.trim()) }}>
        <label className="w-full max-w-sm space-y-1 text-sm font-medium"><span>Buscar por nome, e-mail ou ID</span><input className={field} maxLength={150} value={draft} onChange={event => setDraft(event.target.value)} /></label>
        <button type="submit" className={primary}>Buscar</button>
      </form>
      {error && <Alert>{error}</Alert>}
      {data ? <>
        <Table columns={['Usuário', 'Plano', 'Saldo', 'Cadastro', 'Créditos']}>
          {data.results.map(user => <tr key={user.id}>
            <td><strong className="block">{user.name || `Usuário #${user.id}`}</strong><span className="block text-slate-600">{user.email}{!user.enabled && ' · Conta desativada'}</span></td>
            <td className="capitalize">{user.plan === 'free' ? 'Grátis' : user.plan}</td><td>{number.format(user.credits)}</td><td>{date(user.registered_at)}</td>
            <td><button type="button" className={button} onClick={() => setSelected(user)}>Ver histórico</button></td>
          </tr>)}
          {!data.results.length && <tr><td colSpan={5}>Nenhum usuário encontrado.</td></tr>}
        </Table>
        <Pagination page={page} data={data} onChange={setPage} />
      </> : !error && <p role="status">Carregando usuários…</p>}
    </section>
    {selected && <CustomerHistory key={selected.id} token={token} user={selected} version={version} onChange={() => setVersion(value => value + 1)} />}
  </div>
}

function Subscriptions({ token, period, billing }: { token: string; period: Period; billing?: Overview['billing'] }) {
  const [state, setState] = useState('')
  const [page, setPage] = useState(1)
  const [paymentPage, setPaymentPage] = useState(1)
  const changes = useCommercial<Page<Subscription>>(queryPath('admin-dashboard/subscriptions/', { page, state }), token)
  const payments = useCommercial<Page<Payment>>(queryPath('admin-dashboard/payments/', { ...period, page: paymentPage }), token)
  return <div className="space-y-5">
    {billing && <section className={panel}>
      <h2 className="font-bold">Pagamentos e ciclos</h2>
      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm lg:grid-cols-4">
        <div><dt>Volume confirmado em teste</dt><dd className="text-xl font-black">{currency.format(Number(billing.confirmed_test_volume))}</dd></div>
        <div><dt>Faturamento comercial</dt><dd className="font-semibold">Indisponível no ambiente de teste</dd></div>
        <div><dt>Renovações no período</dt><dd className="text-xl font-black">{billing.applied_renewals}</dd></div>
        <div><dt>Assinaturas canceladas</dt><dd className="text-xl font-black">{billing.cancelled_subscriptions}</dd></div>
      </dl>
      <p className="mt-3 text-sm text-slate-600">{billing.confirmed_payments} pagamentos e {billing.applied_cycles} ciclos aplicados no período. Cancelamentos mostram o estado atual das assinaturas.</p>
    </section>}
    <section className={panel}>
      <h2 className="font-bold">Assinaturas pagas</h2>
      <label className="my-4 block max-w-xs space-y-1 text-sm font-medium"><span>Estado da assinatura</span>
        <select className={field} value={state} onChange={event => { setPage(1); setState(event.target.value) }}>
          <option value="">Todos os estados</option>{Object.entries(states).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
      {changes.error && <Alert>{changes.error}</Alert>}
      {changes.data ? <>
        <Table columns={['Usuário', 'Plano', 'Estado', 'Desde', 'Pago até']}>
          {changes.data.results.map(item => <tr key={item.id}><td>#{item.user_id}</td><td>{item.plan}</td>
            <td>{states[item.state] ?? item.state}{item.cancel_at_period_end && ' · Término no fim do ciclo'}</td>
            <td>{date(item.created_at)}</td><td>{item.paid_until ? date(item.paid_until) : '—'}</td></tr>)}
          {!changes.data.results.length && <tr><td colSpan={5}>Nenhuma assinatura encontrada.</td></tr>}
        </Table>
        <Pagination page={page} data={changes.data} onChange={setPage} />
      </> : !changes.error && <p role="status">Carregando assinaturas…</p>}
    </section>
    <section className={panel}>
      <h2 className="mb-3 font-bold">Pagamentos confirmados no período</h2>
      {payments.error && <Alert>{payments.error}</Alert>}
      {payments.data ? <>
        <Table columns={['Data', 'Usuário', 'Plano', 'Valor em teste', 'Ciclo']}>
          {payments.data.results.map((item, index) => <tr key={`${item.user_id}-${item.date}-${index}`}><td>{date(item.date)}</td><td>#{item.user_id}</td><td>{item.plan}</td><td>{currency.format(Number(item.amount))}</td><td>{item.renewal_applied ? 'Aplicado' : 'Aguardando aplicação'}</td></tr>)}
          {!payments.data.results.length && <tr><td colSpan={5}>Nenhum pagamento confirmado no período.</td></tr>}
        </Table>
        <Pagination page={paymentPage} data={payments.data} onChange={setPaymentPage} />
      </> : !payments.error && <p role="status">Carregando pagamentos…</p>}
    </section>
  </div>
}

function CommercialWorkspace({ token }: { token: string }) {
  const [tab, setTab] = useState<'overview' | 'users' | 'subscriptions'>('overview')
  const [period, setPeriod] = useState<Period>({ start: '', end: '' })
  const [draft, setDraft] = useState<Period>({ start: '', end: '' })
  const [exportError, setExportError] = useState('')
  const [exporting, setExporting] = useState(false)
  const { data, error } = useCommercial<Overview>(queryPath('admin-dashboard/overview/', period), token)
  async function exportCsv() {
    if (exporting) return
    setExporting(true)
    setExportError('')
    try {
      const blob = await apiBlobRequest(queryPath('admin-dashboard/reports.csv', data?.period ?? period), token)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'ofertech-relatorio.csv'
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (failure) {
      setExportError(getErrorMessage(failure))
    } finally {
      setExporting(false)
    }
  }
  return <div className="space-y-5">
    <div className="flex flex-wrap gap-2" aria-label="Seções administrativas">
      {([['overview', 'Visão geral'], ['users', 'Usuários'], ['subscriptions', 'Assinaturas']] as const).map(([key, label]) =>
        <button type="button" key={key} aria-pressed={tab === key} className={tab === key ? primary : button} onClick={() => setTab(key)}>{label}</button>)}
    </div>
    {tab !== 'users' && <section className={panel}>
      <form className="flex flex-wrap items-end gap-3" onSubmit={event => {
        event.preventDefault()
        setPeriod({ start: draft.start || data?.period.start || '', end: draft.end || data?.period.end || '' })
      }}>
        <label className="space-y-1 text-sm font-medium"><span>De</span><input className={field} type="date" value={draft.start || data?.period.start || ''} onChange={event => setDraft(current => ({ ...current, start: event.target.value }))} /></label>
        <label className="space-y-1 text-sm font-medium"><span>Até</span><input className={field} type="date" value={draft.end || data?.period.end || ''} onChange={event => setDraft(current => ({ ...current, end: event.target.value }))} /></label>
        <button type="submit" className={primary}>Aplicar período</button>
        <button type="button" className={button} disabled={!data || exporting} onClick={() => void exportCsv()}>Exportar CSV</button>
      </form>
      {exportError && <Alert>{exportError}</Alert>}
    </section>}
    {tab !== 'users' && error && <Alert>{error}</Alert>}
    {tab === 'overview' && (data ? <OverviewContent data={data} /> : !error && <p role="status">Carregando indicadores…</p>)}
    {tab === 'users' && <Customers token={token} />}
    {tab === 'subscriptions' && <Subscriptions key={`${period.start}-${period.end}`} token={token} period={period} billing={data?.billing} />}
  </div>
}

export function CommercialDashboard() {
  const { user, accessToken } = useAuth()
  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-8">
        <BrandLink /><Link to="/dashboard" className="text-sm font-semibold text-indigo-700">Painel do cliente</Link>
      </div>
    </header>
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-8 sm:py-8">
      <h1 className="text-3xl font-black tracking-tight">Administração comercial</h1>
      {user?.commercial_admin && accessToken ? <CommercialWorkspace token={accessToken} /> : <Alert>Acesso restrito a administradores autorizados.</Alert>}
    </main>
  </div>
}
