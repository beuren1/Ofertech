import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'

const backgrounds = [
  ['01_supermercado_verde', 'Supermercado verde'],
  ['02_supermercado_vermelho', 'Supermercado vermelho'],
  ['03_eletronicos_azul', 'Eletrônicos azul'],
  ['04_eletronicos_roxo', 'Eletrônicos roxo'],
  ['05_farmacia_verde', 'Farmácia verde'],
  ['06_farmacia_azul', 'Farmácia azul'],
  ['07_moda_rosa', 'Moda rosa'],
  ['08_moda_preto_dourado', 'Moda preto e dourado'],
  ['09_varejo_azul_laranja', 'Varejo azul e laranja'],
  ['10_promocao_relampago', 'Promoção relâmpago'],
] as const

const perPage = 2
const pageCount = Math.ceil(backgrounds.length / perPage)
const pages = Array.from({ length: pageCount }, (_, index) =>
  backgrounds.slice(index * perPage, (index + 1) * perPage))
const folder = `${import.meta.env.BASE_URL}flyer-backgrounds/`
const control = 'grid size-8 place-items-center rounded-lg border border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800'

export function FlyerBackgroundCarousel({ onSelect }: { onSelect: (url: string) => void }) {
  const [page, setPage] = useState(0)
  const [playing, setPlaying] = useState(() => !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)
  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => setPage(current => (current + 1) % pageCount), 8000)
    return () => window.clearInterval(timer)
  }, [playing])

  function move(step: number) {
    setPage(current => (current + step + pageCount) % pageCount)
  }

  return (
    <section aria-label="Fundos prontos" className="space-y-2 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Fundos prontos</h3>
        <div className="flex items-center gap-1">
          <button type="button" className={control} aria-label={playing ? 'Pausar carrossel' : 'Reproduzir carrossel'} onClick={() => setPlaying(current => !current)}>
            {playing ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button type="button" className={control} aria-label="Fundos anteriores" onClick={() => move(-1)}><ChevronLeft size={17} /></button>
          <button type="button" className={control} aria-label="Próximos fundos" onClick={() => move(1)}><ChevronRight size={17} /></button>
        </div>
      </div>
      <div className="overflow-hidden" aria-live={playing ? 'off' : 'polite'}>
        <div className="flex transition-transform duration-[1200ms] ease-in-out motion-reduce:transition-none"
          style={{ transform: `translateX(-${page * 100}%)` }}>
          {pages.map((items, index) => (
            <div key={items[0][0]} className="grid w-full shrink-0 grid-cols-2 gap-2" aria-hidden={index !== page}>
              {items.map(([name, label]) => (
                <button type="button" key={name} tabIndex={index === page ? 0 : -1}
                  className="min-w-0 overflow-hidden rounded-lg border border-slate-200 hover:border-indigo-500 focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:hover:border-indigo-400"
                  onClick={() => onSelect(`${folder}${name}.jpg`)}>
                  <img className="mx-auto h-24 w-full bg-slate-100 object-contain dark:bg-slate-800" src={`${folder}${name}-thumb.jpg`} alt="" />
                  <span className="block px-1.5 py-1 text-xs font-medium">{label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
