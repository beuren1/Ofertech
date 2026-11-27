import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, Layers, Newspaper, Pause, Play, Printer, Quote, Smartphone, Store, Tag, Tv, Utensils, Video, WandSparkles } from 'lucide-react'
import { BrandFooter, BrandLink, BRAND, SLOGAN } from '../components/Brand'

const promotions = [
  ['01_supermercado_alimentos', 'Promoção de alimentos de supermercado'],
  ['02_supermercado_limpeza', 'Promoção de produtos de limpeza'],
  ['03_farmacia_higiene', 'Promoção de produtos de higiene'],
  ['04_farmacia_bem_estar', 'Promoção de produtos de bem-estar'],
  ['05_gamer_eletronicos', 'Promoção de eletrônicos e produtos gamer'],
] as const

const features = [
  { to: '/generator', icon: WandSparkles, title: 'Banners promocionais', text: 'Crie artes para redes sociais com foto, preço e desconto. Remova o fundo da foto ou do logotipo no próprio editor.' },
  { to: '/bulk', icon: Layers, title: 'Criação em massa', text: 'Importe uma lista de produtos em CSV, gere uma arte para cada oferta e baixe o lote em ZIP.' },
  { to: '/flyers', icon: Newspaper, title: 'Encartes de ofertas', text: 'Organize produtos por categoria, escolha um dos 10 fundos prontos e arraste textos e imagens na prévia.' },
  { to: '/print', icon: Printer, title: 'Cartazes e etiquetas', text: 'Monte cartazes em A3, A4 ou A5 com fundo até as bordas. Ajuste as medidas e as cópias das etiquetas para impressão.' },
  { to: '/videos', icon: Video, title: 'Vídeos para TV da loja', text: 'Monte uma sequência animada de ofertas, ajuste a duração de cada produto e reproduza o vídeo em loop.' },
  { to: '/labels', icon: Tag, title: 'Etiquetas de preço', text: 'Personalize os tamanhos e monte folhas A4 com preços por unidade, quilo ou litro. Inclua EAN-13 e QR Code.' },
  { to: '/stories', icon: Smartphone, title: 'Stories promocionais', text: 'Crie artes verticais para Instagram, Facebook e WhatsApp. Importe um CSV para preparar várias ofertas de uma vez.' },
  { to: '/menus', icon: Utensils, title: 'Cardápios digitais e impressos', text: 'Organize pratos, bebidas e combos. Imprima em A4 ou publique um cardápio digital com link e QR Code.' },
  { to: '/tv', icon: Tv, title: 'TV de Ofertas', text: 'Monte uma playlist e crie um link para cada TV. Atualize as ofertas pelo painel enquanto as telas reproduzem em loop.' },
  { to: '/store', icon: Store, title: 'Identidade da sua loja', text: 'Use seu nome, logotipo e cores nas peças. Salve os projetos para voltar a editar quando precisar.' },
] as const

const comments = [
  { shop: 'Mercados', text: 'Monte o encarte da semana e reaproveite o projeto quando chegarem ofertas novas.' },
  { shop: 'Lojas de moda', text: 'Use as cores e o logo da loja para manter o mesmo estilo nas promoções.' },
  { shop: 'Lojas de eletrônicos', text: 'Importe a lista de produtos para preparar várias ofertas de uma vez.' },
  { shop: 'Cafeterias', text: 'Coloque o QR Code nas mesas e atualize os preços do cardápio pelo painel.' },
] as const

