import { Download, MoreHorizontal, Search } from 'lucide-react'
import { promotions } from '../data'

export function HistoryPage() {
  return (
    <div className="mx-auto max-w-7xl">
      <h1 className="text-3xl font-black">Histórico</h1><p className="mt-2 text-slate-500">Todas as promoções geradas pela sua equipe.</p>
      <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex border-b border-slate-100 p-4 dark:border-slate-800"><div className="relative max-w-sm flex-1"><Search className="absolute left-3 top-2.5 text-slate-400" size={18} /><input placeholder="Buscar histórico" className="w-full rounded-lg border border-slate-200 bg-transparent py-2 pl-10 pr-3 dark:border-slate-700" /></div></div>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-500 dark:bg-slate-950/40"><tr><th className="px-5 py-3">Nome</th><th className="px-5 py-3">Canal</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Criado em</th><th className="px-5 py-3"></th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{promotions.map(p => <tr key={p.id}><td className="px-5 py-4 font-semibold">{p.name}</td><td className="px-5 py-4 text-slate-500">{p.channel}</td><td className="px-5 py-4"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{p.status}</span></td><td className="px-5 py-4 text-slate-500">{p.createdAt}</td><td className="px-5 py-4"><button className="rounded-lg p-2 hover:bg-slate-100" title="Opções"><MoreHorizontal size={18} /></button></td></tr>)}</tbody></table></div>
      </div>
    </div>
  )
}
