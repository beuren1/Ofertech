import { checkArtworkCredits, confirmArtworks, type Billing } from '../billing'
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import JSZip from 'jszip'
import { bannerPdf } from '../flyerExport'
import { CheckCircle2, ImagePlus, Sparkles, Upload } from 'lucide-react'
import { apiBlobRequest, apiRequest, apiUpload, getErrorMessage, useAuth } from '../auth'
import {
  campaignAssetContentPath,
  campaignThumbnailContentPath,
  createCampaignThumbnail,
  toCampaignArtworkSnapshot,
} from '../campaigns'
import type { CampaignListResponse, SavedCampaign } from '../campaigns'
import {
  ART_TEMPLATES,
  changeArtworkTemplate,
  createArtworkConfig,
  getPhotoCompatibilityWarning,
  loadProductImage,
  normalizeArtworkConfig,
  parseProductCsv,
  productFilename,
  renderArtworkBlob,
  renderArtworkCanvas,
  templateName,
  type ArtElement,
  type ArtFormat,
  type ArtTemplate,
  type ArtworkConfig,
  type BulkProduct,
} from '../bulk'
import { readProductImage, saveProductImage } from '../imageStore'
import { ArtworkEditor, type ArtworkItem } from '../components/ArtworkEditor'

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]
const IMAGE_TYPES = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
])

type SavedPromotion = {
  id: number
  title: string
  configuration: Record<string, unknown>
}

type BulkResponse = {
  created: number
  promotions: SavedPromotion[]
}

function isArtworkConfig(value: unknown): value is ArtworkConfig {
  if (!value || typeof value !== 'object') return false
  const config = value as Partial<ArtworkConfig>
  return ART_TEMPLATES.includes(config.template as ArtTemplate)
    && typeof config.productName === 'string'
    && typeof config.positions === 'object'
    && config.positions !== null
    && typeof config.backgroundColor === 'string'
}

function recordValue(record: Record<string, unknown>, key: string) {
  return typeof record[key] === 'string' ? record[key] : ''
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined
}

async function uploadCampaignImages(
  campaignId: number,
  artworks: ArtworkItem[],
  accessToken: string,
) {
  const persisted: ArtworkItem[] = []
  for (const artwork of artworks) {
    if (!artwork.product.localImageKey || artwork.product.imageAssetId) {
      persisted.push(artwork)
      continue
    }
    const image = await readProductImage(artwork.product.localImageKey)
    if (!image) {
      throw new Error(`A foto de ${artwork.product.name} não está mais disponível neste navegador.`)
    }
    const extension = `.${artwork.product.imageName?.split('.').pop()?.toLowerCase() ?? 'png'}`
    const contentType = IMAGE_TYPES.get(extension) || image.type || 'image/png'
    const file = new File(
      [image],
      artwork.product.imageName || `produto-${artwork.index + 1}.png`,
      { type: contentType },
    )
    const asset = await apiUpload<{ id: number }>(
      `campaigns/${campaignId}/assets/`,
      file,
      accessToken,
    )
    persisted.push({
      ...artwork,
      product: { ...artwork.product, imageAssetId: asset.id },
    })
  }
  return persisted
}

function createDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function serverConfiguration(artwork: ArtworkItem, batchId: string) {
  const remoteImageUrl = artwork.product.imageUrl.startsWith('blob:')
    ? artwork.product.sourceImageUrl || ''
    : artwork.product.imageUrl
  return {
    batch_id: batchId,
    product_index: artwork.index,
    product_name: artwork.product.name,
    category: artwork.product.category,
    price: artwork.config.salePrice,
    original_price: artwork.config.originalPrice,
    discount: artwork.config.discount,
    image_url: remoteImageUrl,
    image_name: artwork.product.imageName || '',
    local_image_key: artwork.product.localImageKey || '',
    image_asset_id: artwork.product.imageAssetId,
    format: artwork.config.template === 'professional' && artwork.config.height && artwork.config.height > 1080
      ? `1080x${artwork.config.height}`
      : 'square',
    template: artwork.config.template,
    image_filename: productFilename(artwork.product, artwork.index),
    image_warning: artwork.imageWarning || '',
    editor: normalizeArtworkConfig(artwork.config),
  }
}

function Thumbnail({ artwork, onOpen }: { artwork: ArtworkItem; onOpen: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const renderCanvas = document.createElement('canvas')
    let active = true
    void renderArtworkCanvas(renderCanvas, artwork.product, artwork.config, null, undefined, 360)
      .then(() => {
        if (!active) return
        canvas.width = renderCanvas.width
        canvas.height = renderCanvas.height
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Não foi possível iniciar a prévia da arte.')
        context.drawImage(renderCanvas, 0, 0)
        setPreviewError(null)
      })
      .catch(reason => {
        if (active) setPreviewError(getErrorMessage(reason))
      })
    return () => {
      active = false
    }
  }, [artwork.product, artwork.config])

  return (
    <button
      type="button"
      aria-label={`Abrir editor da arte ${artwork.index + 1}: ${artwork.config.productName}`}
      onClick={onOpen}
      className="block w-full text-left"
    >
      {previewError
        ? <div className="grid aspect-square place-items-center rounded-lg bg-red-50 p-4 text-sm text-red-700">{previewError}</div>
        : <canvas ref={canvasRef} className="block h-auto w-full rounded-lg" />}
      <span className="mt-2 block truncate text-sm font-bold">{artwork.config.productName}</span>
      <span className="mt-1 block text-xs text-slate-500">{templateName(artwork.config.template)}</span>
    </button>
  )
}

