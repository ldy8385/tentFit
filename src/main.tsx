import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('index.html에 #root 요소가 없습니다')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
