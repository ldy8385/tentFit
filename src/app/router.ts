// 해시 라우팅(스펙 §4.7). Plan 3은 시작(start)과 편집기(edit) 두 가지만 씁니다. 고르기(#/pick)는 Plan 4가 더합니다.
import { useMemo, useSyncExternalStore } from 'react'

export type Route = { name: 'edit'; layoutId: string } | { name: 'start' }

const EDIT_HASH = /^#\/edit\/([^/?#]+)\/?$/

/** '#/edit/<id>'면 편집기, 그 밖(빈 해시, '#/', 모르는 경로, 잘못된 % 인코딩)은 모두 시작입니다. */
export function parseHash(hash: string): Route {
  const m = EDIT_HASH.exec(hash)
  const raw = m?.[1]
  if (raw !== undefined) {
    try {
      const layoutId = decodeURIComponent(raw)
      if (layoutId.trim() !== '') return { name: 'edit', layoutId }
    } catch {
      // 잘못된 % 인코딩은 시작 화면으로 보냅니다.
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

/** 지금 해시의 Route. hashchange마다 다시 그립니다(스냅샷은 문자열이라 같은 해시면 같은 Route 객체). */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribeHash, currentHash)
  return useMemo(() => parseHash(hash), [hash])
}
