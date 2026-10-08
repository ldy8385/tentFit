// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addPresetItem, duplicateSelected } from '../../app/actions'
import { duplicateAndSelect } from '../panels/commands'
import { createStores, StoresProvider, type Stores } from '../../app/stores'
import { createLayout, type Tent } from '../../core/model'
import { addItem, makeItem } from '../../core/ops/items'
import { MobileShell, SUMMARY_CHIP_ZONE_PX } from './MobileShell'
import { selectionBBox } from './revealSelection'
import { worldToScreen } from '../../view/viewport'

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

const STOOL = { id: 'items/stool', name: '스툴', category: 'CHAIR', shape: { kind: 'circle', d: 40 }, color: 'sky', countsArea: true } as const

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

  it('리뷰 회귀: 캔버스를 누르고 있는 동안 열린 시트로는 화면을 옮기지 않고, 손을 떼면 옮긴다', () => {
    const { stores, ids } = renderShell()
    // 선택 안 된 물건을 누르는 순간 선택 시트가 열립니다. 이때 화면이 옮겨지면 그 이동량이 끌기에 섞입니다.
    act(() => stores.ui.getState().setCanvasPressed(true))
    act(() => stores.ui.getState().setSelection([ids[1]!]))
    act(() => FakeResizeObserver.resize(screen.getByTestId('sheet-host'), 300))
    expect(stores.ui.getState().view.panY).toBe(300)
    act(() => stores.ui.getState().setCanvasPressed(false))
    expect(stores.ui.getState().view.panY + 125).toBe(650 - 300 - 16)
  })

  it('리뷰 회귀: 시트 높이가 그대로면 손을 뗄 때 화면을 다시 옮기지 않는다(사용자가 옮긴 화면 유지)', () => {
    const { stores, ids } = renderShell()
    act(() => stores.ui.getState().setSelection([ids[1]!]))
    act(() => FakeResizeObserver.resize(screen.getByTestId('sheet-host'), 300))
    act(() => stores.ui.getState().setCanvasPressed(true))
    act(() => stores.ui.getState().setView({ zoom: 1, panX: 195, panY: 300 }))
    act(() => stores.ui.getState().setCanvasPressed(false))
    expect(stores.ui.getState().view.panY).toBe(300)
  })

  it('리뷰 회귀: 시트 위에 요약 칩까지 뺀 영역이 남지 않으면 칩 영역을 빼지 않고 보인다', () => {
    const { stores, ids } = renderShell()
    // 시트 570px → 칩까지 빼면 72~64(없음). 칩을 빼지 않으면 16~64(48px)라 의자(50px)를 가운데에 맞춥니다.
    act(() => stores.ui.getState().setSelection([ids[1]!]))
    act(() => FakeResizeObserver.resize(screen.getByTestId('sheet-host'), 570))
    expect(stores.ui.getState().view.panY + 100).toBe((16 + 64) / 2)
  })

  it('재검증 회귀: 라이브러리 시트와 선택 시트 높이가 같아도(낮은 화면에서 둘 다 45dvh) 추가한 물건을 시트 위로 옮긴다', () => {
    const { stores } = renderShell()
    const host = screen.getByTestId('sheet-host')
    act(() => stores.ui.getState().patch({ mobileSheet: 'library' }))
    act(() => FakeResizeObserver.resize(host, 400))
    // 카드를 누른 것처럼: 추가(가운데에 놓음) + 선택 시트로 바꿈. 시트 높이는 400 그대로
    act(() => {
      addPresetItem(stores, STOOL)
      stores.ui.getState().patch({ mobileSheet: 'selection' })
    })
    act(() => FakeResizeObserver.resize(host, 400))
    const ui = stores.ui.getState()
    const box = selectionBBox(stores.doc.getState().layout, ui.selection)!
    expect(worldToScreen(ui.view, [box.maxX, box.maxY])[1]).toBeLessThanOrEqual(650 - 400 - 16 + 1e-9)
  })

  it('재검증 회귀: 복제한 물건도 시트 높이가 그대로면 시트 위로 옮긴다', () => {
    const { stores, ids } = renderShell()
    act(() => stores.ui.getState().setSelection([ids[1]!]))
    act(() => FakeResizeObserver.resize(screen.getByTestId('sheet-host'), 300))
    // 의자를 시트 위 끝에 붙여 두고 복제하면 복제본(+20,+20)이 시트 뒤로 갑니다.
    act(() => stores.ui.getState().setView({ zoom: 1, panX: 195, panY: 650 - 300 - 16 - 125 }))
    act(() => {
      duplicateSelected(stores)
    })
    const ui = stores.ui.getState()
    const box = selectionBBox(stores.doc.getState().layout, ui.selection)!
    expect(worldToScreen(ui.view, [box.maxX, box.maxY])[1]).toBeLessThanOrEqual(650 - 300 - 16 + 1e-9)
  })

  it('재검증 회귀: 선택 시트의 [복제] 경로(duplicateAndSelect)도 복제본을 시트 위로 옮긴다', () => {
    const { stores, ids } = renderShell()
    act(() => stores.ui.getState().setSelection([ids[1]!]))
    act(() => FakeResizeObserver.resize(screen.getByTestId('sheet-host'), 300))
    act(() => stores.ui.getState().setView({ zoom: 1, panX: 195, panY: 650 - 300 - 16 - 125 }))
    act(() => {
      duplicateAndSelect(stores, [ids[1]!])
    })
    const ui = stores.ui.getState()
    const box = selectionBBox(stores.doc.getState().layout, ui.selection)!
    expect(worldToScreen(ui.view, [box.maxX, box.maxY])[1]).toBeLessThanOrEqual(650 - 300 - 16 + 1e-9)
  })

  it('재검증 회귀: 펼친 라이브러리 시트(473)에서 추가해도 바뀌기 전 시트 높이로 화면을 옮기지 않는다', () => {
    const { stores } = renderShell()
    const host = screen.getByTestId('sheet-host')
    act(() => stores.ui.getState().patch({ mobileSheet: 'library' }))
    act(() => FakeResizeObserver.resize(host, 473))
    const before = stores.ui.getState().view
    // 선택 시트로 바뀐 커밋에서 잰 새 높이(ResizeObserver는 그다음에 알림)
    host.getBoundingClientRect = () => ({ height: 150 }) as DOMRect
    act(() => {
      addPresetItem(stores, STOOL)
      stores.ui.getState().patch({ mobileSheet: 'selection' })
    })
    act(() => FakeResizeObserver.resize(host, 150))
    // 새 물건은 캔버스 가운데 근처라 선택 시트(150) 위에 이미 보입니다.
    expect(stores.ui.getState().view).toEqual(before)
    expect(stores.ui.getState().insets.bottom).toBe(150)
  })

  it('3차 재검증: 라이브러리·면적 시트가 열린 채 단축키로 복제해도 바뀌기 전 시트 높이로 화면을 옮기지 않는다', () => {
    for (const other of ['library', 'area'] as const) {
      const { stores, ids, unmount } = renderShell()
      const host = screen.getByTestId('sheet-host')
      act(() => stores.ui.getState().setSelection([ids[0]!]))
      act(() => stores.ui.getState().patch({ mobileSheet: other }))
      act(() => FakeResizeObserver.resize(host, 473))
      const before = stores.ui.getState().view
      host.getBoundingClientRect = () => ({ height: 150 }) as DOMRect
      act(() => {
        duplicateSelected(stores)
      })
      act(() => FakeResizeObserver.resize(host, 150))
      expect(stores.ui.getState().mobileSheet).toBe('selection')
      expect(stores.ui.getState().view).toEqual(before)
      unmount()
    }
  })

  it('3차 재검증: 면적 시트에서 선택 시트로 돌아오면(높이가 같아도) 시트에 가린 선택 물건을 다시 보이게 옮긴다', () => {
    const { stores, ids } = renderShell()
    const host = screen.getByTestId('sheet-host')
    // 두 시트 모두 300px(레이아웃 효과가 재는 값)
    host.getBoundingClientRect = () => ({ height: 300 }) as DOMRect
    act(() => stores.ui.getState().setSelection([ids[1]!]))
    act(() => FakeResizeObserver.resize(host, 300))
    act(() => stores.ui.getState().patch({ mobileSheet: 'area' }))
    // 면적 시트를 보는 동안 의자(화면 y 375~425)를 시트 밑으로 옮겨 둡니다.
    act(() => stores.ui.getState().setView({ zoom: 1, panX: 195, panY: 300 }))
    act(() => stores.ui.getState().patch({ mobileSheet: 'selection' }))
    expect(stores.ui.getState().view.panY + 125).toBe(650 - 300 - 16)
  })

  it('끌기 중(제스처)에는 화면을 옮기지 않는다', () => {
    const { stores, ids } = renderShell()
    act(() => stores.doc.getState().beginGesture())
    act(() => stores.ui.getState().setSelection([ids[1]!]))
    act(() => FakeResizeObserver.resize(screen.getByTestId('sheet-host'), 300))
    expect(stores.ui.getState().view.panY).toBe(300)
  })
})
