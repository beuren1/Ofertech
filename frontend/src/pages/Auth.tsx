import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { getErrorMessage, useAuth } from '../auth'
import { BrandFooter, BrandLink, BRAND_DESCRIPTION, SLOGAN } from '../components/Brand'

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const [show, setShow] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const { login, register: createAccount, error: sessionError } = useAuth()
  const register = mode === 'register'

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setFormError(null)
    try {
      if (register) await createAccount(name, email, password)
      else await login(email, password)
      navigate('/dashboard', { replace: true })
    } catch (reason) {
      setFormError(getErrorMessage(reason))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid min-h-screen bg-slate-50 lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-slate-950 p-12 text-white lg:flex">
        <BrandLink className="self-start" />
        <div><p className="max-w-lg text-4xl font-bold leading-tight">{SLOGAN}</p><p className="mt-5 max-w-md text-slate-400">{BRAND_DESCRIPTION}</p></div>
        <BrandFooter className="border-t border-slate-800 pt-5 text-slate-400" />
      </div>
      <div className="flex items-center justify-center px-6 py-12">
        <form className="w-full max-w-md" onSubmit={submit}>
          <BrandLink className="mb-10 text-slate-900 lg:hidden" />
          <h1 className="text-3xl font-black">{register ? 'Crie sua conta' : 'Bem-vindo de volta'}</h1>
          <p className="mt-2 text-slate-500">{register ? 'Crie sua conta na Ofertech para preparar banners, encartes e cartazes para sua loja.' : 'Entre na Ofertech para retomar seus projetos e criar novas ofertas.'}</p>
          {!register && location.state?.passwordReset && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Senha redefinida. Entre com a sua nova senha.</p>}
          {register && <label className="mt-8 block text-sm font-semibold">Nome completo<input required maxLength={150} value={name} onChange={event => setName(event.target.value)} autoComplete="name" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-indigo-500" placeholder="Seu nome" /></label>}
          <label className={`${register ? 'mt-4' : 'mt-8'} block text-sm font-semibold`}>E-mail<input required type="email" maxLength={150} value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-indigo-500" placeholder="voce@empresa.com" /></label>
          <label className="mt-4 block text-sm font-semibold">Senha<div className="relative mt-2"><input required minLength={8} autoComplete={register ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} type={show ? 'text' : 'password'} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pr-12 outline-none focus:border-indigo-500" placeholder="Mínimo de 8 caracteres" /><button type="button" onClick={() => setShow(v => !v)} className="absolute right-3 top-3 text-slate-400" aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}>{show ? <EyeOff size={20} /> : <Eye size={20} />}</button></div></label>
          {!register && <Link to="/forgot-password" className="mt-3 inline-block text-sm font-semibold text-indigo-700">Esqueci minha senha</Link>}
          {(formError || sessionError) && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError || sessionError}</p>}
          <button disabled={submitting} className="mt-6 w-full rounded-xl bg-indigo-600 py-3.5 font-bold text-white shadow-lg shadow-indigo-100 disabled:cursor-wait disabled:opacity-70">{submitting ? 'Aguarde...' : register ? 'Criar conta grátis' : 'Entrar'}</button>
          <p className="mt-6 text-center text-sm text-slate-500">{register ? 'Já possui uma conta?' : 'Novo por aqui?'} <Link to={register ? '/login' : '/register'} className="font-bold text-indigo-600">{register ? 'Entrar' : 'Criar conta'}</Link></p>
          <BrandFooter className="mt-8 border-t border-slate-200 pt-4 text-slate-600 lg:hidden" />
        </form>
      </div>
    </div>
  )
}
