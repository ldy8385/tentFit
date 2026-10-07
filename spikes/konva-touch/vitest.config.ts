// Konva 터치 스파이크의 순수 모듈 테스트 전용 설정(루트 vitest 설정은 src·scripts만 본다).
// 실행: pnpm vitest run -c spikes/konva-touch/vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['spikes/konva-touch/**/*.test.ts'],
    environment: 'node',
  },
})
