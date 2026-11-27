import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Download, Palette, Sparkles, Type, Upload, X } from 'lucide-react'
import { checkArtworkCredits, confirmArtworks } from '../billing'
import { ArtworkCanvas } from '../components/ArtworkCanvas'
import { ProductCutout } from '../components/ProductCutout'
import { ProfessionalOfferControls } from '../components/ProfessionalOfferControls'
import { bannerPdf } from '../flyerExport'
import { apiBlobRequest, apiRequest, apiUpload, getErrorMessage, useAuth } from '../auth'
import { useCreationLogin } from '../creationLogin'
import { findGalleryModel } from '../galleryModels'
import { campaignAssetContentPath, createCampaignThumbnail, toCampaignArtworkSnapshot, type SavedCampaign } from '../campaigns'
import { readProductImage, saveProductImage } from '../imageStore'
import {
  ART_TEMPLATES,
  changeArtworkTemplate,
  createArtworkConfig,
  getPhotoCompatibilityWarning,
  loadProductImage,
  normalizeArtworkConfig,
  renderArtworkBlob,
  templateName,
  type ArtElement,
  type ArtFormat,
  type ArtTemplate,
  type ArtworkConfig,
  type BulkProduct,
} from '../bulk'
import type { ArtworkItem } from '../components/ArtworkEditor'

const initialProduct: BulkProduct = {
  name: 'Tênis de corrida',
  price: '199,90',
  originalPrice: '299,90',
  discount: '',
  imageUrl: '',
  category: 'Moda',
}

const imageTypes = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
])

type SavedBannerTemplate = { id: number; name: string; configuration: ArtworkConfig }

function percentageDiscount(originalPrice: string, salePrice: string) {
  const amount = (value: string) => {
    const normalized = value.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
    const number = Number(normalized)
    return Number.isFinite(number) ? number : null
  }
  const original = amount(originalPrice)
  const sale = amount(salePrice)
  if (original && sale !== null && sale < original) {
    return `-${Math.round(((original - sale) / original) * 100)}%`
  }
  return 'OFERTA'
}

function createDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function uploadProductImage(campaignId: number, product: BulkProduct, accessToken: string) {
  if (!product.localImageKey || product.imageAssetId) return product
  const image = await readProductImage(product.localImageKey)
  if (!image) throw new Error('A foto enviada não está mais disponível neste navegador.')
  const extension = `.${product.imageName?.split('.').pop()?.toLowerCase() ?? 'png'}`
  const contentType = imageTypes.get(extension) || image.type || 'image/png'
  const file = new File([image], product.imageName || 'produto.png', { type: contentType })
  const asset = await apiUpload<{ id: number }>(
    `campaigns/${campaignId}/assets/`,
    file,
    accessToken,
  )
  return { ...product, imageAssetId: asset.id }
}

function campaignArtwork(product: BulkProduct, config: ArtworkConfig): ArtworkItem {
  return {
    key: '0',
    index: 0,
    product,
    config,
    status: 'ready',
    error: null,
    imageWarning: null,
  }
}

