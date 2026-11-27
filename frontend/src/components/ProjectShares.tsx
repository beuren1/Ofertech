import { useEffect, useState } from 'react'
import { toDataURL } from 'qrcode'
import { apiRequest, getErrorMessage } from '../auth'

type Share = { id: number; label: string; token: string }

export function ProjectShares({ projectId, accessToken, kind }: {
  projectId: number; accessToken: string; kind: 'menu' | 'tv'
}) {
  const [shares, setShares] = useState<Share[]>([])
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [qr, setQr] = useState<{ id: number; url: string }>()
  const endpoint = `flyers/${projectId}/shares/`
  const menu = kind === 'menu'
  const shareUrl = (token: string) => new URL(`${import.meta.env.BASE_URL}${menu ? 'cardapio' : 'tv/player'}/${token}`, window.location.origin).href

  useEffect(() => {
    let active = true
    setBusy(true)
    void apiRequest<Share[]>(endpoint, { accessToken }).then(items => {
      if (active) setShares(items)
    }).catch(reason => {
      if (active) setError(getErrorMessage(reason))
    }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [accessToken, endpoint])

  async function update(share?: Share) {
    setBusy(true)
    setError('')
    try {
      if (share) {
        await apiRequest(`${endpoint}${share.id}/`, { accessToken, method: 'DELETE' })
        setShares(current => current.filter(item => item.id !== share.id))
        setQr(current => current?.id === share.id ? undefined : current)
      } else {
        const created = await apiRequest<Share>(endpoint, { accessToken, method: 'POST', body: { label: menu ? 'Cardápio digital' : label.trim() } })
        setShares(current => [created, ...current])
        setLabel('')
      }
    } catch (reason) {
      setError(getErrorMessage(reason))
    } finally {
      setBusy(false)
    }
  }

  async function showQr(share: Share) {
    try {
      setQr({ id: share.id, url: await toDataURL(shareUrl(share.token), { width: 320, margin: 4 }) })
    } catch (reason) {
      setError(getErrorMessage(reason))
    }
  }

  const action = 'rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50 dark:border-slate-700'
  return (
    <section aria-label={menu ? 'Publicação do cardápio' : 'Links de reprodução'} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="font-bold">{menu ? 'Cardápio digital' : 'Links de reprodução'}</h2>
      {!menu && <label className="block text-sm font-medium">Nome da TV
        <input maxLength={80} value={label} onChange={event => setLabel(event.target.value)}
          className="mt-1 block w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2" />
      </label>}
      {(!menu || !shares.length) && <button type="button" className={action} disabled={busy || (!menu && !label.trim())}
        onClick={() => void update()}>{menu ? 'Publicar cardápio' : 'Criar link para TV'}</button>}
      {shares.map(share => <div key={share.id} className="space-y-2">
        <a href={shareUrl(share.token)} target="_blank" rel="noreferrer" className="inline-block font-semibold text-indigo-700 underline dark:text-indigo-300">{share.label}</a>
        <input readOnly value={shareUrl(share.token)} aria-label={`Link de ${share.label}`}
          onFocus={event => event.target.select()}
          className="block w-full min-w-0 rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm" />
        <div className="flex flex-wrap gap-2">
          {menu && <button type="button" className={action} disabled={busy} onClick={() => void showQr(share)}>Exibir QR Code</button>}
          <button type="button" className={action} disabled={busy} onClick={() => void update(share)}>Revogar link</button>
        </div>
        {qr?.id === share.id && <a href={qr.url} download="cardapio-qr.png" className="block w-fit">
          <img src={qr.url} width={160} height={160} alt="Baixar QR Code do cardápio" />
        </a>}
      </div>)}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </section>
  )
}
