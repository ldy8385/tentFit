import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

type WranglerConfig = {
  name: string
  compatibility_date: string
  main?: string
  assets: { directory: string; not_found_handling: string }
}

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')

describe('Cloudflare Workers 정적 배포 설정(wrangler.jsonc)', () => {
  const cfg = JSON.parse(read('wrangler.jsonc')) as WranglerConfig

  it('Vite 빌드 결과(dist)를 정적 자산으로 올리고, 없는 경로는 index.html로 돌린다(SPA)', () => {
    expect(cfg.name).toBe('tentfit')
    expect(cfg.assets.directory).toBe('./dist')
    expect(cfg.assets.not_found_handling).toBe('single-page-application')
  })

  it('Worker 스크립트 없이 정적 자산만 쓴다', () => {
    expect(cfg.main).toBeUndefined()
    expect(cfg.compatibility_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('wrangler는 정확한 버전으로 고정한다(npx가 최신판을 받지 않게)', () => {
    const pkg = JSON.parse(read('package.json')) as { devDependencies: Record<string, string> }
    expect(pkg.devDependencies.wrangler).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('.wrangler 로컬 상태 폴더는 커밋하지 않는다', () => {
    expect(read('.gitignore')).toMatch(/^\.wrangler\/$/m)
  })
})
