// 모바일(스펙 §4.2): 상단 바 / 캔버스(+ 위 컨트롤, 요약 칩, 시트) / 하단 툴바(시트가 열려도 늘 보임, D29).
// - 선택이 있고 다른 시트가 없으면 선택 시트, 선택이 비면 선택 시트를 닫습니다.
// - 시트 높이를 ui.insets.bottom에 반영하고(맞춤 보기·시트 위 영역 계산), 선택한 물건이 시트 위에 보이게 옮깁니다.
// - 선택·라이브러리 시트는 스스로 BottomSheet를 쓰고, 새 도형·면적·경고는 여기서 BottomSheet로 감쌉니다(inSheet: 제목·×는 시트가 그림).
import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'
import { useStores, useUi, type Stores } from '../../app/stores'
import { CANVAS_HOST_TEST_ID } from '../../app/testHook'
import type { MobileSheet } from '../../store/ui'
import { Board } from '../../view/canvas/Board'
import { AreaDetail } from '../area/AreaDetail'
import { SummaryChip } from '../area/SummaryChip'
import { WarningPanel } from '../area/WarningPanel'
import { LibrarySheet } from '../library/LibrarySheet'
import { NewShapeForm } from '../library/NewShapeForm'
import { BottomSheet } from '../sheets/BottomSheet'
import { SelectionSheet } from '../sheets/SelectionSheet'
import { CanvasOverlay } from './CanvasOverlay'
import { MobileTopBar } from './MobileTopBar'
import { REVEAL_MARGIN_PX, revealView, selectionBBox } from './revealSelection'
import { Toolbar } from './Toolbar'
import './shell.css'

/** 선택 ↔ 선택 시트 규칙 */
function useSelectionSheet() {
  const stores = useStores()
  const selectionKey = useUi((s) => s.selection.join('\n'))
  const sheet = useUi((s) => s.mobileSheet)
  useEffect(() => {
    const ui = stores.ui.getState()
    if (selectionKey !== '' && sheet === 'none') ui.patch({ mobileSheet: 'selection' })
    else if (selectionKey === '' && sheet === 'selection') ui.patch({ mobileSheet: 'none' })
  }, [selectionKey, sheet, stores])

  // 선택이 새로 생기거나 바뀌면 다른 시트(면적·경고·라이브러리)가 열려 있어도 선택 시트로 바꿉니다.
  const previousKey = useRef(selectionKey)
  useEffect(() => {
    if (selectionKey === previousKey.current) return
    previousKey.current = selectionKey
    const ui = stores.ui.getState()
    if (selectionKey !== '' && ui.mobileSheet !== 'selection') ui.patch({ mobileSheet: 'selection' })
  }, [selectionKey, stores])
}

/** insets.bottom만 바꿉니다(같은 값이면 그대로). */
function setInsetBottom(stores: Stores, bottom: number): void {
  const cur = stores.ui.getState().insets
  if (cur.bottom !== bottom) stores.ui.getState().setInsets({ top: cur.top, bottom })
}

/**
 * 시트 자리의 높이를 insets.bottom으로. 셸이 사라지면 0으로 돌립니다.
 * 시트 종류가 바뀐 커밋에서는 새 시트 높이를 바로 잽니다. ResizeObserver는 그다음에 알려 주므로, 그 사이에 도는
 * reveal(새 물건 보이기)이 바뀌기 전 시트(펼친 라이브러리 등) 높이로 계산해 화면을 튀게 하지 않도록.
 */
function useSheetInsets(hostRef: RefObject<HTMLDivElement | null>, sheet: MobileSheet) {
  const stores = useStores()
  useLayoutEffect(() => {
    const host = hostRef.current
    if (host !== null) setInsetBottom(stores, Math.max(0, Math.round(host.getBoundingClientRect().height)))
  }, [hostRef, sheet, stores])
  useEffect(() => {
    const host = hostRef.current
    const setBottom = (bottom: number) => setInsetBottom(stores, bottom)
    let observer: ResizeObserver | null = null
    if (host !== null && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver((entries) => {
        const last = entries[entries.length - 1]
        if (last !== undefined) setBottom(Math.max(0, Math.round(last.contentRect.height)))
      })
      observer.observe(host)
    }
    return () => {
      observer?.disconnect()
      setBottom(0)
    }
  }, [hostRef, stores])
}

