// 대화상자·전체 화면 오버레이의 포커스 규칙(대화상자와 텐트 만들기 화면 공용, 최종 리뷰).
// 열 때 안쪽 첫 컨트롤로 포커스를 옮기고, Tab·Shift+Tab은 안에서만 돌며, 닫히면 열기 전 자리로 돌려줍니다.
// 그래야 키보드로 뒤 화면(보이지 않는 카드·편집기 버튼)을 누를 수 없습니다.
import { useEffect, type KeyboardEvent, type RefObject } from 'react'

const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

export function focusablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
}

/**
 * root 안으로 포커스를 가둡니다. firstFocus(root)가 돌려준 요소(없으면 root 안 첫 컨트롤, 그것도 없으면 root)에 처음 포커스를 줍니다.
 * 돌려준 onKeyDown을 root의 onKeyDown에서 부르세요(Tab만 처리).
 */
export function useFocusTrap(
  rootRef: RefObject<HTMLElement | null>,
  firstFocus?: (root: HTMLElement) => HTMLElement | null | undefined,
): (e: KeyboardEvent<HTMLElement>) => void {
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const root = rootRef.current
    if (root !== null) (firstFocus?.(root) ?? focusablesIn(root)[0] ?? root).focus()
    return () => {
      if (before !== null && before.isConnected) before.focus()
    }
    // 열 때 한 번만(firstFocus는 첫 렌더 기준)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootRef])

  return (e) => {
    if (e.key !== 'Tab') return
    const root = rootRef.current
    if (root === null) return
    const items = focusablesIn(root)
    const first = items[0]
    const last = items[items.length - 1]
    if (first === undefined || last === undefined) {
      e.preventDefault()
      return
    }
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === root)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }
}
