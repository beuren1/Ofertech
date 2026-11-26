import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it } from 'vitest'
import { TemplatesPage } from './pages/Templates'

afterEach(cleanup)

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
