import { describe, expect, it } from 'vitest'
import { swSource } from './serviceWorker'

describe('서비스 워커(오프라인)', () => {
  it('루트와 빌드 파일을 미리 저장하고, 빌드마다 캐시 이름이 다름', () => {
    const src = swSource(['/index.html', '/assets/index-abc.js', '/sw.js'], 'v1')
    expect(src).toContain(`const CACHE = 'tentfit-v1'`)
    // /index.html은 배포 서버가 /로 돌려보내므로 '/'만
    expect(src).toContain('const PRECACHE = ["/","/assets/index-abc.js"]')
    expect(swSource([], 'v2')).toContain(`'tentfit-v2'`)
  })

  it('화면 주소는 네트워크 먼저·없으면 저장한 index.html, 개발 서버 주소는 건드리지 않음', () => {
    const src = swSource([], 'v')
    expect(src).toContain("req.mode === 'navigate'")
    expect(src).toContain("caches.match('/')")
    expect(src).toContain('res.redirected')
    expect(src).toContain("url.pathname.startsWith('/__')")
    expect(src).toContain('ignoreVary: true')
  })
})
