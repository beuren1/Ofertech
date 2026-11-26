import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Clock3, Coins, Copy, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import { apiBlobRequest, apiRequest, getErrorMessage, useAuth } from '../auth'
import { campaignThumbnailContentPath, type CampaignListResponse, type SavedCampaign } from '../campaigns'
import { listStoreBrands, type StoreBrand } from '../stores'
import { editorLinks, useDashboardCredits } from '../components/Layout'
import type { FlyerSummary } from '../flyers'

const projectTypes = {
  flyer: { path: '/flyers', label: 'Encarte' },
  print: { path: '/print', label: 'Impressão' },
  video: { path: '/videos', label: 'Vídeo' },
}

function campaignUrl(campaign: SavedCampaign) {
  if (!campaign.batch_id && campaign.artworks.length === 1) return `/generator?campaign_id=${campaign.id}`
  return `/bulk?campaign_id=${campaign.id}${campaign.batch_id ? `&batch_id=${encodeURIComponent(campaign.batch_id)}` : ''}`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function CampaignThumbnail({ campaign, accessToken }: {
  campaign: SavedCampaign
  accessToken: string
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const firstArtwork = campaign.artworks[0]
  const backgroundColor = firstArtwork?.config?.backgroundColor || '#eef2ff'

  useEffect(() => {
    if (!campaign.thumbnail_url) {
      setImageUrl(null)
      setError(null)
      return
    }
    let active = true
    let objectUrl: string | null = null
    void apiBlobRequest(campaignThumbnailContentPath(campaign.id), accessToken)
      .then(blob => {
        if (!active) return
        objectUrl = URL.createObjectURL(blob)
        setImageUrl(objectUrl)
        setError(null)
      })
      .catch(reason => {
        if (active) setError(getErrorMessage(reason))
      })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [accessToken, campaign.id, campaign.thumbnail_url])

  if (imageUrl) {
    return <img src={imageUrl} alt={`Miniatura da campanha ${campaign.name}`} className="aspect-square w-full rounded-xl object-cover" />
  }
  return (
    <div
      className="grid aspect-square place-items-center rounded-xl p-5 text-center"
      style={{ backgroundColor }}
      title={error || undefined}
    >
      <div>
        <Sparkles className="mx-auto text-indigo-600" size={28} />
        <p className="mt-2 line-clamp-2 text-sm font-bold">{firstArtwork?.product.name || 'Campanha salva'}</p>
        {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      </div>
    </div>
  )
}

export function DashboardPage() {
  const { user, accessToken } = useAuth()
  const credits = useDashboardCredits()
  const navigate = useNavigate()
  const [campaigns, setCampaigns] = useState<SavedCampaign[]>([])
  const [recentCampaigns, setRecentCampaigns] = useState<SavedCampaign[]>([])
  const [projects, setProjects] = useState<FlyerSummary[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [projectsError, setProjectsError] = useState('')
  const [order, setOrder] = useState<'updated_at' | 'created_at'>('updated_at')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyCampaignId, setBusyCampaignId] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [stores, setStores] = useState<StoreBrand[]>([])
  const [storeFilter, setStoreFilter] = useState('')
  const business = user?.profile.plan === 'business'
  const startPath = user?.profile.plan === 'free' ? '/generator' : '/bulk'

  const loadCampaigns = useCallback(async (refreshRecent = false) => {
    if (!accessToken) return
    setLoading(true)
    setError(null)
    try {
      const activeFilter = business ? storeFilter : ''
      const latest = order === 'updated_at' && !activeFilter
      const result = await apiRequest<CampaignListResponse>(
        `campaigns/?ordering=-${order}${activeFilter ? `&store_brand=${encodeURIComponent(activeFilter)}` : ''}`,
        { accessToken },
      )
      setCampaigns(result.results)
      if (latest) setRecentCampaigns(result.results)
      if (!latest && refreshRecent) {
        const recent = await apiRequest<CampaignListResponse>('campaigns/?ordering=-updated_at', { accessToken })
        setRecentCampaigns(recent.results)
      }
    } catch (reason) {
      setError(getErrorMessage(reason))
    } finally {
      setLoading(false)
    }
  }, [accessToken, order, business, storeFilter])

  useEffect(() => {
    if (!business || !accessToken) return
    let active = true
    void listStoreBrands(accessToken).then(items => { if (active) setStores(items) }).catch(reason => {
      if (active) setError(getErrorMessage(reason))
    })
    return () => { active = false }
  }, [accessToken, business])

  async function moveCampaign(campaign: SavedCampaign, store: string) {
    if (!business || !accessToken) return
    setBusyCampaignId(campaign.id)
    try {
      await apiRequest(`campaigns/${campaign.id}/`, { method: 'PATCH', accessToken, body: { store_brand: store ? Number(store) : null } })
      await loadCampaigns(true)
    } catch (reason) {
      setError(getErrorMessage(reason))
    } finally {
      setBusyCampaignId(null)
    }
  }

  useEffect(() => {
    void loadCampaigns()
  }, [loadCampaigns])

  useEffect(() => {
    if (!accessToken) return
    let active = true
    setProjectsLoading(true)
    setProjectsError('')
    void apiRequest<{ results: FlyerSummary[] }>('flyers/?kind=all', { accessToken }).then(result => {
      if (active) setProjects(result.results)
    }).catch(reason => {
      if (active) setProjectsError(getErrorMessage(reason))
    }).finally(() => {
      if (active) setProjectsLoading(false)
    })
    return () => { active = false }
  }, [accessToken])

  const renameCampaign = async (campaign: SavedCampaign) => {
    if (!editName.trim()) {
      setError('Informe um nome para a campanha.')
      return
    }
    setBusyCampaignId(campaign.id)
    setError(null)
    try {
      await apiRequest<SavedCampaign>(`campaigns/${campaign.id}/`, {
        method: 'PATCH',
        accessToken: accessToken || undefined,
        body: { name: editName.trim() },
      })
      setEditingId(null)
      await loadCampaigns(true)
    } catch (reason) {
      setError(getErrorMessage(reason))
    } finally {
      setBusyCampaignId(null)
    }
  }

  const duplicateCampaign = async (campaign: SavedCampaign) => {
    setBusyCampaignId(campaign.id)
    setError(null)
    try {
      const duplicate = await apiRequest<SavedCampaign>(
        `campaigns/${campaign.id}/duplicate/`,
        { method: 'POST', accessToken: accessToken || undefined, body: {} },
      )
      await loadCampaigns(true)
      navigate(campaignUrl(duplicate))
    } catch (reason) {
      setError(getErrorMessage(reason))
    } finally {
      setBusyCampaignId(null)
    }
  }

  const deleteCampaign = async (campaign: SavedCampaign) => {
    if (!window.confirm(`Excluir a campanha "${campaign.name}" e suas artes?`)) return
    setBusyCampaignId(campaign.id)
    setError(null)
    try {
      await apiRequest(`campaigns/${campaign.id}/`, {
        method: 'DELETE',
        accessToken: accessToken || undefined,
      })
      setCampaigns(current => current.filter(item => item.id !== campaign.id))
      setRecentCampaigns(current => current.filter(item => item.id !== campaign.id))
    } catch (reason) {
      setError(getErrorMessage(reason))
    } finally {
      setBusyCampaignId(null)
    }
  }

  const recent = [
    ...recentCampaigns.map(campaign => ({ key: `campaign-${campaign.id}`, name: campaign.name, date: campaign.updated_at, to: campaignUrl(campaign), label: 'Campanha' })),
    ...projects.map(project => {
      const type = projectTypes[project.kind ?? 'flyer']
      return { key: `project-${project.id}`, name: project.name, date: project.updated_at, to: `${type.path}?project_id=${project.id}`, label: type.label }
    }),
  ].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 5)

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm text-slate-500">Seu espaço de criação</p>
          <h1 className="mt-1 text-3xl font-black">Olá, {user?.name || user?.email} 👋</h1>
        </div>
        <Link to={startPath} className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white shadow-lg shadow-indigo-100">
          <Plus size={18} /> Nova campanha
        </Link>
      </div>

      <section className="mt-8 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Link to="/plans" className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 text-indigo-950 hover:border-indigo-500 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-100">
          <span className="flex items-center gap-2 text-sm font-semibold"><Coins aria-hidden="true" size={18} /> Créditos restantes</span>
          <span aria-live="polite" className="mt-3 block text-3xl font-black">{credits === undefined ? '—' : credits.toLocaleString('pt-BR')}</span>
          <span className="mt-3 inline-flex items-center gap-2 text-sm font-semibold">Ver planos e consumo <ArrowRight aria-hidden="true" size={16} /></span>
        </Link>
        <nav aria-label="Atalhos dos geradores" className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:grid-cols-3 dark:border-slate-800 dark:bg-slate-900">
          {editorLinks.map(({ to, label, icon: Icon }) => <Link key={to} to={to} className="flex min-w-0 items-center gap-2 rounded-xl p-2 text-sm font-semibold hover:bg-indigo-50 dark:hover:bg-slate-800"><Icon aria-hidden="true" size={19} className="shrink-0 text-indigo-600 dark:text-indigo-300" />{label}</Link>)}
        </nav>
      </section>

      <section aria-labelledby="recent-projects" className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 id="recent-projects" className="text-xl font-black">Projetos recentes</h2>
        {projectsError && <p role="status" className="mt-2 text-sm text-rose-700 dark:text-rose-300">Não foi possível carregar encartes, impressões e vídeos. {projectsError}</p>}
        {recent.length === 0 && <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{loading || projectsLoading ? 'Carregando projetos…' : 'Seus projetos aparecerão aqui depois de salvos.'}</p>}
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {recent.map(project => <li key={project.key} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div className="min-w-0"><p className="break-words font-semibold">{project.name}</p><p className="text-sm text-slate-500 dark:text-slate-400">{project.label} · {formatDate(project.date)}</p></div>
            <Link to={project.to} aria-label={`Continuar editando ${project.name}`} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-slate-800">Continuar editando <ArrowRight aria-hidden="true" size={16} /></Link>
          </li>)}
        </ul>
      </section>

      <section className="mt-8" aria-labelledby="saved-campaigns">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="saved-campaigns" className="text-2xl font-black">Minhas campanhas</h2>
            <p className="mt-1 text-sm text-slate-500">Suas artes, fotos e configurações salvas automaticamente.</p>
          </div>
          {business && <label className="text-sm font-semibold">Filtrar por loja
            <select className="ml-2 rounded-lg border bg-transparent px-3 py-2" value={storeFilter} onChange={event => setStoreFilter(event.target.value)}>
              <option value="">Todas as lojas</option><option value="none">Sem loja</option>
              {stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}
            </select>
          </label>}
          <label className="text-sm font-semibold">Ordenar por
            <select
              aria-label="Ordenar campanhas"
              value={order}
              onChange={event => setOrder(event.target.value as 'updated_at' | 'created_at')}
              className="ml-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="updated_at">Última edição</option>
              <option value="created_at">Data de criação</option>
            </select>
          </label>
        </div>

        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {loading
          ? <p role="status" className="mt-6 text-sm text-slate-500">Carregando campanhas salvas...</p>
          : campaigns.length === 0
            ? <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
                <Sparkles className="mx-auto text-indigo-500" size={30} />
                <h3 className="mt-3 text-lg font-bold">Nenhuma campanha salva ainda</h3>
                <p className="mt-1 text-sm text-slate-500">Gere suas primeiras artes para encontrá-las aqui.</p>
                <Link to={startPath} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white"><Plus size={16} /> Criar campanha</Link>
              </div>
            : <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {campaigns.map(campaign => (
                  <article key={campaign.id} className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                    <Link to={campaignUrl(campaign)} className="block">
                      <CampaignThumbnail campaign={campaign} accessToken={accessToken || ''} />
                    </Link>
                    <div className="mt-3 flex items-start justify-between gap-2">
                      {editingId === campaign.id
                        ? <div className="min-w-0 flex-1">
                            <input
                              aria-label={`Novo nome para ${campaign.name}`}
                              value={editName}
                              maxLength={180}
                              onChange={event => setEditName(event.target.value)}
                              className="w-full rounded-lg border border-slate-200 bg-transparent px-2 py-1.5 text-sm font-bold dark:border-slate-700"
                            />
                            <div className="mt-2 flex gap-2 text-xs">
                              <button type="button" disabled={busyCampaignId === campaign.id} onClick={() => void renameCampaign(campaign)} className="font-bold text-indigo-600 disabled:opacity-50">Salvar nome</button>
                              <button type="button" onClick={() => setEditingId(null)} className="text-slate-500">Cancelar</button>
                            </div>
                          </div>
                        : <div className="min-w-0 flex-1">
                            <Link to={campaignUrl(campaign)} className="block truncate font-bold hover:text-indigo-600">{campaign.name}</Link>
                            <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Clock3 size={13} /> Editada {formatDate(campaign.updated_at)}</p>
                            <p className="mt-1 text-xs text-slate-500">{campaign.artworks.length} artes · criada {formatDate(campaign.created_at)}</p>
                          </div>}
                    </div>
                    {business && <label className="mt-3 block text-xs font-semibold">Loja da campanha
                      <select className="mt-1 block w-full rounded-lg border bg-transparent p-2" value={campaign.store_brand ?? ''}
                        disabled={busyCampaignId === campaign.id} onChange={event => void moveCampaign(campaign, event.target.value)}>
                        <option value="">Sem loja</option>
                        {stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}
                      </select>
                    </label>}
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                      <button type="button" onClick={() => { setEditingId(campaign.id); setEditName(campaign.name) }} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold"><Pencil size={13} /> Renomear</button>
                      <button type="button" disabled={busyCampaignId === campaign.id} onClick={() => void duplicateCampaign(campaign)} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"><Copy size={13} /> Duplicar</button>
                      <button type="button" disabled={busyCampaignId === campaign.id} onClick={() => void deleteCampaign(campaign)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-50"><Trash2 size={13} /> Excluir</button>
                    </div>
                  </article>
                ))}
              </div>}
      </section>
    </div>
  )
}
