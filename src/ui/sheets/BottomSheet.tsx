// 모바일 하단 시트(스펙 §4.2, D29). 놓는 자리는 셸이 정합니다(툴바 바로 위). 툴바는 늘 보입니다.
// - grabber(펼치기·접기), 제목, ×(이름은 closeLabel — 선택·텐트 시트는 「선택 해제」, R14)
// - 화면 키보드가 올라오면 visualViewport에 맞춰 키보드 위로 올리고, 높이를 보이는 영역 안으로 줄입니다(헤더 고정, 본문 스크롤).
//   줄인 높이의 위 끝은 시트 자리(셸이 SHEET_BOUNDS_ATTR로 표시한 캔버스 영역 = 상단 바·safe-area 아래)보다 내려가
//   상단 바에 가리지 않고, 그 아래로 캔버스가 SHEET_KEYBOARD_TOP_GAP만큼 보입니다(보류 Minor #13).
// - 아래쪽 safe-area는 시트 아래의 툴바가 맡고, 시트는 좌우 safe-area만 둡니다.
import type { JSX, ReactNode } from 'react'
import { useLayoutEffect, useRef } from 'react'
import { useVisualViewport } from '../fields/useVisualViewport'
import './sheets.css'

/** 키보드가 떠 있을 때 시트 위쪽(시트 자리 위 끝 아래)에 남겨 둘 여백(px). 그만큼 캔버스가 보입니다. */
export const SHEET_KEYBOARD_TOP_GAP = 48
/** 키보드가 떠 있을 때 시트 최소 높이(px). 헤더와 입력칸 한 줄은 보이게 */
export const SHEET_MIN_KEYBOARD_HEIGHT = 120
/** 셸이 시트를 놓는 영역(상단 바 아래 캔버스)에 붙이는 속성. 시트는 이 요소의 위 끝 위로 올라가지 않습니다. */
export const SHEET_BOUNDS_ATTR = 'data-sheet-bounds'

/**
 * 키보드에 가리지 않게 올릴 거리. 시트 아래에 이미 below(px)만큼(툴바 등) 떨어져 있으면
 * 키보드가 그것을 덮는 만큼은 올리지 않아도 됩니다.
 */
export function sheetLift(keyboardInset: number, below: number): number {
  return Math.max(0, keyboardInset - Math.max(0, below))
}

/**
 * 키보드가 떠 있을 때 시트 최대 높이(px). 올린 시트의 아래 끝은 보이는 영역 아래 끝(vvBottom)이고,
 * 위 끝은 시트 자리 위 끝(boundsTop)과 보이는 영역 위 끝(vvTop) 중 아래쪽에서 SHEET_KEYBOARD_TOP_GAP만큼 내려온 곳입니다.
 */
export function sheetMaxHeight(vvTop: number, vvBottom: number, boundsTop: number): number {
  return Math.max(SHEET_MIN_KEYBOARD_HEIGHT, Math.round(vvBottom - Math.max(vvTop, boundsTop) - SHEET_KEYBOARD_TOP_GAP))
}

export function BottomSheet(p: {
  title: string
  /** 없으면 ×를 그리지 않습니다(만들기 화면의 늘 보이는 시트에서 대상이 없을 때) */
  onClose?(): void
  /** ×의 이름(기본 '닫기'). 동작이 선택 해제인 시트는 '선택 해제' */
  closeLabel?: string
  expanded?: boolean
  onToggleExpand?(): void
  children: ReactNode
  testId?: string
}): JSX.Element {
  const { height, offsetTop, keyboardInset } = useVisualViewport()
  const ref = useRef<HTMLElement>(null)
  const expanded = p.expanded === true

  // 올리기 전 위치에서 시트 아래 남은 거리를 재고 transform·maxHeight를 직접 줍니다(키보드·보이는 영역이 바뀔 때만).
  // 시트 아래 끝은 시트 자리 바닥에 붙어 있어 maxHeight를 줄여도 그대로입니다.
  useLayoutEffect(() => {
    const el = ref.current
    if (el === null) return
    el.style.transform = ''
    el.style.maxHeight = ''
    if (keyboardInset <= 0) return
    const bounds = el.closest(`[${SHEET_BOUNDS_ATTR}]`)
    const boundsTop = bounds === null ? 0 : bounds.getBoundingClientRect().top
    el.style.maxHeight = `${sheetMaxHeight(offsetTop, offsetTop + height, boundsTop)}px`
    const below = window.innerHeight - el.getBoundingClientRect().bottom
    const lift = sheetLift(keyboardInset, below)
    if (lift > 0) el.style.transform = `translateY(${-lift}px)`
  }, [keyboardInset, height, offsetTop])

  return (
    <section ref={ref} className="tf-sheet" aria-label={p.title} data-testid={p.testId} data-expanded={expanded}>
      {p.onToggleExpand !== undefined ? (
        <button
          type="button"
          className="tf-sheet__grabber"
          aria-label={expanded ? '접기' : '펼치기'}
          aria-expanded={expanded}
          onClick={p.onToggleExpand}
        >
          <span className="tf-sheet__grabber-bar" />
        </button>
      ) : (
        <div className="tf-sheet__grabber" aria-hidden="true">
          <span className="tf-sheet__grabber-bar" />
        </div>
      )}
      <header className="tf-sheet__header">
        <h2 className="tf-sheet__title">{p.title}</h2>
        {p.onClose !== undefined && (
          <button type="button" className="tf-sheet__close" aria-label={p.closeLabel ?? '닫기'} onClick={p.onClose}>
            ×
          </button>
        )}
      </header>
      <div className="tf-sheet__body">{p.children}</div>
    </section>
  )
}
