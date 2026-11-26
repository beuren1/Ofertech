import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { BRAND, BRAND_DESCRIPTION, SLOGAN } from './Brand'

const publicPages: Record<string, [string, string]> = {
  '/': [`${BRAND} | ${SLOGAN}`, BRAND_DESCRIPTION],
  '/login': [`Entrar na ${BRAND}`, 'Acesse sua conta Ofertech para editar seus materiais e retomar seus projetos.'],
  '/register': [`Crie sua conta na ${BRAND}`, 'Cadastre-se na Ofertech para criar banners, encartes e cartazes para sua loja.'],
  '/plans': [`Planos e créditos | ${BRAND}`, 'Compare os planos Grátis, Pro e Business da Ofertech e confira os créditos para criar materiais promocionais.'],
}

const workspacePages: Record<string, [string, string]> = {
  '/dashboard': ['Visão geral', 'Acompanhe e reabra suas campanhas promocionais.'],
  '/forgot-password': ['Recuperar senha', 'Solicite um link para recuperar a senha da sua conta.'],
  '/reset-password': ['Criar nova senha', 'Redefina a senha da sua conta Ofertech.'],
  '/admin-dashboard': ['Administração comercial', 'Acompanhe usuários, uso da plataforma e assinaturas da Ofertech.'],
  '/generator': ['Criar promoção', 'Crie e personalize um banner promocional.'],
  '/bulk': ['Criação em massa', 'Importe produtos e gere artes para suas campanhas.'],
  '/flyers': ['Criar Encarte', 'Monte encartes com vários produtos e exporte em PDF ou PNG.'],
  '/print': ['Criar Cartaz', 'Crie cartazes e etiquetas de preço para impressão em tamanho real.'],
  '/videos': ['Criar Vídeo', 'Crie ofertas animadas para reproduzir em loop na TV da sua loja.'],
  '/templates': ['Templates', 'Explore os modelos disponíveis para suas promoções.'],
  '/history': ['Histórico', 'Consulte suas promoções e campanhas anteriores.'],
  '/settings': ['Configurações', 'Gerencie as configurações da sua conta.'],
  '/store': ['Minha loja', 'Personalize a identidade da sua loja e o logotipo das suas artes.'],
}

export function PageMetadata() {
  const { pathname } = useLocation()
  useEffect(() => {
    const path = pathname.replace(/\/+$/, '') || '/'
    const visible = publicPages[path]
    const workspace = workspacePages[path]
    const [title, description] = visible ?? (workspace
      ? [`${workspace[0]} | ${BRAND}`, workspace[1]]
      : publicPages['/'])
    document.title = title
    const metadata = [
      ['name', 'description', description],
      ['name', 'robots', visible ? 'index, follow' : 'noindex, follow'],
      ['property', 'og:title', title],
      ['property', 'og:description', description],
    ]
    for (const [attribute, name, content] of metadata) {
      const existing = document.head.querySelector(`meta[${attribute}="${name}"]`)
      const tag = existing ?? document.createElement('meta')
      tag.setAttribute(attribute, name)
      tag.setAttribute('content', content)
      if (!existing) document.head.append(tag)
    }
  }, [pathname])
  return null
}
