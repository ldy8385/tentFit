// @vitest-environment happy-dom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Layout } from '../../core/model'
import { createStores, StoresProvider, type Stores } from '../../app/stores'
import { viewCenterWorld } from '../../view/viewport'
import { WarningPanel } from './WarningPanel'
import { rectItem, tunnelLayout } from './testLayouts'

/** 나감(A, x 200~400) + 이너 벽(x=−90) 걸침(B) + 문제없는 C */
function warnLayout(): Layout {
  return tunnelLayout([
    rectItem('b', '걸친 매트', -90, 0),
    rectItem('a', '나간 매트', 300, 0),
    rectItem('c', '괜찮은 매트', 100, 0),
  ])
}

function renderPanel(layout: Layout, inSheet = false): Stores {
  const stores = createStores(layout)
  stores.ui.getState().setSize({ width: 800, height: 600 })
  stores.ui.getState().setView({ zoom: 1, panX: 400, panY: 300 })
  stores.ui.getState().patch({ desktopPanel: 'warnings', mobileSheet: inSheet ? 'warnings' : 'none' })
  render(
    <StoresProvider stores={stores}>
      <WarningPanel inSheet={inSheet} />
    </StoresProvider>,
  )
  return stores
}

/** 터널 4인의 이너를 x −250으로 옮겨 외곽 밖으로 나가게 한 배치(물건 없음 → 경고 행은 이탈 1개) */
function escapedLayout(): Layout {
  const base = tunnelLayout()
  return { ...base, tent: { ...base.tent, inners: base.tent.inners.map((i) => ({ ...i, x: -250 })) } }
}

const rows = () => within(screen.getByRole('list')).getAllByRole('button')
const center = (s: Stores) => {
  const { view, size, insets } = s.ui.getState()
  return viewCenterWorld(view, size, insets)
}

