// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Layout } from '../../core/model'
import { createStores, StoresProvider, type Stores } from '../../app/stores'
import { SummaryChip } from './SummaryChip'
import { rectItem, tipiLayout, tunnelLayout } from './testLayouts'

function renderChip(layout: Layout): Stores {
  const stores = createStores(layout)
  render(
    <StoresProvider stores={stores}>
      <SummaryChip />
    </StoresProvider>,
  )
  return stores
}

describe('SummaryChip', () => {
  it("'이너 N% · 전실 N%'를 누르면 면적 상세 시트를 연다", () => {
    const stores = renderChip(tunnelLayout([rectItem('m', '매트', -200, 0)]))
    const main = screen.getByRole('button', { name: /면적 현황 열기/ })
    expect(main.textContent).toBe('이너 18%·전실 0%')
    fireEvent.click(main)
    expect(stores.ui.getState().mobileSheet).toBe('area')
  })

  it('⚠N 부분은 따로 누를 수 있고(44px) 경고 시트를 연다', () => {
    const stores = renderChip(tunnelLayout([rectItem('a', '나간 매트', 300, 0), rectItem('b', '걸친 매트', -90, 0)]))
    const warn = screen.getByRole('button', { name: '경고 2건 보기' })
    expect(warn.textContent).toBe('2')
    expect(warn.style.minHeight).toBe('44px')
    expect(warn.style.minWidth).toBe('44px')
    fireEvent.click(warn)
    expect(stores.ui.getState().mobileSheet).toBe('warnings')
  })

  it('경고가 없으면 ⚠ 부분이 없고, 이너 없는 텐트는 이너 —·바닥으로 쓴다', () => {
    renderChip(tipiLayout())
    expect(screen.queryByRole('button', { name: /경고/ })).toBeNull()
    expect(screen.getByRole('button', { name: /면적 현황 열기/ }).textContent).toBe('이너 —·바닥 0%')
  })
})
