// Konva 터치 스파이크 전용 Vite 설정(버리는 코드). 스펙 §14, 계획 P1 Task 6.
// 실행: pnpm spike:touch → 같은 Wi-Fi의 휴대폰에서 https://<맥 IP>:5174 (자체 서명 경고 통과)
// 경로는 저장소 루트에서 실행한다는 전제다(pnpm 스크립트는 늘 루트에서 돈다).
import { appendFile } from 'node:fs/promises'
import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const RESULTS_FILE = 'docs/plans/spike-results.md' // 로컬 전용(docs/는 커밋하지 않음)
const MAX_BODY = 64 * 1024

// 휴대폰의 [맥에 저장] 버튼이 보낸 결과 절을 RESULTS_FILE 끝에 붙인다. 개발 서버에서만 동작한다.
function saveSpikeResults(): Plugin {
  return {
    name: 'tentfit-spike-save-results',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__spike/results', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        let body = ''
        req.setEncoding('utf8')
        req.on('data', (chunk: string) => {
          body += chunk
          if (body.length > MAX_BODY) req.destroy()
        })
        req.on('end', () => {
          appendFile(RESULTS_FILE, `\n${body.trim()}\n`, 'utf8').then(
            () => {
              res.statusCode = 204
              res.end()
            },
            (err: unknown) => {
              res.statusCode = 500
              res.end(String(err))
            },
          )
        })
      })
    },
  }
}

export default defineConfig({
  root: 'spikes/konva-touch', // index.html 위치. 현재 작업 폴더(저장소 루트) 기준
  cacheDir: '../../node_modules/.vite-spike-touch', // 본 앱의 node_modules/.vite와 분리(인증서도 여기에 생김)
  plugins: [react(), basicSsl(), saveSpikeResults()],
  server: { host: true, port: 5174, strictPort: true },
  preview: { host: true, port: 5174, strictPort: true },
  build: {
    outDir: '../../node_modules/.cache/spike-konva-touch', // 버리는 산출물: git에 안 잡히는 곳
    emptyOutDir: true,
    chunkSizeWarningLimit: 1024, // konva+react 한 덩어리(약 560kB)는 스파이크에서 문제 아님
  },
})