describe('WarningPanel', () => {
  it('제목 "경고 N건", 행은 danger 먼저이고 행 전체가 버튼', () => {
    renderPanel(warnLayout())
    expect(screen.getByRole('heading', { name: '경고 2건' })).toBeTruthy()
    const r = rows()
    expect(r).toHaveLength(2)
    expect(r[0]?.textContent).toContain('나간 매트')
    expect(r[0]?.textContent).toContain('텐트 밖으로 나감')
    expect(r[0]?.getAttribute('data-severity')).toBe('danger')
    expect(r[1]?.textContent).toContain('걸친 매트')
    expect(r[1]?.textContent).toContain('이너 벽에 걸침')
    expect(r[1]?.getAttribute('data-severity')).toBe('warn')
  })

  it('물건 행을 누르면 선택하고 화면을 그쪽으로 옮기며, 데스크톱은 목록을 유지한다', () => {
    const stores = renderPanel(warnLayout())
    fireEvent.click(rows()[1] as HTMLElement)
    expect(stores.ui.getState().selection).toEqual(['b'])
    expect(stores.ui.getState().desktopPanel).toBe('warnings')
    const [cx, cy] = center(stores)
    expect(cx).toBeCloseTo(-90, 6)
    expect(cy).toBeCloseTo(0, 6)
    expect(stores.ui.getState().view.zoom).toBe(1)
  })

  it('그룹 멤버를 누르면 그룹 전체를 선택한다', () => {
    const layout = tunnelLayout([
      rectItem('a', '나간 매트', 300, 0, { groupId: 'g' }),
      rectItem('c', '같은 그룹', 100, 0, { groupId: 'g' }),
    ])
    const stores = renderPanel({ ...layout, groups: [{ id: 'g' }] })
    fireEvent.click(rows()[0] as HTMLElement)
    expect(stores.ui.getState().selection).toEqual(['a', 'c'])
  })

  it('텐트 편집 모드에서 누르면 배치 모드로 바꾼 뒤(편집 대상 정리) 선택한다', () => {
    const stores = renderPanel(warnLayout())
    stores.ui.getState().setMode('tent')
    stores.ui.getState().selectTentTarget('outer', 0)
    fireEvent.click(rows()[0] as HTMLElement)
    expect(stores.ui.getState().mode).toBe('place')
    expect(stores.ui.getState().tentTarget).toBeNull()
    expect(stores.ui.getState().vertexIndex).toBeNull()
    expect(stores.ui.getState().selection).toEqual(['a'])
  })

  it('측정 중에는 선택하지 않고 화면만 옮긴다', () => {
    const stores = renderPanel(warnLayout())
    stores.ui.getState().patch({ measuring: true })
    fireEvent.click(rows()[0] as HTMLElement)
    expect(stores.ui.getState().selection).toEqual([])
    expect(center(stores)[0]).toBeCloseTo(300, 6)
  })

  it('D27: 배치 모드에서 이너 이탈 행을 누르면 텐트 편집으로 바꾸고 그 이너를 고른 뒤 화면을 옮긴다', () => {
    const layout = escapedLayout()
    const innerId = layout.tent.inners[0]!.id
    const stores = renderPanel(layout)
    const r = rows()
    expect(r).toHaveLength(1)
    expect(r[0]?.textContent).toContain('이너 1이 외곽 밖으로 나감')
    fireEvent.click(r[0] as HTMLElement)
    expect(stores.ui.getState().mode).toBe('tent')
    expect(stores.ui.getState().tentTarget).toEqual({ innerId })
    expect(stores.ui.getState().vertexIndex).toBeNull()
    expect(stores.ui.getState().selection).toEqual([])
    expect(center(stores)[0]).toBeCloseTo(-250, 6)
    expect(stores.doc.getState().canUndo).toBe(false)
  })

  it('D27: 텐트 편집 모드(외곽을 고른 상태)에서 누르면 그 이너로 대상만 바꾼다', () => {
    const layout = escapedLayout()
    const innerId = layout.tent.inners[0]!.id
    const stores = renderPanel(layout)
    stores.ui.getState().setMode('tent')
    stores.ui.getState().selectTentTarget('outer', 2)
    fireEvent.click(rows()[0] as HTMLElement)
    expect(stores.ui.getState().mode).toBe('tent')
    expect(stores.ui.getState().tentTarget).toEqual({ innerId })
    expect(stores.ui.getState().vertexIndex).toBeNull()
  })

  it('D27 모바일: 이너 이탈 행은 경고 시트를 닫고 텐트 시트로 바꾼다', () => {
    const layout = escapedLayout()
    const stores = renderPanel(layout, true)
    fireEvent.click(rows()[0] as HTMLElement)
    expect(stores.ui.getState().mode).toBe('tent')
    expect(stores.ui.getState().mobileSheet).toBe('tent')
  })

  it('측정 중에는 이너 이탈 행도 모드·대상을 바꾸지 않고 화면만 옮긴다', () => {
    const stores = renderPanel(escapedLayout(), true)
    stores.ui.getState().patch({ measuring: true })
    fireEvent.click(rows()[0] as HTMLElement)
    expect(stores.ui.getState().mode).toBe('place')
    expect(stores.ui.getState().tentTarget).toBeNull()
    expect(stores.ui.getState().mobileSheet).toBe('warnings')
    expect(center(stores)[0]).toBeCloseTo(-250, 6)
  })

  it('시트 안(모바일)에서는 제목 줄 없이, 누르면 선택 시트로 바꾼다', () => {
    const stores = renderPanel(warnLayout(), true)
    expect(screen.queryByRole('heading', { name: /경고/ })).toBeNull()
    fireEvent.click(rows()[0] as HTMLElement)
    expect(stores.ui.getState().selection).toEqual(['a'])
    expect(stores.ui.getState().mobileSheet).toBe('selection')
  })

  it('×는 속성 패널 자리로 돌린다', () => {
    const stores = renderPanel(warnLayout())
    fireEvent.click(screen.getByRole('button', { name: '경고 목록 닫기' }))
    expect(stores.ui.getState().desktopPanel).toBe('auto')
  })

  it('경고가 없으면 안내 문구, "표시 규칙" 범례는 접혀 있다가 펼쳐진다', () => {
    renderPanel(tunnelLayout())
    expect(screen.getByText('경고가 없어요')).toBeTruthy()
    const toggle = screen.getByRole('button', { name: /표시 규칙/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText(/이너 벽에 걸침/)).toBeNull()
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText(/주황 짧은 점선 테두리 · 이너 벽에 걸침/)).toBeTruthy()
    expect(screen.getByText(/긴 점선 테두리 · 점유 면적에서 뺀 물건/)).toBeTruthy()
  })
})
