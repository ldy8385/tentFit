// 전역 스타일은 컴포넌트보다 먼저 불러옵니다(토큰 → 기본 규칙 → 컴포넌트 순으로 덮어씀).
import './ui/tokens.css'
import './ui/base.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import { openIdbKv } from './app/persist/kv'
import { flushSaves, initStorage } from './app/persist/storage'
import { blockBrowserGestures } from './ui/browserGestures'

// iOS Safari 핀치 확대(gesturestart·gesturechange) 차단(스펙 §4.5). 앱이 살아 있는 동안 계속 붙여 둡니다.
blockBrowserGestures(document)

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('index.html에 #root 요소가 없습니다')
}

// 오프라인(PWA, 2026-10-15): 배포본에서만 서비스 워커를 둡니다(빌드가 dist/sw.js를 만듦). 한 번 연 뒤에는 인터넷 없이 열립니다.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // 등록 실패(사생활 보호 창 등)는 앱 동작과 무관합니다.
    })
  })
}

// 새 버전 배포 뒤 예전 화면이 지워진 조각을 부르다 실패하면, 저장을 끝내고 한 번 새로 고칩니다(§10.2).
window.addEventListener('vite:preloadError', () => {
  void flushSaves().finally(() => window.location.reload())
})

// 저장된 배치·내 텐트를 먼저 불러온 뒤 그립니다(Plan 7). 저장소를 못 쓰면 메모리로만.
const root = createRoot(rootElement)
void openIdbKv()
  .then(initStorage)
  .catch(() => initStorage(null))
  .finally(() =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  )
