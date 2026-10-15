// 오프라인(PWA, 스펙 §10, 소유자 요청 2026-10-15): 빌드가 끝나면 dist의 모든 파일을 미리 저장하는 서비스 워커(dist/sw.js)를 만듭니다.
// 플러그인 의존성 없이 직접 씁니다(vite-plugin-pwa 대신). 동작:
// - 설치: 이 빌드의 파일 전부를 캐시에 넣고 바로 이어받음(skipWaiting) → 한 번 연 뒤에는 인터넷 없이 열림.
// - 화면 주소(navigate): 네트워크 먼저(온라인이면 늘 새 버전), 안 되면 저장해 둔 index.html.
// - 그 밖의 같은 출처 GET: 캐시 먼저(Vary 무시 — 모듈 스크립트 요청의 Origin 헤더 때문에 못 찾지 않게), 없으면 네트워크에서 받아 넣음.
//   개발 서버 전용 주소(/__…)는 건드리지 않음.
// - 활성화: 이전 빌드 캐시를 지움.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { Plugin } from 'vite'

export const SW_FILE = 'sw.js'

/** 파일 목록(사이트 루트 기준 '/…')과 빌드 판별값으로 서비스 워커 글자를 만듭니다. */
export function swSource(files: readonly string[], version: string): string {
  const precache = ['/', ...files.filter((f) => f !== '/' + SW_FILE)]
  return `// tentFit 서비스 워커(빌드 때 scripts/serviceWorker.ts가 만듦). 손으로 고치지 마세요.
const CACHE = 'tentfit-${version}'
const PRECACHE = ${JSON.stringify(precache)}
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('tentfit-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})
self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/__')) return
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/index.html').then((r) => r || caches.match('/'))))
    return
  }
  e.respondWith(
    caches.match(req, { ignoreVary: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})
`
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

/** 빌드가 끝나면 dist/sw.js를 씁니다(개발 서버에는 없음). 판별값 = 파일 내용 해시 */
export function serviceWorkerPlugin(): Plugin {
  let outDir = 'dist'
  return {
    name: 'tentfit-service-worker',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir
    },
    closeBundle() {
      const paths = walk(outDir)
        .filter((p) => !p.endsWith(sep + SW_FILE) && !p.endsWith('.map'))
        .sort()
      const hash = createHash('sha256')
      for (const p of paths) hash.update(p).update(readFileSync(p))
      const files = paths.map((p) => '/' + relative(outDir, p).split(sep).join('/'))
      writeFileSync(join(outDir, SW_FILE), swSource(files, hash.digest('hex').slice(0, 12)))
    },
  }
}
