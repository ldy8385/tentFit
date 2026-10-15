// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createStores, StoresProvider, type Stores } from '../../app/stores'
import { createLayout } from '../../core/model'
import { CornerControls } from './GridStepControl'

afterEach(() => {
  cleanup()
  localStorage.removeItem('tentfit.gridStep')
})

function setup(gridChip = true): Stores {
  const stores = createStores(createLayout({ name: 't', outer: { kind: 'rect', w: 600, h: 300 }, inners: [] }, { name: 'l' }))
  render(
    <StoresProvider stores={stores}>
      <CornerControls gridChip={gridChip} />
    </StoresProvider>,
  )
  return stores
}

describe('격자 간격 칩(소유자 요청 2026-10-15)', () => {
  it('「격자 10cm」를 누르면 간격 입력·빠른 선택, 굵은 선 안내', () => {
    const s = setup()
    fireEvent.click(screen.getByRole('button', { name: '격자 10cm' }))
    expect(screen.getByText('굵은 선은 100cm마다')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '1cm' }))
    expect(s.ui.getState().gridStep).toBe(1)
    expect(screen.getByRole('button', { name: '격자 1cm' })).toBeTruthy()
    expect(screen.getByText('굵은 선은 10cm마다')).toBeTruthy()
    const input = screen.getByLabelText('격자 간격')
    fireEvent.change(input, { target: { value: '250' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(s.ui.getState().gridStep).toBe(250)
  })

  it('칩 없이(휴대폰 편집 화면 = ☰ 메뉴에서 엶): 화면 상태로 열고 [닫기]로 닫음', () => {
    const s = setup(false)
    expect(screen.queryByRole('button', { name: /^격자 / })).toBeNull()
    act(() => s.ui.getState().patch({ gridPanelOpen: true }))
    fireEvent.click(screen.getByRole('button', { name: '50cm' }))
    expect(s.ui.getState().gridStep).toBe(50)
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(s.ui.getState().gridPanelOpen).toBe(false)
    expect(screen.queryByText('굵은 선은 500cm마다')).toBeNull()
  })

  it('배경 이미지 칩도 같은 자리에', () => {
    setup()
    expect(screen.getByRole('button', { name: '배경 이미지' })).toBeTruthy()
  })
})
