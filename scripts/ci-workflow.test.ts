import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

type PackageJson = { packageManager: string; engines: { node: string }; scripts: Record<string, string> }

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
const workflow = read('.github/workflows/ci.yml')
const pkg = JSON.parse(read('package.json')) as PackageJson

/** `uses: <action>` 줄부터 다음 단계(`      - `) 직전까지의 텍스트 */
function stepBlock(action: string): string {
  const start = workflow.indexOf(`uses: ${action}`)
  if (start < 0) return ''
  const next = workflow.indexOf('\n      - ', start)
  return next < 0 ? workflow.slice(start) : workflow.slice(start, next)
}

describe('GitHub Actions CI (.github/workflows/ci.yml)', () => {
  it('push와 pull_request에서 돈다', () => {
    expect(workflow).toMatch(/^on: \[push, pull_request\]$/m)
  })

  it('잠금 파일 그대로 설치한 뒤 pnpm ci:all 하나로 검사한다', () => {
    const install = workflow.indexOf('run: pnpm install --frozen-lockfile')
    const ciAll = workflow.indexOf('run: pnpm ci:all')
    expect(install).toBeGreaterThan(-1)
    expect(ciAll).toBeGreaterThan(install)
    expect(pkg.scripts['ci:all']).toBeDefined()
  })

  it('Node는 engines 최소 버전(Cloudflare NODE_VERSION과 같은 22.12.0)으로 돈다', () => {
    const minNode = pkg.engines.node.replace('>=', '')
    expect(minNode).toBe('22.12')
    expect(stepBlock('actions/setup-node@v7')).toMatch(/node-version: 22\.12\.0\n/)
    expect(stepBlock('actions/setup-node@v7')).toContain('cache: pnpm')
  })

  it('pnpm 버전은 package.json packageManager 한 곳에서만 정한다', () => {
    expect(pkg.packageManager).toBe('pnpm@10.8.1')
    const pnpmStep = stepBlock('pnpm/action-setup@v6')
    expect(pnpmStep).not.toBe('')
    expect(pnpmStep).not.toContain('version:')
    // pnpm이 setup-node(cache: pnpm)보다 먼저 설치돼야 캐시 경로를 찾습니다.
    expect(workflow.indexOf('uses: pnpm/action-setup@v6')).toBeLessThan(
      workflow.indexOf('uses: actions/setup-node@v7'),
    )
  })
})
