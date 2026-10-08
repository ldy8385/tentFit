import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const baseCss = read('./base.css')

type Decls = Record<string, string>

/** 단순 CSS(중첩·@규칙 없음)를 선택자별 선언으로 읽습니다. 같은 선택자가 여러 번 나오면 뒤 값이 이깁니다. */
function rulesBySelector(css: string): Map<string, Decls> {
  const out = new Map<string, Decls>()
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decls: Decls = {}
    for (const part of m[2].split(';')) {
      const i = part.indexOf(':')
      if (i < 0) continue
      decls[part.slice(0, i).trim()] = part.slice(i + 1).trim()
    }
    for (const sel of m[1].split(',')) {
      const key = sel.trim()
      out.set(key, { ...out.get(key), ...decls })
    }
  }
  return out
}

const rules = rulesBySelector(baseCss)
const decl = (selector: string): Decls => rules.get(selector) ?? {}

describe('base.css — 브라우저 기본 제스처 차단(스펙 §4.5)', () => {
  it('html·body: 여백 0, 높이 100dvh 고정, 문서 스크롤·당겨서 새로고침 없음, 핀치 확대 금지', () => {
    for (const sel of ['html', 'body']) {
      expect(decl(sel), sel).toMatchObject({
        margin: '0',
        height: '100dvh',
        overflow: 'hidden',
        'overscroll-behavior': 'none',
        'touch-action': 'pan-x pan-y',
      })
    }
  })

  it('body: 앱 글꼴·배경·글자색 토큰, 숫자는 tabular-nums, 글자 선택·길게 누르기 메뉴 막음', () => {
    expect(decl('body')).toMatchObject({
      'font-family': 'var(--font-sans)',
      'font-variant-numeric': 'tabular-nums',
      background: 'var(--bg-app)',
      color: 'var(--text-primary)',
      'user-select': 'none',
      '-webkit-user-select': 'none',
      '-webkit-touch-callout': 'none',
    })
  })

  it('입력칸(input·textarea·contenteditable)은 글자 선택과 길게 누르기 메뉴를 되살린다', () => {
    for (const sel of ['input', 'textarea', '[contenteditable]', '[contenteditable] *']) {
      expect(decl(sel), sel).toMatchObject({
        'user-select': 'text',
        '-webkit-user-select': 'text',
        '-webkit-touch-callout': 'default',
      })
    }
  })

  it('입력칸 글자는 16px(iOS 포커스 확대 방지, 스펙 §4.2)', () => {
    for (const sel of ['input', 'select', 'textarea']) expect(decl(sel)['font-size'], sel).toBe('16px')
  })

  it('캔버스 컨테이너(.canvas-host)만 touch-action: none이다', () => {
    expect(decl('.canvas-host')['touch-action']).toBe('none')
    const noneSelectors = [...rules].filter(([, d]) => d['touch-action'] === 'none').map(([sel]) => sel)
    expect(noneSelectors).toEqual(['.canvas-host'])
  })

  it('#root는 body 높이를 채우고, 모든 요소는 border-box다', () => {
    expect(decl('#root').height).toBe('100%')
    for (const sel of ['*', '*::before', '*::after']) expect(decl(sel)['box-sizing'], sel).toBe('border-box')
  })
})

describe('src/main.tsx 진입점', () => {
  const main = read('../main.tsx')

  it('tokens.css → base.css 순서로, App보다 먼저 불러온다', () => {
    const tokens = main.indexOf("import './ui/tokens.css'")
    const base = main.indexOf("import './ui/base.css'")
    const app = main.indexOf("import App from './app/App'")
    expect(tokens).toBeGreaterThan(-1)
    expect(base).toBeGreaterThan(tokens)
    expect(app).toBeGreaterThan(base)
  })

  it('document에 WebKit 제스처 차단을 붙인다', () => {
    expect(main).toContain("import { blockBrowserGestures } from './ui/browserGestures'")
    expect(main).toContain('blockBrowserGestures(document)')
  })
})
