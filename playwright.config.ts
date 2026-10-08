import { defineConfig } from '@playwright/test'

/**
 * 화면 테스트(스펙 §13.4). 테스트 빌드(`vite --mode test`)만 window.__tentfit을 노출하므로 그 모드로 개발 서버를 띄웁니다.
 * 평소 개발 서버(5173)와 겹치지 않게 포트를 4321로 고정합니다. CDP 터치(e2e/helpers.ts)를 쓰므로 chromium만 돌립니다.
 */
const PORT = 4321
const BASE_URL = `http://localhost:${PORT}`
const CI = Boolean(process.env.CI)

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      testMatch: 'editor.spec.ts',
      use: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
    },
    {
      name: 'mobile',
      testMatch: 'mobile.spec.ts',
      use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command: `pnpm vite --mode test --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !CI,
    timeout: 120_000,
  },
})
