import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Search } from 'lucide-react'
import { flyerCategories, flyerTemplateImage, flyerTemplates } from '../flyerTemplates'

function normalize(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR').trim()
}

export function TemplatesPage() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('Todos')
  const search = normalize(query)
  const results = flyerTemplates.filter(([, name, segment, , title]) =>
    (category === 'Todos' || segment === category) && normalize(`${name} ${segment} ${title}`).includes(search))

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header><h1 className="text-3xl font-black">Galeria de templates</h1><p className="mt-2 text-slate-500 dark:text-slate-400">Escolha um modelo para começar seu encarte.</p></header>
      <div className="space-y-4">
        <label className="relative block max-w-xl">
          <span className="sr-only">Buscar templates</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 text-slate-500" size={18} />
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar templates…" className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-3 dark:border-slate-700 dark:bg-slate-900" />
        </label>
        <div role="group" aria-label="Categoria dos templates" className="flex flex-wrap gap-2">
          {['Todos', ...flyerCategories].map(item => <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}
            className={`rounded-full border px-4 py-2 text-sm font-semibold ${category === item ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white hover:border-indigo-500 dark:border-slate-700 dark:bg-slate-900'}`}>{item}</button>)}
        </div>
      </div>
      <p role="status" className="text-sm text-slate-600 dark:text-slate-400">{results.length} {results.length === 1 ? 'modelo encontrado' : 'modelos encontrados'}</p>
      {results.length === 0 && <button type="button" className="font-semibold text-indigo-700 underline dark:text-indigo-300" onClick={() => { setQuery(''); setCategory('Todos') }}>Limpar filtros</button>}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {results.map(([id, name, segment, , title]) => (
          <article key={id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="relative grid aspect-[4/3] place-items-center overflow-hidden bg-slate-900 p-4 text-center text-white">
              <img src={flyerTemplateImage(id)} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
              <div className="relative max-w-[85%] rounded-xl bg-slate-950/80 px-4 py-3 text-2xl font-black leading-tight">{title}</div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div><h2 className="font-bold">{name}</h2><p className="text-sm text-slate-500 dark:text-slate-400">{segment}</p></div>
              <Link to={`/flyers?template=${id}`} aria-label={`Usar modelo ${name}`} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Usar modelo <ArrowRight aria-hidden="true" size={16} /></Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
