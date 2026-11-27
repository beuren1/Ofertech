import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { apiRequest } from '../auth'
import { contrast, priceText, type Flyer, type FlyerProduct } from '../flyers'
import { BrandFooter } from '../components/Brand'

type PublishedMenu = Flyer & { kind: 'menu' }

export function PublicMenuPage() {
  const { token = '' } = useParams()
  const [menu, setMenu] = useState<PublishedMenu>()
  const [unavailable, setUnavailable] = useState(false)
  useEffect(() => {
    let active = true
    setMenu(undefined)
    setUnavailable(false)
    void apiRequest<PublishedMenu>(`public/projects/${encodeURIComponent(token)}/`).then(result => {
      if (!active) return
      if (result.kind === 'menu') setMenu(result)
      else setUnavailable(true)
    }).catch(() => { if (active) setUnavailable(true) })
    return () => { active = false }
  }, [token])

  if (!menu) return <main className="mx-auto max-w-2xl p-8"><p role="status">{unavailable ? 'Cardápio indisponível.' : 'Carregando cardápio…'}</p></main>
  const { design, products } = menu
  const categories = new Map<string, FlyerProduct[]>()
  for (const product of products) {
    const category = product.category.trim() || 'Cardápio'
    categories.set(category, [...(categories.get(category) ?? []), product])
  }
  return (
    <div className="min-h-screen text-slate-900" style={{ backgroundColor: design.background }}>
      <header className="px-5 py-10" style={{ backgroundColor: design.primary, color: design.headerTextColor ?? contrast(design.primary) }}>
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-5">
          {design.logo && <img src={design.logo} alt="" referrerPolicy="no-referrer" className="size-16 object-contain" />}
          <div>
            {design.storeName && <p className="font-semibold">{design.storeName}</p>}
            <h1 className="text-4xl font-black">{design.title}</h1>
            {design.subtitle && <p className="mt-2">{design.subtitle}</p>}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-7 px-5 py-8">
        {Array.from(categories, ([category, items]) => <section key={category} className="space-y-3">
          <h2 className="text-xl font-bold" style={{ color: contrast(design.background) }}>{category}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map((product, index) => <article key={index} className="flex gap-3 rounded-xl border bg-white p-4"
              style={{ borderColor: product.featured ? design.accent : '#e2e8f0' }}>
              {product.imageUrl && <img src={product.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-20 shrink-0 rounded-lg object-cover" />}
              <div className="min-w-0">
                <h3 className="break-words font-bold">{product.name}</h3>
                {product.description && <p className="mt-1 break-words text-sm text-slate-600">{product.description}</p>}
                <p className="mt-2 font-bold">{product.originalPrice && <del className="mr-2 text-sm text-slate-500">{priceText(product.originalPrice)}</del>}{priceText(product.price)}</p>
              </div>
            </article>)}
          </div>
        </section>)}
      </main>
      <BrandFooter className="mx-auto max-w-3xl px-5 py-6" />
    </div>
  )
}
