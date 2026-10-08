// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStores, StoresProvider, type Stores } from '../../app/stores'
import { createLayout, type Tent } from '../../core/model'
import { addItem, makeItem } from '../../core/ops/items'
import { MobileShell, SUMMARY_CHIP_ZONE_PX } from './MobileShell'

vi.mock('../../view/canvas/Board', () => ({ Board: () => <div data-testid="mock-board" /> }))
vi.mock('../sheets/SelectionSheet', () => ({ SelectionSheet: () => <div data-testid="mock-selection-sheet" /> }))
vi.mock('../library/LibrarySheet', () => ({ LibrarySheet: () => <div data-testid="mock-library-sheet" /> }))
vi.mock('../area/SummaryChip', () => ({ SummaryChip: () => <div data-testid="mock-summary-chip" /> }))
vi.mock('../area/AreaDetail', () => ({ AreaDetail: () => <div data-testid="mock-area-detail" /> }))
vi.mock('../area/WarningPanel', () => ({
  WarningPanel: (p: { inSheet?: boolean }) => <div data-testid="mock-warning-panel" data-in-sheet={String(p.inSheet === true)} />,
}))
vi.mock('../library/NewShapeForm', () => ({
  NewShapeForm: (p: { onDone(): void; onCancel(): void; inSheet?: boolean }) => (
    <button type="button" data-testid="mock-new-shape" data-in-sheet={String(p.inSheet === true)} onClick={p.onDone}>
      추가 완료
    </button>
  ),
}))
vi.mock('../sheets/BottomSheet', () => ({
  BottomSheet: (p: { title: string; onClose(): void; children: ReactNode; testId?: string }) => (
    <section data-testid={p.testId}>
      <h2>{p.title}</h2>
      <button type="button" aria-label="시트 닫기" onClick={p.onClose} />
      {p.children}
    </section>
  ),
}))

/** 테스트에서 손으로 크기 변화를 알리는 ResizeObserver */
class FakeResizeObserver {
  static all: FakeResizeObserver[] = []
  targets: Element[] = []
  constructor(private readonly cb: ResizeObserverCallback) {
    FakeResizeObserver.all.push(this)
  }
  observe(el: Element) {
    this.targets.push(el)
  }
  unobserve() {}
  disconnect() {
    this.targets = []
  }
  static resize(el: Element, height: number) {
    for (const ro of FakeResizeObserver.all) {
      if (!ro.targets.includes(el)) continue
      const entry = { target: el, contentRect: { height, width: 390 } } as unknown as ResizeObserverEntry
      ro.cb([entry], ro as unknown as ResizeObserver)
    }
  }
}

const TENT: Tent = { name: '시험 텐트', outer: { kind: 'rect', w: 400, h: 300 }, inners: [] }

