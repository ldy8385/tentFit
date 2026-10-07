import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import App from './App'

const TITLE = 'tentFit — 텐트 배치 시뮬레이터'

describe('App', () => {
  it('제목을 h1 하나로 보여 준다', () => {
    const html = renderToStaticMarkup(createElement(App))
    expect(html).toMatch(/<h1[^>]*>tentFit — 텐트 배치 시뮬레이터<\/h1>/)
    expect(html.match(/<h1/g)).toHaveLength(1)
  })
})

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
