// @vitest-environment happy-dom
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createStores, StoresProvider, type Stores } from '../../app/stores'
import { createLayout, type Tent } from '../../core/model'
import { addItem, makeItem } from '../../core/ops/items'
import { DesktopShell } from './DesktopShell'

// 이웃 작업의 화면은 자리만 확인합니다(각자 테스트가 따로 있음). Board는 react-konva라 happy-dom에서 그리지 않습니다.
vi.mock('../../view/canvas/Board', () => ({ Board: () => <div data-testid="mock-board" /> }))
vi.mock('../library/LibraryPanel', () => ({ LibraryPanel: () => <div data-testid="mock-library-panel" /> }))
vi.mock('../panels/PropertiesPanel', () => ({ PropertiesPanel: () => <div data-testid="mock-properties" /> }))
vi.mock('../area/AreaSummary', () => ({ AreaSummary: () => <div data-testid="mock-area-summary" /> }))
vi.mock('../area/WarningPanel', () => ({ WarningPanel: () => <div data-testid="mock-warning-panel" /> }))
vi.mock('../library/NewShapeForm', () => ({
  NewShapeForm: (p: { onDone(): void; onCancel(): void }) => (
    <div data-testid="mock-new-shape">
      <button type="button" onClick={p.onDone}>
        추가 완료
      </button>
      <button type="button" onClick={p.onCancel}>
        폼 취소
      </button>
    </div>
  ),
}))

const TENT: Tent = { name: '시험 텐트', outer: { kind: 'rect', w: 400, h: 300 }, inners: [] }

function renderShell(): { stores: Stores; itemId: string } {
  const item = makeItem({ name: '매트', shape: { kind: 'rect', w: 200, h: 60 }, color: 'blue', category: 'MAT', countsArea: true }, [0, 0])
  const stores = createStores(createLayout(TENT, { name: '배치' }))
  stores.doc.getState().commit((d) => addItem(d, item))
  render(
    <StoresProvider stores={stores}>
      <DesktopShell />
    </StoresProvider>,
  )
  return { stores, itemId: item.id }
}

describe('DesktopShell', () => {
  it('상단 바·왼쪽 라이브러리·가운데 캔버스(canvas-host 안에 Board)·오른쪽 속성+면적 현황', () => {
    renderShell()
    expect(screen.getByTestId('top-bar')).toBeTruthy()
    expect(screen.getByTestId('mock-library-panel')).toBeTruthy()
    const host = screen.getByTestId('canvas-host')
    expect(host.classList.contains('canvas-host')).toBe(true)
    expect(within(host).getByTestId('mock-board')).toBeTruthy()
    expect(screen.getByTestId('canvas-overlay')).toBeTruthy()
    expect(within(screen.getByTestId('right-panel')).getByTestId('mock-properties')).toBeTruthy()
    expect(screen.getByTestId('mock-area-summary')).toBeTruthy()
  })

  it("desktopPanel 'newShape'면 새 도형 폼, 완료·취소하면 속성 패널로", () => {
    const { stores } = renderShell()
    act(() => stores.ui.getState().patch({ desktopPanel: 'newShape' }))
    expect(screen.getByTestId('mock-new-shape')).toBeTruthy()
    expect(screen.queryByTestId('mock-properties')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '추가 완료' }))
    expect(stores.ui.getState().desktopPanel).toBe('auto')
    act(() => stores.ui.getState().patch({ desktopPanel: 'newShape' }))
    fireEvent.click(screen.getByRole('button', { name: '폼 취소' }))
    expect(stores.ui.getState().desktopPanel).toBe('auto')
    expect(screen.getByTestId('mock-properties')).toBeTruthy()
  })

  it("desktopPanel 'warnings'면 경고 패널(제목 줄·×는 경고 패널 자신이 그림)", () => {
    const { stores } = renderShell()
    act(() => stores.ui.getState().patch({ desktopPanel: 'warnings' }))
    expect(within(screen.getByTestId('right-panel')).getByTestId('mock-warning-panel')).toBeTruthy()
    expect(screen.queryByTestId('mock-properties')).toBeNull()
    act(() => stores.ui.getState().patch({ desktopPanel: 'auto' }))
    expect(screen.getByTestId('mock-properties')).toBeTruthy()
  })
})
