import type { Promotion } from './types'

export const promotions: Promotion[] = [
  { id: 1, name: 'Semana do Tênis', channel: 'Instagram', status: 'Pronta', createdAt: 'Hoje, 10:24', color: '#6366f1' },
  { id: 2, name: 'Liquida Verão', channel: 'WhatsApp', status: 'Pronta', createdAt: 'Ontem, 16:40', color: '#14b8a6' },
  { id: 3, name: 'Kit Beleza', channel: 'Facebook', status: 'Processando', createdAt: '20 Nov, 09:12', color: '#f97316' },
  { id: 4, name: 'Black Friday Antecipada', channel: 'Instagram', status: 'Rascunho', createdAt: '19 Nov, 14:31', color: '#ec4899' },
]

export const templates = [
  { id: 1, name: 'Oferta Vibrante', category: 'Promoção', colors: ['#4f46e5', '#a855f7', '#f97316'] },
  { id: 2, name: 'Elegância Premium', category: 'Lançamento', colors: ['#0f172a', '#475569', '#e2e8f0'] },
  { id: 3, name: 'Flash Sale', category: 'Desconto', colors: ['#dc2626', '#f97316', '#facc15'] },
  { id: 4, name: 'Marketplace', category: 'Marketplace', colors: ['#0891b2', '#22d3ee', '#ecfeff'] },
  { id: 5, name: 'Food Lovers', category: 'Restaurante', colors: ['#b91c1c', '#fb923c', '#fef3c7'] },
  { id: 6, name: 'Minimalismo', category: 'Marca', colors: ['#fafafa', '#d4d4d4', '#171717'] },
]
