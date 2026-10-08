// @vitest-environment happy-dom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createStores, StoresProvider, type Stores } from '../../app/stores'
import { createLayout, type Tent } from '../../core/model'
import { Toolbar } from './Toolbar'

const TENT: Tent = { name: '시험 텐트', outer: { kind: 'rect', w: 400, h: 300 }, inners: [] }

function renderToolbar(): Stores {
  const stores = createStores(createLayout(TENT, { name: '배치' }))
  render(
    <StoresProvider stores={stores}>
      <Toolbar />
    </StoresProvider>,
  )
  return stores
}

describe('Toolbar(모바일)', () => {
  it('버튼은 [+물건]·[선택] 두 개뿐이다([텐트]·[측정]은 Plan 4·5)', () => {
    renderToolbar()
    const buttons = within(screen.getByTestId('toolbar')).getAllByRole('button')
    expect(buttons.map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['+물건', '선택'])
  })

  it('[+물건]은 라이브러리 시트를 열고, 열려 있으면 닫는다', () => {
    const stores = renderToolbar()
    const add = screen.getByRole('button', { name: '+물건' })
    expect(add.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(add)
    expect(stores.ui.getState().mobileSheet).toBe('library')
    expect(add.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(add)
    expect(stores.ui.getState().mobileSheet).toBe('none')
  })

  it('[+물건]은 선택 시트가 열려 있어도 라이브러리 시트로 바꾼다', () => {
    const stores = renderToolbar()
    stores.ui.getState().patch({ mobileSheet: 'selection' })
    fireEvent.click(screen.getByRole('button', { name: '+물건' }))
    expect(stores.ui.getState().mobileSheet).toBe('library')
  })

  it('[선택]은 selectToggle을 켜고 끄며 켜짐을 aria-pressed로 보여 준다', () => {
    const stores = renderToolbar()
    const toggle = screen.getByRole('button', { name: '선택' })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(toggle)
    expect(stores.ui.getState().selectToggle).toBe(true)
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(toggle)
    expect(stores.ui.getState().selectToggle).toBe(false)
  })
})
