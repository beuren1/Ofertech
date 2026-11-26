import { useState } from 'react'
import { Search, SlidersHorizontal } from 'lucide-react'
import { templates } from '../data'

export function TemplatesPage() {
  const [query, setQuery] = useState('')
  const filtered = templates.filter(t => t.name.toLowerCase().includes(query.toLowerCase()) || t.category.toLowerCase().includes(query.toLowerCase()))

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h1 className="text-3xl font-black">Biblioteca de templates</h1><p className="mt-2 text-slate-500">Layouts profissionais prontos para personalizar.</p></div></div>
      <div className="mt-8 flex gap-3"><div className="relative flex-1"><Search className="absolute left-3 top-3 text-slate-400" size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar templates..." className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 dark:border-slate-800 dark:bg-slate-900" /></div><button className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 dark:border-slate-800"><SlidersHorizontal size={18} /><span className="hidden sm:block">Filtros</span></button></div>
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map(template => (
          <article key={template.id} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="grid aspect-[4/3] place-items-center p-8" style={{ background: `linear-gradient(135deg, ${template.colors[0]}, ${template.colors[1]})` }}><div className="text-center text-white"><span className="text-xs font-bold uppercase tracking-widest">Promoção</span><div className="mt-2 text-5xl font-black">-30%</div></div></div>
            <div className="flex items-center justify-between p-4"><div><h2 className="font-bold">{template.name}</h2><p className="mt-1 text-sm text-slate-500">{template.category}</p></div><button className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold group-hover:border-indigo-500 group-hover:text-indigo-600 dark:border-slate-700">Usar</button></div>
          </article>
        ))}
      </div>
    </div>
  )
}