function ProductRow({
  product,
  index,
  error,
  onUpload,
  onRemove,
  onImageError,
}: {
  product: BulkProduct
  index: number
  error: string | null
  onUpload: (index: number, file: File) => void
  onRemove: (index: number) => void
  onImageError: (index: number) => void
}) {
  const photoWarning = getPhotoCompatibilityWarning(product)

  return (
    <li className="flex flex-col gap-3 border-b border-slate-100 py-3 last:border-0 dark:border-slate-800 sm:flex-row sm:items-center">
      {product.imageUrl
        ? <img src={product.imageUrl} alt={`Foto de ${product.name}`} onError={() => onImageError(index)} className="h-20 w-20 rounded-lg bg-slate-100 object-contain" />
        : <div className="grid h-20 w-20 place-items-center rounded-lg bg-slate-100 text-slate-400 dark:bg-slate-800"><ImagePlus size={24} /></div>}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{product.name}</p>
        <p className="text-sm text-slate-500">
          {product.category || 'Categoria não informada'} ·{' '}
          {product.originalPrice && <del className="mr-1">{product.originalPrice}</del>}
          {product.price || 'Sem preço promocional'}
        </p>
        {error
          ? <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>
          : photoWarning
            ? <p role="status" className="mt-1 text-xs text-amber-700">{photoWarning}</p>
          : !product.imageUrl
            ? <p className="mt-1 text-xs text-amber-700">Sem foto. Adicione uma para não usar a ilustração identificada na arte.</p>
            : product.imageAssetId
              ? <p className="mt-1 text-xs text-emerald-700">Foto salva na campanha</p>
            : product.localImageKey
              ? <p className="mt-1 text-xs text-emerald-700">Foto carregada neste navegador</p>
              : <p className="mt-1 text-xs text-slate-500">Foto do CSV; será verificada ao renderizar.</p>}
      </div>
      <div className="flex gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border px-3 py-2 text-sm font-semibold">
          <Upload size={15} /> {product.imageUrl ? 'Trocar foto' : 'Adicionar foto'}
          <input
            aria-label={`Foto para ${product.name}`}
            type="file"
            accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
            className="sr-only"
            onChange={event => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ''
              if (file) onUpload(index, file)
            }}
          />
        </label>
        {product.imageUrl && <button type="button" onClick={() => onRemove(index)} className="rounded-lg border px-3 py-2 text-sm">Remover</button>}
      </div>
    </li>
  )
}