function ShopComments() {
  const [active, setActive] = useState(0)
  const [playing, setPlaying] = useState(() => !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    if (!playing || hovered) return
    const timer = window.setTimeout(() => setActive((active + 1) % comments.length), 6500)
    return () => window.clearTimeout(timer)
  }, [active, hovered, playing])

  return (
    <section aria-labelledby="shop-comments" className="px-6 py-16 text-center sm:py-20">
      <h2 id="shop-comments" className="text-3xl font-black">Exemplos para cada tipo de loja</h2>
      <div className="mx-auto mt-7 max-w-2xl" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
        <div aria-live={playing ? 'off' : 'polite'} className="grid">
          {comments.map(({ shop, text }, index) => (
            <figure key={shop} aria-hidden={index !== active}
              className={`col-start-1 row-start-1 grid content-center justify-items-center rounded-2xl border border-indigo-100 bg-indigo-50/60 px-6 py-8 transition-opacity duration-700 motion-reduce:transition-none sm:px-12 ${index === active ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
              <Quote size={24} aria-hidden="true" className="text-indigo-600" />
              <p className="mt-4 text-lg leading-relaxed text-slate-800">{text}</p>
              <figcaption className="mt-4 text-sm font-semibold text-indigo-800">{shop}</figcaption>
            </figure>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-center gap-1">
          {comments.map(({ shop }, index) => (
            <button key={shop} type="button" aria-label={`Ver exemplo para ${shop.toLowerCase()}`} aria-pressed={index === active}
              onClick={() => setActive(index)} className="grid size-10 place-items-center rounded-full">
              <span aria-hidden="true" className={`h-2 rounded-full transition-[width,background-color] motion-reduce:transition-none ${index === active ? 'w-5 bg-indigo-600' : 'w-2 bg-slate-400'}`} />
            </button>
          ))}
          <button type="button" aria-label={playing ? 'Pausar exemplos por segmento' : 'Reproduzir exemplos por segmento'} onClick={() => setPlaying(value => !value)}
            className="grid size-10 place-items-center rounded-full text-slate-600 hover:bg-indigo-50">
            {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
          </button>
        </div>
      </div>
    </section>
  )
}

function PromotionCarousel() {
  const [active, setActive] = useState(0)
  const [playing, setPlaying] = useState(() => !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)

  useEffect(() => {
    if (!playing) return
    const timer = window.setTimeout(() => setActive(current => (current + 1) % promotions.length), 7000)
    return () => window.clearTimeout(timer)
  }, [active, playing])

  return (
    <section id="exemplos" aria-label="Exemplos de artes promocionais" className="relative min-w-0 scroll-mt-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-6 rounded-full bg-indigo-100 blur-3xl" />
      <div className="relative isolate grid aspect-[3/2] place-items-center">
        {promotions.map(([name, description], index) => (
          <img key={name} src={`${import.meta.env.BASE_URL}promotion-examples/${name}.jpg`}
            alt={description} aria-hidden={index !== active}
            className={`absolute inset-0 m-auto max-h-full w-full rounded-2xl object-contain shadow-xl transition-opacity duration-1000 motion-reduce:transition-none ${index === active ? 'opacity-100' : 'opacity-0'}`} />
        ))}
      </div>
      <div className="relative mt-3 flex items-center justify-center gap-0.5">
        {promotions.map(([name, description], index) => (
          <button key={name} type="button" aria-label={`Exibir: ${description}`} aria-pressed={index === active}
            onClick={() => setActive(index)} className="grid size-8 place-items-center rounded-full">
            <span aria-hidden="true" className={`h-2 rounded-full transition-[width,background-color] motion-reduce:transition-none ${index === active ? 'w-5 bg-indigo-600' : 'w-2 bg-slate-400'}`} />
          </button>
        ))}
        <button type="button" aria-label={playing ? 'Pausar rotação' : 'Reproduzir carrossel'} onClick={() => setPlaying(current => !current)}
          className="ml-1 grid size-8 place-items-center rounded-full text-slate-600 hover:bg-slate-100">
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
      </div>
    </section>
  )
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <BrandLink />
        <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex"><a href="#recursos">Recursos</a><Link to="/plans">Planos</Link></nav>
        <div className="flex gap-2"><Link to="/login" className="rounded-xl px-4 py-2.5 text-sm font-semibold">Entrar</Link><Link to="/generator" className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200">Começar grátis</Link></div>
      </header>
      <main>
        <section className="mx-auto grid max-w-7xl items-center gap-10 px-6 py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:py-28">
          <div>
            <h1 className="max-w-3xl text-5xl font-black leading-[1.05] tracking-tight sm:text-6xl">{SLOGAN}</h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">Crie banners, encartes, cartazes, etiquetas e stories para sua loja. Publique cardápios e mantenha as ofertas rodando na TV pelo mesmo painel.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row"><Link to="/generator" className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3.5 font-bold text-white shadow-xl shadow-indigo-200">Criar minha primeira arte <ArrowRight size={18} /></Link><Link to="/templates" className="rounded-xl border border-slate-200 px-6 py-3.5 text-center font-bold">Ver exemplos</Link></div>
            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600"><span className="flex items-center gap-1.5"><Check size={16} className="text-emerald-600" /> Cadastro sem cartão</span><span className="flex items-center gap-1.5"><Check size={16} className="text-emerald-600" /> 10 créditos grátis por mês</span></div>
          </div>
          <PromotionCarousel />
        </section>
        <section id="recursos" className="border-y border-slate-100 bg-slate-50 px-6 py-20">
          <div className="mx-auto max-w-7xl">
            <h2 className="text-center text-3xl font-black">O que você pode criar na {BRAND}</h2>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {features.map(({ to, icon: Icon, title, text }) => (
                <Link key={to} to={to} aria-labelledby={`feature-${to.slice(1)}`} className="group block rounded-2xl border border-slate-200 bg-white p-6 shadow-soft transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><Icon size={21} aria-hidden="true" /></span>
                  <h3 id={`feature-${to.slice(1)}`} className="mt-5 text-lg font-bold group-hover:text-indigo-700">{title}</h3>
                  <p className="mt-2 leading-7 text-slate-600">{text}</p>
                </Link>
              ))}
            </div>
            <p className="mt-8 text-center text-sm text-slate-600">Confira o custo em créditos de cada recurso e os formatos disponíveis. <Link to="/plans" className="font-semibold text-indigo-700 underline underline-offset-4">Ver planos e créditos</Link></p>
          </div>
        </section>
        <ShopComments />
      </main>
      <BrandFooter className="mx-auto max-w-7xl px-6 py-8 text-slate-600" />
    </div>
  )
}
