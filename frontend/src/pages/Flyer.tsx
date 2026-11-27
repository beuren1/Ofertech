import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, FileImage, FileText, GripVertical, Plus, Save, Upload } from 'lucide-react'
import { apiBlobRequest, apiRequest, getErrorMessage, useAuth } from '../auth'
import { useCreationLogin } from '../creationLogin'
import { parseProductCsv } from '../bulk'
import { campaignAssetContentPath, type SavedCampaign } from '../campaigns'
import { exportFlyer } from '../flyerExport'
import { FlyerPreview } from '../components/FlyerPreview'
import { flyerTemplateImage, flyerTemplates } from '../flyerTemplates'
import { findGalleryModel } from '../galleryModels'
import { useFlyerHistory } from '../useFlyerHistory'
import { PrintControls } from '../components/PrintControls'
import { FlyerBackgroundCarousel } from '../components/FlyerBackgroundCarousel'
import { ProductCutout } from '../components/ProductCutout'
import { creditCost, creditOperation, type CreditOperation } from '../billing'
import { MAX_FLYER_PHOTO_SCALE, MAX_GLOW_INTENSITY, OFFER_LABELS, PHOTO_DEFAULTS, PRODUCT_GLOW_DEFAULTS, type FlyerLayer, type PhotoAdjustment } from '../flyerOfferLayout'
import type { FlyerDesignLayer } from '../flyerOfferLayout'
import { VideoControls, VideoPreview } from '../components/VideoPreview'
import { DEFAULT_PRINT, paginatePrint, printPaper, printSettingsError, type PrintSettings } from '../printLayout'
import { STORY_CHANNELS, type StoryChannel } from '../storyLayout'
import { MENU_CATEGORIES, MENU_FORMATS, menuCanvasSize, type MenuFormat } from '../menuLayout'
import { ProjectShares } from '../components/ProjectShares'
import {
  contrast, createFlyer, FLYER_LAYOUTS, FLYER_LIMIT, FLYER_TEMPLATES, flyerCanvasSize,
  flyerGrid, flyerProduct, paginateFlyer, prepareFlyerImage, priceNumber, printProductErrors, reopenFlyer,
  type FlyerDesign, type FlyerPage, type FlyerProduct, type FlyerSummary, type SavedFlyer,
} from '../flyers'

type PageResult<T> = { results: T[]; next: string | null }
const panel = 'space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900'
const field = 'mt-1 block w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-700 dark:bg-slate-900'
const secondary = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50 dark:border-slate-700'
const primary = 'inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50'
const imageTypes = 'image/png,image/jpeg,image/webp'
const productFields = [
  ['name', 'Nome do produto', 180],
  ['category', 'Categoria', 80],
  ['originalPrice', 'Preço anterior', 36],
  ['price', 'Preço promocional', 36],
  ['discount', 'Desconto', 36],
  ['imageUrl', 'URL da foto', 2048],
] as const

function Field({ label, children, className = 'block' }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`${className} text-sm font-medium`}><span>{label}</span>{children}</label>
}

const emptyPage: FlyerPage = { category: '', products: [] }

function matchesEditor(design: Pick<FlyerDesign, 'print' | 'video' | 'story' | 'menu' | 'tv'>, mode: {
  printMode: boolean; videoMode: boolean; storyMode: boolean; menuMode: boolean; labelsMode: boolean; tvMode: boolean
}) {
  return Boolean(design.print) === mode.printMode && Boolean(design.video) === mode.videoMode
    && Boolean(design.story) === mode.storyMode && Boolean(design.menu) === mode.menuMode
    && Boolean(design.tv) === mode.tvMode
    && (!mode.labelsMode || design.print?.kind === 'labels')
}

async function loadFlyerBackground(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Não foi possível carregar o fundo escolhido.')
  return prepareFlyerImage(await response.blob(), 850, 132000)
}

