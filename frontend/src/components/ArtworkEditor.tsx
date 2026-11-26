import { useState, type ChangeEvent } from 'react'
import { Check, Redo2, Undo2, Upload, X } from 'lucide-react'
import { ART_TEMPLATES, changeArtworkTemplate, getPhotoCompatibilityWarning, templateName, type ArtElement, type ArtTemplate, type ArtworkConfig, type BadgeStyle, type BulkProduct } from '../bulk'
import { ProductCutout } from './ProductCutout'
import { ProfessionalOfferControls } from './ProfessionalOfferControls'
import { ArtworkCanvas } from './ArtworkCanvas'

export type ArtworkItem = {
  key: string
  index: number
  promotionId?: number
  product: BulkProduct
  config: ArtworkConfig
  status: 'ready' | 'error'
  error: string | null
  imageWarning: string | null
}

type Props = {
  free?: boolean
  artwork: ArtworkItem
  total: number
  scope: 'current' | 'all'
  onScopeChange: (scope: 'current' | 'all') => void
  onConfigChange: (patch: Partial<ArtworkConfig>, applyToAll?: boolean) => void
  onTemplateChange: (template: ArtTemplate, applyToAll: boolean) => void
  onDragConfigChange: (config: ArtworkConfig) => void
  onDragStart: () => void
  onDragEnd: () => void
  onPhotoChange: (file: File | null) => Promise<void>
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  onSave: () => void
  saveState: 'saved' | 'dirty' | 'saving' | 'error'
  saveError: string | null
  onDownload: (format: 'png' | 'jpeg' | 'pdf') => void
}

const fonts = ['Arial', 'Georgia', 'Trebuchet MS', 'Verdana', 'Impact']
const badgeStyles: { value: BadgeStyle; label: string }[] = [
  { value: 'burst', label: 'Explosão' },
  { value: 'circle', label: 'Círculo' },
  { value: 'pill', label: 'Pílula' },
]