beforeEach(() => {
  FakeResizeObserver.all = []
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderShell(): { stores: Stores; ids: string[]; unmount(): void } {
  const a = makeItem({ name: '매트', shape: { kind: 'rect', w: 200, h: 60 }, color: 'blue', category: 'MAT', countsArea: true }, [0, 0])
  const b = makeItem({ name: '의자', shape: { kind: 'rect', w: 50, h: 50 }, color: 'teal', category: 'CHAIR', countsArea: true }, [150, 100])
  const stores = createStores(createLayout(TENT, { name: '배치' }))
  stores.doc.getState().commit((d) => {
    addItem(d, a)
    addItem(d, b)
  })
  stores.ui.getState().setSize({ width: 390, height: 650 })
  stores.ui.getState().setView({ zoom: 1, panX: 195, panY: 300 })
  const view = render(
    <StoresProvider stores={stores}>
      <MobileShell />
    </StoresProvider>,
  )
  return { stores, ids: [a.id, b.id], unmount: view.unmount }
}

describe('MobileShell', () => {
  it('상단 바·캔버스(canvas-host 안에 Board)·요약 칩·툴바를 그리고, 처음에는 시트가 없다', () => {
    const { stores } = renderShell()
    expect(screen.getByTestId('mobile-top-bar')).toBeTruthy()
    expect(within(screen.getByTestId('canvas-host')).getByTestId('mock-board')).toBeTruthy()
    expect(screen.getByTestId('mock-summary-chip')).toBeTruthy()
    expect(screen.getByTestId('toolbar')).toBeTruthy()
    expect(screen.getByTestId('sheet-host').childElementCount).toBe(0)
    expect(stores.ui.getState().mobileSheet).toBe('none')
  })

  it("선택이 생기면 mobileSheet='selection'이고 선택 시트가 열린다. 선택이 비면 닫힌다", () => {
    const { stores, ids } = renderShell()
    act(() => stores.ui.getState().setSelection([ids[0]!]))
    expect(stores.ui.getState().mobileSheet).toBe('selection')
    expect(screen.getByTestId('mock-selection-sheet')).toBeTruthy()
    act(() => stores.ui.getState().clearSelection())
    expect(stores.ui.getState().mobileSheet).toBe('none')
    expect(screen.queryByTestId('mock-selection-sheet')).toBeNull()
  })

  it('선택이 있는 채로 면적 시트를 열면 유지되고, 닫으면 선택 시트로 돌아온다', () => {
    const { stores, ids } = renderShell()
    act(() => stores.ui.getState().setSelection([ids[0]!]))
    act(() => stores.ui.getState().patch({ mobileSheet: 'area' }))
    expect(screen.getByTestId('mock-area-detail')).toBeTruthy()
    expect(stores.ui.getState().mobileSheet).toBe('area')
    fireEvent.click(screen.getByRole('button', { name: '시트 닫기' }))
    expect(stores.ui.getState().mobileSheet).toBe('selection')
  })

  it('경고 시트에서 다른 물건이 선택되면 선택 시트로 바뀐다', () => {
    const { stores, ids } = renderShell()
    act(() => stores.ui.getState().patch({ mobileSheet: 'warnings' }))
    expect(within(screen.getByTestId('sheet-warnings')).getByTestId('mock-warning-panel').dataset.inSheet).toBe('true')
    act(() => stores.ui.getState().setSelection([ids[1]!]))
    expect(stores.ui.getState().mobileSheet).toBe('selection')
  })

  it('라이브러리 시트 → 새 도형 시트, 새 도형 시트의 ×는 라이브러리 시트로', () => {
    const { stores } = renderShell()
    fireEvent.click(screen.getByRole('button', { name: '+물건' }))
    expect(screen.getByTestId('mock-library-sheet')).toBeTruthy()
    act(() => stores.ui.getState().patch({ mobileSheet: 'newShape' }))
    const sheet = screen.getByTestId('sheet-new-shape')
    expect(within(sheet).getByText('새 도형 만들기')).toBeTruthy()
    expect(within(sheet).getByTestId('mock-new-shape').dataset.inSheet).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '시트 닫기' }))
    expect(stores.ui.getState().mobileSheet).toBe('library')
  })

  it('시트 높이를 insets.bottom에 반영하고, 셸이 사라지면 0으로 돌린다', () => {
    const { stores, ids, unmount } = renderShell()
    act(() => stores.ui.getState().setSelection([ids[0]!]))
    act(() => FakeResizeObserver.resize(screen.getByTestId('sheet-host'), 280.4))
    expect(stores.ui.getState().insets.bottom).toBe(280)
    act(() => unmount())
    expect(stores.ui.getState().insets.bottom).toBe(0)
  })

  it('시트가 열리면 시트에 가린 선택 물건이 시트 위 영역에 보이도록 화면을 옮긴다', () => {
    const { stores, ids } = renderShell()
    // 의자(150,100) 50×50 → 화면 y 375~425. 시트 300px이면 보이는 영역 아래 끝은 650-300-16=334
    act(() => stores.ui.getState().setSelection([ids[1]!]))
    act(() => FakeResizeObserver.resize(screen.getByTestId('sheet-host'), 300))
    const v = stores.ui.getState().view
    expect(v.zoom).toBe(1)
    expect(v.panY + 125).toBe(650 - 300 - 16)
  })

  it('요약 칩 아래에 가린 선택 물건은 칩 아래로 내린다', () => {
    const { stores, ids } = renderShell()
    act(() => stores.ui.getState().setView({ zoom: 1, panX: 195, panY: -60 }))
    // 의자 y 75~125 → 화면 15~65. 위쪽 한계는 요약 칩 영역 56 + 여백 16 = 72
    act(() => stores.ui.getState().setSelection([ids[1]!]))
    act(() => FakeResizeObserver.resize(screen.getByTestId('sheet-host'), 200))
    expect(stores.ui.getState().view.panY + 75).toBe(SUMMARY_CHIP_ZONE_PX + 16)
  })

  it('선택 시트가 아닌 시트(라이브러리)의 높이로는 화면을 옮기지 않는다', () => {
    const { stores, ids } = renderShell()
    act(() => stores.ui.getState().setSelection([ids[1]!]))
    act(() => stores.ui.getState().patch({ mobileSheet: 'library' }))
    act(() => FakeResizeObserver.resize(screen.getByTestId('sheet-host'), 600))
    expect(stores.ui.getState().view.panY).toBe(300)
  })

  it('끌기 중(제스처)에는 화면을 옮기지 않는다', () => {
    const { stores, ids } = renderShell()
    act(() => stores.doc.getState().beginGesture())
    act(() => stores.ui.getState().setSelection([ids[1]!]))
    act(() => FakeResizeObserver.resize(screen.getByTestId('sheet-host'), 300))
    expect(stores.ui.getState().view.panY).toBe(300)
  })
})
