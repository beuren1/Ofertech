import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it } from 'vitest'
import { TemplatesPage } from './pages/Templates'

afterEach(cleanup)

it('shows the five original artwork examples in Banners only', () => {
  render(<MemoryRouter><TemplatesPage /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Banners' }))
  const examples = screen.getByRole('region', { name: 'Exemplos de banners' })
  expect(within(examples).getAllByRole('img')).toHaveLength(5)
  expect(within(examples).getByRole('img', { name: /TechMax/ }).getAttribute('src')).toBe('/banner-examples/techmax.png')
  fireEvent.click(screen.getByRole('button', { name: 'Vídeos' }))
  expect(screen.queryByRole('region', { name: 'Exemplos de banners' })).toBeNull()
})

it('shows the five original bulk artwork examples under Criação em massa', () => {
  render(<MemoryRouter><TemplatesPage /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Criação em massa' }))
  const examples = screen.getByRole('region', { name: 'Exemplos de criação em massa' })
  expect(within(examples).getAllByRole('img')).toHaveLength(5)
  fireEvent.click(screen.getByRole('button', { name: 'Moda' }))
  expect(within(examples).getByRole('link').getAttribute('href')).toBe('/bulk-examples/03_moda_criacao_em_massa.png')
})

it('shows the five original flyer images under Encartes and filters by segment', () => {
  render(<MemoryRouter><TemplatesPage /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Encartes' }))
  const examples = screen.getByRole('region', { name: 'Exemplos de encartes' })
  expect(within(examples).getAllByRole('img')).toHaveLength(5)
  expect(screen.queryByRole('region', { name: 'Exemplos de banners' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Farmácia' }))
  expect(within(examples).getAllByRole('img')).toHaveLength(1)
  expect(within(examples).getByRole('link').getAttribute('href')).toBe('/flyer-examples/04_encarte_farmacia.png')
})

it('shows the five original poster images under Cartazes', () => {
  render(<MemoryRouter><TemplatesPage /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Cartazes' }))
  const examples = screen.getByRole('region', { name: 'Exemplos de cartazes' })
  expect(within(examples).getAllByRole('img')).toHaveLength(5)
  fireEvent.click(screen.getByRole('button', { name: 'Farmácia' }))
  expect(within(examples).getByRole('link').getAttribute('href')).toBe('/poster-examples/02_cartaz_farmacia.png')
})

it('shows three editable examples in each of the five formats', () => {
  render(<MemoryRouter><TemplatesPage /></MemoryRouter>)
  for (const [format, path] of [
    ['Banners', '/generator'], ['Criação em massa', '/bulk'], ['Encartes', '/flyers'],
    ['Cartazes', '/print'], ['Vídeos', '/videos'],
  ]) {
    const section = screen.getByRole('heading', { name: format }).closest('section')!
    const links = within(section).getAllByRole('link', { name: /Usar modelo/ })
    expect(links).toHaveLength(3)
    expect(new Set(links.map(link => link.getAttribute('href'))).size).toBe(3)
    expect(links.every(link => link.getAttribute('href')?.startsWith(`${path}?template=`))).toBe(true)
  }
})

it('combines category and text filters and opens the applicable flyer preset', () => {
  render(<MemoryRouter><TemplatesPage /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Farmácia' }))
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'farmacia azul' } })
  expect(screen.getByRole('status').textContent).toBe('1 modelo encontrado')
  expect(screen.getByRole('link', { name: 'Usar modelo Farmácia azul' }).getAttribute('href')).toBe('/flyers?template=06_farmacia_azul')
  fireEvent.click(screen.getByRole('button', { name: 'Atacarejo' }))
  expect(screen.queryByRole('link', { name: /Usar modelo/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
  expect(screen.getByRole('link', { name: 'Usar modelo Ofertas de Natal' })).toBeTruthy()
})
