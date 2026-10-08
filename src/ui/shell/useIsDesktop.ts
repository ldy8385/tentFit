// 화면 전환 기준(Plan 3 Global Constraints, 스펙 D8): 뷰포트 폭 768px 이상이고 높이 560px 이상이면 PC 3단.
// 높이 조건은 가로로 돌린 휴대폰(높이 430px 이하)이 PC 셸이 되지 않게 합니다.
// 제스처 판정은 폭이 아니라 이벤트 pointerType(스펙 §4.5)이고, 여기의 굵은 포인터 질의는 버튼 배치에만 씁니다.
import { useCallback, useSyncExternalStore } from 'react'

export const DESKTOP_QUERY = '(min-width: 768px) and (min-height: 560px)'
/** 터치가 주 입력인 기기(태블릿 PC 화면 등). 상단 바에 [선택] 토글을 더합니다(스펙 §4.1). */
export const COARSE_POINTER_QUERY = '(pointer: coarse)'

function mediaList(query: string): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query) : null
}

/** 미디어 질의 결과를 구독합니다. matchMedia가 없으면 false. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = mediaList(query)
      if (mql === null) return () => {}
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [query],
  )
  const getSnapshot = useCallback(() => mediaList(query)?.matches ?? false, [query])
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

export function useIsDesktop(): boolean {
  return useMediaQuery(DESKTOP_QUERY)
}

export function useCoarsePointer(): boolean {
  return useMediaQuery(COARSE_POINTER_QUERY)
}
