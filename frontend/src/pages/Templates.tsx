import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import { flyerCategories, flyerTemplateImage, flyerTemplates } from '../flyerTemplates'
import { galleryModels, modelTypes } from '../galleryModels'

const segments = Array.from(new Set([...flyerCategories, ...galleryModels.map(model => model.segment)]))

const bannerExamples = [
  { file: 'techmax.png', title: 'Promoção imperdível', store: 'TechMax', segment: 'Eletrônicos', width: 1122, height: 1402 },
  { file: 'farmavida.png', title: 'Cuidados em oferta', store: 'Farmavida', segment: 'Farmácia', width: 941, height: 1672 },
  { file: 'gamezone.png', title: 'Setup gamer em oferta', store: 'GameZone', segment: 'Eletrônicos', width: 1536, height: 1024 },
  { file: 'bella-moda.png', title: 'Liquidação Fashion', store: 'Bella Moda', segment: 'Moda', width: 1672, height: 941 },
  { file: 'supermais.png', title: 'Ofertas da semana', store: 'SuperMais', segment: 'Supermercado', width: 1254, height: 1254 },
]

const flyerExamples = [
  { file: '01_encarte_supermercado.png', title: 'Ofertas de supermercado', segment: 'Supermercado', width: 1086, height: 1448 },
  { file: '02_encarte_gamer.png', title: 'Ofertas gamer', segment: 'Eletrônicos', width: 1086, height: 1448 },
  { file: '03_encarte_moda.png', title: 'Ofertas de moda', segment: 'Moda', width: 1086, height: 1448 },
  { file: '04_encarte_farmacia.png', title: 'Ofertas de farmácia', segment: 'Farmácia', width: 1086, height: 1448 },
  { file: '05_encarte_eletronicos.png', title: 'Ofertas de eletrônicos', segment: 'Eletrônicos', width: 1055, height: 1491 },
]

const bulkExamples = [
  ['01_supermercado_criacao_em_massa.png', 'Ofertas de supermercado em lote', 'Supermercado'],
  ['02_gamer_criacao_em_massa.png', 'Ofertas gamer em lote', 'Eletrônicos'],
  ['03_moda_criacao_em_massa.png', 'Ofertas de moda em lote', 'Moda'],
  ['04_eletronicos_criacao_em_massa.png', 'Ofertas de eletrônicos em lote', 'Eletrônicos'],
  ['05_farmacia_criacao_em_massa.png', 'Ofertas de farmácia em lote', 'Farmácia'],
].map(([file, title, segment]) => ({ file, title, segment, store: '', width: 1536, height: 1024 }))

const posterExamples = [
  { file: '01_cartaz_supermercado.png', title: 'Cartaz de supermercado', segment: 'Supermercado', width: 1024, height: 1536 },
  { file: '02_cartaz_farmacia.png', title: 'Cartaz de farmácia', segment: 'Farmácia', width: 1086, height: 1448 },
  { file: '03_cartaz_eletronicos.png', title: 'Cartaz de eletrônicos', segment: 'Eletrônicos', width: 1024, height: 1536 },
  { file: '04_cartaz_moda.png', title: 'Cartaz de moda', segment: 'Moda', width: 1024, height: 1536 },
  { file: '05_cartaz_gamer.png', title: 'Cartaz gamer', segment: 'Eletrônicos', width: 1024, height: 1536 },
]

const exampleGroups = [
  { path: '/generator', folder: 'banner-examples', label: 'Exemplos de banners', kind: 'banner', images: bannerExamples },
  { path: '/bulk', folder: 'bulk-examples', label: 'Exemplos de criação em massa', kind: 'arte em lote', images: bulkExamples },
  { path: '/flyers', folder: 'flyer-examples', label: 'Exemplos de encartes', kind: 'encarte', images: flyerExamples.map(example => ({ ...example, store: '' })) },
  { path: '/print', folder: 'poster-examples', label: 'Exemplos de cartazes', kind: 'cartaz', images: posterExamples.map(example => ({ ...example, store: '' })) },
]

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
  const examples = exampleGroups.filter(group => format === 'Todos' || format === group.path).map(group => ({
    ...group,
    images: group.images.filter(({ title, store, segment }) => (category === 'Todos' || category === segment)
      && normalize(`${title} ${store} ${segment}`).includes(search)),
  })).filter(group => group.images.length)
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
          {['Todos', ...segments].map(item => <button key={item} type="button" aria-pressed={category === item}
            onClick={() => setCategory(item)} className={filterClass(category === item)}>{item === 'Todos' ? 'Todos os segmentos' : item}</button>)}
        </div>
      </div>
      <p role="status" className="text-sm text-slate-600 dark:text-slate-400">{total} {total === 1 ? 'modelo encontrado' : 'modelos encontrados'}</p>
      {total === 0 && examples.length === 0 && <button type="button" className="font-semibold text-indigo-700 underline dark:text-indigo-300"
        onClick={() => { setQuery(''); setCategory('Todos'); setFormat('Todos') }}>Limpar filtros</button>}
      {examples.map(({ path, folder, label, kind, images }) => <section key={folder} aria-labelledby={folder} className="space-y-4">
        <h2 id={folder} className="text-xl font-bold">{label}</h2>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {images.map(({ file, title, store, segment, width, height }) => {
            const source = `${import.meta.env.BASE_URL}${folder}/${file}`
            const description = `${kind}${store ? ` da ${store}` : ''}: ${title}`
            const preset = galleryModels.find(model => model.path === path && model.segment === segment)?.id
              ?? (path === '/flyers' ? flyerTemplates.find(([, , category]) => category === segment)?.[0] : undefined)
            const editorUrl = preset ? `${path}?template=${preset}` : path
            return <article key={file} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <a href={source} target="_blank" rel="noopener" aria-label={`Ampliar ${description}`}
                className="block focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-600">
                <img src={source} alt={description} width={width} height={height} loading="lazy" decoding="async"
                  className="h-72 w-full bg-slate-100 object-contain dark:bg-slate-950 sm:h-80" />
              </a>
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div>
                  <h3 className="font-bold">{title}</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{store || segment}</p>
                </div>
                <Link to={editorUrl} aria-label={`Abrir editor para ${description}`}
                  className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                  Abrir editor
                </Link>
              </div>
            </article>
          })}
        </div>
      </section>)}
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
