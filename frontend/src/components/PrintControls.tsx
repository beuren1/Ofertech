import { LABEL_SIZES, PAPER, printGrid, type PrintSettings } from '../printLayout'
import type { FlyerProduct } from '../flyers'

const input = 'mt-1 block w-full min-w-0 rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-700 dark:bg-slate-900'

export function PrintControls({ settings, products, error, onChange, allowLabels = true, labelsOnly = false }: {
  settings: PrintSettings; products: FlyerProduct[]; error: string; onChange: (changes: Partial<PrintSettings>) => void; allowLabels?: boolean; labelsOnly?: boolean
}) {
  const labels = settings.kind === 'labels'
  const { cols, rows } = printGrid(settings)
  const numberField = (key: 'margin' | 'labelWidth' | 'labelHeight' | 'copies', label: string, min: number, max: number, step = 1) => (
    <label className="block text-sm font-medium">{label}
      <input className={input} type="number" min={min} max={max} step={step} value={Number.isFinite(settings[key]) ? settings[key] : ''}
        onChange={event => onChange({ [key]: event.target.valueAsNumber })} />
    </label>
  )
  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="font-bold">Formato de impressão</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {!labelsOnly && <label className="block text-sm font-medium">Tipo de material
          <select className={input} value={settings.kind} onChange={event => onChange({ kind: event.target.value as PrintSettings['kind'] })}>
            <option value="poster">Cartazes</option><option value="labels" disabled={!allowLabels}>Etiquetas de preço{!allowLabels ? ' · Pro' : ''}</option>
          </select>
        </label>}
        <label className="block text-sm font-medium">Geração
          <select className={input} value={settings.mode} onChange={event => onChange({ mode: event.target.value as PrintSettings['mode'] })}>
            <option value="bulk" disabled={!allowLabels}>Em massa{!allowLabels ? ' · Pro' : ''}</option><option value="single">Individual</option>
          </select>
        </label>
        {settings.mode === 'single' && <label className="block min-w-0 text-sm font-medium sm:col-span-2">Produto para impressão
          <select className={input} value={Math.max(0, Math.min(settings.selectedProduct, products.length - 1))} onChange={event => onChange({ selectedProduct: Number(event.target.value) })}>
            {!products.length && <option value={0}>Adicione um produto</option>}
            {products.map((product, index) => <option key={index} value={index}>{product.name}</option>)}
          </select>
        </label>}
        {!labels && <label className="block text-sm font-medium">Orientação
          <select className={input} value={settings.orientation ?? 'portrait'} onChange={event => onChange({ orientation: event.target.value as PrintSettings['orientation'] })}>
            <option value="portrait">Retrato</option><option value="landscape">Paisagem</option>
          </select>
        </label>}
        {labels ? <>
          <label className="block text-sm font-medium">Tamanho da etiqueta
            <select className={input} value={LABEL_SIZES.find(size => size.labelWidth === settings.labelWidth && size.labelHeight === settings.labelHeight)?.name ?? ''}
              onChange={event => {
                const size = LABEL_SIZES.find(option => option.name === event.target.value)
                if (size) onChange({ labelWidth: size.labelWidth, labelHeight: size.labelHeight })
              }}>
              <option value="" disabled>Personalizado</option>
              {LABEL_SIZES.map(size => <option key={size.name} value={size.name}>{size.name} · {size.labelWidth} × {size.labelHeight} mm</option>)}
            </select>
          </label>
          {numberField('labelWidth', 'Largura da etiqueta (mm)', 20, 204, 0.1)}
          {numberField('labelHeight', 'Altura da etiqueta (mm)', 15, 291, 0.1)}
          {numberField('copies', 'Cópias por produto', 1, 10)}
        </> : <label className="block text-sm font-medium">Papel
          <select className={input} value={settings.paper} onChange={event => onChange({ paper: event.target.value as PrintSettings['paper'] })}>
            {Object.entries(PAPER).map(([name, size]) => <option key={name} value={name}>{name} · {size.width} × {size.height} mm</option>)}
          </select>
        </label>}
        {numberField('margin', 'Margem (mm)', 3, 20, 0.1)}
        <label className="block text-sm font-medium">Posição da foto
          <select className={input} value={settings.photoPosition} onChange={event => onChange({ photoPosition: event.target.value as PrintSettings['photoPosition'] })}>
            <option value="top">Acima dos preços</option><option value="left">À esquerda</option><option value="right">À direita</option>
          </select>
        </label>
        <label className="block text-sm font-medium">Alinhamento do texto
          <select className={input} value={settings.textAlign} onChange={event => onChange({ textAlign: event.target.value as PrintSettings['textAlign'] })}>
            <option value="center">Centralizado</option><option value="left">À esquerda</option>
          </select>
        </label>
      </div>
      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : labels &&
        <p className="text-sm text-slate-600 dark:text-slate-400">{cols * rows} etiquetas por folha A4 ({cols} × {rows}), com 3 mm entre etiquetas.</p>}
    </section>
  )
}