/** 요약 칩이 차지하는 캔버스 위쪽 높이(px): 위 여백 12 + 칩(누름 영역 44) */
export const SUMMARY_CHIP_ZONE_PX = 56

/**
 * 선택 시트가 열리거나 높이가 바뀌면(insets.bottom 변화), 또는 물건을 새로 만들면(revealRequest) 선택한 물건이
 * 시트 위·요약 칩 아래 영역에 보이게 옮깁니다(§4.2).
 * 다른 시트(라이브러리 등)의 높이로는 옮기지 않고, 제스처 중에도 건드리지 않습니다.
 * 캔버스를 누르고 있는 동안 바뀐 것은 손을 뗀 뒤에 반영합니다(누르는 순간 열린 시트로 화면이 옮겨지면 그 이동량이 끌기에 섞임).
 * 시트가 높아 요약 칩 아래가 남지 않으면 칩 영역을 빼지 않고 계산합니다.
 */
function useRevealSelection() {
  const stores = useStores()
  const insetBottom = useUi((s) => s.insets.bottom)
  const revealRequest = useUi((s) => s.revealRequest)
  const pressed = useUi((s) => s.canvasPressed)
  const handled = useRef<string | null>(null)
  useEffect(() => {
    const ui = stores.ui.getState()
    // 키와 계산 모두 스토어의 지금 값으로(같은 커밋의 레이아웃 효과가 방금 잰 시트 높이를 씀)
    const key = `${ui.insets.bottom}|${ui.revealRequest}`
    if (pressed || handled.current === key) return
    handled.current = key
    if (ui.mobileSheet !== 'selection' || ui.selection.length === 0 || stores.doc.getState().inGesture) return
    const box = selectionBBox(stores.doc.getState().layout, ui.selection)
    if (box === null) return
    const area = { top: ui.insets.top + SUMMARY_CHIP_ZONE_PX, bottom: ui.insets.bottom }
    if (ui.size.height - area.bottom - area.top <= 2 * REVEAL_MARGIN_PX) area.top = ui.insets.top
    const next = revealView(ui.view, ui.size, area, box)
    if (next !== null) ui.setView(next)
  }, [insetBottom, revealRequest, pressed, stores])
}

function SheetFor(p: { sheet: MobileSheet }): ReactNode {
  const stores = useStores()
  const patch = (mobileSheet: MobileSheet) => stores.ui.getState().patch({ mobileSheet })
  switch (p.sheet) {
    case 'none':
      return null
    case 'selection':
      return <SelectionSheet />
    case 'library':
      return <LibrarySheet />
    case 'newShape':
      return (
        <BottomSheet title="새 도형 만들기" onClose={() => patch('library')} testId="sheet-new-shape">
          <NewShapeForm inSheet onDone={() => patch('selection')} onCancel={() => patch('library')} />
        </BottomSheet>
      )
    case 'area':
      return (
        <BottomSheet title="면적 현황" onClose={() => patch('none')} testId="sheet-area">
          <AreaDetail />
        </BottomSheet>
      )
    case 'warnings':
      return (
        <BottomSheet title="경고" onClose={() => patch('none')} testId="sheet-warnings">
          <WarningPanel inSheet />
        </BottomSheet>
      )
  }
}

export function MobileShell() {
  const sheet = useUi((s) => s.mobileSheet)
  const insetTop = useUi((s) => s.insets.top)
  const sheetHostRef = useRef<HTMLDivElement>(null)
  useSelectionSheet()
  useSheetInsets(sheetHostRef, sheet)
  useRevealSelection()

  return (
    <div className="shell-mobile" data-testid="mobile-shell">
      <MobileTopBar />
      <main className="shell-mobile__canvas">
        <div className="canvas-host shell-canvas" data-testid={CANVAS_HOST_TEST_ID}>
          <Board />
        </div>
        <CanvasOverlay variant="mobile" />
        <div className="shell-mobile__chip" style={{ top: insetTop + SUMMARY_CHIP_ZONE_PX - 44 }}>
          <SummaryChip />
        </div>
        <div className="shell-mobile__sheet" ref={sheetHostRef} data-testid="sheet-host">
          <SheetFor sheet={sheet} />
        </div>
      </main>
      <Toolbar />
    </div>
  )
}
