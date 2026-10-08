// 브라우저 기본 확대 제스처 막기(스펙 §4.5). CSS touch-action만으로는 iOS Safari의 핀치 확대가 남으므로
// WebKit 전용 gesturestart·gesturechange 이벤트를 document에서 preventDefault합니다.

/** 막는 WebKit 제스처 이벤트. */
export const BLOCKED_GESTURE_EVENTS = ['gesturestart', 'gesturechange'] as const

/**
 * target(보통 document)에 제스처 차단 리스너를 붙이고, 떼는 함수를 돌려줍니다.
 * preventDefault가 먹도록 passive: false로 붙입니다.
 */
export function blockBrowserGestures(target: EventTarget): () => void {
  const prevent = (e: Event) => {
    e.preventDefault()
  }
  for (const type of BLOCKED_GESTURE_EVENTS) target.addEventListener(type, prevent, { passive: false })
  return () => {
    for (const type of BLOCKED_GESTURE_EVENTS) target.removeEventListener(type, prevent)
  }
}
