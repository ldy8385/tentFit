// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Layout } from '../../core/model'
import { createStores, StoresProvider, type Stores } from '../../app/stores'
import { AreaSummary } from './AreaSummary'
import { rectItem, tipiLayout, tunnelLayout } from './testLayouts'

function renderSummary(layout: Layout): Stores {
  const stores = createStores(layout)
  render(
    <StoresProvider stores={stores}>
      <AreaSummary />
    </StoresProvider>,
  )
  return stores
}

const zoneText = (key: string) => document.querySelector(`[data-zone="${key}"]`)?.textContent ?? ''

describe('AreaSummary', () => {
  it('이너 전체·전실 전체 행에 점유율·구역 넓이·남은 넓이를 보여 준다', () => {
    // 이너 안에 매트 200×60 = 12,000cm² → 이너 66,000cm² 중 18%(내림), 남은 54,000cm²
    renderSummary(tunnelLayout([rectItem('m', '매트', -200, 0)]))
    expect(zoneText('total-inner')).toContain('이너 전체')
    expect(zoneText('total-inner')).toContain('18%')
    expect(zoneText('total-inner')).toContain('6.60m² 중')
    expect(zoneText('total-inner')).toContain('남은 5.40m²')
    expect(zoneText('total-floor')).toContain('전실 전체')
    expect(zoneText('total-floor')).toContain('0%')
    expect(zoneText('total-floor')).toContain('13.24m² 중')
  })

  it("이너가 없는 텐트는 이너 전체 '—', 바닥 전체로 표시하고 경고가 없으면 [보기]가 없다", () => {
    renderSummary(tipiLayout())
    expect(zoneText('total-inner')).toContain('—')
    expect(zoneText('total-floor')).toContain('바닥 전체')
    expect(zoneText('total-floor')).toContain('0%')
    expect(screen.queryByRole('button', { name: /보기/ })).toBeNull()
    expect(screen.getByText('경고 없음')).toBeTruthy()
  })

  it("경고가 있으면 '경고 N건 [보기]'가 경고 패널을 연다", () => {
    const stores = renderSummary(tunnelLayout([rectItem('out', '나간 매트', 300, 0)]))
    const btn = screen.getByRole('button', { name: /보기/ })
    expect(btn.textContent).toContain('경고 1건')
    fireEvent.click(btn)
    expect(stores.ui.getState().desktopPanel).toBe('warnings')
  })

  it('[자세히]로 펼치면 상세가 나오고, 펼친 채로 선택이 생기면 자동으로 접는다', () => {
    const stores = renderSummary(tunnelLayout([rectItem('m', '매트', -200, 0)]))
    expect(screen.queryByText('겹친 부분은 한 번만 세서 합과 다를 수 있어요')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '자세히' }))
    expect(stores.ui.getState().areaExpanded).toBe(true)
    expect(screen.getByRole('button', { name: '접기' }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('겹친 부분은 한 번만 세서 합과 다를 수 있어요')).toBeTruthy()

    act(() => stores.ui.getState().setSelection(['m']))
    expect(stores.ui.getState().areaExpanded).toBe(false)
    expect(screen.queryByText('겹친 부분은 한 번만 세서 합과 다를 수 있어요')).toBeNull()
  })

  it('이미 선택이 있을 때 펼치면 펼친 상태를 유지한다(선택이 "생길 때"만 접음)', () => {
    const stores = createStores(tunnelLayout([rectItem('m', '매트', -200, 0)]))
    stores.ui.getState().setSelection(['m'])
    render(
      <StoresProvider stores={stores}>
        <AreaSummary />
      </StoresProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: '자세히' }))
    expect(stores.ui.getState().areaExpanded).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '접기' }))
    expect(stores.ui.getState().areaExpanded).toBe(false)
  })
})