export function BulkPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [fileName, setFileName] = useState('')
  const [products, setProducts] = useState<BulkProduct[]>([])
  const [requestedCount, setCount] = useState(24)
  const [parsing, setParsing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [fileError, setFileError] = useState<string | null>(null)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [uploadErrors, setUploadErrors] = useState<Record<number, string>>({})
  const [arts, setArts] = useState<ArtworkItem[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [activeArtId, setActiveArtId] = useState<string | null>(null)
  const [batchId, setBatchId] = useState<string | null>(null)
  const [campaignId, setCampaignId] = useState<number | null>(null)
  const [campaignName, setCampaignName] = useState('Nova campanha')
  const [restoring, setRestoring] = useState(false)
  const [zipBusy, setZipBusy] = useState(false)
  const [zipError, setZipError] = useState<string | null>(null)
  const [scope, setScope] = useState<'current' | 'all'>('current')
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [history, setHistory] = useState<{ past: ArtworkItem[][]; future: ArtworkItem[][] }>({ past: [], future: [] })
  const { accessToken, user } = useAuth()
  const plan = user?.profile.plan
  const free = plan === 'free'
  const batchLimit = free ? 5 : plan === 'pro' ? 50 : 100
  const count = Math.min(requestedCount, batchLimit)
  const pendingBatch = useRef<{ id: string; products: BulkProduct[]; count: number; rendered: Blob[]; generated: ArtworkItem[] }>()
  const batchQuery = searchParams.get('batch_id')
  const campaignQuery = searchParams.get('campaign_id')
  const activeArt = arts.find(art => art.key === activeArtId) ?? null
  const objectUrls = useRef(new Set<string>())
  const dragSnapshot = useRef<ArtworkItem[] | null>(null)
  const restoredBatch = useRef('')
  const editRevision = useRef(0)
  const saving = useRef(false)
  const saveRequested = useRef(false)
  const latestSave = useRef<() => Promise<void>>(async () => {})
  const editorRef = useRef<HTMLElement>(null)

  useEffect(() => () => {
    objectUrls.current.forEach(url => URL.revokeObjectURL(url))
    objectUrls.current.clear()
  }, [])

  useEffect(() => {
    if ((!batchQuery && !campaignQuery) || !accessToken) return
    const restoreKey = campaignQuery ? `campaign:${campaignQuery}` : `batch:${batchQuery}`
    if (restoredBatch.current === restoreKey) return
    let active = true
    setRestoring(true)
    setGenerationError(null)
    if (campaignQuery) {
      void apiRequest<SavedCampaign>(`campaigns/${encodeURIComponent(campaignQuery)}/`, {
        accessToken,
      }).then(async campaign => {
        const restored = await Promise.all(campaign.artworks.map(async (artwork, listIndex) => {
          const data = artwork as unknown as Record<string, unknown>
          const productData = data.product && typeof data.product === 'object'
            ? data.product as Record<string, unknown>
            : {}
          const index = numberValue(data.index) ?? listIndex
          const imageAssetId = numberValue(productData.image_asset_id)
          let imageUrl = recordValue(productData, 'image_url')
            || recordValue(productData, 'imageUrl')
          let imageWarning = recordValue(data, 'image_warning')
            || recordValue(data, 'imageWarning')
            || null
          if (imageAssetId) {
            try {
              const blob = await apiBlobRequest(
                campaignAssetContentPath(campaign.id, imageAssetId),
                accessToken,
              )
              imageUrl = URL.createObjectURL(blob)
              objectUrls.current.add(imageUrl)
            } catch (reason) {
              imageWarning = `Não foi possível recuperar a foto salva: ${getErrorMessage(reason)}`
            }
          }
          const sourceImageUrl = recordValue(productData, 'source_image_url')
            || recordValue(productData, 'sourceImageUrl')
            || imageUrl
          if (imageUrl && !imageAssetId && !imageWarning) {
            const loaded = await loadProductImage(imageUrl)
            if (!loaded.image) imageWarning = loaded.error || 'Não foi possível carregar a foto.'
          }
          const product: BulkProduct = {
            name: recordValue(productData, 'name') || 'Produto sem nome',
            category: recordValue(productData, 'category'),
            price: recordValue(productData, 'price'),
            originalPrice: recordValue(productData, 'original_price')
              || recordValue(productData, 'originalPrice'),
            discount: recordValue(productData, 'discount'),
            imageUrl,
            imageName: recordValue(productData, 'image_name')
              || recordValue(productData, 'imageName')
              || undefined,
            sourceImageUrl,
            imageAssetId,
          }
          const config = isArtworkConfig(data.config)
            ? normalizeArtworkConfig(data.config)
            : createArtworkConfig(product, index)
          const promotionId = numberValue(data.promotion_id)
          const status = data.status === 'error' ? 'error' : 'ready'
          return {
            key: String(promotionId ?? `campaign-${campaign.id}-${index}`),
            index,
            promotionId,
            product: {
              ...product,
              name: config.productName,
              price: config.salePrice,
              originalPrice: config.originalPrice,
              discount: config.discount,
            },
            config,
            status,
            error: recordValue(data, 'error') || null,
            imageWarning,
          } satisfies ArtworkItem
        }))
        if (active) {
          restoredBatch.current = restoreKey
          setArts(restored)
          setProducts(restored.map(art => art.product))
          setCount(Math.min(restored.length || 1, 100))
          setFileName('Campanha salva · configurações recuperadas')
          setBatchId(campaign.batch_id || null)
          setCampaignId(campaign.id)
          setCampaignName(campaign.name)
          setActiveArtId(restored[0]?.key ?? null)
          setSelectedIds(new Set())
          setSaveState('saved')
          setSaveError(null)
        }
      }).catch(reason => {
        if (active) {
          setGenerationError(`Não foi possível recuperar esta campanha: ${getErrorMessage(reason)}`)
          restoredBatch.current = ''
        }
      }).finally(() => {
        if (active) setRestoring(false)
      })
      return () => {
        active = false
      }
    }

    if (!batchQuery) return
    const legacyBatchId = batchQuery
    void apiRequest<BulkResponse>(`promotions/bulk/?batch_id=${encodeURIComponent(legacyBatchId)}`, {
      accessToken,
    }).then(async result => {
      const restored = await Promise.all(result.promotions.map(async (promotion, listIndex) => {
        const data = promotion.configuration
        const indexValue = data.product_index
        const index = typeof indexValue === 'number' ? indexValue : listIndex
        const localImageKey = recordValue(data, 'local_image_key') || undefined
        let imageUrl = recordValue(data, 'image_url')
        let restoreWarning = recordValue(data, 'image_warning') || null
        if (localImageKey) {
          try {
            const blob = await readProductImage(localImageKey)
            if (blob) {
              imageUrl = URL.createObjectURL(blob)
              objectUrls.current.add(imageUrl)
            } else if (!imageUrl) {
              restoreWarning = 'A foto enviada anteriormente não está neste navegador. Adicione a foto novamente.'
            }
          } catch (reason) {
            restoreWarning = getErrorMessage(reason)
          }
        }
        if (imageUrl && !restoreWarning) {
          const loaded = await loadProductImage(imageUrl)
          if (!loaded.image) restoreWarning = loaded.error || 'Não foi possível carregar a foto.'
        }
        const product: BulkProduct = {
          name: recordValue(data, 'product_name') || promotion.title,
          category: recordValue(data, 'category'),
          price: recordValue(data, 'price'),
          originalPrice: recordValue(data, 'original_price'),
          discount: recordValue(data, 'discount'),
          imageUrl,
          imageName: recordValue(data, 'image_name') || undefined,
          sourceImageUrl: recordValue(data, 'image_url'),
          localImageKey,
        }
        const config = isArtworkConfig(data.editor)
          ? normalizeArtworkConfig(data.editor)
          : createArtworkConfig(product, index)
        const restoredProduct = {
          ...product,
          name: config.productName,
          price: config.salePrice,
          originalPrice: config.originalPrice,
          discount: config.discount,
        }
        return {
          key: String(promotion.id),
          index,
          promotionId: promotion.id,
          product: restoredProduct,
          config,
          status: 'ready' as const,
          error: null,
          imageWarning: restoreWarning,
        }
      }))
      const campaignResults = await apiRequest<CampaignListResponse>(
        `campaigns/?batch_id=${encodeURIComponent(legacyBatchId)}`,
        { accessToken },
      )
      const savedCampaign = campaignResults.results[0]
      if (active) {
        restoredBatch.current = restoreKey
        setArts(restored)
        setProducts(restored.map(art => art.product))
        setCount(Math.min(restored.length, 100))
        setFileName('Lote salvo · configurações recuperadas')
        setBatchId(legacyBatchId)
        setCampaignId(savedCampaign?.id ?? null)
        setCampaignName(savedCampaign?.name ?? 'Nova campanha')
        setActiveArtId(restored[0]?.key ?? null)
        setSelectedIds(new Set())
        setSaveState('saved')
        setSaveError(null)
      }
    }).catch(reason => {
      if (active) {
        setGenerationError(`Não foi possível recuperar este lote: ${getErrorMessage(reason)}`)
        restoredBatch.current = ''
      }
    }).finally(() => {
      if (active) setRestoring(false)
    })
    return () => {
      active = false
    }
  }, [batchQuery, campaignQuery, accessToken])

  useEffect(() => {
    if (activeArtId && arts.some(art => art.key === activeArtId)) {
      editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [activeArtId, arts.length])

  const commitArts = (next: ArtworkItem[]) => {
    editRevision.current += 1
    setHistory(current => ({
      past: [...current.past, arts].slice(-30),
      future: [],
    }))
    setArts(next)
    setSaveState('dirty')
    setSaveError(null)
  }

  const restoreInput = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    setFileName(file.name)
    setFileError(null)
    setGenerationError(null)
    setProducts([])
    setArts([])
    setBatchId(null)
    setCampaignId(null)
    setSelectedIds(new Set())
    setHistory({ past: [], future: [] })
    setActiveArtId(null)
    setSelectedIds(new Set())
    setHistory({ past: [], future: [] })
    setSearchParams({})
    setRestoring(false)
    restoredBatch.current = ''

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setFileError('Envie um arquivo CSV. Arquivos XLSX não são suportados.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setFileError('O CSV deve ter no máximo 10 MB.')
      return
    }

    setParsing(true)
    try {
      const parsed = parseProductCsv(await file.text())
      setProducts(parsed.map(product => ({ ...product, sourceImageUrl: product.imageUrl })))
      setCount(Math.min(parsed.length, 24))
      setUploadErrors({})
    } catch (reason) {
      setFileError(getErrorMessage(reason))
    } finally {
      setParsing(false)
    }
  }

  const uploadProductPhoto = async (index: number, file: File | null) => {
    const currentProduct = products[index] ?? arts.find(art => art.index === index)?.product
    if (!currentProduct) return

    if (!file) {
      const restoredUrl = currentProduct.sourceImageUrl || ''
      const updatedProduct = {
        ...currentProduct,
        imageUrl: restoredUrl,
        imageName: undefined,
        localImageKey: undefined,
        imageAssetId: undefined,
      }
      setProducts(current => current.map((product, productIndex) => productIndex === index ? updatedProduct : product))
      const updatedArts = arts.map(art => art.index === index ? { ...art, product: updatedProduct, imageWarning: restoredUrl ? 'Imagem do CSV será validada ao renderizar.' : 'Foto removida; uma ilustração identificada será usada até adicionar outra.' } : art)
      if (arts.some(art => art.index === index)) commitArts(updatedArts)
      return
    }

    const extension = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`
    const expectedMime = IMAGE_TYPES.get(extension)
    if (!expectedMime || (file.type && file.type !== expectedMime)) {
      throw new Error('Use uma foto PNG, JPG ou WebP.')
    }
    if (file.size > 10 * 1024 * 1024) throw new Error('A foto deve ter no máximo 10 MB.')

    const url = URL.createObjectURL(file)
    const probe = await loadProductImage(url)
    if (!probe.image) {
      URL.revokeObjectURL(url)
      throw new Error(probe.error || 'Não foi possível abrir esta imagem.')
    }
    const localImageKey = await saveProductImage(file)
    objectUrls.current.add(url)
    const updatedProduct: BulkProduct = {
      ...currentProduct,
      imageUrl: url,
      imageName: file.name,
      sourceImageUrl: currentProduct.localImageKey
        ? currentProduct.sourceImageUrl
        : currentProduct.imageUrl,
      localImageKey,
      imageAssetId: undefined,
    }
    setProducts(current => current.map((product, productIndex) => productIndex === index ? updatedProduct : product))
    const updatedArts = arts.map(art => art.index === index
      ? { ...art, product: updatedProduct, imageWarning: null }
      : art)
    if (arts.some(art => art.index === index)) commitArts(updatedArts)
    setUploadErrors(current => {
      const next = { ...current }
      delete next[index]
      return next
    })
  }

  const uploadPhotoFromRow = (index: number, file: File) => {
    void uploadProductPhoto(index, file).catch(reason => {
      setUploadErrors(current => ({ ...current, [index]: getErrorMessage(reason) }))
    })
  }

  const removePhotoFromRow = (index: number) => {
    void uploadProductPhoto(index, null).catch(reason => {
      setUploadErrors(current => ({ ...current, [index]: getErrorMessage(reason) }))
    })
  }

  const updateGeneratedProduct = (index: number) => async (file: File | null) => {
    await uploadProductPhoto(index, file)
  }

  const generate = async () => {
    if (generating || !accessToken || products.length < count || count < 1 || count > batchLimit) return
    setGenerating(true)
    setProgress(0)
    setGenerationError(null)
    setZipError(null)
    setSaveError(null)
    setArts([])
    setBatchId(null)
    setCampaignId(null)
    setSearchParams({})

    const pending = pendingBatch.current?.products === products && pendingBatch.current.count === count ? pendingBatch.current : undefined
    const newBatchId = pending?.id ?? crypto.randomUUID()
    try {
      await checkArtworkCredits(accessToken, newBatchId, count, 'png', false, true)
    } catch (reason) {
      setGenerationError(getErrorMessage(reason))
      setGenerating(false)
      return
    }

    const rendered: Blob[] = pending?.rendered ?? []
    const selectedProducts = products.slice(0, count)
    const generated: ArtworkItem[] = pending?.generated ?? []
    for (let index = generated.length; index < selectedProducts.length; index += 1) {
      const product = selectedProducts[index]
      const config = createArtworkConfig(product, index)
      try {
        const result = await renderArtworkBlob(product, config, 'png')
        const signature = Array.from(new Uint8Array(await result.blob.slice(0, 8).arrayBuffer()))
        if (!PNG_SIGNATURE.every((byte, position) => signature[position] === byte)) {
          throw new Error('O navegador retornou uma imagem PNG inválida.')
        }
        rendered.push(result.blob)
        generated.push({
          key: String(index),
          index,
          product,
          config,
          status: 'ready',
          error: null,
          imageWarning: result.usedProductImage
            ? null
            : result.imageError || 'Sem foto: a ilustração da categoria está identificada na arte.',
        })
      } catch (reason) {
        generated.push({
          key: String(index),
          index,
          product,
          config,
          status: 'error',
          error: getErrorMessage(reason),
          imageWarning: null,
        })
      }
      setProgress(index + 1)
    }

    const ready = generated.filter(art => art.status === 'ready')
    if (!ready.length) {
      setArts(generated)
      setGenerationError('Nenhuma arte pôde ser renderizada. Revise as fotos e tente novamente.')
      setGenerating(false)
      return
    }

    try {
      pendingBatch.current = { id: newBatchId, products, count, rendered, generated }
      await confirmArtworks(accessToken, newBatchId, rendered, false, true)
    } catch (reason) {
      setGenerationError(getErrorMessage(reason))
      setGenerating(false)
      return
    }
    setArts(generated)
    setActiveArtId(ready[0].key)
    let createdCampaignId: number | null = null
    try {
      const campaign = await apiRequest<SavedCampaign>('campaigns/', {
        method: 'POST',
        accessToken,
        body: {
          name: campaignName.trim(),
          batch_id: newBatchId,
          artworks: [],
        },
      })
      createdCampaignId = campaign.id
      const artsWithAssets = await uploadCampaignImages(campaign.id, generated, accessToken)
      const readyArts = artsWithAssets.filter(art => art.status === 'ready')

      const result = await apiRequest<BulkResponse>('promotions/bulk/', {
        method: 'POST',
        accessToken,
        body: {
          campaign_id: campaign.id,
          promotions: readyArts.map(art => ({
            title: art.config.productName,
            channel: 'Instagram',
            status: 'ready',
            configuration: serverConfiguration(art, newBatchId),
          })),
        },
      })
      if (result.created !== ready.length) throw new Error('O servidor não confirmou todas as artes.')
      const savedByIndex = new Map(result.promotions.map(promotion => [
        Number(promotion.configuration.product_index),
        promotion,
      ]))
      const savedArts = artsWithAssets.map(art => ({
        ...art,
        promotionId: savedByIndex.get(art.index)?.id,
      }))
      const thumbnailArtwork = savedArts.find(art => art.status === 'ready')
      if (!thumbnailArtwork) throw new Error('Não há uma arte pronta para gerar a miniatura.')
      const thumbnail = await createCampaignThumbnail(thumbnailArtwork.product, thumbnailArtwork.config)
      await apiUpload(
        `campaigns/${campaign.id}/thumbnail-upload/`,
        thumbnail,
        accessToken,
      )
      await apiRequest<SavedCampaign>(`campaigns/${campaign.id}/`, {
        method: 'PATCH',
        accessToken,
        body: {
          name: campaignName.trim(),
          batch_id: newBatchId,
          artworks: savedArts.map(toCampaignArtworkSnapshot),
        },
      })
      setArts(savedArts)
      setProducts(savedArts.map(art => art.product))
      setBatchId(newBatchId)
      setCampaignId(campaign.id)
      setSearchParams({ campaign_id: String(campaign.id), batch_id: newBatchId })
      setSaveState('saved')
      setSaveError(null)
      pendingBatch.current = undefined
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
      setGenerationError(`As imagens foram renderizadas, mas a campanha não foi salva: ${getErrorMessage(reason)}.${cleanupMessage}`)
      setSaveState('error')
    } finally {
      setGenerating(false)
    }
  }

  async function checkExportPlan(items: ArtworkItem[], format: ArtFormat | 'pdf') {
    if (!accessToken) throw new Error('Entre para exportar a campanha.')
    const account = await apiRequest<Billing>('billing/', { accessToken })
    if (account.plan.code === 'free' && (format !== 'png' || items.some(item => item.config.template === 'professional'))) {
      throw new Error('JPG, PDF e Oferta Profissional exigem Pro ou Business. Consulte Planos e créditos.')
    }
    if (items.length > (account.plan.limits?.batch ?? batchLimit)) throw new Error('A seleção excede o limite de exportação do seu plano.')
  }

  const downloadArtwork = async (artwork: ArtworkItem, format: ArtFormat | 'pdf') => {
    try {
      await checkExportPlan([artwork], format)
      const result = await renderArtworkBlob(artwork.product, artwork.config, format === 'pdf' ? 'jpeg' : format)
      if (result.imageError) throw new Error(result.imageError)
      const blob = format === 'pdf' ? await bannerPdf([{ jpeg: result.blob, height: artwork.config.template === 'professional' ? artwork.config.height ?? 1080 : 1080 }]) : result.blob
      createDownload(blob, productFilename(artwork.product, artwork.index, format === 'jpeg' ? 'jpg' : format))
    } catch (reason) {
      setZipError(`${artwork.config.productName}: ${getErrorMessage(reason)}`)
    }
  }

  const downloadBatch = async (format: ArtFormat | 'pdf', onlySelected: boolean) => {
    const items = arts.filter(art => art.status === 'ready'
      && (!onlySelected || selectedIds.has(art.key)))
    if (!items.length) {
      setZipError(onlySelected ? 'Selecione ao menos uma arte pronta.' : 'Nenhuma arte está pronta para exportação.')
      return
    }
    setZipBusy(true)
    setZipError(null)
    try {
      await checkExportPlan(items, format)
      const zip = new JSZip()
      const pdfPages: { jpeg: Blob; height: number }[] = []
      const extension = format === 'jpeg' ? 'jpg' : 'png'
      const failures: string[] = []
      for (const artwork of items) {
        try {
          const result = await renderArtworkBlob(artwork.product, artwork.config, format === 'pdf' ? 'jpeg' : format)
          if (result.imageError) throw new Error(result.imageError)
          if (format === 'pdf') pdfPages.push({ jpeg: result.blob, height: artwork.config.template === 'professional' ? artwork.config.height ?? 1080 : 1080 })
          else zip.file(productFilename(artwork.product, artwork.index, extension), result.blob)
        } catch (reason) {
          failures.push(`${artwork.config.productName}: ${getErrorMessage(reason)}`)
        }
      }
      if (failures.length === items.length) throw new Error(failures.join(' · '))
      const archive = format === 'pdf' ? await bannerPdf(pdfPages) : await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
      createDownload(archive, `ofertech-${items.length - failures.length}-artes.${format === 'pdf' ? 'pdf' : `${extension}.zip`}`)
      if (failures.length) setZipError(`Alguns produtos não foram incluídos: ${failures.join(' · ')}`)
    } catch (reason) {
      setZipError(getErrorMessage(reason))
    } finally {
      setZipBusy(false)
    }
  }

  const updateArtworkConfig = (patch: Partial<ArtworkConfig>, applyToAll = false) => {
    if (!activeArt) return
    const targets = applyToAll ? arts : arts.filter(art => art.key === activeArt.key)
    const targetIds = new Set(targets.map(art => art.key))
    commitArts(arts.map(art => {
      if (!targetIds.has(art.key)) return art
      const positions = { ...art.config.positions }
      if (patch.positions) {
        for (const element of Object.keys(patch.positions) as ArtElement[]) {
          const next = patch.positions[element]
          if (!next) continue
          const current = activeArt.config.positions[element]
          const target = positions[element]
          positions[element] = applyToAll
            ? {
                x: next.x === current.x ? target.x : next.x,
                y: next.y === current.y ? target.y : next.y,
                width: next.width === current.width ? target.width : next.width,
                height: next.height === current.height ? target.height : next.height,
              }
            : next
        }
      }
      return {
        ...art,
        product: patch.productName === undefined
          ? art.product
          : { ...art.product, name: patch.productName },
        config: normalizeArtworkConfig({
          ...art.config, ...patch, positions,
          presentation: patch.presentation ? { ...art.config.presentation, ...patch.presentation } : art.config.presentation,
        }),
      }
    }))
  }

  const updateArtworkTemplate = (template: ArtTemplate, applyToAll: boolean) => {
    if (!activeArt) return
    const targetIds = new Set((applyToAll ? arts : [activeArt]).map(art => art.key))
    commitArts(arts.map(art => targetIds.has(art.key)
      ? {
          ...art,
          config: changeArtworkTemplate(art.product, art.config, template, art.index),
        }
      : art))
  }

  const changeDraggedConfig = (config: ArtworkConfig) => {
    if (!activeArt) return
    setArts(current => current.map(art => art.key === activeArt.key
      ? { ...art, config: normalizeArtworkConfig(config) }
      : art))
  }

  const beginDrag = () => {
    dragSnapshot.current = arts
  }

  const finishDrag = () => {
    if (dragSnapshot.current) {
      editRevision.current += 1
      const snapshot = dragSnapshot.current
      setHistory(current => ({ past: [...current.past, snapshot].slice(-30), future: [] }))
      setSaveState('dirty')
      dragSnapshot.current = null
    }
  }

  const undo = () => {
    if (!history.past.length) return
    editRevision.current += 1
    const previous = history.past[history.past.length - 1]
    setHistory(current => ({
      past: current.past.slice(0, -1),
      future: [...current.future, arts].slice(-30),
    }))
    setArts(previous)
    setSaveState('dirty')
  }

  const redo = () => {
    if (!history.future.length) return
    editRevision.current += 1
    const next = history.future[history.future.length - 1]
    setHistory(current => ({
      past: [...current.past, arts].slice(-30),
      future: current.future.slice(0, -1),
    }))
    setArts(next)
    setSaveState('dirty')
  }

  const saveEdits = useCallback(async () => {
    if (saving.current) {
      saveRequested.current = true
      return
    }
    if (!campaignId || !accessToken) {
      setSaveState('error')
      setSaveError('Esta campanha ainda não está salva no servidor.')
      return
    }
    if (!campaignName.trim()) {
      setSaveState('error')
      setSaveError('Informe um nome para a campanha.')
      return
    }
    const readyArts = arts.filter(art => art.status === 'ready')
    if (!readyArts.length) {
      setSaveState('error')
      setSaveError('Não há artes prontas para atualizar.')
      return
    }
    const revision = editRevision.current
    saving.current = true
    setSaveState('saving')
    setSaveError(null)
    try {
      const artsWithAssets = await uploadCampaignImages(campaignId, arts, accessToken)
      setArts(artsWithAssets)
      const productsByIndex = new Map(artsWithAssets.map(art => [art.index, art.product]))
      setProducts(current => current.map((product, index) => productsByIndex.get(index) ?? product))
      const thumbnailArtwork = artsWithAssets.find(art => art.status === 'ready')
      if (!thumbnailArtwork) throw new Error('Não há uma arte pronta para gerar a miniatura.')
      const thumbnail = await createCampaignThumbnail(thumbnailArtwork.product, thumbnailArtwork.config)
      await apiUpload(
        `campaigns/${campaignId}/thumbnail-upload/`,
        thumbnail,
        accessToken,
      )
      await apiRequest<SavedCampaign>(`campaigns/${campaignId}/`, {
        method: 'PATCH',
        accessToken,
        body: {
          name: campaignName.trim(),
          batch_id: batchId || '',
          artworks: artsWithAssets.map(toCampaignArtworkSnapshot),
        },
      })
      const savedArtsWithAssets = artsWithAssets.filter(
        art => art.status === 'ready' && art.promotionId,
      )
      if (savedArtsWithAssets.length && batchId) {
        await apiRequest<BulkResponse>('promotions/bulk/', {
          method: 'PATCH',
          accessToken,
          body: {
            promotions: savedArtsWithAssets.map(art => ({
              id: art.promotionId,
              title: art.config.productName,
              configuration: serverConfiguration(art, batchId),
            })),
          },
        })
      }
      if (revision === editRevision.current) {
        setSaveState('saved')
        setSaveError(null)
      } else {
        setSaveState('dirty')
      }
    } catch (reason) {
      if (revision === editRevision.current) {
        setSaveState('error')
        setSaveError(getErrorMessage(reason))
      } else {
        setSaveState('dirty')
      }
    } finally {
      saving.current = false
      if (saveRequested.current || revision !== editRevision.current) {
        saveRequested.current = false
        setSaveState('dirty')
        window.setTimeout(() => void latestSave.current(), 0)
      }
    }
  }, [accessToken, arts, batchId, campaignId, campaignName])
  latestSave.current = saveEdits

  useEffect(() => {
    if (saveState !== 'dirty' || !campaignId) return
    const timeout = window.setTimeout(() => void saveEdits(), 900)
    return () => window.clearTimeout(timeout)
  }, [arts, batchId, campaignId, campaignName, saveEdits, saveState])

  const selectArt = (key: string) => {
    setActiveArtId(key)
    setSelectedIds(current => new Set(current).add(key))
  }

  const toggleSelected = (key: string) => {
    setSelectedIds(current => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleAllSelected = () => {
    const ready = arts.filter(art => art.status === 'ready')
    setSelectedIds(current => current.size === ready.length
      ? new Set()
      : new Set(ready.map(art => art.key)))
  }

  const quantities = free ? [1, 2, 3, 4, 5] : Array.from(new Set([
    12,
    24,
    50,
    100,
    ...(products.length > 0 && products.length <= 100 ? [products.length] : []),
  ])).filter(quantity => quantity <= batchLimit).sort((left, right) => left - right)
  const canGenerate = Boolean(
    accessToken && campaignName.trim() && products.length >= count && count > 0 && count <= batchLimit && !generating && !parsing,
  )
  const readyCount = arts.filter(art => art.status === 'ready').length
  const saveStatus = saveState === 'error'
    ? 'error'
    : saveState === 'saving'
      ? 'saving'
      : saveState === 'dirty'
        ? 'dirty'
        : 'saved'

  return (
    <div className="mx-auto max-w-7xl">
      <h1 className="text-3xl font-black">Criação em massa</h1>
      <p className="mt-2 text-slate-500">Importe produtos, revise cada arte e personalize sua campanha.</p>
      <p className="mt-2 text-sm">1 crédito por arte gerada · até {batchLimit} por lote. <a href="/plans" className="underline">Ver planos</a></p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
        <section className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="font-bold">1. Importar produtos</h2>
            <label className="mt-4 flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 text-center dark:border-slate-700 dark:bg-slate-950/40">
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={event => void restoreInput(event)} />
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><Upload /></span>
              <b className="mt-4">{fileName || 'Selecione seu CSV de produtos'}</b>
              <span className="mt-1 text-sm text-slate-500">{parsing ? 'Validando produtos...' : 'CSV até 10 MB'}</span>
            </label>
            {fileError && <p role="alert" className="mt-3 text-sm text-red-600">{fileError}</p>}
            {!fileError && products.length > 0 && (
              <div role="status" className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-3 text-sm text-emerald-700">
                <CheckCircle2 size={17} /> {products.length} produtos validados
              </div>
            )}
            {products.length > 0 && (
              <ul aria-label="Produtos importados" className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                {products.map((product, index) => (
                  <ProductRow
                    key={`${index}-${product.name}`}
                    product={product}
                    index={index}
                    error={uploadErrors[index] ?? null}
                    onUpload={uploadPhotoFromRow}
                    onRemove={removePhotoFromRow}
                    onImageError={rowIndex => setUploadErrors(current => ({
                      ...current,
                      [rowIndex]: 'A URL da foto falhou no preview; verifique a URL ou associe um arquivo local.',
                    }))}
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="font-bold">2. Configurar campanha</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold sm:col-span-2">Nome da campanha
                <input
                  aria-label="Nome da campanha"
                  value={campaignName}
                  maxLength={180}
                  onChange={event => {
                    setCampaignName(event.target.value)
                    if (campaignId) {
                      editRevision.current += 1
                      setSaveState('dirty')
                    }
                  }}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-transparent px-3 py-3 dark:border-slate-700"
                  placeholder="Ex.: Black Friday 2026"
                />
              </label>
              <label className="text-sm font-semibold">Quantidade
                <select value={count} onChange={event => setCount(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-slate-200 bg-transparent px-3 py-3 dark:border-slate-700">
                  {quantities.map(quantity => <option key={quantity} value={quantity}>{quantity}</option>)}
                </select>
              </label>
              <p className="self-end rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold dark:border-slate-700">Formato · Instagram 1080 × 1080</p>
            </div>
          </div>
        </section>

        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><Sparkles /></span>
          <h2 className="mt-5 text-xl font-bold">Resumo da geração</h2>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Produtos no CSV</dt><dd className="font-bold">{products.length || '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Artes selecionadas</dt><dd className="font-bold">{count}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Formato</dt><dd className="font-bold">1080 × 1080</dd></div>
          </dl>
          {products.length > 0 && products.length < count && (
            <p className="mt-4 text-sm text-amber-700">O CSV tem {products.length} produtos. Escolha essa quantidade ou importe mais produtos.</p>
          )}
          <button type="button" disabled={!canGenerate} onClick={() => void generate()} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">
            <Sparkles size={18} />
            {generating ? `Gerando ${progress}/${count}...` : `Gerar ${count} artes`}
          </button>
          {generating && <p role="status" className="mt-3 text-center text-sm text-slate-500">Renderizando imagens reais e preparando a galeria.</p>}
          {restoring && <p role="status" className="mt-3 text-center text-sm text-slate-500">Recuperando artes e configurações salvas...</p>}
          {generationError && <p role="alert" className="mt-4 text-sm text-red-600">{generationError}</p>}
          {arts.length > 0 && (
            <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">
              <p className="font-semibold">{readyCount} de {arts.length} artes prontas</p>
              <p className="mt-1 text-slate-500">{campaignId ? 'Campanha salva; alterações e fotos são sincronizadas automaticamente.' : 'Arquivos disponíveis para exportação local.'}</p>
            </div>
          )}
        </aside>
      </div>

      {arts.length > 0 && (
        <section className="mt-9" aria-labelledby="art-gallery-title">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="art-gallery-title" className="text-2xl font-black">Galeria de artes ({arts.length})</h2>
              <p className="mt-1 text-sm text-slate-500">Selecione várias artes para baixar ou abra uma miniatura para editar.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={toggleAllSelected} className="rounded-lg border px-3 py-2 text-sm font-semibold">
                {selectedIds.size === readyCount && readyCount > 0 ? 'Limpar seleção' : 'Selecionar todas'}
              </button>
              <button type="button" disabled={zipBusy || !selectedIds.size} onClick={() => void downloadBatch('png', true)} className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-40">
                ZIP PNG selecionadas ({selectedIds.size})
              </button>
              {!free && <button type="button" disabled={zipBusy || !readyCount} onClick={() => void downloadBatch('jpeg', false)} className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-40">
                ZIP JPG todas
              </button>}
              {!free && <button type="button" disabled={zipBusy || !readyCount} onClick={() => void downloadBatch('pdf', selectedIds.size > 0)} className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-40">
                {selectedIds.size ? 'PDF selecionadas' : 'PDF todas'}
              </button>}
              <button type="button" disabled={zipBusy || !readyCount} onClick={() => void downloadBatch('png', false)} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
                {zipBusy ? 'Preparando exportação...' : 'ZIP PNG todas'}
              </button>
            </div>
          </div>
          {zipError && <p role="alert" className="mt-3 text-sm text-red-600">{zipError}</p>}
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {arts.map(artwork => (
              <article key={artwork.key} className={`rounded-2xl border bg-white p-3 dark:bg-slate-900 ${activeArtId === artwork.key ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-slate-200 dark:border-slate-800'}`}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-xs font-semibold">
                    <input type="checkbox" checked={selectedIds.has(artwork.key)} onChange={() => toggleSelected(artwork.key)} aria-label={`Selecionar ${artwork.config.productName}`} className="h-4 w-4 accent-indigo-600" />
                    Selecionar
                  </label>
                  <span className={`rounded-full px-2 py-1 text-xs font-bold ${artwork.status === 'ready' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                    {artwork.status === 'ready' ? 'Pronta' : 'Erro'}
                  </span>
                </div>
                <Thumbnail artwork={artwork} onOpen={() => selectArt(artwork.key)} />
                {artwork.status === 'error'
                  ? <p role="alert" className="mt-2 text-xs text-red-600">{artwork.error}</p>
                  : artwork.imageWarning
                    ? <p className="mt-2 text-xs text-amber-700">{artwork.imageWarning}</p>
                    : null}
                <div className="mt-3 flex gap-2">
                  <button type="button" disabled={artwork.status !== 'ready'} onClick={() => void downloadArtwork(artwork, 'png')} className="flex-1 rounded-lg border px-2 py-2 text-xs font-semibold disabled:opacity-40">Baixar PNG</button>
                  {!free && <button type="button" disabled={artwork.status !== 'ready'} onClick={() => void downloadArtwork(artwork, 'jpeg')} className="flex-1 rounded-lg border px-2 py-2 text-xs font-semibold disabled:opacity-40">Baixar JPG</button>}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeArt && (
        <section ref={editorRef} className="scroll-mt-36">
          <ArtworkEditor
            free={free}
            artwork={activeArt}
            total={arts.length}
            scope={scope}
            onScopeChange={setScope}
            onConfigChange={updateArtworkConfig}
            onTemplateChange={updateArtworkTemplate}
            onDragConfigChange={changeDraggedConfig}
            onDragStart={beginDrag}
            onDragEnd={finishDrag}
            onPhotoChange={updateGeneratedProduct(activeArt.index)}
            onUndo={undo}
            onRedo={redo}
            canUndo={history.past.length > 0}
            canRedo={history.future.length > 0}
            onSave={() => void saveEdits()}
            saveState={saveStatus}
            saveError={saveError}
            onDownload={format => void downloadArtwork(activeArt, format)}
          />
        </section>
      )}
    </div>
  )
}
