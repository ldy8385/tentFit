// Vitest 공용 설정(vitest.config.ts의 setupFiles). 모든 테스트 파일보다 먼저 돕니다.
// @testing-library/react는 전역 afterEach가 있을 때만 자동 정리(cleanup)와 React act 환경 표시를 켭니다.
// 이 저장소는 Vitest globals를 쓰지 않으므로 DOM 환경(happy-dom) 파일에서 여기서 직접 켭니다.
// node 환경 파일에서는 아무것도 하지 않습니다(Testing Library를 불러오지도 않음).
import { afterEach } from 'vitest'

if (typeof document !== 'undefined') {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const { cleanup } = await import('@testing-library/react')
  afterEach(() => {
    cleanup()
  })
}
