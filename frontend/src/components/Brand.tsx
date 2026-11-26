import { Link } from 'react-router-dom'

export const BRAND = 'Ofertech'
export const SLOGAN = 'Sua oferta merece destaque.'
export const BRAND_DESCRIPTION = 'Crie banners, encartes, cartazes, etiquetas de preço e vídeos promocionais com a identidade da sua loja.'

export function BrandLink({ className = '' }: { className?: string }) {
  return (
    <Link to="/" className={`inline-flex items-center gap-2.5 text-xl font-bold tracking-tight ${className}`}>
      <img src={`${import.meta.env.BASE_URL}ofertech.svg`} alt="" width={36} height={36} className="shrink-0" />
      {BRAND}
    </Link>
  )
}

export function BrandFooter({ className = '' }: { className?: string }) {
  return (
    <footer className={`flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm ${className}`}>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <span>© {new Date().getFullYear()} {BRAND}</span>
        <span>Desenvolvido por Josué Beuren</span>
      </div>
      <span>{SLOGAN}</span>
    </footer>
  )
}