export function ArtworkEditor({
  free = false,
  artwork,
  total,
  scope,
  onScopeChange,
  onConfigChange,
  onTemplateChange,
  onDragConfigChange,
  onDragStart,
  onDragEnd,
  onPhotoChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onSave,
  saveState,
  saveError,
  onDownload,
}: Props) {
  const [selectedElement, setSelectedElement] = useState<ArtElement | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const config = artwork.config
  const photoCompatibilityWarning = getPhotoCompatibilityWarning(artwork.product)

  const uploadPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    setPhotoError(null)
    try {
      await onPhotoChange(file)
    } catch (reason) {
      setPhotoError(reason instanceof Error ? reason.message : 'Não foi possível carregar a foto.')
    }
  }

  const removePhoto = async () => {
    setPhotoError(null)
    try {
      await onPhotoChange(null)
    } catch (reason) {
      setPhotoError(reason instanceof Error ? reason.message : 'Não foi possível remover a foto.')
    }
  }

  return (
    <section id="artwork-editor" className="mt-8 scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-indigo-600">Editor visual · arte {artwork.index + 1} de {total}</p>
          <h2 className="mt-1 text-2xl font-black">{artwork.config.productName}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={!canUndo} onClick={onUndo} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm disabled:opacity-40"><Undo2 size={16} /> Desfazer</button>
          <button type="button" disabled={!canRedo} onClick={onRedo} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm disabled:opacity-40"><Redo2 size={16} /> Refazer</button>
          <button type="button" disabled={saveState === 'saving' || saveState === 'saved'} onClick={onSave} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {saveState === 'saving' ? 'Salvando...' : saveState === 'saved' ? <><Check size={16} /> Salvo</> : 'Salvar edições'}
          </button>
        </div>
      </div>
      {saveError && <p role="alert" className="mt-3 text-sm text-red-600">{saveError}</p>}

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="rounded-2xl border border-slate-200 bg-slate-100 p-3 dark:border-slate-800 dark:bg-slate-950 sm:p-5 xl:sticky xl:top-24 xl:max-h-[calc(100dvh-7rem)] xl:overflow-y-auto">
          <div className="mx-auto mb-4 flex max-w-[620px] items-center justify-between text-xs font-semibold text-slate-500">
            <span>PRÉVIA DA PEÇA</span>
            <span>1080 × {config.template === 'professional' ? config.height ?? 1080 : 1080}</span>
          </div>
          <ArtworkCanvas
            product={artwork.product}
            config={config}
            selectedElement={selectedElement}
            onSelectElement={setSelectedElement}
            onConfigChange={onDragConfigChange}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
          {artwork.imageWarning && (
            <p role="status" className="mx-auto mt-3 max-w-[620px] rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{artwork.imageWarning}</p>
          )}
          {photoCompatibilityWarning && (
            <p role="status" className="mx-auto mt-3 max-w-[620px] rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{photoCompatibilityWarning}</p>
          )}
          <div className="mx-auto mt-4 flex max-w-[620px] flex-wrap gap-2">
            <button type="button" onClick={() => onDownload('png')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900">Exportar PNG</button>
            {!free && <>
              <button type="button" onClick={() => onDownload('jpeg')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900">Exportar JPG</button>
              <button type="button" onClick={() => onDownload('pdf')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900">Exportar PDF</button>
            </>}
          </div>
        </div>

        <div className="space-y-3 pr-1 xl:max-h-[78vh] xl:overflow-y-auto">
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 dark:border-indigo-950 dark:bg-indigo-950/30">
            <p className="text-xs font-bold uppercase tracking-wide text-indigo-800 dark:text-indigo-300">Escopo das mudanças gerais</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" aria-pressed={scope === 'current'} onClick={() => onScopeChange('current')} className={`rounded-lg border px-2 py-2 text-xs font-semibold ${scope === 'current' ? 'border-indigo-600 bg-white text-indigo-700 shadow-sm dark:bg-slate-900' : 'border-transparent text-slate-600'}`}>Somente nesta arte</button>
              <button type="button" aria-pressed={scope === 'all'} onClick={() => onScopeChange('all')} className={`rounded-lg border px-2 py-2 text-xs font-semibold ${scope === 'all' ? 'border-indigo-600 bg-white text-indigo-700 shadow-sm dark:bg-slate-900' : 'border-transparent text-slate-600'}`}>Aplicar em todas</button>
            </div>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">Nome, foto, preços e desconto continuam individuais por produto.</p>
          </div>

          <details open className="group rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <summary className="cursor-pointer list-none font-bold">Produto e foto</summary>
            <div className="mt-3 space-y-3">
              <p className="text-sm text-slate-500">
                {artwork.product.imageUrl ? 'Arraste a foto na prévia para mover ou use a alça para redimensionar.' : 'Adicione uma foto para destacar o produto.'}
              </p>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">
                <Upload size={16} /> {artwork.product.imageUrl ? 'Trocar foto' : 'Adicionar foto'}
                <input type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" className="sr-only" onChange={event => void uploadPhoto(event)} />
              </label>
              {artwork.product.imageUrl && (
                <button type="button" onClick={() => void removePhoto()} className="flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm"><X size={15} /> Remover foto</button>
              )}
              {photoError && <p role="alert" className="text-sm text-red-600">{photoError}</p>}
              {artwork.product.imageUrl && <ProductCutout key={artwork.product.imageUrl} url={artwork.product.imageUrl} onApply={onPhotoChange} />}
              <p className="text-xs leading-5 text-slate-500">PNG e WebP com transparência são preservados na Oferta Profissional.</p>
            </div>
          </details>

          <details open className="group rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <summary className="cursor-pointer list-none font-bold">Texto</summary>
            <div className="mt-3 space-y-3">
              <TextField label="Nome do produto" value={config.productName} onChange={value => onConfigChange({ productName: value })} />
              <TextField label={config.template === 'professional' ? 'Título da oferta' : 'Chamada promocional'} value={config.callout} onChange={value => onConfigChange({ callout: value }, scope === 'all')} />
              <label className="block text-sm font-medium">Fonte
                <select aria-label="Fonte do texto" value={config.fontFamily} onChange={event => onConfigChange({ fontFamily: event.target.value }, scope === 'all')} className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2">
                  {fonts.map(font => <option key={font} value={font}>{font}</option>)}
                </select>
              </label>
              <RangeField label="Tamanho do nome" min={28} max={90} value={config.titleSize} onChange={value => onConfigChange({ titleSize: value }, scope === 'all')} />
            </div>
          </details>

          <details open className="group rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <summary className="cursor-pointer list-none font-bold">Oferta</summary>
            <div className="mt-3 space-y-3">
              <TextField label="Texto do selo / desconto" value={config.discount} onChange={value => onConfigChange({ discount: value })} />
              <label className="block text-sm font-medium">Estilo do selo
                <select aria-label="Estilo do selo" value={config.badgeStyle ?? 'burst'} onChange={event => onConfigChange({ badgeStyle: event.target.value as BadgeStyle }, scope === 'all')} className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2">
                  {badgeStyles.map(style => <option key={style.value} value={style.value}>{style.label}</option>)}
                  {config.template === 'professional' && <option value="ribbon">Faixa</option>}
                </select>
              </label>
              <ColorField label="Selo" value={config.badgeColor} onChange={value => onConfigChange({ badgeColor: value }, scope === 'all')} />
              <ColorField label="Texto do selo" value={config.badgeTextColor} onChange={value => onConfigChange({ badgeTextColor: value }, scope === 'all')} />
              <RangeField label="Tamanho do selo" min={100} max={config.template === 'professional' ? 900 : 280} value={config.positions.badge.width} onChange={value => onConfigChange({
                positions: {
                  ...config.positions,
                  badge: { ...config.positions.badge, width: value, height: config.template === 'professional' ? config.positions.badge.height : value },
                },
              }, scope === 'all')} />
              <label className="block text-sm font-medium">Camada no preview
                <select aria-label="Camada no preview" value={selectedElement ?? ''} onChange={event => setSelectedElement((event.target.value || null) as ArtElement | null)} className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2">
                  <option value="">Nenhuma</option>
                  <option value="photo">Foto do produto</option>
                  <option value="title">Nome do produto</option>
                  <option value="callout">Chamada</option>
                  <option value="originalPrice">Preço original</option>
                  <option value="salePrice">Preço promocional</option>
                  <option value="badge">Selo</option>
                  <option value="cta">Botão CTA</option>
                  {(config.brand?.showLogo || config.offerLogo) && <option value="brandLogo">Logo da loja</option>}
                </select>
              </label>
              <p className="text-xs text-slate-500">Arraste o selo no preview para mover. Selecione-o para exibir a alça de redimensionamento.</p>
            </div>
          </details>

          {config.brand && (
            <details open className="group rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <summary className="cursor-pointer list-none font-bold">Minha marca</summary>
              <div className="mt-3 space-y-3">
                <p className="text-sm text-slate-500">Identidade aplicada: <b>{config.brand.name}</b>. Os ajustes abaixo afetam {scope === 'all' ? 'todas as artes' : 'somente esta arte'}.</p>
                <ToggleField
                  label="Mostrar logo"
                  checked={config.brand.showLogo}
                  onChange={showLogo => onConfigChange({
                    brand: { ...config.brand!, showLogo },
                  }, scope === 'all')}
                />
                {config.brand.showLogo && (
                  <>
                    <RangeField
                      label="Largura da logo"
                      min={100}
                      max={500}
                      value={config.positions.brandLogo.width}
                      onChange={width => onConfigChange({
                        positions: {
                          ...config.positions,
                          brandLogo: {
                            ...config.positions.brandLogo,
                            width,
                            height: Math.max(60, Math.round(width * 0.5)),
                          },
                        },
                      }, scope === 'all')}
                    />
                    <RangeField
                      label="Posição horizontal da logo"
                      min={8}
                      max={1080 - config.positions.brandLogo.width - 8}
                      value={config.positions.brandLogo.x}
                      onChange={x => onConfigChange({
                        positions: {
                          ...config.positions,
                          brandLogo: { ...config.positions.brandLogo, x },
                        },
                      }, scope === 'all')}
                    />
                    <RangeField
                      label="Posição vertical da logo"
                      min={8}
                      max={1080 - config.positions.brandLogo.height - 8}
                      value={config.positions.brandLogo.y}
                      onChange={y => onConfigChange({
                        positions: {
                          ...config.positions,
                          brandLogo: { ...config.positions.brandLogo, y },
                        },
                      }, scope === 'all')}
                    />
                  </>
                )}
                <TextField
                  label="Slogan da loja na arte"
                  value={config.brand.slogan}
                  onChange={slogan => onConfigChange({
                    brand: { ...config.brand!, slogan },
                  }, scope === 'all')}
                />
                <ToggleField
                  label="Mostrar Instagram"
                  checked={config.brand.showInstagram}
                  onChange={showInstagram => onConfigChange({
                    brand: { ...config.brand!, showInstagram },
                  }, scope === 'all')}
                />
                {config.brand.showInstagram && (
                  <TextField
                    label="Instagram na arte"
                    value={config.brand.instagram}
                    onChange={instagram => onConfigChange({
                      brand: { ...config.brand!, instagram },
                    }, scope === 'all')}
                  />
                )}
                <ToggleField
                  label="Mostrar WhatsApp"
                  checked={config.brand.showWhatsapp}
                  onChange={showWhatsapp => onConfigChange({
                    brand: { ...config.brand!, showWhatsapp },
                  }, scope === 'all')}
                />
                {config.brand.showWhatsapp && (
                  <TextField
                    label="WhatsApp na arte"
                    value={config.brand.whatsapp}
                    onChange={whatsapp => onConfigChange({
                      brand: { ...config.brand!, whatsapp },
                    }, scope === 'all')}
                  />
                )}
                <ToggleField
                  label="Mostrar site"
                  checked={config.brand.showWebsite}
                  onChange={showWebsite => onConfigChange({
                    brand: { ...config.brand!, showWebsite },
                  }, scope === 'all')}
                />
                {config.brand.showWebsite && (
                  <TextField
                    label="Site na arte"
                    value={config.brand.website}
                    onChange={website => onConfigChange({
                      brand: { ...config.brand!, website },
                    }, scope === 'all')}
                  />
                )}
                {!config.brand.logoUrl && !config.brand.logoAssetId && (
                  <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Esta loja ainda não tem logo; adicione uma em Minha loja.</p>
                )}
              </div>
            </details>
          )}

          <details open className="group rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <summary className="cursor-pointer list-none font-bold">Preço</summary>
            <div className="mt-3 space-y-3">
              <TextField label="Preço original" value={config.originalPrice} onChange={value => onConfigChange({ originalPrice: value })} />
              <TextField label="Preço promocional" value={config.salePrice} onChange={value => onConfigChange({ salePrice: value })} />
              <RangeField label="Tamanho do preço" min={40} max={config.template === 'professional' ? 190 : 120} value={config.priceSize} onChange={value => onConfigChange({ priceSize: value }, scope === 'all')} />
              <p className="text-xs text-slate-500">Os valores permanecem individuais para cada produto; o preço promocional recebe destaque na arte.</p>
            </div>
          </details>

          <details className="group rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <summary className="cursor-pointer list-none font-bold">Cores</summary>
            <div className="mt-3 space-y-3">
              <ColorField label="Fundo" value={config.backgroundColor} onChange={value => onConfigChange({ backgroundColor: value }, scope === 'all')} />
              <ColorField label="Textos" value={config.textColor} onChange={value => onConfigChange({ textColor: value }, scope === 'all')} />
            </div>
          </details>

          <details className="group rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <summary className="cursor-pointer list-none font-bold">{config.template === 'professional' ? 'Faixa de preço e rodapé' : 'CTA'}</summary>
            <div className="mt-3 space-y-3">
              <TextField label={config.template === 'professional' ? 'Texto do rodapé' : 'Texto do botão'} value={config.cta} onChange={value => onConfigChange({ cta: value }, scope === 'all')} />
              <ColorField label={config.template === 'professional' ? 'Faixa de preço' : 'Botão'} value={config.buttonColor} onChange={value => onConfigChange({ buttonColor: value }, scope === 'all')} />
              <ColorField label={config.template === 'professional' ? 'Valor promocional' : 'Texto do botão'} value={config.buttonTextColor} onChange={value => onConfigChange({ buttonTextColor: value }, scope === 'all')} />
            </div>
          </details>

          <details className="group rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <summary className="cursor-pointer list-none font-bold">Template</summary>
            <div className="mt-3 space-y-3">
              <select
                aria-label="Template da arte"
                value={config.template}
                onChange={event => onTemplateChange(event.target.value as ArtTemplate, scope === 'all')}
                className="w-full rounded-lg border bg-transparent px-3 py-2"
              >
                {ART_TEMPLATES.map(template => <option key={template} value={template} disabled={free && template === 'professional'}>{templateName(template)}{free && template === 'professional' ? ' · Pro' : ''}</option>)}
              </select>
              <p className="text-xs text-slate-500">O layout pode ser aplicado em uma peça ou em todas; textos, fotos e preços de cada produto são preservados.</p>
            </div>
          </details>
          <details className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <summary className="cursor-pointer font-bold">Composição da arte</summary>
            <div className="mt-3"><ProfessionalOfferControls config={config} productCategory={artwork.product.category} onChange={patch => onConfigChange(patch, scope === 'all')} onLogoChange={onConfigChange} /></div>
          </details>
        </div>
      </div>
    </section>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      {label}
      <input aria-label={`Cor ${label.toLowerCase()}`} type="color" value={value} onChange={event => onChange(event.target.value)} className="h-9 w-14 cursor-pointer rounded border-0 bg-transparent" />
    </label>
  )
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm font-medium">{label}
      <input aria-label={label} value={value} onChange={event => onChange(event.target.value)} className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2" />
    </label>
  )
}

function RangeField({ label, min, max, value, onChange }: { label: string; min: number; max: number; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block text-sm font-medium">{label} · {value}px
      <input aria-label={label} type="range" min={min} max={max} value={value} onChange={event => onChange(Number(event.target.value))} className="mt-2 w-full accent-indigo-600" />
    </label>
  )
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      {label}
      <input
        aria-label={label}
        type="checkbox"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
        className="h-4 w-4 accent-indigo-600"
      />
    </label>
  )
}
