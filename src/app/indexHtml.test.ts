import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const TITLE = 'tentFit — 텐트 배치 시뮬레이터'

describe('index.html', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')

  it('문서 제목과 언어가 정해져 있다', () => {
    expect(html).toContain(`<title>${TITLE}</title>`)
    expect(html).toContain('<html lang="ko">')
  })

  it('뷰포트는 스펙 §4.5 값이고 진입점은 src/main.tsx다', () => {
    expect(html).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />',
    )
    expect(html).toContain('<script type="module" src="/src/main.tsx"></script>')
  })
})
