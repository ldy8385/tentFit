// 화면 키보드 대응(스펙 §4.2 "시트와 화면 위치"). 시트는 visualViewport의 resize·scroll에 맞춰 키보드 위로 올립니다.
import { useSyncExternalStore } from 'react'

export type VisualViewportInfo = { height: number; offsetTop: number; keyboardInset: number }

/**
 * 보이는 영역의 높이·위쪽 밀림과, 레이아웃 뷰포트 아래쪽이 키보드 등에 가려진 높이(keyboardInset).
 * visualViewport가 없으면 innerHeight 기준(가려짐 0)입니다. keyboardInset이 음수면 0입니다.
 */
export function readVisualViewport(win: { innerHeight: number; visualViewport?: { height: number; offsetTop: number } | null }): VisualViewportInfo {
  const vv = win.visualViewport
  if (!vv) return { height: win.innerHeight, offsetTop: 0, keyboardInset: 0 }
  return {
    height: vv.height,
    offsetTop: vv.offsetTop,
    keyboardInset: Math.max(0, win.innerHeight - (vv.height + vv.offsetTop)),
  }
}

let snapshot: VisualViewportInfo = { height: 0, offsetTop: 0, keyboardInset: 0 }

/** 값이 같으면 같은 객체를 돌려줍니다(useSyncExternalStore는 매번 새 객체를 받으면 무한히 다시 그림). */
function getSnapshot(): VisualViewportInfo {
  const next = readVisualViewport(window)
  if (
    next.height !== snapshot.height ||
    next.offsetTop !== snapshot.offsetTop ||
    next.keyboardInset !== snapshot.keyboardInset
  ) {
    snapshot = next
  }
  return snapshot
}

function subscribe(onChange: () => void): () => void {
  const vv = window.visualViewport
  vv?.addEventListener('resize', onChange)
  vv?.addEventListener('scroll', onChange)
  window.addEventListener('resize', onChange)
  return () => {
    vv?.removeEventListener('resize', onChange)
    vv?.removeEventListener('scroll', onChange)
    window.removeEventListener('resize', onChange)
  }
}

export function useVisualViewport(): VisualViewportInfo {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
