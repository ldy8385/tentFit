// 해시 라우팅(스펙 §4.7). 텐트 고르기(#/pick), 편집기(#/edit/<id>), 그 밖은 시작(start — 시작 규칙으로 보냄).
// 텐트 만들기 화면은 라우트가 아니라 고르기 화면·편집기 위 오버레이입니다(해시 그대로, §4.4-1).
import { useMemo, useSyncExternalStore } from 'react'

export type Route = { name: 'edit'; layoutId: string } | { name: 'pick' } | { name: 'start' }

/** 텐트 고르기 화면 주소 */
export const PICK_HASH = '#/pick'

const EDIT_HASH = /^#\/edit\/([^/?#]+)\/?$/
const PICK_ROUTE = /^#\/pick\/?$/

/**
 * '#/edit/<id>'면 편집기, '#/pick'(뒤 슬래시 허용)이면 고르기, 그 밖(빈 해시, '#/', 모르는 경로,
 * 잘못된 % 인코딩)은 모두 시작입니다.
 */
export function parseHash(hash: string): Route {
  if (PICK_ROUTE.test(hash)) return { name: 'pick' }
  const m = EDIT_HASH.exec(hash)
  const raw = m?.[1]
  if (raw !== undefined) {
    try {
      const layoutId = decodeURIComponent(raw)
      if (layoutId.trim() !== '') return { name: 'edit', layoutId }
    } catch {
      // 잘못된 % 인코딩은 시작으로 보냅니다.
    }
  }
  return { name: 'start' }
}

export function editHash(id: string): string {
  return `#/edit/${encodeURIComponent(id)}`
}

function subscribeHash(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

function currentHash(): string {
  return window.location.hash
}

/**
 * 지금 해시의 Route. hashchange마다 다시 그립니다(스냅샷은 문자열이라 같은 해시면 같은 Route 객체).
 * history.pushState로 같은 해시 항목을 쌓으면 hashchange가 없어 Route가 바뀌지 않습니다(만들기 오버레이가 이용).
 */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribeHash, currentHash)
  return useMemo(() => parseHash(hash), [hash])
}
