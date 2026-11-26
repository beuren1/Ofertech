import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { apiRequest, getErrorMessage, useAuth } from '../auth'
import { BrandFooter, BrandLink } from '../components/Brand'

const input = 'mt-2 block w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-600'
const primary = 'w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white disabled:opacity-60'
const linkStyle = 'font-semibold text-indigo-700'

function RecoveryCard({ title, children }: { title: string; children: ReactNode }) {
  return <div className="grid min-h-screen place-items-center bg-slate-50 px-4 py-12 text-slate-900">
    <main className="w-full max-w-md space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <BrandLink />
      <h1 className="text-2xl font-black">{title}</h1>
      {children}
      <BrandFooter className="border-t border-slate-200 pt-4 text-slate-600" />
    </main>
  </div>
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await apiRequest('auth/password-reset/', { method: 'POST', body: { email: email.trim() } })
      setSent(true)
    } catch (reason) {
      setError(getErrorMessage(reason))
    } finally {
      setBusy(false)
    }
  }
  return <RecoveryCard title="Recuperar senha">
    {sent ? <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm leading-6 text-emerald-800">
      Se houver uma conta com esse e-mail, enviaremos um link para redefinir a senha. Confira também a caixa de spam.
    </p> : <form className="space-y-4" onSubmit={event => void submit(event)}>
      <p className="text-sm leading-6 text-slate-600">Informe o e-mail usado na sua conta da Ofertech.</p>
      <label className="block text-sm font-semibold">E-mail
        <input className={input} required maxLength={254} type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} />
      </label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={busy} className={primary}>{busy ? 'Enviando…' : 'Enviar link'}</button>
    </form>}
    <Link className={linkStyle} to="/login">Voltar para o login</Link>
  </RecoveryCard>
}

export function ResetPasswordPage() {
  const location = useLocation()
  const fragment = new URLSearchParams(location.hash.slice(1))
  const uid = fragment.get('uid')
  const token = fragment.get('token')
  const { clearSession } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!uid || !token) return
    if (password !== confirmation) {
      setError('As senhas precisam ser iguais.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await apiRequest('auth/password-reset/confirm/', { method: 'POST', body: { uid, token, password } })
      clearSession()
      navigate('/login', { replace: true, state: { passwordReset: true } })
    } catch (reason) {
      setError(getErrorMessage(reason))
    } finally {
      setBusy(false)
    }
  }
  return <RecoveryCard title="Criar nova senha">
    {uid && token ? <form className="space-y-4" onSubmit={event => void submit(event)}>
      <label className="block text-sm font-semibold">Nova senha
        <input className={input} required minLength={8} maxLength={128} type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} />
      </label>
      <label className="block text-sm font-semibold">Confirme a nova senha
        <input className={input} required minLength={8} maxLength={128} type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} />
      </label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={busy} className={primary}>{busy ? 'Salvando…' : 'Salvar nova senha'}</button>
    </form> : <p role="alert" className="text-sm text-red-700">Este link está incompleto. Solicite um novo link de recuperação.</p>}
    <Link className={linkStyle} to="/forgot-password" replace>Solicitar um novo link</Link>
  </RecoveryCard>
}