export function FlyerPageEditor({ printMode = false, labelsMode = false, videoMode = false, storyMode = false, menuMode = false, tvMode = false, initialSearch = '' }: {
  printMode?: boolean; labelsMode?: boolean; videoMode?: boolean; storyMode?: boolean; menuMode?: boolean; tvMode?: boolean; initialSearch?: string
}) {
  const { accessToken, user } = useAuth()
  const requestLogin = useCreationLogin()
  const free = user?.profile.plan === 'free'
  const lastExport = useRef<{ design: FlyerDesign; pages: FlyerPage[]; request: string; operation: CreditOperation; artifact: Awaited<ReturnType<typeof exportFlyer>>; confirmed: boolean }>()
  const { flyer, setFlyer, resetFlyer, undo, redo, canUndo, canRedo } = useFlyerHistory(newProject)
  const [currentId, setCurrentId] = useState<number | null>(null)
  const [campaigns, setCampaigns] = useState<SavedCampaign[]>([])
  const [projects, setProjects] = useState<FlyerSummary[]>([])
  const [campaignPage, setCampaignPage] = useState(1)
  const [projectPage, setProjectPage] = useState(1)
  const [moreCampaigns, setMoreCampaigns] = useState(false)
  const [moreProjects, setMoreProjects] = useState(false)
  const [selectedCampaign, setSelectedCampaign] = useState('')
  const [selectedProject, setSelectedProject] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [openProduct, setOpenProduct] = useState<number | null>(null)
  const [showGuides, setShowGuides] = useState(true)
  const [dropTarget, setDropTarget] = useState<number | null>(null)
  const draggedProduct = useRef<number | null>(null)
  const inProgress = useRef(false)
  const appliedLink = useRef(false)
  const previewPages = useRef<HTMLDivElement>(null)
  const { products, design } = flyer
  const { layout, grouped, print, video, menu } = design
  const documentMode = !printMode && !videoMode && !storyMode && !menuMode
  const editablePreview = documentMode || storyMode || menuMode || print?.kind === 'poster'
  const kindQuery = tvMode ? '&kind=tv' : menuMode ? '&kind=menu' : storyMode ? '&kind=story' : labelsMode ? '&kind=labels' : videoMode ? '&kind=video' : printMode ? '&kind=print' : ''
  const validDuration = (duration: number) => Number.isInteger(duration) && duration >= 1 && duration <= 60
  const invalidVideo = Boolean(video && (!validDuration(video.duration) || products.some(product => product.duration !== undefined && !validDuration(product.duration))))
  const settingsError = print ? printSettingsError(print) : ''
  const calculatedPages = useMemo(() => {
    if (videoMode) return []
    if (storyMode) return products.map(product => ({ category: product.category, products: [product] }))
    if (!print) return paginateFlyer(products, { layout, grouped })
    return settingsError ? [] : paginatePrint(products, print).map(items => ({ category: '', products: items }))
  }, [products, layout, grouped, print, settingsError, videoMode, storyMode])
  const printError = settingsError || (print && calculatedPages.length > 100 ? 'Reduza a quantidade para exportar até 100 folhas por vez.' : '')
  const pages = printError ? [] : calculatedPages
  const exportKind = menuMode ? 'menu' : storyMode ? 'story' : print?.kind ?? 'flyer'
  const pageCost = creditCost(exportKind, user?.profile.plan)
  const freeBatchExceeded = free && pages.length > 5
  const paper = printPaper(print)
  const menuSize = menu ? menuCanvasSize(menu) : undefined
  const editorTitle = tvMode ? 'TV de Ofertas' : menuMode ? 'Criar Cardápio' : storyMode ? 'Criar Stories' : labelsMode ? 'Criar Etiquetas' : videoMode ? 'Criar Vídeo' : printMode ? 'Criar Cartaz' : 'Criar Encarte'

  useEffect(() => {
    if (!initialSearch || appliedLink.current) return
    const params = new URLSearchParams(initialSearch)
    const id = params.get('project_id')
    if (id && !accessToken) return
    const template = documentMode ? flyerTemplates.find(([key]) => key === params.get('template')) : undefined
    const model = findGalleryModel(tvMode ? '/tv' : menuMode ? '/menus' : storyMode ? '/stories' : labelsMode ? '/labels' : printMode ? '/print' : videoMode ? '/videos' : '/flyers', initialSearch)
    if (!id && !template && !model) return
    let active = true
    inProgress.current = true
    setBusy(true)
    async function openLink() {
      if (id) {
        if (!/^[1-9]\d*$/.test(id)) throw new Error('Projeto inválido.')
        const project = await apiRequest<SavedFlyer>(`flyers/${id}/`, { accessToken: accessToken ?? undefined })
        if (!matchesEditor(project.design, { printMode, videoMode, storyMode, menuMode, labelsMode, tvMode })) throw new Error('Selecione um projeto deste editor.')
        if (!active) return
        resetFlyer(reopenFlyer(project))
        setCurrentId(project.id)
        setSelectedProject(String(project.id))
        return
      }
      const preset = model ? [model.background, model.name, model.segment, model.flyer, model.name] as const : template
      if (!preset) return
      const [key, name, , style, title] = preset
      const backgroundImage = await loadFlyerBackground(flyerTemplateImage(key))
      if (!active) return
      const draft = createFlyer(printMode, videoMode, labelsMode, storyMode, menuMode, tvMode)
      const { primary, accent, background, font, border, badge } = FLYER_TEMPLATES[style]
      resetFlyer({ name, products: model?.products.map(flyerProduct) ?? [], design: { ...draft.design, template: style, title, primary, accent, background, font, border, badge, backgroundImage } })
    }
    void openLink().catch(reason => { if (active) setError(getErrorMessage(reason)) }).finally(() => {
      if (active) {
        appliedLink.current = true
        inProgress.current = false
        setBusy(false)
      }
    })
    return () => { active = false; inProgress.current = false }
  }, [accessToken, initialSearch, printMode, labelsMode, videoMode, storyMode, menuMode, tvMode, documentMode, resetFlyer])

  function newProject() {
    return createFlyer(printMode, videoMode, labelsMode, storyMode, menuMode, tvMode)
  }

  useEffect(() => {
    function handleHistory(event: KeyboardEvent) {
      if (busy || event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.altKey) return
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey && canUndo) { event.preventDefault(); undo() }
      if ((key === 'y' || (key === 'z' && event.shiftKey)) && canRedo) { event.preventDefault(); redo() }
    }
    window.addEventListener('keydown', handleHistory)
    return () => window.removeEventListener('keydown', handleHistory)
  }, [busy, canRedo, canUndo, redo, undo])

  useEffect(() => {
    if (!accessToken) return
    let active = true
    void apiRequest<PageResult<SavedCampaign>>(`campaigns/?page=${campaignPage}`, { accessToken }).then(result => {
      if (active) {
        setCampaigns(current => campaignPage === 1 ? result.results : [...current, ...result.results])
        setMoreCampaigns(Boolean(result.next))
      }
    }).catch(reason => { if (active) setError(getErrorMessage(reason)) })
    return () => { active = false }
  }, [accessToken, campaignPage])

  useEffect(() => {
    if (!accessToken) return
    let active = true
    void apiRequest<PageResult<FlyerSummary>>(`flyers/?page=${projectPage}${kindQuery}`, { accessToken }).then(result => {
      if (active) {
        setProjects(current => projectPage === 1 ? result.results : [...current, ...result.results])
        setMoreProjects(Boolean(result.next))
      }
    }).catch(reason => { if (active) setError(getErrorMessage(reason)) })
    return () => { active = false }
  }, [accessToken, projectPage, kindQuery])

  async function run(action: () => Promise<void>) {
    if (inProgress.current) return
    inProgress.current = true
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await action()
    } catch (reason) {
      setError(getErrorMessage(reason))
    } finally {
      inProgress.current = false
      setBusy(false)
    }
  }

  function editDesign(values: Partial<FlyerDesign>) {
    setFlyer(current => ({ ...current, design: { ...current.design, ...values } }))
  }

  function editPrint(changes: Partial<PrintSettings>) {
    if (!print) return
    const next = { ...print, ...changes }
    if (changes.kind === 'poster' && printSettingsError({ ...print, kind: 'labels' })) {
      next.labelWidth = DEFAULT_PRINT.labelWidth
      next.labelHeight = DEFAULT_PRINT.labelHeight
      next.copies = DEFAULT_PRINT.copies
    }
    editDesign({ print: next })
  }

  function editProduct(index: number, values: Partial<FlyerProduct>, group?: symbol) {
    setFlyer(current => ({
      ...current, products: current.products.map((product, position) => position === index ? { ...product, ...values } : product),
    }), group)
  }

  function removeProduct(index: number) {
    setFlyer(current => ({ ...current, products: current.products.filter((_, position) => position !== index) }))
    setOpenProduct(null)
  }

  function appendProducts(items: FlyerProduct[]) {
    if (!items.length) throw new Error('Nenhum produto foi encontrado.')
    if (products.length + items.length > FLYER_LIMIT) throw new Error(`O projeto aceita até ${FLYER_LIMIT} produtos.`)
    setFlyer(current => ({ ...current, products: [...current.products, ...items] }))
    const total = products.length + items.length
    setMessage(`${total} ${total === 1 ? 'produto no projeto' : 'produtos no projeto'}.`)
  }

  async function importCampaign() {
    if (!accessToken || !selectedCampaign) return
    const stored = await apiRequest<SavedCampaign>(`campaigns/${Number(selectedCampaign)}/`, { accessToken })
    if (products.length + stored.artworks.length > FLYER_LIMIT) throw new Error(`O projeto aceita até ${FLYER_LIMIT} produtos.`)
    const items: FlyerProduct[] = []
    let missingPhotos = 0
    for (const artwork of stored.artworks) {
      const product = artwork.product
      let imageUrl = product.image_url || product.source_image_url || ''
      if (product.image_asset_id) {
        try {
          const blob = await apiBlobRequest(campaignAssetContentPath(stored.id, product.image_asset_id), accessToken)
          imageUrl = await prepareFlyerImage(blob, 420, 15000)
        } catch {
          missingPhotos += 1
        }
      }
      items.push(flyerProduct({
        name: artwork.config?.productName || product.name,
        category: product.category,
        price: artwork.config?.salePrice ?? product.price,
        originalPrice: artwork.config?.originalPrice ?? product.original_price,
        discount: artwork.config?.discount ?? product.discount,
        imageUrl,
      }))
    }
    appendProducts(items)
    if (missingPhotos) setMessage(`${items.length} produto(s) adicionado(s). Não foi possível copiar ${missingPhotos} foto(s); você pode reenviá-las.`)
  }

  async function save() {
    if (!accessToken) return requestLogin()
    if (settingsError) throw new Error(settingsError)
    if (invalidVideo) throw new Error('Informe durações inteiras entre 1 e 60 segundos.')
    if (!flyer.name.trim() || !design.title.trim() || products.some(product => !product.name.trim())) {
      throw new Error('Preencha o nome do projeto, o título e o nome de cada produto.')
    }
    if (print || video || storyMode || menuMode) validateProductFields(products)
    const saved = await apiRequest<SavedFlyer>(currentId ? `flyers/${currentId}/` : 'flyers/', {
      accessToken, method: currentId ? 'PUT' : 'POST', body: { ...flyer, design },
    })
    setCurrentId(saved.id)
    setSelectedProject(String(saved.id))
    const summary = { id: saved.id, name: saved.name, updated_at: saved.updated_at }
    setProjects(current => [summary, ...current.filter(project => project.id !== saved.id)])
    setMessage(documentMode ? 'Encarte salvo.' : 'Projeto salvo.')
  }

  async function openProject() {
    if (!accessToken || !selectedProject) return
    const saved = await apiRequest<SavedFlyer>(`flyers/${Number(selectedProject)}/`, { accessToken })
    if (!matchesEditor(saved.design, { printMode, videoMode, storyMode, menuMode, labelsMode, tvMode })) throw new Error('Selecione um projeto deste editor.')
    resetFlyer(reopenFlyer(saved))
    setCurrentId(saved.id)
    setOpenProduct(null)
    setMessage('Projeto carregado.')
  }

  async function deleteProject() {
    if (!accessToken || !currentId || !window.confirm(`Excluir o projeto “${flyer.name}”?`)) return
    await apiRequest(`flyers/${currentId}/`, { accessToken, method: 'DELETE' })
    setProjects(current => current.filter(project => project.id !== currentId))
    clearProject()
    setMessage('Projeto excluído.')
  }

  function clearProject() {
    resetFlyer(newProject())
    setCurrentId(null)
    setSelectedProject('')
    setOpenProduct(null)
    setMessage('')
    setError('')
  }

  async function download(format: 'png' | 'pdf' | 'zip' | 'jpeg', page?: number) {
    if (!pages.length) return
    if (!accessToken) return requestLogin()
    const exportedProducts = print ? (page === undefined ? pages.flatMap(sheet => sheet.products) : pages[page].products) : []
    if (print) validateProductFields(exportedProducts, true)
    const request = `${format}:${page ?? 'all'}`
    let entry = lastExport.current
    if (!entry || entry.design !== design || entry.pages !== pages || entry.request !== request) {
      const count = page === undefined ? pages.length : 1
      const operation: CreditOperation = {
        key: crypto.randomUUID(), kind: exportKind, count,
        format: format === 'png' && count > 1 ? 'zip' : format,
        premium: design.template === 'professional',
      }
      await creditOperation(accessToken, operation)
      entry = {
        design, pages, request, operation,
        artifact: await exportFlyer(pages, design, format, page), confirmed: false,
      }
      lastExport.current = entry
    }
    if (!entry.confirmed) {
      await creditOperation(accessToken, entry.operation, entry.artifact.blob)
      entry.confirmed = true
    }
    const { blob, extension } = entry.artifact
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${flyer.name.trim().replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-|-$/g, '') || 'encarte'}.${extension}`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function validateProductFields(items: FlyerProduct[], forExport = false) {
    for (const product of items) {
      const [message] = Object.values(printProductErrors(product, forExport))
      if (message) throw new Error(`${product.name.trim() || 'Produto sem nome'} · ${message}`)
    }
  }

  function moveProduct(index: number, destination: number) {
    if (index === destination || destination < 0 || destination >= products.length) return
    const reordered = [...products]
    const [product] = reordered.splice(index, 1)
    reordered.splice(destination, 0, product)
    setFlyer(current => ({ ...current, products: reordered }))
    setOpenProduct(destination)
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">{editorTitle}</h1>
          <p className="mt-1 text-slate-600 dark:text-slate-400">{tvMode ? 'Monte playlists de ofertas e atualize os televisores da loja pelo painel.' : menuMode ? 'Monte seu cardápio para imprimir, publicar ou exibir na TV.' : storyMode ? 'Crie ofertas verticais para WhatsApp, Instagram e Facebook.' : labelsMode ? 'Monte folhas A4 com etiquetas de preço personalizadas.' : videoMode ? 'Monte ofertas animadas para a TV da loja.' : printMode ? 'Prepare cartazes e etiquetas de preço para imprimir em tamanho real.' : 'Monte ofertas em páginas A4 para divulgar ou imprimir.'}</p>
          {!videoMode && <p className="mt-1 text-sm">Exportação · {pageCost} {pageCost === 1 ? 'crédito' : 'créditos'} por página. <a href="/plans" className="underline">Ver planos</a></p>}
          {!videoMode && pages.length > 1 && <p className="text-sm">{freeBatchExceeded
            ? 'No Grátis, exporte até 5 páginas por lote ou baixe uma página pela prévia.'
            : `Exportar todas as ${pages.length} páginas custa ${pages.length * pageCost} créditos.`}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondary} disabled={busy || !canUndo} onClick={undo}>Desfazer</button>
          <button type="button" className={secondary} disabled={busy || !canRedo} onClick={redo}>Refazer</button>
          {!videoMode && <>
            <button type="button" className={secondary} disabled={busy || !pages.length || freeBatchExceeded} onClick={() => void run(() => download(printMode && !free ? 'zip' : 'png'))}><FileImage size={17} /> {printMode && !free || free && pages.length > 1 ? 'Exportar ZIP de PNGs' : 'Exportar PNG'}</button>
            {!free && !storyMode && <button type="button" className={secondary} disabled={busy || !pages.length} onClick={() => void run(() => download('pdf'))}><FileText size={17} /> Exportar PDF</button>}
          </>}
          <button type="button" className={primary} disabled={busy} onClick={() => void run(save)}><Save size={17} /> {documentMode ? 'Salvar encarte' : 'Salvar projeto'}</button>
        </div>
      </header>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>}
      {(busy || message) && <p role="status" className="text-sm text-indigo-700 dark:text-indigo-300">{busy ? 'Processando…' : message}</p>}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(360px,460px)_minmax(0,1fr)]">
        <fieldset disabled={busy} className="min-w-0 space-y-4">
          <legend className="sr-only">{videoMode ? 'Editor de vídeo' : printMode ? 'Editor de impressão' : 'Editor de encarte'}</legend>
          <section className={panel}>
            <h2 className="font-bold">Projeto</h2>
            <Field label="Nome do projeto"><input className={field} maxLength={180} value={flyer.name} onChange={event => setFlyer(current => ({ ...current, name: event.target.value }))} /></Field>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-40 flex-1">
                <Field label="Projetos salvos"><select className={field} value={selectedProject} onChange={event => setSelectedProject(event.target.value)}>
                  <option value="">Selecione um projeto</option>
                  {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select></Field>
              </div>
              <button type="button" className={secondary} disabled={!selectedProject} onClick={() => void run(openProject)}>Abrir</button>
              <button type="button" className={secondary} disabled={busy} onClick={clearProject}>Novo</button>
              {currentId && <button type="button" className={secondary} disabled={busy} onClick={() => void run(deleteProject)}>Excluir projeto</button>}
            </div>
            {moreProjects && <button type="button" className={secondary} onClick={() => { setMoreProjects(false); setProjectPage(page => page + 1) }}>Mais projetos</button>}
          </section>
          {(menuMode || tvMode) && currentId && accessToken && <ProjectShares key={currentId} projectId={currentId} accessToken={accessToken} kind={tvMode ? 'tv' : 'menu'} />}
          {tvMode && <details className={panel}>
            <summary className="cursor-pointer font-bold">Como abrir na Smart TV</summary>
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              <li>Adicione ofertas ou imagens à playlist e salve o projeto.</li>
              <li>Crie um link para a TV e abra esse endereço no navegador do aparelho ou em um computador conectado por HDMI.</li>
              <li>Selecione “Tela cheia” no player. Ao salvar alterações neste painel, a TV verifica a playlist a cada 30 segundos.</li>
            </ol>
          </details>}
          {print && <PrintControls settings={print} products={products} error={printError} onChange={editPrint} labelsOnly={labelsMode} />}
          {video && <VideoControls settings={video} onChange={changes => editDesign({ video: { ...video, ...changes } })} />}
          <section className={panel}>
            <h2 className="font-bold">Visual e layout</h2>
            {menuMode && <Field label="Formato do cardápio">
              <select className={field} value={menu} onChange={event => editDesign({ menu: event.target.value as MenuFormat })}>
                {MENU_FORMATS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </Field>}
            {storyMode && <Field label="Canal do story">
              <select className={field} value={design.story} onChange={event => editDesign({ story: event.target.value as StoryChannel })}>
                {STORY_CHANNELS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </Field>}
            <Field label="Modelo visual"><select className={field} value={design.template} onChange={event => {
              const template = event.target.value as FlyerDesign['template']
              const { primary, accent, background, font, border, badge } = FLYER_TEMPLATES[template]
              editDesign({ template, primary, accent, background, font, border, badge })
            }}>
              {Object.entries(FLYER_TEMPLATES).filter(([key]) => key !== 'professional' || !free && (documentMode || print?.kind === 'poster' || design.template === 'professional'))
                .map(([key, template]) => <option key={key} value={key}>{template.label}</option>)}
            </select></Field>
            <Field label="Nome da loja"><input className={field} maxLength={100} value={design.storeName} onChange={event => editDesign({ storeName: event.target.value })} /></Field>
            <Field label={documentMode ? 'Título do encarte' : 'Título do material'}><input className={field} maxLength={100} value={design.title} onChange={event => editDesign({ title: event.target.value })} /></Field>
            <Field label="Subtítulo"><input className={field} maxLength={160} value={design.subtitle} onChange={event => editDesign({ subtitle: event.target.value })} /></Field>
            {(documentMode || menuMode) && <div className="grid grid-cols-2 gap-3">
              <Field label="Produtos por página"><select className={field} value={design.layout} onChange={event => editDesign({ layout: Number(event.target.value) as FlyerDesign['layout'] })}>
                {FLYER_LAYOUTS.map(layout => <option key={layout}>{layout}</option>)}
              </select></Field>
              {documentMode && <Field label="Disposição"><select className={field} value={design.arrangement} onChange={event => editDesign({ arrangement: event.target.value as FlyerDesign['arrangement'] })}>
                <option value="standard">{flyerGrid(design.layout, 'standard').cols} colunas</option>
                <option value="wide">{flyerGrid(design.layout, 'wide').cols} colunas</option>
              </select></Field>}
            </div>}
            <Field label="Fonte"><select className={field} value={design.font} onChange={event => editDesign({ font: event.target.value as FlyerDesign['font'] })}>
              <option value="sans">Arial</option><option value="serif">Georgia</option><option value="mono">Courier New</option>
            </select></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Borda dos cards"><select className={field} value={design.border} onChange={event => editDesign({ border: event.target.value as FlyerDesign['border'] })}>
                <option value="none">Sem borda</option><option value="thin">Fina</option><option value="strong">Marcante</option>
              </select></Field>
              <Field label="Etiqueta de desconto"><select className={field} value={design.badge} onChange={event => editDesign({ badge: event.target.value as FlyerDesign['badge'] })}>
                <option value="pill">Arredondada</option><option value="square">Retangular</option><option value="burst">Estrela</option><option value="none">Oculta</option>
              </select></Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {([['primary', 'Cabeçalho'], ['accent', 'Destaque'], ['background', 'Fundo']] as const).map(([key, label]) =>
                <Field key={key} label={label} className="flex min-w-0 flex-col justify-between"><input type="color" className="mt-1 h-9 w-full cursor-pointer" value={design[key]} onChange={event => editDesign({ [key]: event.target.value })} /></Field>,
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {([
                ['headerTextColor', 'Cor do título principal', contrast(design.primary)],
                ['storeNameColor', 'Cor do nome da loja', design.headerTextColor ?? contrast(design.primary)],
                ['subtitleColor', 'Cor do subtítulo', design.headerTextColor ?? contrast(design.primary)],
                ['categoryTextColor', 'Texto da categoria', design.headerTextColor ?? contrast(design.primary)],
                ['productTextColor', 'Nome do produto na arte', design.template === 'professional' ? '#082b12' : contrast(design.background)],
              ] as const).map(([key, label, fallback]) =>
                <Field key={key} label={label} className="flex min-w-0 flex-col justify-between"><input type="color" className="mt-1 h-9 w-full cursor-pointer"
                  value={design[key] ?? fallback} onChange={event => editDesign({ [key]: event.target.value })} /></Field>,
              )}
            </div>
            {([['logo', 'Logotipo', 360, 66000], ['backgroundImage', 'Imagem de fundo', 850, 132000]] as const).map(([key, label, size, limit]) =>
              <div key={key} className="space-y-1">
                <Field label={label}><input className={field} type="file" accept={imageTypes} onChange={event => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (file) void run(async () => editDesign({ [key]: await prepareFlyerImage(file, size, limit) }))
                }} /></Field>
                {(editablePreview || video || print?.kind === 'labels') && key === 'backgroundImage' && <FlyerBackgroundCarousel onSelect={url => void run(async () => {
                  editDesign({ backgroundImage: await loadFlyerBackground(url) })
                })} />}
                {design[key] && <button type="button" className="text-sm font-semibold text-indigo-600 dark:text-indigo-300" onClick={() => editDesign({ [key]: '' })}>Remover {label.toLowerCase()}</button>}
                {key === 'logo' && design.logo && <>
                  <Field label="Tamanho do logotipo">
                    <input type="range" className="mt-1 block w-full" min={50} max={160} value={design.logoScale ?? 100}
                      onChange={event => editDesign({ logoScale: event.target.valueAsNumber })} />
                  </Field>
                  <ProductCutout key={design.logo} url={design.logo} buttonLabel="Remover fundo do logotipo"
                    onApply={async file => editDesign({ logo: await prepareFlyerImage(file, size, limit) })} />
                </>}
              </div>,
            )}
            {video && design.backgroundImage && <Field label="Intensidade da imagem de fundo">
              <input className="mt-1 w-full" type="range" min={0} max={100} value={video.backgroundOpacity ?? 20}
                onChange={event => editDesign({ video: { ...video, backgroundOpacity: event.target.valueAsNumber } })} />
            </Field>}
            {(documentMode || menuMode) && <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={design.grouped} onChange={event => editDesign({ grouped: event.target.checked })} /> Separar páginas por categoria
            </label>}
          </section>
          <section className={panel}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold">Produtos <span className="ml-1 text-sm font-medium text-slate-500">{products.length}/{FLYER_LIMIT}</span></h2>
              <button type="button" className={secondary} disabled={products.length >= FLYER_LIMIT} onClick={() => {
                appendProducts([{ name: 'Novo produto', category: '', price: '', originalPrice: '', discount: '', imageUrl: '' }])
                setOpenProduct(products.length)
              }}><Plus size={16} /> Adicionar</button>
            </div>
            <label className={`${secondary} cursor-pointer`}>
              <Upload size={16} /> Importar CSV
              <input type="file" className="sr-only" accept=".csv,text/csv" onChange={event => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) void run(async () => {
                  if (file.size > 2 * 1024 * 1024) throw new Error('Selecione um CSV de até 2 MB.')
                  appendProducts(parseProductCsv(await file.text()).map(flyerProduct))
                })
              }} />
            </label>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-40 flex-1">
                <Field label="Campanha salva"><select className={field} value={selectedCampaign} onChange={event => setSelectedCampaign(event.target.value)}>
                  <option value="">Selecione uma campanha</option>
                  {campaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
                </select></Field>
              </div>
              <button type="button" className={secondary} disabled={!selectedCampaign} onClick={() => void run(importCampaign)}>Importar produtos</button>
            </div>
            {moreCampaigns && <button type="button" className={secondary} onClick={() => { setMoreCampaigns(false); setCampaignPage(page => page + 1) }}>Mais campanhas</button>}
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              {products.map((product, index) => {
                const fieldErrors = documentMode ? null : printProductErrors(product)
                const glow = product.glow ?? PRODUCT_GLOW_DEFAULTS
                return (
                <div key={index} className={`min-w-0 py-2 ${dropTarget === index ? 'border-t-2 border-t-indigo-500' : ''}`}
                  onDragOver={event => {
                    if (!busy && draggedProduct.current !== null) {
                      event.preventDefault()
                      event.dataTransfer.dropEffect = 'move'
                      setDropTarget(index)
                    }
                  }}
                  onDrop={event => {
                    event.preventDefault()
                    if (!busy && draggedProduct.current !== null) moveProduct(draggedProduct.current, index)
                    draggedProduct.current = null
                    setDropTarget(null)
                  }}>
                  <div className="flex items-center gap-2">
                    <span draggable={!busy} role="img" aria-label={`Arrastar ${product.name}`} title="Arraste para reordenar"
                      className="cursor-grab rounded p-2 text-slate-500 active:cursor-grabbing"
                      onDragStart={event => {
                        draggedProduct.current = index
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData('text/plain', String(index))
                      }}
                      onDragEnd={() => { draggedProduct.current = null; setDropTarget(null) }}><GripVertical size={17} aria-hidden /></span>
                    <button type="button" aria-expanded={openProduct === index} className="min-w-0 flex-1 break-words py-2 text-left text-sm font-semibold" onClick={() => setOpenProduct(openProduct === index ? null : index)}>
                      <span className="flex items-center justify-between gap-2">
                        <span>
                          {product.name || 'Produto sem nome'} {product.category && <span className="font-normal text-slate-500">· {product.category}</span>}
                          {product.featured && <span className="ml-2 font-semibold text-indigo-600 dark:text-indigo-300">Oferta principal</span>}
                        </span>
                        <ChevronDown size={16} aria-hidden="true" className={`shrink-0 ${openProduct === index ? 'rotate-180' : ''}`} />
                      </span>
                    </button>
                  </div>
                  {openProduct === index && <div className="space-y-3 pb-2">
                    {productFields.map(([key, label, max]) => {
                      const fieldError = fieldErrors?.[key]
                      const invalidPrice = (key === 'price' || key === 'originalPrice') && Boolean(product[key].trim()) && !Number.isFinite(priceNumber(product[key]))
                      const errorId = `product-${index}-${key}-error`
                      return <div key={key}>
                        <Field label={label}>
                          <input className={field} maxLength={max} list={menuMode && key === 'category' ? 'menu-product-categories' : undefined}
                            value={key === 'imageUrl' && product.imageUrl.startsWith('data:') ? '' : product[key]}
                            aria-invalid={(documentMode ? invalidPrice : Boolean(fieldError)) || undefined}
                            aria-describedby={fieldError ? errorId : undefined}
                            onChange={event => editProduct(index, { [key]: event.target.value })} />
                        </Field>
                        {fieldError && <p id={errorId} className="mt-1 text-sm text-red-600 dark:text-red-300">{fieldError}</p>}
                      </div>
                    })}
                    {documentMode && ([product.price, product.originalPrice].some(price => price.trim() && !Number.isFinite(priceNumber(price)))) &&
                      <p className="text-sm text-amber-700 dark:text-amber-300">Use valores como 19,90. Preços promocionais inválidos aparecem como “Preço sob consulta”.</p>}
                    {menuMode && <>
                      <datalist id="menu-product-categories">{MENU_CATEGORIES.map(category => <option key={category}>{category}</option>)}</datalist>
                      <Field label="Descrição do item">
                        <textarea className={field} maxLength={280} value={product.description ?? ''}
                          onChange={event => editProduct(index, { description: event.target.value })} />
                      </Field>
                    </>}
                    {(documentMode || menuMode) && <label className="flex items-center gap-2 text-sm font-medium">
                      <input type="checkbox" checked={Boolean(product.featured)} onChange={event => {
                        const featured = event.target.checked
                        setFlyer(current => ({
                          ...current, products: current.products.map((item, position) => ({
                            ...item, featured: featured && position === index,
                          })),
                        }))
                      }} /> Marcar como oferta principal
                    </label>}
                    {print?.kind === 'labels' && <>
                      <Field label="Unidade de venda">
                        <select className={field} value={product.saleUnit ?? ''} aria-invalid={Boolean(fieldErrors?.saleUnit)}
                          onChange={event => editProduct(index, { saleUnit: event.target.value })}>
                          <option value="">Sem indicação</option><option value="un">Unidade</option><option value="kg">Quilo</option><option value="l">Litro</option>
                          {fieldErrors?.saleUnit && <option value={product.saleUnit}>{product.saleUnit}</option>}
                        </select>
                      </Field>
                      {(['barcode', 'qrUrl'] as const).map(key => <div key={key}>
                        <Field label={key === 'barcode' ? 'Código de barras EAN-13' : 'Endereço do QR Code'}>
                          <input className={field} value={product[key] ?? ''} maxLength={key === 'barcode' ? 13 : 180}
                            inputMode={key === 'barcode' ? 'numeric' : 'url'} aria-invalid={Boolean(fieldErrors?.[key])}
                            onChange={event => editProduct(index, { [key]: event.target.value.trim() })} />
                        </Field>
                        {fieldErrors?.[key] && <p className="text-sm text-red-600">{fieldErrors[key]}</p>}
                      </div>)}
                    </>}
                    {(editablePreview || video || print?.kind === 'labels') && <>
                      <Field label="Etiqueta promocional">
                        <select className={field} value={product.offerLabel ?? 'OFERTA'} onChange={event => editProduct(index, {
                          offerLabel: event.target.value as FlyerProduct['offerLabel'],
                        })}>
                          {OFFER_LABELS.map(label => <option key={label}>{label}</option>)}
                        </select>
                      </Field>
                      <div className="flex flex-wrap gap-4">
                        {([
                          ['offerColor', 'Cor da faixa da oferta', design.primary],
                          ['discountColor', 'Cor do selo de desconto', design.template === 'professional' ? '#c51b2a' : design.accent],
                          ['offerTextColor', 'Texto da oferta', contrast(product.offerColor ?? design.primary)],
                          ['discountTextColor', 'Texto do selo de desconto', contrast(product.discountColor ?? (design.template === 'professional' ? '#c51b2a' : design.accent))],
                          ['oldPriceColor', 'Cor da caixa do preço anterior', '#fff8df'],
                        ] as const)
                          .map(([key, label, fallback]) => (
                            <label key={key} className="flex items-center gap-2 text-sm">
                              {label}
                              <input type="color" className="h-8 w-12" value={product[key] ?? fallback}
                                onChange={event => editProduct(index, { [key]: event.target.value })} />
                            </label>
                          ))}
                      </div>
                      {(product.offerColor || product.discountColor || product.offerTextColor || product.discountTextColor || product.oldPriceColor) && <button type="button" className={secondary}
                        onClick={() => editProduct(index, { offerColor: undefined, discountColor: undefined, offerTextColor: undefined, discountTextColor: undefined, oldPriceColor: undefined })}>Restaurar cores da promoção</button>}
                      {product.textPositions && Object.keys(product.textPositions).length > 0 &&
                        <button type="button" className={secondary} onClick={() => editProduct(index, { textPositions: undefined })}>
                          Restaurar posições dos textos
                        </button>}
                      {product.imageUrl && <div className="space-y-2">
                        {([
                          ['photoScale', 'Escala da foto', 50, MAX_FLYER_PHOTO_SCALE],
                          ['photoX', 'Posição horizontal', -100, 100],
                          ['photoY', 'Posição vertical', -100, 100],
                        ] as const).map(([key, label, min, max]) => (
                          <Field key={key} label={label}>
                            <input className="block w-full" type="range" min={min} max={max} value={product[key] ?? PHOTO_DEFAULTS[key]} disabled={product.lockedLayers?.includes('photo')}
                              onChange={event => editProduct(index, { [key]: event.target.valueAsNumber })} />
                          </Field>
                        ))}
                        <button type="button" className={secondary} disabled={product.lockedLayers?.includes('photo')} onClick={() => editProduct(index, PHOTO_DEFAULTS)}>Centralizar foto</button>
                        <div className="mt-3 space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                          <label className="flex items-center gap-2 text-sm font-semibold">
                            <input type="checkbox" checked={glow.enabled}
                              onChange={event => editProduct(index, { glow: { ...glow, enabled: event.target.checked } })} />
                            Brilho do produto
                          </label>
                          {glow.enabled && <>
                            <label className="flex items-center justify-between gap-2 text-sm">
                              Cor do brilho
                              <input type="color" className="h-8 w-12" value={glow.color}
                                onChange={event => editProduct(index, { glow: { ...glow, color: event.target.value } })} />
                            </label>
                            {([['intensity', 'Intensidade do brilho', 0, MAX_GLOW_INTENSITY], ['blur', 'Difusão do brilho', 1, 10]] as const).map(([key, label, min, max]) => (
                              <Field key={key} label={label}>
                                <span aria-hidden="true" className="ml-2 text-slate-500">{glow[key]}%</span>
                                <input aria-label={label} type="range" className="block w-full" min={min} max={max} value={glow[key]}
                                  onChange={event => editProduct(index, { glow: { ...glow, [key]: event.target.valueAsNumber } })} />
                              </Field>
                            ))}
                          </>}
                        </div>
                      </div>}
                      <Field label="Fotos secundárias (até 3)">
                        <input className={field} type="file" multiple accept={imageTypes} disabled={(product.detailPhotos?.length ?? 0) >= 3} onChange={event => {
                          const files = Array.from(event.target.files ?? [])
                          event.target.value = ''
                          if (files.length) void run(async () => {
                            const details = product.detailPhotos ?? []
                            if (details.length + files.length > 3) throw new Error('Adicione até três fotos secundárias por produto.')
                            const uploaded = await Promise.all(files.map(file => prepareFlyerImage(file, 160, 2400)))
                            editProduct(index, { detailPhotos: [...details, ...uploaded] })
                          })
                        }} />
                      </Field>
                      {(product.detailPhotos ?? []).map((url, detailIndex) => (
                        <div key={detailIndex} className="flex items-center gap-3">
                          <img src={url} alt={`Foto secundária ${detailIndex + 1}`} className="h-10 w-10 rounded-full object-cover" />
                          <button type="button" className={secondary} onClick={() => editProduct(index, {
                            detailPhotos: product.detailPhotos?.filter((_, photoIndex) => photoIndex !== detailIndex),
                          })}>Remover foto secundária {detailIndex + 1}</button>
                        </div>
                      ))}
                    </>}
                    {video && <Field label="Duração desta oferta (segundos)">
                      <input type="number" min={1} max={60} step={1} className={field} placeholder={String(video.duration)}
                        value={product.duration ?? ''} onChange={event => editProduct(index, {
                          duration: event.target.value === '' ? undefined : event.target.valueAsNumber,
                        })} />
                    </Field>}
                    {tvMode && <Field label="Enviar banner para tela inteira">
                      <input className={field} type="file" accept={imageTypes} onChange={event => {
                        const file = event.target.files?.[0]
                        event.target.value = ''
                        if (file) void run(async () => editProduct(index, { slideImageUrl: await prepareFlyerImage(file, 1440, 132000) }))
                      }} />
                    </Field>}
                    {tvMode && product.slideImageUrl && <button type="button" className={secondary}
                      onClick={() => editProduct(index, { slideImageUrl: '' })}>Remover banner de tela inteira</button>}
                    <Field label="Enviar foto do produto"><input className={field} type="file" accept={imageTypes} onChange={event => {
                      const file = event.target.files?.[0]
                      event.target.value = ''
                      if (file) void run(async () => editProduct(index, { imageUrl: await prepareFlyerImage(file, 420, 15000) }))
                    }} /></Field>
                    {(print || documentMode) && product.imageUrl && <ProductCutout key={product.imageUrl} url={product.imageUrl} onApply={async file => {
                      editProduct(index, { imageUrl: await prepareFlyerImage(file, 420, 15000) })
                    }} />}
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={secondary} disabled={!index} onClick={() => moveProduct(index, index - 1)}>Subir</button>
                      <button type="button" className={secondary} disabled={index === products.length - 1} onClick={() => moveProduct(index, index + 1)}>Descer</button>
                      {product.imageUrl && <button type="button" className={secondary} onClick={() => editProduct(index, { imageUrl: '' })}>Remover foto</button>}
                      <button type="button" className={secondary} onClick={() => removeProduct(index)}>Excluir produto</button>
                    </div>
                  </div>}
                </div>
                )
              })}
            </div>
          </section>
        </fieldset>
        {video ? <VideoPreview products={products} design={design} settings={video} name={flyer.name} invalid={invalidVideo} busy={busy} playbackOnly={tvMode} /> :
        <section aria-label={printMode ? 'Prévias de impressão' : 'Prévias do encarte'} className="min-w-0 rounded-2xl bg-slate-200/70 p-4 dark:bg-slate-900 sm:p-6 xl:sticky xl:top-24 xl:max-h-[calc(100dvh-7rem)] xl:overflow-y-auto">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">{menuMode ? 'Prévia do cardápio' : storyMode ? 'Prévia dos stories' : printMode ? 'Prévia de impressão' : 'Prévia do encarte'}</h2>
            <span className="text-sm text-slate-600 dark:text-slate-400">{pages.length} {pages.length === 1 ? 'página' : 'páginas'} · {storyMode ? '1080 × 1920 px' : menuSize && menu !== 'a4' ? `${menuSize.width} × ${menuSize.height} px` : print?.kind === 'poster' ? print.paper : 'A4'}{print && ` · ${paper.width} × ${paper.height} mm`}</span>
          </div>
          {print && <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">Para manter as medidas, imprima o PDF em tamanho real (100%).</p>}
          {print?.mode === 'single' && products.length > 1 && <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
            O modo Individual mostra o produto selecionado em “Produto para impressão”. Para ver todos, escolha “Em massa”.
          </p>}
          {editablePreview && <label className="mb-4 flex w-fit items-center gap-2 text-sm font-medium"><input type="checkbox" checked={showGuides} onChange={event => setShowGuides(event.target.checked)} /> Guias de alinhamento</label>}
          {pages.length > 1 && <Field label="Ir para a página" className="mb-4 block">
            <select className={field} value="" onChange={event => {
              previewPages.current?.children[Number(event.target.value)]?.scrollIntoView({ block: 'start' })
            }}>
              <option value="" disabled>Selecione uma página</option>
              {pages.map((page, index) => <option key={index} value={index}>
                {index + 1} · {page.category || page.products[0]?.name || 'Produto sem nome'}
              </option>)}
            </select>
          </Field>}
          <div ref={previewPages} className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-5">
            {(pages.length ? pages : printError ? [] : [emptyPage]).map((page, index) => <div key={index} className="min-w-0 scroll-mt-24 xl:scroll-mt-0">
              <FlyerPreview page={page} design={design}
              index={index} total={pages.length} busy={busy} showGuides={showGuides}
              activeProduct={openProduct === null ? undefined : products[openProduct]}
              onSelectProduct={documentMode ? product => {
                const position = products.indexOf(product)
                if (position >= 0) setOpenProduct(position)
              } : undefined}
              onMoveProduct={documentMode ? product => {
                const position = products.indexOf(product)
                if (position < 0) return undefined
                return (adjustment, group) => editProduct(position, {
                  cardPosition: { x: adjustment.photoX ?? 0, y: adjustment.photoY ?? 0 },
                }, group)
              } : undefined}
              onRemoveProduct={documentMode ? product => {
                const position = products.indexOf(product)
                if (position >= 0) removeProduct(position)
              } : undefined}
              onToggleLock={editablePreview ? (layer) => {
                if ('designLayer' in layer) {
                  const key = layer.designLayer
                  const locked = design.lockedLayers ?? []
                  editDesign({ lockedLayers: locked.includes(key) ? locked.filter(item => item !== key) : [...locked, key] })
                } else {
                  const position = products.indexOf(layer.product)
                  if (position < 0) return
                  const locked = layer.product.lockedLayers ?? []
                  editProduct(position, { lockedLayers: locked.includes(layer.layer) ? locked.filter(item => item !== layer.layer) : [...locked, layer.layer] })
                }
              } : undefined}
              onMoveDesignLayer={editablePreview ? (layer, adjustment, group) => {
                setFlyer(current => ({ ...current, design: { ...current.design, layerPositions: {
                  ...current.design.layerPositions, [layer]: { x: adjustment.photoX ?? 0, y: adjustment.photoY ?? 0 },
                } } }), group)
              } : undefined}
              onMoveLayer={editablePreview ? (product, layer) => {
                const position = products.indexOf(product)
                if (position < 0) return undefined
                if (layer === 'photo') return (adjustment, group) => editProduct(position, adjustment, group)
                return (adjustment, group) => editProduct(position, {
                  textPositions: { ...product.textPositions, [layer]: { x: adjustment.photoX ?? 0, y: adjustment.photoY ?? 0 } },
                }, group)
              } : undefined}
              onExport={pages.length ? () => void run(() => download('png', index)) : undefined} />
              {(storyMode || menuMode) && !free && pages.length > 0 && <button type="button" className={secondary} disabled={busy}
                onClick={() => void run(() => download('jpeg', index))}>Baixar JPG</button>}
            </div>)}
          </div>
        </section>}
      </div>
    </div>
  )
}
