// 모바일 하단 시트(스펙 §4.2, D29). 놓는 자리는 셸이 정합니다(툴바 바로 위). 툴바는 늘 보입니다.
// - grabber(펼치기·접기), 제목, ×
// - 화면 키보드가 올라오면 visualViewport에 맞춰 키보드 위로 올리고, 높이를 보이는 영역 안으로 줄입니다(헤더 고정, 본문 스크롤).
// - 아래쪽 safe-area는 시트 아래의 툴바가 맡고, 시트는 좌우 safe-area만 둡니다.
import type { JSX, ReactNode } from 'react'
import { useLayoutEffect, useRef } from 'react'
import { useVisualViewport } from '../fields/useVisualViewport'
import './sheets.css'

/** 키보드가 떠 있을 때 시트 위쪽에 남겨 둘 여백(px). 그만큼 캔버스가 보입니다. */
export const SHEET_KEYBOARD_TOP_GAP = 48

/**
 * 키보드에 가리지 않게 올릴 거리. 시트 아래에 이미 below(px)만큼(툴바 등) 떨어져 있으면
 * 키보드가 그것을 덮는 만큼은 올리지 않아도 됩니다.
 */
export function sheetLift(keyboardInset: number, below: number): number {
  return Math.max(0, keyboardInset - Math.max(0, below))
}

export function BottomSheet(p: {
  title: string
  onClose(): void
  expanded?: boolean
  onToggleExpand?(): void
  children: ReactNode
  testId?: string
}): JSX.Element {
  const { height, keyboardInset } = useVisualViewport()
  const ref = useRef<HTMLElement>(null)
  const expanded = p.expanded === true

  // 올리기 전 위치에서 시트 아래 남은 거리를 재고 transform을 직접 줍니다(키보드 높이가 바뀔 때만).
  useLayoutEffect(() => {
    const el = ref.current
    if (el === null) return
    el.style.transform = ''
    if (keyboardInset <= 0) return
    const below = window.innerHeight - el.getBoundingClientRect().bottom
    const lift = sheetLift(keyboardInset, below)
    if (lift > 0) el.style.transform = `translateY(${-lift}px)`
  }, [keyboardInset])

  const maxHeight = keyboardInset > 0 ? Math.max(120, height - SHEET_KEYBOARD_TOP_GAP) : undefined

  return (
    <section
      ref={ref}
      className="tf-sheet"
      aria-label={p.title}
      data-testid={p.testId}
      data-expanded={expanded}
      style={maxHeight === undefined ? undefined : { maxHeight }}
    >
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
        <button type="button" className="tf-sheet__close" aria-label="닫기" onClick={p.onClose}>
          ×
        </button>
      </header>
      <div className="tf-sheet__body">{p.children}</div>
    </section>
  )
}
