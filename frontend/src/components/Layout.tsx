import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, WandSparkles, Library, History, CreditCard, Settings,
  Moon, Sun, Menu, X, Sparkles, LogOut, Store, Newspaper, Printer, Video, Coins
} from 'lucide-react'
import { apiRequest, useAuth } from '../auth'
import { CREDIT_BALANCE_CHANGED, type Billing } from '../billing'
import { BrandLink } from './Brand'

export const editorLinks = [
  { to: '/generator', label: 'Criar promoção', icon: WandSparkles },
  { to: '/bulk', label: 'Criação em massa', icon: Sparkles },
  { to: '/flyers', label: 'Criar Encarte', icon: Newspaper },
  { to: '/print', label: 'Criar Cartaz', icon: Printer },
  { to: '/videos', label: 'Criar Vídeo', icon: Video },
]

const nav = [
  { to: '/dashboard', label: 'Visão geral', icon: LayoutDashboard },
  ...editorLinks,
  { to: '/store', label: 'Minha loja', icon: Store },
  { to: '/templates', label: 'Templates', icon: Library },
  { to: '/history', label: 'Histórico', icon: History },
]

const creditNumber = new Intl.NumberFormat('pt-BR')
const CreditsContext = createContext<number | undefined>(undefined)

export function useDashboardCredits() {
  return useContext(CreditsContext)
}

export function DashboardLayout({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark')
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { user, accessToken, logout, error } = useAuth()
  const userId = user?.id
  const [balance, setBalance] = useState<{ userId: number; credits: number }>()
  const credits = balance?.userId === userId ? balance?.credits : undefined

  useEffect(() => {
    if (!accessToken || userId === undefined) return
    let requestId = 0
    const refresh = () => {
      const current = ++requestId
      void apiRequest<Pick<Billing, 'credits'>>('billing/', { accessToken }).then(account => {
        if (current === requestId) setBalance({ userId, credits: account.credits })
      }).catch(() => {
        if (current === requestId) setBalance(undefined)
      })
    }
    window.addEventListener(CREDIT_BALANCE_CHANGED, refresh)
    refresh()
    return () => {
      requestId++
      window.removeEventListener(CREDIT_BALANCE_CHANGED, refresh)
    }
  }, [accessToken, userId])

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }
  const displayName = user?.name || user?.email || ''
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform dark:border-slate-800 dark:bg-slate-900 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-20 shrink-0 items-center justify-between px-6">
          <BrandLink />
          <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Fechar menu"><X /></button>
        </div>
        <nav aria-label="Menu principal" className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3">
          {(user ? nav : [...editorLinks, ...nav.filter(link => link.to === '/templates')]).map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} onClick={() => setOpen(false)} className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${isActive ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}`
            }>
              <Icon size={19} /> {label}
            </NavLink>
          ))}
          {user?.commercial_admin && <NavLink to="/admin-dashboard" onClick={() => setOpen(false)}
            className="block rounded-xl px-3 py-3 text-sm font-semibold text-indigo-700 dark:text-indigo-300">Administração comercial</NavLink>}
        </nav>
        <nav aria-label="Conta" className="shrink-0 border-t border-slate-200 p-3 dark:border-slate-800">
          <NavLink to="/plans" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"><CreditCard size={19} /> Planos</NavLink>
          {user && <NavLink to="/settings" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"><Settings size={19} /> Configurações</NavLink>}
        </nav>
      </aside>
      {open && <button aria-label="Fechar menu" className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90 sm:px-8">
          <button className="rounded-lg p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menu"><Menu /></button>
          <div className="ml-auto flex items-center gap-2">
            {user && <Link to="/plans" title="Ver planos"
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-200 dark:hover:bg-indigo-900">
              <Coins size={16} aria-hidden="true" />
              <span aria-live="polite">
                {credits === undefined ? <><span aria-hidden="true">—</span><span className="sr-only">Saldo de créditos indisponível</span></>
                  : <>{creditNumber.format(credits)} <span className="sr-only sm:not-sr-only">{credits === 1 ? 'crédito' : 'créditos'}</span></>}
              </span>
            </Link>}
            <button className="rounded-xl border border-slate-200 p-2.5 dark:border-slate-700" onClick={() => setDark(v => !v)} aria-label="Alternar tema">
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            {user ? <><button className="flex items-center gap-2 rounded-xl p-1.5 pr-3 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => navigate('/settings')}>
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-bold text-white">{initials}</span>
              <span className="hidden text-left sm:block"><b className="block text-sm">{displayName}</b>{user?.profile.plan_name && <small className="text-slate-500">Plano {user.profile.plan_name}</small>}</span>
            </button>
            <button title="Sair" onClick={() => void handleLogout()} className="rounded-lg p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white"><LogOut size={18} /></button></>
              : <Link to="/login" className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Entrar</Link>}
          </div>
        </header>
        {error && <p role="alert" className="px-4 pt-3 text-sm text-red-600 sm:px-8">{error}</p>}
        <main className="p-4 sm:p-8"><CreditsContext.Provider value={credits}>{children}</CreditsContext.Provider></main>
      </div>
    </div>
  )
}