export function GeneratorPage({ initialSearch = '' }: { initialSearch?: string } = {}) {
  const model = findGalleryModel('/generator', initialSearch)
  const photoUrl = useRef<string | null>(null)
  const saveInProgress = useRef(false)
  const saveRequested = useRef(false)
  const editRevision = useRef(0)
  const latestCampaignSave = useRef<() => Promise<void>>(async () => {})
  const [product, setProduct] = useState(() => model?.products[0] ?? initialProduct)
  const [config, setConfig] = useState<ArtworkConfig>(() => {
    const defaults = createArtworkConfig(product, 0)
    return model ? { ...changeArtworkTemplate(product, defaults, model.artwork, 0), callout: model.name } : defaults
  })
  const [selectedElement, setSelectedElement] = useState<ArtElement | null>(null)
  const [discountIsCustom, setDiscountIsCustom] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [campaignName, setCampaignName] = useState(() => model?.name ?? 'Nova campanha')
  const [campaignId, setCampaignId] = useState<number | null>(null)
  const [campaignSaveState, setCampaignSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle')
  const [campaignSaveError, setCampaignSaveError] = useState<string | null>(null)
  const { accessToken, user } = useAuth()
  const requestLogin = useCreationLogin()
  const free = user?.profile.plan === 'free'
  const business = user?.profile.plan === 'business'
  const [customTemplates, setCustomTemplates] = useState<SavedBannerTemplate[]>([])
  const [templateNameInput, setTemplateNameInput] = useState('')
  const [templateStatus, setTemplateStatus] = useState('')
  const [templateBusy, setTemplateBusy] = useState(false)
  const photoCompatibilityWarning = getPhotoCompatibilityWarning(product)

  useEffect(() => () => {
    if (photoUrl.current) URL.revokeObjectURL(photoUrl.current)
  }, [])

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('campaign_id')
    if (!accessToken || !id || !/^\d+$/.test(id)) return
    let active = true
    void apiRequest<SavedCampaign>(`campaigns/${id}/`, { accessToken }).then(async campaign => {
      const artwork = campaign.artworks[0]
      if (campaign.artworks.length !== 1 || !artwork) throw new Error('Abra campanhas em lote no editor de Criação em massa.')
      const details = artwork.product
      const blob = details.image_asset_id ? await apiBlobRequest(campaignAssetContentPath(campaign.id, details.image_asset_id), accessToken) : null
      if (!active) return
      if (photoUrl.current) URL.revokeObjectURL(photoUrl.current)
      photoUrl.current = blob ? URL.createObjectURL(blob) : null
      setProduct({
        name: details.name, category: details.category, price: details.price, originalPrice: details.original_price,
        discount: details.discount, imageUrl: photoUrl.current ?? details.image_url, imageName: details.image_name,
        imageAssetId: details.image_asset_id, sourceImageUrl: details.source_image_url,
      })
      setConfig(normalizeArtworkConfig(artwork.config))
      setCampaignName(campaign.name)
      setCampaignId(campaign.id)
      setCampaignSaveState('saved')
    }).catch(error => { if (active) setCampaignSaveError(getErrorMessage(error)) })
    return () => { active = false }
  }, [accessToken])

  useEffect(() => {
    if (!business || !accessToken) return
    let active = true
    void apiRequest<{ results: SavedBannerTemplate[] }>('templates/', { accessToken }).then(result => {
      if (active) setCustomTemplates(result.results)
    }).catch(reason => { if (active) setTemplateStatus(getErrorMessage(reason)) })
    return () => { active = false }
  }, [business, accessToken])

  const updateConfig = (patch: Partial<ArtworkConfig>) => {
    setConfig(current => ({
      ...current, ...patch,
      presentation: patch.presentation ? { ...current.presentation, ...patch.presentation } : current.presentation,
    }))
    if (campaignId || saveInProgress.current) {
      editRevision.current += 1
      setCampaignSaveState('dirty')
    }
  }

  const updateProductName = (name: string) => {
    setProduct(current => ({ ...current, name }))
    updateConfig({ productName: name })
  }

  const updateCategory = (category: string) => {
    setProduct(current => ({ ...current, category }))
    if (campaignId || saveInProgress.current) {
      editRevision.current += 1
      setCampaignSaveState('dirty')
    }
  }

  const updateCampaignName = (name: string) => {
    setCampaignName(name)
    if (campaignId || saveInProgress.current) {
      editRevision.current += 1
      setCampaignSaveState('dirty')
    }
  }

  const updatePrice = (field: 'originalPrice' | 'salePrice', value: string) => {
    const nextConfig = { ...config, [field]: value }
    if (!discountIsCustom) {
      nextConfig.discount = percentageDiscount(
        field === 'originalPrice' ? value : config.originalPrice,
        field === 'salePrice' ? value : config.salePrice,
      )
    }
    setConfig(nextConfig)
    if (field === 'salePrice') setProduct(current => ({ ...current, price: value }))
    if (field === 'originalPrice') setProduct(current => ({ ...current, originalPrice: value }))
    if (campaignId || saveInProgress.current) {
      editRevision.current += 1
      setCampaignSaveState('dirty')
    }
  }

  const setPhotoFile = async (file: File) => {
    setPhotoError(null)
    const extension = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`
    const expectedMime = imageTypes.get(extension)
    if (!expectedMime || (file.type && file.type !== expectedMime)) {
      throw new Error('Use uma foto PNG, JPG ou WebP.')
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('A foto deve ter no máximo 10 MB.')
    }

    let nextUrl: string | null = null
    try {
      const objectUrl = URL.createObjectURL(file)
      nextUrl = objectUrl
      const image = await loadProductImage(objectUrl)
      if (!image.image) {
        throw new Error(image.error || 'Não foi possível abrir esta imagem.')
      }

      const localImageKey = await saveProductImage(file)
      if (photoUrl.current) URL.revokeObjectURL(photoUrl.current)
      photoUrl.current = objectUrl
      setProduct(current => ({
        ...current,
        imageUrl: objectUrl,
        imageName: file.name,
        localImageKey,
        imageAssetId: undefined,
      }))
      if (campaignId || saveInProgress.current) {
        editRevision.current += 1
        setCampaignSaveState('dirty')
      }
    } catch (reason) {
      if (nextUrl) URL.revokeObjectURL(nextUrl)
      throw reason
    }
  }

  const uploadPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    try {
      await setPhotoFile(file)
    } catch (reason) {
      setPhotoError(getErrorMessage(reason))
    }
  }

  const removePhoto = () => {
    if (photoUrl.current) URL.revokeObjectURL(photoUrl.current)
    photoUrl.current = null
    setProduct(current => ({
      ...current,
      imageUrl: '',
      imageName: undefined,
      localImageKey: undefined,
      imageAssetId: undefined,
    }))
    if (campaignId || saveInProgress.current) {
      editRevision.current += 1
      setCampaignSaveState('dirty')
    }
    setPhotoError(null)
  }

  const generatedExports = useRef(new WeakMap<ArtworkConfig, { product: BulkProduct; key: string; blob: Blob; format: ArtFormat; confirmed: boolean }>())

  const download = async (format: ArtFormat | 'pdf') => {
    if (exporting) return
    if (!accessToken) return requestLogin()
    let saved = generatedExports.current.get(config)
    if (saved?.product !== product) saved = undefined
    const alreadyConfirmed = Boolean(saved?.confirmed)
    const key = saved?.key ?? crypto.randomUUID()
    const premium = config.template === 'professional'
    const raster = format === 'pdf' ? 'jpeg' : format
    setExporting(true)
    setExportError(null)
    try {
      if (!alreadyConfirmed || raster === 'jpeg' || premium) await checkArtworkCredits(accessToken, key, 1, raster, premium)
      if (!saved || (saved.confirmed && saved.format !== raster)) {
        const { blob, imageError } = await renderArtworkBlob(product, config, raster)
        if (imageError) {
          setPhotoError(imageError)
          return
        }
        saved = { product, key, blob, format: raster, confirmed: alreadyConfirmed }
        generatedExports.current.set(config, saved)
      }
      const output = saved.format === raster ? { blob: saved.blob, imageError: null } : await renderArtworkBlob(product, config, raster)
      if (output.imageError) throw new Error(output.imageError)
      const blob = format === 'pdf' ? await bannerPdf([{ jpeg: output.blob, height: config.template === 'professional' ? config.height ?? 1080 : 1080 }]) : output.blob
      if (!saved.confirmed) {
        await confirmArtworks(accessToken, key, [saved.blob], premium)
        saved.confirmed = true
      }
      createDownload(blob, `ofertech-promo.${format === 'jpeg' ? 'jpg' : format}`)
    } catch (reason) {
      setExportError(reason instanceof Error ? reason.message : 'Não foi possível exportar a arte.')
    } finally {
      setExporting(false)
    }
  }

  const saveCampaign = useCallback(async () => {
    if (saveInProgress.current) {
      saveRequested.current = true
      return
    }
    if (!accessToken) return requestLogin()
    if (!campaignName.trim()) {
      setCampaignSaveState('error')
      setCampaignSaveError('Informe um nome para a campanha.')
      return
    }

    const revision = editRevision.current
    saveInProgress.current = true
    setCampaignSaveState('saving')
    setCampaignSaveError(null)
    let targetCampaignId = campaignId
    let createdCampaignId: number | null = null
    try {
      if (!targetCampaignId) {
        const created = await apiRequest<{ id: number }>('campaigns/', {
          method: 'POST',
          accessToken,
          body: { name: campaignName.trim(), batch_id: '', artworks: [] },
        })
        targetCampaignId = created.id
        createdCampaignId = created.id
      }

      const savedProduct = await uploadProductImage(targetCampaignId, product, accessToken)
      setProduct(current => current.localImageKey === product.localImageKey
        ? { ...current, imageAssetId: savedProduct.imageAssetId }
        : current)
      const artwork = campaignArtwork(savedProduct, config)
      const thumbnail = await createCampaignThumbnail(savedProduct, config)
      await apiUpload(
        `campaigns/${targetCampaignId}/thumbnail-upload/`,
        thumbnail,
        accessToken,
      )
      await apiRequest(`campaigns/${targetCampaignId}/`, {
        method: 'PATCH',
        accessToken,
        body: {
          name: campaignName.trim(),
          batch_id: '',
          artworks: [toCampaignArtworkSnapshot(artwork)],
        },
      })
      setCampaignId(targetCampaignId)
      setProduct(current => current.localImageKey === product.localImageKey
        ? { ...current, imageAssetId: savedProduct.imageAssetId }
        : current)
      if (revision === editRevision.current) {
        setCampaignSaveState('saved')
        setCampaignSaveError(null)
      } else {
        setCampaignSaveState('dirty')
      }
    } catch (reason) {
      let cleanupMessage = ''
      if (createdCampaignId !== null) {
        try {
          await apiRequest(`campaigns/${createdCampaignId}/`, {
            method: 'DELETE',
            accessToken,
          })
        } catch (cleanupReason) {
          cleanupMessage = ` A campanha incompleta não pôde ser removida: ${getErrorMessage(cleanupReason)}`
        }
      }
      setCampaignSaveState('error')
      setCampaignSaveError(`${getErrorMessage(reason)}.${cleanupMessage}`)
    } finally {
      saveInProgress.current = false
      if (saveRequested.current || revision !== editRevision.current) {
        saveRequested.current = false
        setCampaignSaveState('dirty')
        window.setTimeout(() => void latestCampaignSave.current(), 0)
      }
    }
  }, [accessToken, campaignId, campaignName, config, product, requestLogin])
  latestCampaignSave.current = saveCampaign

  useEffect(() => {
    if (!campaignId || campaignSaveState !== 'dirty') return
    const timeout = window.setTimeout(() => void saveCampaign(), 900)
    return () => window.clearTimeout(timeout)
  }, [campaignId, campaignName, config, product, saveCampaign, campaignSaveState])

  const changeTemplate = (template: ArtTemplate) => {
    setConfig(current => changeArtworkTemplate(product, current, template, 0))
    if (campaignId || saveInProgress.current) {
      editRevision.current += 1
      setCampaignSaveState('dirty')
    }
  }

  async function saveReusableTemplate() {
    if (!business || !accessToken || !templateNameInput.trim() || templateBusy) return
    setTemplateBusy(true)
    setTemplateStatus('')
    try {
      const saved = await apiRequest<SavedBannerTemplate>('templates/', {
        method: 'POST', accessToken, body: {
          name: templateNameInput.trim(), category: 'banner',
          configuration: { ...config, productName: '', salePrice: '', originalPrice: '', discount: '', brand: undefined },
        },
      })
      setCustomTemplates(current => [saved, ...current])
      setTemplateNameInput('')
      setTemplateStatus('Template salvo.')
    } catch (reason) {
      setTemplateStatus(getErrorMessage(reason))
    } finally {
      setTemplateBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">Criar promoção</h1>
          <p className="mt-2 text-slate-500">Crie uma peça de e-commerce, personalize os elementos e veja a prévia em tempo real.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-end">
          <label className="text-sm font-semibold">Nome da campanha
            <input
              aria-label="Nome da campanha"
              value={campaignName}
              maxLength={180}
              onChange={event => updateCampaignName(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 sm:w-64"
              placeholder="Ex.: Black Friday 2026"
            />
          </label>
          <div className="flex flex-col items-start gap-1">
            <button
              type="button"
              disabled={campaignSaveState === 'saving' || !campaignName.trim()}
              onClick={() => void saveCampaign()}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              <Sparkles size={16} />
              {campaignSaveState === 'saving' ? 'Salvando...' : campaignId ? 'Salvar agora' : 'Salvar campanha'}
            </button>
            <span role="status" className="text-xs text-slate-500">
              {campaignSaveState === 'saved' ? 'Salvo automaticamente' : campaignSaveState === 'dirty' ? 'Alterações pendentes' : campaignId ? 'Salvamento automático ativo' : 'Ainda não salva'}
            </span>
          </div>
        </div>
      </div>
      {campaignSaveError && <p role="alert" className="mt-3 text-sm text-red-600">{campaignSaveError}</p>}

      <div className="mt-8 grid items-start gap-6 xl:grid-cols-[minmax(320px,390px)_minmax(0,1fr)]">
        <aside className="space-y-3">
          <section className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-4 dark:border-indigo-950 dark:bg-indigo-950/30">
            <p className="flex items-center gap-2 text-sm font-bold text-indigo-800 dark:text-indigo-300"><Sparkles size={16} /> Personalize sua arte</p>
            <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-400">As mudanças são aplicadas imediatamente. Arraste elementos na prévia para ajustar a composição.</p>
          </section>

          <details open className="group rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <summary className="cursor-pointer list-none font-bold">Produto e foto</summary>
            <div className="mt-3 space-y-3">
              <TextField label="Nome do produto" value={config.productName} onChange={updateProductName} />
              <TextField label="Categoria" value={product.category} onChange={updateCategory} />
              <p className="text-sm text-slate-500">
                {product.imageUrl ? 'Foto associada e preservada na proporção original.' : 'Adicione uma foto para destacar o produto.'}
              </p>
              {photoCompatibilityWarning && <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{photoCompatibilityWarning}</p>}
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-900 dark:text-indigo-300 dark:hover:bg-indigo-950/40">
                <Upload size={16} /> {product.imageUrl ? 'Trocar foto' : 'Adicionar foto'}
                <input type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" className="sr-only" onChange={event => void uploadPhoto(event)} />
              </label>
              {product.imageUrl && (
                <button type="button" onClick={removePhoto} className="flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm"><X size={15} /> Remover foto</button>
              )}
              {photoError && <p role="alert" className="text-sm text-red-600">{photoError}</p>}
              {product.imageUrl && <ProductCutout key={product.imageUrl} url={product.imageUrl} onApply={setPhotoFile} />}
              <p className="text-xs leading-5 text-slate-500">PNG e WebP com transparência são preservados na Oferta Profissional.</p>
            </div>
          </details>

          <details open className="group rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <summary className="cursor-pointer list-none font-bold">Texto</summary>
            <div className="mt-3 space-y-3">
              <TextField label={config.template === 'professional' ? 'Título da oferta' : 'Chamada promocional'} value={config.callout} onChange={callout => updateConfig({ callout })} />
              <label className="block text-sm font-medium">Fonte
                <select aria-label="Fonte do texto" value={config.fontFamily} onChange={event => updateConfig({ fontFamily: event.target.value })} className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2">
                  {['Arial', 'Georgia', 'Trebuchet MS', 'Verdana', 'Impact'].map(font => <option key={font} value={font}>{font}</option>)}
                </select>
              </label>
              <RangeField label="Tamanho do nome" min={28} max={90} value={config.titleSize} onChange={titleSize => updateConfig({ titleSize })} />
            </div>
          </details>

          <details open className="group rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <summary className="cursor-pointer list-none font-bold">Oferta</summary>
            <div className="mt-3 space-y-3">
              <TextField label="Texto do selo / desconto" value={config.discount} onChange={discount => { setDiscountIsCustom(true); updateConfig({ discount }) }} />
              <label className="block text-sm font-medium">Estilo do selo
                <select aria-label="Estilo do selo" value={config.badgeStyle ?? 'burst'} onChange={event => updateConfig({ badgeStyle: event.target.value as ArtworkConfig['badgeStyle'] })} className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2">
                  <option value="burst">Explosão</option>
                  <option value="circle">Círculo</option>
                  <option value="pill">Pílula</option>
                  {config.template === 'professional' && <option value="ribbon">Faixa</option>}
                </select>
              </label>
              <ColorField label="Selo" value={config.badgeColor} onChange={badgeColor => updateConfig({ badgeColor })} />
              <ColorField label="Texto do selo" value={config.badgeTextColor} onChange={badgeTextColor => updateConfig({ badgeTextColor })} />
              <RangeField
                label="Tamanho do selo"
                min={100}
                max={config.template === 'professional' ? 900 : 280}
                value={config.positions.badge.width}
                onChange={size => updateConfig({
                  positions: { ...config.positions, badge: { ...config.positions.badge, width: size, height: config.template === 'professional' ? config.positions.badge.height : size } },
                })}
              />
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
                  {config.offerLogo && <option value="brandLogo">Logotipo</option>}
                </select>
              </label>
            </div>
          </details>

          <details open className="group rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <summary className="cursor-pointer list-none font-bold">Preço</summary>
            <div className="mt-3 space-y-3">
              <TextField label="Preço original" value={config.originalPrice} onChange={value => updatePrice('originalPrice', value)} />
              <TextField label="Preço promocional" value={config.salePrice} onChange={value => updatePrice('salePrice', value)} />
              <RangeField label="Tamanho do preço" min={40} max={config.template === 'professional' ? 190 : 120} value={config.priceSize} onChange={priceSize => updateConfig({ priceSize })} />
              <p className="text-xs text-slate-500">O desconto é recalculado ao alterar os preços até que o texto do selo seja personalizado.</p>
            </div>
          </details>

          <details className="group rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <summary className="cursor-pointer list-none">Cores</summary>
            <div className="mt-3 space-y-3">
              <ColorField label="Fundo" value={config.backgroundColor} onChange={backgroundColor => updateConfig({ backgroundColor })} />
              <ColorField label="Textos" value={config.textColor} onChange={textColor => updateConfig({ textColor })} />
            </div>
          </details>

          <details className="group rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <summary className="cursor-pointer list-none">{config.template === 'professional' ? 'Faixa de preço e rodapé' : 'CTA'}</summary>
            <div className="mt-3 space-y-3">
              <TextField label={config.template === 'professional' ? 'Texto do rodapé' : 'Texto do botão'} value={config.cta} onChange={cta => updateConfig({ cta })} />
              <ColorField label={config.template === 'professional' ? 'Faixa de preço' : 'Botão'} value={config.buttonColor} onChange={buttonColor => updateConfig({ buttonColor })} />
              <ColorField label={config.template === 'professional' ? 'Valor promocional' : 'Texto do botão'} value={config.buttonTextColor} onChange={buttonTextColor => updateConfig({ buttonTextColor })} />
            </div>
          </details>

          <details className="group rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <summary className="cursor-pointer list-none font-bold">Template</summary>
            <div className="mt-3 space-y-3">
              <label className="block text-sm font-medium">Layout da arte
                <select aria-label="Template da arte" value={config.template} onChange={event => changeTemplate(event.target.value as ArtTemplate)} className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2">
                  {ART_TEMPLATES.map(template => <option key={template} value={template} disabled={free && template === 'professional'}>{templateName(template)}{free && template === 'professional' ? ' · Pro' : ''}</option>)}
                </select>
              </label>
              {business && <div className="space-y-2 border-t pt-3">
                <label className="block text-sm font-medium">Template salvo
                  <select defaultValue="" className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2" onChange={event => {
                    const selected = customTemplates.find(item => item.id === Number(event.currentTarget.value))
                    if (selected && ART_TEMPLATES.includes(selected.configuration.template)) {
                      updateConfig(normalizeArtworkConfig({
                        ...selected.configuration, brand: config.brand, productName: config.productName,
                        salePrice: config.salePrice, originalPrice: config.originalPrice, discount: config.discount,
                      }))
                    }
                    event.currentTarget.value = ''
                  }}><option value="">Escolher template</option>
                    {customTemplates.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
                  </select>
                </label>
                <TextField label="Nome do template" value={templateNameInput} onChange={value => setTemplateNameInput(value.slice(0, 120))} />
                <button type="button" className="rounded-lg border px-3 py-2 text-sm" disabled={templateBusy || !templateNameInput.trim()} onClick={() => void saveReusableTemplate()}>Salvar como template</button>
                {templateStatus && <p role="status" className="text-sm">{templateStatus}</p>}
              </div>}
            </div>
          </details>
          <details className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <summary className="cursor-pointer font-bold">Composição da arte</summary>
            <div className="mt-3"><ProfessionalOfferControls config={config} productCategory={product.category} onChange={updateConfig} onLogoChange={updateConfig} /></div>
          </details>
        </aside>

        <section className="min-w-0 rounded-2xl border border-slate-200 bg-slate-100 p-3 dark:border-slate-800 dark:bg-slate-900/50 sm:p-5 xl:sticky xl:top-24 xl:max-h-[calc(100dvh-7rem)] xl:overflow-y-auto">
          <div className="mx-auto mb-4 flex max-w-[620px] items-center justify-between text-xs font-semibold text-slate-500">
            <span>PRÉVIA DA PEÇA</span>
            <span>1080 × {config.template === 'professional' ? config.height ?? 1080 : 1080}</span>
          </div>
          <ArtworkCanvas
            product={product}
            config={config}
            selectedElement={selectedElement}
            onSelectElement={setSelectedElement}
            onConfigChange={updateConfig}
            onDragStart={() => {}}
            onDragEnd={() => {}}
          />
          {exportError && <p role="alert" className="mx-auto mt-3 max-w-[620px] text-sm text-red-600">{exportError}</p>}
          <p className="mx-auto mt-3 max-w-[620px] text-sm">1 crédito por arte exportada. <a href="/plans" className="underline">Ver planos</a></p>
          <div className="mx-auto mt-4 flex max-w-[620px] flex-wrap gap-2">
            <button type="button" disabled={exporting} onClick={() => void download('png')} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
              <Download size={16} /> {exporting ? 'Exportando...' : 'Baixar PNG'}
            </button>
            <button type="button" disabled={exporting || free} onClick={() => void download('jpeg')} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900">
              {free ? 'Baixar JPG · Pro' : 'Baixar JPG'}
            </button>
            <button type="button" disabled={exporting || free} onClick={() => void download('pdf')} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">
              {free ? 'Baixar PDF · Pro' : 'Baixar PDF'}
            </button>
          </div>
        </section>
      </div>
    </div>
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
