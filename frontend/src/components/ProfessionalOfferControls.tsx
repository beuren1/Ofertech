import { useState } from 'react'
import { ARTWORK_HEIGHTS, clampArtworkElementRect, defaultArtworkPhoto, loadProductImage, professionalDefaults, professionalOfferLayout, type ArtworkConfig, type ArtworkHeight, type ArtworkPresentation } from '../bulk'
import { MAX_FLYER_PHOTO_SCALE, MAX_GLOW_INTENSITY, OFFER_LABELS, PHOTO_DEFAULTS, PRODUCT_GLOW_DEFAULTS } from '../flyerOfferLayout'
import { prepareFlyerImage } from '../flyers'
import { ProductCutout } from './ProductCutout'

async function prepareOfferImage(file: File, maxWidth: number, maxHeight: number) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    throw new Error('Use imagens PNG, JPG ou WebP de até 5 MB cada.')
  }
  const url = URL.createObjectURL(file)
  try {
    const { image } = await loadProductImage(url)
    if (!image) throw new Error('Não foi possível abrir a imagem.')
    const canvas = document.createElement('canvas')
    const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight)
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Não foi possível preparar a imagem.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/webp', 0.78)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function ProfessionalOfferControls({ config, productCategory, onChange, onLogoChange }: {
  config: ArtworkConfig
  productCategory: string
  onChange: (patch: Partial<ArtworkConfig>) => void
  onLogoChange: (patch: Partial<ArtworkConfig>) => void
}) {
  const settings = { ...professionalDefaults, ...config.professional }
  const professional = config.template === 'professional'
  const presentation = config.presentation ?? {}
  const glow = presentation.glow ?? PRODUCT_GLOW_DEFAULTS
  const logo = config.offerLogo || (config.brand?.showLogo ? config.brand.logoUrl : '')
  const [imageError, setImageError] = useState('')
  const [uploading, setUploading] = useState(false)
  const details = config.offerDetails ?? []
  const update = (patch: Partial<typeof settings>) => onChange({ professional: { ...settings, ...patch } })
  const edit = (patch: ArtworkPresentation) => onChange({ presentation: patch })

  async function uploadImages(files: File[], logo: boolean) {
    setImageError('')
    setUploading(true)
    try {
      if (logo) onLogoChange({ offerLogo: await prepareOfferImage(files[0], 240, 140) })
      else {
        const remaining = 3 - details.length
        if (files.length > remaining) throw new Error('O template aceita até três fotos de detalhes.')
        const images = await Promise.all(files.map(file => prepareOfferImage(file, 160, 160)))
        onLogoChange({ offerDetails: [...details, ...images] })
      }
    } catch (reason) {
      setImageError(reason instanceof Error ? reason.message : 'Não foi possível preparar as imagens.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-3">
      {professional && <>
      <button type="button" className="w-full rounded-lg border px-3 py-2 text-sm" onClick={() => onChange(professionalOfferLayout())}>
        Aplicar composição da referência
      </button>
      <label className="block text-sm font-medium">Dimensões da arte
        <select className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2" value={config.height ?? 1080} onChange={event => onChange({ height: Number(event.target.value) as ArtworkHeight })}>
          {ARTWORK_HEIGHTS.map(height => <option key={height} value={height}>1080 × {height}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap gap-4 text-sm">
        <label>Cabeçalho <input type="color" value={settings.headingColor} onChange={event => update({ headingColor: event.target.value })} /></label>
        <label>Contorno da faixa <input type="color" value={settings.outlineColor} onChange={event => update({ outlineColor: event.target.value })} /></label>
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        <label><input type="checkbox" checked={settings.rays} onChange={event => update({ rays: event.target.checked })} /> Raios</label>
        <label><input type="checkbox" checked={settings.shadow} onChange={event => update({ shadow: event.target.checked })} /> Sombra do produto</label>
      </div>
      {settings.shadow && <label className="block text-sm">Intensidade da sombra
        <input className="block w-full" type="range" min={0} max={100} value={settings.shadowStrength} onChange={event => update({ shadowStrength: Number(event.target.value) })} />
      </label>}
      </>}
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">Nome da loja na arte
          <input className="mt-1 w-full rounded border bg-transparent p-2" maxLength={100} value={presentation.storeName ?? config.brand?.name ?? ''} onChange={event => edit({ storeName: event.target.value })} />
        </label>
        <label className="block text-sm">Subtítulo da arte
          <input className="mt-1 w-full rounded border bg-transparent p-2" maxLength={160} value={presentation.subtitle ?? ''} onChange={event => edit({ subtitle: event.target.value })} />
        </label>
      </div>
      <label className="block text-sm"><input type="checkbox" checked={Boolean(presentation.showCategory)} onChange={event => edit({ showCategory: event.target.checked })} /> Exibir faixa de categoria</label>
      {presentation.showCategory && <label className="block text-sm">Categoria na faixa
        <input className="mt-1 w-full rounded border bg-transparent p-2" maxLength={80} value={presentation.categoryLabel ?? productCategory}
          onChange={event => edit({ categoryLabel: event.target.value })} />
      </label>}
      <div className="grid grid-cols-2 gap-2">
        {([
          ['headerTextColor', 'Cor do texto do título', professional ? '#ffffff' : config.badgeTextColor],
          ['storeNameColor', 'Cor do nome da loja', presentation.headerTextColor ?? (professional ? '#fff' : config.textColor)],
          ['subtitleColor', 'Cor do subtítulo', presentation.headerTextColor ?? (professional ? '#fff' : config.textColor)],
          ['categoryTextColor', 'Cor do texto da categoria', '#ffffff'],
          ['oldPriceColor', 'Cor da caixa do preço anterior', '#fff8df'],
          ['offerColor', 'Cor da faixa do preço', config.buttonColor],
          ['offerTextColor', 'Cor do texto da oferta', config.buttonTextColor],
        ] as const).map(([key, label, fallback]) => (
          <label className="flex items-center justify-between gap-2 text-sm" key={key}>{label}
            <input type="color" className="h-8 w-10" value={presentation[key] ?? (fallback === '#fff' ? '#ffffff' : fallback)}
              onChange={event => edit({ [key]: event.target.value })} />
          </label>
        ))}
      </div>
      <label className="block text-sm">Etiqueta promocional
        <select className="mt-1 w-full rounded border bg-transparent p-2" value={presentation.offerLabel ?? 'OFERTA'}
          onChange={event => edit({ offerLabel: event.target.value as ArtworkPresentation['offerLabel'] })}>
          {OFFER_LABELS.map(label => <option key={label}>{label}</option>)}
        </select>
      </label>
      <label className="block text-sm">Escala da foto
        <input className="block w-full" type="range" min={50} max={MAX_FLYER_PHOTO_SCALE} value={presentation.photoScale ?? 100}
          onChange={event => edit({ photoScale: event.target.valueAsNumber })} />
      </label>
      <button className="text-sm underline" type="button" onClick={() => onLogoChange({
        positions: { ...config.positions, photo: defaultArtworkPhoto(config.template) }, presentation: PHOTO_DEFAULTS,
      })}>Centralizar foto</button>
      <label className="block text-sm"><input type="checkbox" checked={glow.enabled} onChange={event => edit({ glow: { ...glow, enabled: event.target.checked } })} /> Brilho do produto</label>
      {glow.enabled && <div className="space-y-2">
        <label className="flex items-center justify-between text-sm">Cor do brilho
          <input type="color" value={glow.color} onChange={event => edit({ glow: { ...glow, color: event.target.value } })} />
        </label>
        {([['intensity', 'Intensidade do brilho', 0, MAX_GLOW_INTENSITY], ['blur', 'Difusão do brilho', 1, 10]] as const).map(([key, label, min, max]) => (
          <label key={key} className="block text-sm">{label}
            <input type="range" className="block w-full" min={min} max={max} value={glow[key]}
              onChange={event => edit({ glow: { ...glow, [key]: event.target.valueAsNumber } })} />
          </label>
        ))}
      </div>}
      <label className="block text-sm">Imagem de fundo
        <input className="block w-full text-xs" type="file" disabled={uploading} accept="image/png,image/jpeg,image/webp" onChange={event => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (!file) return
          setUploading(true)
          setImageError('')
          void prepareFlyerImage(file, 650, 30000).then(backgroundImage => onLogoChange({ presentation: { backgroundImage } }))
            .catch(error => setImageError(error instanceof Error ? error.message : 'Não foi possível preparar o fundo.'))
            .finally(() => setUploading(false))
        }} />
      </label>
      {presentation.backgroundImage && <button className="text-sm underline" type="button" onClick={() => onLogoChange({ presentation: { backgroundImage: '' } })}>Remover imagem de fundo</button>}
      <label className="block text-sm">Logotipo da oferta
        <input className="block w-full text-xs" type="file" disabled={uploading} accept="image/png,image/jpeg,image/webp" onChange={event => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void uploadImages([file], true)
        }} />
      </label>
      {config.offerLogo && <button className="text-sm underline" type="button" onClick={() => onLogoChange({ offerLogo: '' })}>Remover logotipo da oferta</button>}
      {logo && <>
        <label className="block text-sm">Tamanho do logotipo
          <input className="block w-full" type="range" min={90} max={professional ? 460 : 420} value={config.positions.brandLogo.width}
            onChange={event => {
              const current = config.positions.brandLogo
              const width = event.target.valueAsNumber
              onLogoChange({ positions: { ...config.positions, brandLogo: clampArtworkElementRect('brandLogo', {
                ...current, width, height: current.height * width / current.width,
              }, config.template) } })
            }} />
        </label>
        <ProductCutout url={logo} key={logo} buttonLabel="Remover fundo do logotipo"
          onApply={async file => onLogoChange({ offerLogo: await prepareOfferImage(file, 360, 240) })} />
      </>}
      <label className="block text-sm">Fotos de detalhes (até 3)
        <input className="block w-full text-xs" type="file" multiple disabled={uploading || details.length >= 3} accept="image/png,image/jpeg,image/webp" onChange={event => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ''
          if (files.length) void uploadImages(files, false)
        }} />
      </label>
      <div className="flex flex-wrap gap-2">
        {details.map((image, index) => (
          <div key={index} className="flex flex-col items-center gap-1">
            <img src={image} alt={`Detalhe ${index + 1} do produto`} className="h-12 w-12 rounded-full object-cover" />
            <button type="button" disabled={uploading} className="text-xs underline" onClick={() => onLogoChange({ offerDetails: details.filter((_, item) => item !== index) })}>Remover {index + 1}</button>
          </div>
        ))}
      </div>
      {imageError && <p role="alert" className="text-sm text-red-600">{imageError}</p>}
    </div>
  )
}
