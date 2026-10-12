// 모바일(스펙 §4.2): 상단 바 / 캔버스(+ 위 컨트롤, 요약 칩, 시트) / 하단 툴바(시트가 열려도 늘 보임, D29).
// - 선택이 있고 다른 시트가 없으면 선택 시트, 선택이 비면 선택 시트를 닫습니다.
// - 텐트 편집 모드에서 편집 대상(외곽·이너)이 생기면 텐트 시트, 대상이 없어지면 닫습니다(§4.4-3).
// - 시트 높이를 ui.insets.bottom에 반영하고(맞춤 보기·시트 위 영역 계산), 선택한 물건·텐트 대상이 시트 위에 보이게 옮깁니다.
// - 선택·라이브러리 시트는 스스로 BottomSheet를 쓰고, 새 도형·면적·경고·텐트는 여기서 BottomSheet로 감쌉니다(inSheet: 제목·×는 시트가 그림).
// - 캔버스 영역(main)에 SHEET_BOUNDS_ATTR을 붙여, 키보드가 올라와도 시트가 상단 바 밑으로 들어가지 않게 합니다(보류 Minor #13).
// - 텐트 시트·시트 높이·reveal 훅은 만들기 화면도 쓰도록 sheetHooks.tsx에 있습니다(Plan 4.1).
import { useEffect, useRef, type ReactNode } from 'react'
import { useStores, useUi } from '../../app/stores'
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
import { SUMMARY_CHIP_ZONE_PX, TentSheet, useRevealOnSheet, useSheetInsets, useTentSheet } from './sheetHooks'
import { Toolbar } from './Toolbar'
import './shell.css'

export { SUMMARY_CHIP_ZONE_PX } from './sheetHooks'

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
    case 'tent':
      return <TentSheet />
  }
}

export function MobileShell() {
  const sheet = useUi((s) => s.mobileSheet)
  const insetTop = useUi((s) => s.insets.top)
  const sheetHostRef = useRef<HTMLDivElement>(null)
  useSelectionSheet()
  useTentSheet()
  useSheetInsets(sheetHostRef, sheet)
  useRevealOnSheet()

  return (
    <div className="shell-mobile" data-testid="mobile-shell">
      <MobileTopBar />
      <main className="shell-mobile__canvas" data-sheet-bounds="">
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
