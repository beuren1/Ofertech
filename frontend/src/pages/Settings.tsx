import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'

export function SettingsPage() {
  const [saved, setSaved] = useState(false)
  const { user } = useAuth()
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-3xl font-black">Configurações</h1><p className="mt-2 text-slate-500">Gerencie sua conta e preferências.</p>
      <form className="mt-8 space-y-6" onSubmit={e => { e.preventDefault(); setSaved(true) }}>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"><h2 className="font-bold">Perfil</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Nome<input readOnly value={user?.name || ''} className="mt-2 w-full rounded-xl border border-slate-200 bg-transparent px-3 py-3 dark:border-slate-700" /></label><label className="text-sm font-semibold">E-mail<input readOnly type="email" value={user?.email || ''} className="mt-2 w-full rounded-xl border border-slate-200 bg-transparent px-3 py-3 dark:border-slate-700" /></label></div></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"><h2 className="font-bold">Preferências</h2><div className="mt-5 space-y-4"><label className="flex items-center justify-between text-sm"><span><b className="block">Notificações por e-mail</b><small className="text-slate-500">Receba resumos semanais da sua produção.</small></span><input type="checkbox" defaultChecked className="h-5 w-5 accent-indigo-600" /></label><label className="flex items-center justify-between text-sm"><span><b className="block">Marcas favoritas</b><small className="text-slate-500">Sugestões personalizadas nos templates.</small></span><input type="checkbox" defaultChecked className="h-5 w-5 accent-indigo-600" /></label></div></section>
        <div className="flex items-center gap-3"><button className="rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white">Salvar alterações</button>{saved && <span className="text-sm font-semibold text-emerald-600">Alterações salvas!</span>}</div>
      </form>
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-bold">Privacidade e dados</h2>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <Link to="/privacidade" className="font-semibold text-indigo-700 underline dark:text-indigo-300">Política de Privacidade</Link>
          <Link to="/excluir-conta" className="font-semibold text-indigo-700 underline dark:text-indigo-300">Solicitar exclusão de conta e dados</Link>
        </div>
      </section>
    </div>
  )
}
