import type { ArtworkItem } from './components/ArtworkEditor'
import { renderArtworkCanvas, type ArtworkConfig, type BulkProduct } from './bulk'
import type { StoreBrandSnapshot } from './stores'

export type CampaignArtworkSnapshot = {
  promotion_id?: number
  index: number
  product: {
    name: string
    category: string
    price: string
    original_price: string
    discount: string
    image_url: string
    image_name: string
    source_image_url: string
    image_asset_id?: number
  }
  config: ArtworkConfig
  status: 'ready' | 'error'
  error: string | null
  image_warning: string | null
}

export type SavedCampaign = {
  id: number
  name: string
  batch_id: string
  artworks: CampaignArtworkSnapshot[]
  store_brand: number | null
  brand_snapshot: StoreBrandSnapshot
  thumbnail_url: string | null
  created_at: string
  updated_at: string
}

export type CampaignListResponse = {
  count: number
  next: string | null
  previous: string | null
  results: SavedCampaign[]
}

export function campaignAssetContentPath(campaignId: number, assetId: number) {
  return `campaigns/${campaignId}/assets/${assetId}/content/`
}

export function campaignThumbnailContentPath(campaignId: number) {
  return `campaigns/${campaignId}/thumbnail/content/`
}

export async function createCampaignThumbnail(product: BulkProduct, config: ArtworkConfig) {
  const canvas = document.createElement('canvas')
  await renderArtworkCanvas(canvas, product, config, null, undefined, 360)
  return new Promise<File>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error('Não foi possível gerar a miniatura da campanha.'))
        return
      }
      resolve(new File([blob], 'campaign-thumbnail.jpg', { type: 'image/jpeg' }))
    }, 'image/jpeg', 0.82)
  })
}

export function toCampaignArtworkSnapshot(artwork: ArtworkItem): CampaignArtworkSnapshot {
  const imageUrl = artwork.product.imageUrl.startsWith('blob:')
    ? artwork.product.sourceImageUrl || ''
    : artwork.product.imageUrl
  return {
    promotion_id: artwork.promotionId,
    index: artwork.index,
    product: {
      name: artwork.product.name,
      category: artwork.product.category,
      price: artwork.product.price,
      original_price: artwork.product.originalPrice || '',
      discount: artwork.product.discount,
      image_url: artwork.product.imageAssetId ? '' : imageUrl,
      image_name: artwork.product.imageName || '',
      source_image_url: imageUrl,
      image_asset_id: artwork.product.imageAssetId,
    },
    config: artwork.config.brand
      ? { ...artwork.config, brand: { ...artwork.config.brand, logoUrl: '' } }
      : artwork.config,
    status: artwork.status,
    error: artwork.error,
    image_warning: artwork.imageWarning,
  }
}
