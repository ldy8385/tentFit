// 전역 스타일은 컴포넌트보다 먼저 불러옵니다(토큰 → 기본 규칙 → 컴포넌트 순으로 덮어씀).
import './ui/tokens.css'
import './ui/base.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import { openIdbKv } from './app/persist/kv'
import { initStorage } from './app/persist/storage'
import { blockBrowserGestures } from './ui/browserGestures'

// iOS Safari 핀치 확대(gesturestart·gesturechange) 차단(스펙 §4.5). 앱이 살아 있는 동안 계속 붙여 둡니다.
blockBrowserGestures(document)

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('index.html에 #root 요소가 없습니다')
}

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
