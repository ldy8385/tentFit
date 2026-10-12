// 공용 대화상자(내 배치 목록 R2, 텐트 바꾸기 §4.7-8). role="dialog" aria-modal, 제목은 aria-labelledby.
// - Esc·바깥(배경) 누름·[닫기]로 onClose. 열 때 본문의 첫 컨트롤에 포커스, 닫으면(언마운트) 원래 포커스로 돌려줍니다.
// - Tab은 대화상자 안에서만 돕니다. 대화상자 안의 키 입력은 편집기 단축키(window keydown)까지 가지 않습니다.
// - 휴대폰(useIsDesktop false)은 전체 화면, PC는 가운데 상자. document.body에 portal로 그려 시트·메뉴 위에 뜹니다.
import { useEffect, useId, useRef, type JSX, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useIsDesktop } from '../shell/useIsDesktop'
import './common.css'

export type DialogProps = {
  title: string
  open: boolean
  onClose(): void
  children: ReactNode
  testId?: string
  footer?: ReactNode
}

const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

function focusablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
}

export function Dialog(p: DialogProps): JSX.Element | null {
  if (!p.open) return null
  return <DialogPanel {...p} />
}

function DialogPanel(p: DialogProps): JSX.Element {
  const desktop = useIsDesktop()
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const pressedBackdrop = useRef(false)

  // 열 때: 본문(없으면 아래 버튼 줄) 첫 컨트롤, 그것도 없으면 대화상자 자체. 닫을 때: 열기 전 포커스로.
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const panel = panelRef.current
    if (panel !== null) {
      const body = panel.querySelector<HTMLElement>('.tf-dialog__body')
      const footer = panel.querySelector<HTMLElement>('.tf-dialog__footer')
      const first = (body && focusablesIn(body)[0]) ?? (footer && focusablesIn(footer)[0]) ?? panel
      first.focus()
    }
    return () => {
      if (before !== null && before.isConnected) before.focus()
    }
  }, [])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // 대화상자 안의 키는 뒤의 편집기 단축키(Delete·Ctrl+Z 등)로 가지 않습니다.
    e.stopPropagation()
    if (e.key === 'Escape') {
      e.preventDefault()
      p.onClose()
      return
    }
    if (e.key !== 'Tab') return
    const panel = panelRef.current
    if (panel === null) return
    const items = focusablesIn(panel)
    const first = items[0]
    const last = items[items.length - 1]
    if (first === undefined || last === undefined) {
      e.preventDefault()
      return
    }
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === panel)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div
      className="tf-dialog-backdrop"
      data-fullscreen={!desktop}
      onPointerDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        // 대화상자 안에서 눌러 배경에서 뗀 경우(글자 선택 등)는 닫지 않습니다.
        const fromBackdrop = pressedBackdrop.current && e.target === e.currentTarget
        pressedBackdrop.current = false
        if (fromBackdrop) p.onClose()
      }}
    >
      <div
        ref={panelRef}
        className="tf-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={p.testId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <header className="tf-dialog__header">
          <h2 id={titleId} className="tf-dialog__title">
            {p.title}
          </h2>
          <button type="button" className="tf-dialog__close" aria-label="닫기" onClick={p.onClose}>
            ×
          </button>
        </header>
        <div className="tf-dialog__body">{p.children}</div>
        {p.footer !== undefined && <footer className="tf-dialog__footer">{p.footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}
