// 휴대폰 시트 공용 훅(Plan 4.1에서 MobileShell에서 꺼냄 — 만들기 화면도 씀).
// - useTentSheet: 텐트 대상 ↔ 텐트 시트 규칙(그리는 중에는 닫음).
// - useSheetInsets: 시트 자리 높이를 ui.insets.bottom으로.
// - useRevealOnSheet: 선택·텐트 대상이 시트 위에 보이게 화면을 옮김.
// - TentSheet: 제목 = 대상 이름, × = 선택 해제.
import { useEffect, useLayoutEffect, useRef, useState, type JSX, type RefObject } from 'react'
import { useDoc, useStores, useUi, type Stores } from '../../app/stores'
import type { MobileSheet } from '../../store/ui'
import { tentTargetBBox } from '../../view/tentEdit'
import type { BBox } from '../../view/viewport'
import { BottomSheet } from '../sheets/BottomSheet'
import { TentEditor } from '../tent/TentEditor'
import { targetKey, targetName } from '../tent/tentEditorModel'
import { REVEAL_MARGIN_PX, revealView, selectionBBox } from './revealSelection'

/**
 * 텐트 대상 ↔ 텐트 시트 규칙(§4.4-3). 텐트 편집 모드에서 대상이 있고 시트가 없으면 텐트 시트, 대상이 없어지면 닫습니다.
 * 대상이 새로 생기거나 바뀌면 다른 시트(면적·경고)가 열려 있어도 텐트 시트로 바꿉니다(선택 시트와 같은 규칙).
 * 그리는 중에는 닫아 캔버스를 넓히고(Plan 4.1 판단 Q13), 그리기가 끝나 대상이 있으면 다시 엽니다.
 */
export function useTentSheet() {
  const stores = useStores()
  const mode = useUi((s) => s.mode)
  const key = useUi((s) => targetKey(s.tentTarget))
  const drawing = useUi((s) => s.drawing !== null)
  const sheet = useUi((s) => s.mobileSheet)
  useEffect(() => {
    const ui = stores.ui.getState()
    const active = mode === 'tent' && key !== '' && !drawing
    if (active && sheet === 'none') ui.patch({ mobileSheet: 'tent' })
    else if (!active && sheet === 'tent') ui.patch({ mobileSheet: 'none' })
  }, [mode, key, drawing, sheet, stores])

  const previousKey = useRef(key)
  useEffect(() => {
    if (key === previousKey.current) return
    previousKey.current = key
    const ui = stores.ui.getState()
    if (ui.mode === 'tent' && key !== '' && ui.drawing === null && ui.mobileSheet !== 'tent') ui.patch({ mobileSheet: 'tent' })
  }, [key, stores])
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
export function useSheetInsets(hostRef: RefObject<HTMLDivElement | null>, sheet: MobileSheet) {
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
 * 시트 위에 보이게 할 대상의 월드 바운딩 박스: 선택 시트면 선택한 물건, 텐트 시트면 텐트 편집 대상(외곽·이너).
 * 그 밖의 시트·대상 없음이면 null.
 */
function revealBox(stores: Stores, sheet: MobileSheet): BBox | null {
  const ui = stores.ui.getState()
  const layout = stores.doc.getState().layout
  if (sheet === 'selection') return ui.selection.length === 0 ? null : selectionBBox(layout, ui.selection)
  if (sheet === 'tent') return ui.tentTarget === null ? null : tentTargetBBox(layout, ui.tentTarget)
  return null
}

/**
 * topZonePx: 캔버스 위쪽에서 비워 둘 높이(편집기 = 요약 칩 자리, 만들기 화면 = 0).
 * 선택·텐트 시트가 열리거나 높이가 바뀌면(insets.bottom 변화), 또는 물건을 새로 만들면(revealRequest), 또는 텐트 대상이
 * 바뀌면 그 대상이 시트 위·요약 칩 아래 영역에 보이게 옮깁니다(§4.2).
 * 다른 시트(라이브러리 등)의 높이로는 옮기지 않고, 제스처 중에도 건드리지 않습니다.
 * 캔버스를 누르고 있는 동안 바뀐 것은 손을 뗀 뒤에 반영합니다(누르는 순간 열린 시트로 화면이 옮겨지면 그 이동량이 끌기에 섞임).
 * 시트가 높아 요약 칩 아래가 남지 않으면 칩 영역을 빼지 않고 계산합니다.
 */
export function useRevealOnSheet(opts?: { topZonePx?: number }) {
  const topZonePx = opts?.topZonePx ?? SUMMARY_CHIP_ZONE_PX
  const stores = useStores()
  const insetBottom = useUi((s) => s.insets.bottom)
  const revealRequest = useUi((s) => s.revealRequest)
  const tentKey = useUi((s) => targetKey(s.tentTarget))
  const pressed = useUi((s) => s.canvasPressed)
  const renderedSheet = useUi((s) => s.mobileSheet)
  const handled = useRef<string | null>(null)
  useEffect(() => {
    // 선택·텐트 시트가 그려진 커밋에서만 계산합니다. 다른 시트에서 바뀌는 중이면(단축키 복제 등) 레이아웃 효과가
    // 새 시트 높이를 잰 다음 커밋으로 미룹니다. 다른 시트일 때 기록을 지워, 시트가 열릴 때마다 한 번은 계산합니다.
    if (renderedSheet !== 'selection' && renderedSheet !== 'tent') {
      handled.current = null
      return
    }
    if (pressed) return
    const ui = stores.ui.getState()
    // 키와 계산 모두 스토어의 지금 값으로(같은 커밋의 레이아웃 효과가 방금 잰 시트 높이를 씀).
    // 텐트 시트는 시트 높이가 같아도 대상이 바뀌면 다시 계산합니다.
    const target = renderedSheet === 'tent' ? targetKey(ui.tentTarget) : ''
    const key = `${renderedSheet}|${ui.insets.bottom}|${ui.revealRequest}|${target}`
    if (handled.current === key) return
    handled.current = key
    if (ui.mobileSheet !== renderedSheet || stores.doc.getState().inGesture) return
    const box = revealBox(stores, renderedSheet)
    if (box === null) return
    const area = { top: ui.insets.top + topZonePx, bottom: ui.insets.bottom }
    if (ui.size.height - area.bottom - area.top <= 2 * REVEAL_MARGIN_PX) area.top = ui.insets.top
    const next = revealView(ui.view, ui.size, area, box)
    if (next !== null) ui.setView(next)
  }, [insetBottom, revealRequest, tentKey, pressed, renderedSheet, stores, topZonePx])
}

/** 텐트 시트: 제목 = 대상 이름(없으면 '텐트 편집'), × = 선택 해제(시트도 닫힘, R14), 펼치기 있음 */
export function TentSheet(): JSX.Element {
  const stores = useStores()
  const tent = useDoc((s) => s.layout.tent)
  const target = useUi((s) => s.tentTarget)
  const [expanded, setExpanded] = useState(false)
  const title = (target === null ? null : targetName(tent, target)) ?? '텐트 편집'
  const close = () => {
    const ui = stores.ui.getState()
    ui.selectTentTarget(null)
    ui.patch({ mobileSheet: 'none' })
  }
  return (
    <BottomSheet
      title={title}
      closeLabel="선택 해제"
      onClose={close}
      expanded={expanded}
      onToggleExpand={() => setExpanded((v) => !v)}
      testId="sheet-tent"
    >
      <TentEditor variant="sheet" />
    </BottomSheet>
  )
}

