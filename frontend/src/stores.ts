import { apiBlobRequest, apiRequest, apiUpload } from './auth'
import type { ArtworkBrand } from './bulk'

export type StoreBrand = {
  id: number
  name: string
  logo_url: string | null
  primary_color: string
  secondary_color: string
  instagram: string
  whatsapp: string
  website: string
  slogan: string
  updated_at: string
}

export type StoreBrandListResponse = {
  count: number
  next: string | null
  previous: string | null
  results: StoreBrand[]
}

export type StoreBrandSnapshot = {
  name: string
  primary_color: string
  secondary_color: string
  instagram: string
  whatsapp: string
  website: string
  slogan: string
  logo_asset_id?: number | null
}

export function storeLogoContentPath(storeId: number) {
  return `stores/${storeId}/logo/content/`
}

export function toStoreBrandSnapshot(store: StoreBrand, logoAssetId?: number): StoreBrandSnapshot {
  return {
    name: store.name,
    primary_color: store.primary_color,
    secondary_color: store.secondary_color,
    instagram: store.instagram,
    whatsapp: store.whatsapp,
    website: store.website,
    slogan: store.slogan,
    logo_asset_id: logoAssetId ?? null,
  }
}

export function toArtworkBrand(
  store: StoreBrand,
  logoUrl: string,
  logoAssetId?: number,
): ArtworkBrand {
  return {
    storeId: store.id,
    name: store.name,
    primaryColor: store.primary_color,
    secondaryColor: store.secondary_color,
    instagram: store.instagram,
    whatsapp: store.whatsapp,
    website: store.website,
    slogan: store.slogan,
    logoUrl,
    logoAssetId,
    showLogo: true,
    showInstagram: Boolean(store.instagram),
    showWhatsapp: Boolean(store.whatsapp),
    showWebsite: Boolean(store.website),
  }
}

export function artworkBrandFromSnapshot(
  storeId: number,
  snapshot: StoreBrandSnapshot,
  logoUrl: string,
): ArtworkBrand {
  return {
    storeId,
    name: snapshot.name,
    primaryColor: snapshot.primary_color,
    secondaryColor: snapshot.secondary_color,
    instagram: snapshot.instagram,
    whatsapp: snapshot.whatsapp,
    website: snapshot.website,
    slogan: snapshot.slogan,
    logoUrl,
    logoAssetId: snapshot.logo_asset_id ?? undefined,
    showLogo: true,
    showInstagram: Boolean(snapshot.instagram),
    showWhatsapp: Boolean(snapshot.whatsapp),
    showWebsite: Boolean(snapshot.website),
  }
}

export async function loadStoreLogo(store: StoreBrand, accessToken: string) {
  if (!store.logo_url) return ''
  const blob = await apiBlobRequest(storeLogoContentPath(store.id), accessToken)
  return URL.createObjectURL(blob)
}

export async function uploadStoreLogoToCampaign(
  campaignId: number,
  store: StoreBrand,
  accessToken: string,
): Promise<number | undefined> {
  if (!store.logo_url) return undefined
  const blob = await apiBlobRequest(storeLogoContentPath(store.id), accessToken)
  const extensions: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
  }
  const extension = extensions[blob.type]
  if (!extension) throw new Error('O formato da logo armazenada não é suportado.')
  const file = new File([blob], `logo-${store.id}.${extension}`, { type: blob.type })
  const uploaded = await apiUpload<{ id: number }>(
    `campaigns/${campaignId}/assets/`,
    file,
    accessToken,
  )
  return uploaded.id
}

export async function listStoreBrands(accessToken: string) {
  const response = await apiRequest<StoreBrandListResponse>('stores/', { accessToken })
  return response.results
}
