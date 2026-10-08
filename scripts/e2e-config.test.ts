// Playwright 화면 테스트 설정이 계약(Plan 3 Task 13)·스펙 §12·§13.4와 어긋나지 않는지 확인합니다.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'
import config from '../playwright.config'

type PackageJson = { scripts: Record<string, string>; devDependencies: Record<string, string> }

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')
const pkg = JSON.parse(read('package.json')) as PackageJson

describe('Playwright 설정(playwright.config.ts)', () => {
  it('e2e/ 폴더를 테스트 빌드 개발 서버(포트 4321)에 대고 돌린다', () => {
    expect(config.testDir).toBe('e2e')
    expect(config.use?.baseURL).toBe('http://localhost:4321')
    expect(config.webServer).toEqual({
      command: 'pnpm vite --mode test --port 4321 --strictPort',
      url: 'http://localhost:4321',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    })
  })

  it('desktop(1440×900 마우스)·mobile(390×844 터치) 두 프로젝트를 chromium으로 돌린다', () => {
    expect(config.use?.browserName).toBe('chromium')
    const projects = config.projects ?? []
    expect(projects.map((p) => p.name)).toEqual(['desktop', 'mobile'])
    const [desktop, mobile] = projects
    expect(desktop?.testMatch).toBe('editor.spec.ts')
    expect(desktop?.use).toEqual({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    })
    expect(mobile?.testMatch).toBe('mobile.spec.ts')
    expect(mobile?.use).toEqual({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    })
  })

  it('html 보고서를 열지 않고 playwright-report/에 남긴다(CI 아티팩트)', () => {
    const reporters = Array.isArray(config.reporter) ? config.reporter : []
    expect(reporters).toContainEqual(['html', { open: 'never' }])
  })
})

describe('package.json', () => {
  it('pnpm e2e = playwright test이고, 배포 관문(ci:all)에는 넣지 않는다(스펙 §12)', () => {
    expect(pkg.scripts.e2e).toBe('playwright test')
    expect(pkg.scripts['ci:all']).not.toContain('e2e')
    expect(pkg.scripts['ci:all']).not.toContain('playwright')
  })

  it('@playwright/test는 정확한 버전으로 고정한다', () => {
    expect(pkg.devDependencies['@playwright/test']).toMatch(/^\d+\.\d+\.\d+$/)
  })
})

describe('GitHub Actions 화면 테스트(.github/workflows/e2e.yml)', () => {
  const workflow = read('.github/workflows/e2e.yml')

  it('PR과 수동 실행에서만 돈다', () => {
    expect(workflow).toMatch(/^on: \[pull_request, workflow_dispatch\]$/m)
  })

  it('잠금 파일 그대로 설치 → chromium과 시스템 의존성 설치 → pnpm e2e 순서다', () => {
    const install = workflow.indexOf('run: pnpm install --frozen-lockfile')
    const browsers = workflow.indexOf('run: pnpm exec playwright install --with-deps chromium')
    const e2e = workflow.indexOf('run: pnpm e2e')
    expect(install).toBeGreaterThan(-1)
    expect(browsers).toBeGreaterThan(install)
    expect(e2e).toBeGreaterThan(browsers)
  })

  it('CI와 같은 Node 22.12.0을 쓰고 pnpm 버전은 packageManager를 따른다', () => {
    expect(workflow).toMatch(/node-version: 22\.12\.0\n/)
    expect(workflow).toContain('cache: pnpm')
    expect(workflow).toContain('uses: pnpm/action-setup@v6\n')
    expect(workflow.indexOf('uses: pnpm/action-setup@v6')).toBeLessThan(workflow.indexOf('uses: actions/setup-node@v7'))
  })

  it('실패하면 playwright-report를 아티팩트로 올린다', () => {
    const upload = workflow.slice(workflow.indexOf('uses: actions/upload-artifact@v7') - 80)
    expect(upload).toContain('if: failure()')
    expect(upload).toContain('path: playwright-report/')
  })
})

describe('Playwright 부산물', () => {
  it('.gitignore가 test-results/와 playwright-report/를 뺀다', () => {
    const lines = read('.gitignore').split('\n')
    expect(lines).toContain('test-results/')
    expect(lines).toContain('playwright-report/')
  })

  it('ESLint는 보고서·결과 폴더를 검사하지 않고 e2e/는 검사한다', async () => {
    const eslint = new ESLint({ cwd: root })
    expect(await eslint.isPathIgnored(join(root, 'playwright-report/trace/index.js'))).toBe(true)
    expect(await eslint.isPathIgnored(join(root, 'test-results/run/trace.js'))).toBe(true)
    expect(await eslint.isPathIgnored(join(root, 'e2e/helpers.ts'))).toBe(false)
    expect(await eslint.isPathIgnored(join(root, 'playwright.config.ts'))).toBe(false)
  })

  it('타입 검사 범위에 e2e/가 들어 있다(playwright.config.ts는 루트 *.ts로 이미 포함)', () => {
    const tsconfig = JSON.parse(read('tsconfig.json')) as { include: string[] }
    expect(tsconfig.include).toContain('e2e')
    expect(tsconfig.include).toContain('*.ts')
  })

  it('README 명령 표에 pnpm e2e가 있다', () => {
    expect(read('README.md')).toMatch(/^\| `pnpm e2e` \| .+ \|$/m)
  })
})
