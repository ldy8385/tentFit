// 전역 스타일은 컴포넌트보다 먼저 불러옵니다(토큰 → 기본 규칙 → 컴포넌트 순으로 덮어씀).
import './ui/tokens.css'
import './ui/base.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import { blockBrowserGestures } from './ui/browserGestures'

// iOS Safari 핀치 확대(gesturestart·gesturechange) 차단(스펙 §4.5). 앱이 살아 있는 동안 계속 붙여 둡니다.
blockBrowserGestures(document)

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('index.html에 #root 요소가 없습니다')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
