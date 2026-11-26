export type Promotion = {
  id: number
  name: string
  channel: string
  status: 'Pronta' | 'Processando' | 'Rascunho'
  createdAt: string
  color: string
}
