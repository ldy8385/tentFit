import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // 순수 TS는 *.test.ts(node 환경), React 컴포넌트는 *.test.tsx(파일 첫 줄 `// @vitest-environment happy-dom`)
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.ts'],
    environment: 'node',
    // DOM 환경 파일에서 Testing Library 자동 정리·React act 환경을 켭니다(Vitest globals를 쓰지 않으므로)
    setupFiles: ['src/test/setup.ts'],
  },
})
