import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import { flyerCategories, flyerTemplateImage, flyerTemplates } from '../flyerTemplates'
import { galleryModels, modelTypes } from '../galleryModels'

const groups = [
  ...modelTypes.map(([path, label]) => ({ label, path, models: galleryModels.filter(model => model.path === path).map(model => ({
    ...model, title: model.name,
  })) })),
  { label: 'Mais modelos de encarte', path: '/flyers', models: flyerTemplates.map(([id, name, segment, , title]) => ({
    id, name, segment, title, background: id, products: [],
  })) },
]

function normalize(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR').trim()
}

function filterClass(active: boolean) {
  return `rounded-full border px-4 py-2 text-sm font-semibold ${active ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white hover:border-indigo-500 dark:border-slate-700 dark:bg-slate-900'}`
}

export function TemplatesPage() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('Todos')
  const [format, setFormat] = useState('Todos')
  const search = normalize(query)
  const results = groups.filter(group => format === 'Todos' || format === group.path).map(group => ({
    ...group,
    models: group.models.filter(({ name, title, segment, products }) =>
      (category === 'Todos' || category === segment)
      && normalize(`${name} ${segment} ${title} ${products.map(product => product.name).join(' ')}`).includes(search)),
  })).filter(group => group.models.length)
  const total = results.reduce((count, group) => count + group.models.length, 0)

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <header>
        <h1 className="text-3xl font-black">Modelos</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">Escolha um exemplo e personalize com os produtos da sua loja.</p>
      </header>
      <div className="space-y-4">
        <label className="relative block max-w-xl">
          <span className="sr-only">Buscar modelos</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 text-slate-500" size={18} />
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar modelos…" className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-3 dark:border-slate-700 dark:bg-slate-900" />
        </label>
        <div role="group" aria-label="Tipo de arte" className="flex flex-wrap gap-2">
          {[['Todos', 'Todos os formatos'], ...modelTypes].map(([path, label]) => <button key={path} type="button" aria-pressed={format === path}
            onClick={() => setFormat(path)} className={filterClass(format === path)}>{label}</button>)}
        </div>
        <div role="group" aria-label="Segmento da loja" className="flex flex-wrap gap-2">
          {['Todos', ...flyerCategories].map(item => <button key={item} type="button" aria-pressed={category === item}
            onClick={() => setCategory(item)} className={filterClass(category === item)}>{item === 'Todos' ? 'Todos os segmentos' : item}</button>)}
        </div>
      </div>
      <p role="status" className="text-sm text-slate-600 dark:text-slate-400">{total} {total === 1 ? 'modelo encontrado' : 'modelos encontrados'}</p>
      {total === 0 && <button type="button" className="font-semibold text-indigo-700 underline dark:text-indigo-300"
        onClick={() => { setQuery(''); setCategory('Todos'); setFormat('Todos') }}>Limpar filtros</button>}
      {results.map(({ path, label, models }) => (
        <section key={label} className="space-y-4">
          <h2 className="text-xl font-bold">{label}</h2>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {models.map(({ id, name, title, background, segment, products }) => (
              <Link key={id} to={`${path}?template=${id}`} aria-label={`Usar modelo ${name}`}
                className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm hover:border-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600 dark:border-slate-800 dark:bg-slate-900">
                <div className="relative isolate flex min-h-52 flex-col justify-end overflow-hidden bg-slate-950 p-5 text-white">
                  <img src={flyerTemplateImage(background)} alt="" loading="lazy" decoding="async"
                    className="absolute inset-0 -z-20 size-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-105" />
                  <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-r from-slate-950 via-slate-950/75 to-slate-950/20" />
                  <p className="text-sm font-medium text-white/90">{segment}</p>
                  <h3 className="mt-1 max-w-56 text-2xl font-black leading-tight">{title}</h3>
                  {products.length > 0 && <ul className="mt-4 grid max-w-60 gap-1 text-sm">
                    {products.slice(0, 2).map(product => <li key={product.name} className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-lg bg-white/15 px-2.5 py-1.5">
                      <span>{product.name}</span><strong>R$ {product.price}</strong>
                    </li>)}
                  </ul>}
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3">
                  {title !== name && <span className="text-sm font-semibold">{name}</span>}
                  <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">Usar modelo</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
