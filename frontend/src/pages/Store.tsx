import { useEffect, useState, type ChangeEvent } from 'react'
import { ImagePlus, Plus, Save, Store } from 'lucide-react'
import { apiRequest, apiUpload, getErrorMessage, useAuth } from '../auth'
import { loadStoreLogo, listStoreBrands, type StoreBrand } from '../stores'

type StoreDraft = {
  name: string
  primary_color: string
  secondary_color: string
  instagram: string
  whatsapp: string
  website: string
  slogan: string
}

const emptyDraft: StoreDraft = {
  name: '',
  primary_color: '#4f46e5',
  secondary_color: '#f97316',
  instagram: '',
  whatsapp: '',
  website: '',
  slogan: '',
}

function draftFromStore(store: StoreBrand): StoreDraft {
  return {
    name: store.name,
    primary_color: store.primary_color,
    secondary_color: store.secondary_color,
    instagram: store.instagram,
    whatsapp: store.whatsapp,
    website: store.website,
    slogan: store.slogan,
  }
}

export function StorePage() {
  const { accessToken } = useAuth()
  const [stores, setStores] = useState<StoreBrand[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [draft, setDraft] = useState<StoreDraft>(emptyDraft)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const store = stores.find(item => item.id === selectedId) ?? null

  useEffect(() => {
    if (!accessToken) return
    let active = true
    void listStoreBrands(accessToken).then(items => {
      if (!active) return
      setStores(items)
      const first = items[0] ?? null
      setSelectedId(first?.id ?? null)
      setDraft(first ? draftFromStore(first) : emptyDraft)
    }).catch(reason => {
      if (active) setError(getErrorMessage(reason))
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
    }
  }, [accessToken])

  useEffect(() => {
    let active = true
    let objectUrl = ''
    if (logoFile) {
      objectUrl = URL.createObjectURL(logoFile)
      setLogoPreview(objectUrl)
    } else if (store?.logo_url && accessToken) {
      void loadStoreLogo(store, accessToken).then(url => {
        objectUrl = url
        if (active) setLogoPreview(url)
        else if (url) URL.revokeObjectURL(url)
      }).catch(reason => {
        if (active) {
          setLogoPreview('')
          setError(getErrorMessage(reason))
        }
      })
    } else {
      setLogoPreview('')
    }
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [accessToken, logoFile, store?.id, store?.logo_url])

  const selectStore = (value: string) => {
    if (value === 'new') {
      setSelectedId(null)
      setDraft(emptyDraft)
      setLogoFile(null)
      setError(null)
      setSaved(false)
      return
    }
    const next = stores.find(item => item.id === Number(value))
    if (!next) return
    setSelectedId(next.id)
    setDraft(draftFromStore(next))
    setLogoFile(null)
    setError(null)
    setSaved(false)
  }

  const selectLogo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    const expectedTypes: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
    }
    const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!expectedTypes[extension] || file.type !== expectedTypes[extension]) {
      setError('Envie uma logo PNG, JPG ou WebP válida.')
      return
    }
    if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
      setError('A logo deve ter entre 1 byte e 10 MB.')
      return
    }
    setError(null)
    setSaved(false)
    setLogoFile(file)
  }

  const saveStore = async () => {
    if (!accessToken || saving) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      let updated = selectedId
        ? await apiRequest<StoreBrand>(`stores/${selectedId}/`, {
            method: 'PATCH',
            accessToken,
            body: draft,
          })
        : await apiRequest<StoreBrand>('stores/', {
            method: 'POST',
            accessToken,
            body: draft,
          })
      if (logoFile) {
        updated = await apiUpload<StoreBrand>(
          `stores/${updated.id}/logo-upload/`,
          logoFile,
          accessToken,
        )
      }
      setStores(current => [
        ...current.filter(item => item.id !== updated.id),
        updated,
      ].sort((left, right) => left.name.localeCompare(right.name)))
      setSelectedId(updated.id)
      setDraft(draftFromStore(updated))
      setLogoFile(null)
      setSaved(true)
    } catch (reason) {
      setError(getErrorMessage(reason))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold text-indigo-600"><Store size={17} /> IDENTIDADE VISUAL</p>
          <h1 className="mt-2 text-3xl font-black">Minha loja</h1>
          <p className="mt-2 text-slate-500">Salve a marca que será aplicada às suas artes e campanhas.</p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <select
            aria-label="Loja selecionada"
            value={selectedId ?? 'new'}
            onChange={event => selectStore(event.target.value)}
            disabled={loading}
            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900 sm:w-56"
          >
            {stores.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            <option value="new">Nova loja</option>
          </select>
          <button type="button" onClick={() => selectStore('new')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold dark:border-slate-700">
            <Plus size={16} /> Nova
          </button>
        </div>
      </div>

      {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="mt-7 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-7">
          <h2 className="text-lg font-bold">{selectedId ? 'Dados da loja' : 'Cadastrar loja'}</h2>
          {loading
            ? <p role="status" className="mt-4 text-sm text-slate-500">Carregando suas lojas...</p>
            : <div className="mt-5 space-y-5">
                <label className="block text-sm font-semibold">Nome da loja
                  <input aria-label="Nome da loja" value={draft.name} maxLength={150} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-transparent px-3 py-3 dark:border-slate-700" />
                </label>

                <div>
                  <p className="text-sm font-semibold">Logo da loja</p>
                  <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-4 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-slate-700 dark:text-indigo-300 dark:hover:bg-slate-800">
                    <ImagePlus size={18} /> {logoFile ? logoFile.name : store?.logo_url ? 'Substituir logo' : 'Enviar logo PNG, JPG ou WebP'}
                    <input type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" className="sr-only" onChange={selectLogo} />
                  </label>
                  <p className="mt-2 text-xs text-slate-500">Tamanho máximo: 10 MB. O arquivo fica privado e é armazenado fora do banco de dados.</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <ColorField label="Cor principal" value={draft.primary_color} onChange={primary_color => setDraft(current => ({ ...current, primary_color }))} />
                  <ColorField label="Cor secundária" value={draft.secondary_color} onChange={secondary_color => setDraft(current => ({ ...current, secondary_color }))} />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField label="Instagram" value={draft.instagram} onChange={instagram => setDraft(current => ({ ...current, instagram }))} placeholder="@minhaloja" />
                  <TextField label="WhatsApp" value={draft.whatsapp} onChange={whatsapp => setDraft(current => ({ ...current, whatsapp }))} placeholder="+55 11 99999-9999" />
                  <TextField label="Site" value={draft.website} onChange={website => setDraft(current => ({ ...current, website }))} placeholder="https://minhaloja.com.br" />
                  <TextField label="Slogan (opcional)" value={draft.slogan} onChange={slogan => setDraft(current => ({ ...current, slogan }))} placeholder="Uma frase curta da sua marca" />
                </div>

                <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5 dark:border-slate-800">
                  <button type="button" disabled={saving || !draft.name.trim()} onClick={() => void saveStore()} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white disabled:opacity-50">
                    <Save size={17} /> {saving ? 'Salvando...' : selectedId ? 'Salvar alterações' : 'Cadastrar loja'}
                  </button>
                  {saved && <span role="status" className="text-sm font-semibold text-emerald-600">Identidade visual salva.</span>}
                </div>
              </div>}
        </section>

        <aside className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Prévia da marca na arte</p>
          <div className="mt-4 aspect-square overflow-hidden rounded-2xl border border-slate-200 shadow-lg dark:border-slate-700" style={{ backgroundColor: draft.primary_color }}>
            <div className="relative flex h-full flex-col justify-between p-5 text-white sm:p-7">
              <div className="flex min-h-24 items-center">
                {logoPreview
                  ? <img src={logoPreview} alt={`Logo de ${draft.name || 'sua loja'}`} className="max-h-24 max-w-48 rounded-lg bg-white p-2 object-contain" />
                  : <span className="rounded-lg bg-white/95 px-4 py-3 text-lg font-black text-slate-900">{draft.name || 'Nome da loja'}</span>}
              </div>
              <div className="rounded-2xl p-4 text-slate-950" style={{ backgroundColor: draft.secondary_color }}>
                <p className="text-xs font-black uppercase tracking-wide">Identidade da loja</p>
                <p className="mt-1 text-lg font-black">{draft.name || 'Sua loja em destaque'}</p>
                {draft.slogan && <p className="mt-1 text-sm font-medium">{draft.slogan}</p>}
              </div>
              <div className="truncate rounded-xl bg-white/95 px-3 py-2 text-center text-xs font-semibold text-slate-800">
                {[draft.instagram, draft.whatsapp, draft.website].filter(Boolean).join(' · ') || 'Instagram · WhatsApp · Site'}
              </div>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-500">As cores destacam o CTA e o selo. Logo e contatos podem ser reposicionados ou ocultados em cada arte.</p>
        </aside>
      </div>
    </div>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold dark:border-slate-700">
      {label}
      <input aria-label={label} type="color" value={value} onChange={event => onChange(event.target.value)} className="h-9 w-14 cursor-pointer rounded border-0 bg-transparent" />
    </label>
  )
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="block text-sm font-semibold">{label}
      <input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="mt-2 w-full rounded-xl border border-slate-200 bg-transparent px-3 py-3 font-normal dark:border-slate-700" />
    </label>
  )
}
