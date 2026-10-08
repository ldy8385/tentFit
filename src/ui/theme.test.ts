import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { COLOR_KEYS } from '../core/model'
import { THEME, cssVar, objColor } from './theme'

const tokensCss = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')

/** tokens.css의 `:root { … }`에서 사용자 정의 속성을 읽습니다. 키는 '--'를 뺀 이름입니다. */
function rootVars(css: string): Record<string, string> {
  const body = /:root\s*\{([^}]*)\}/.exec(css.replace(/\/\*[\s\S]*?\*\//g, ''))?.[1]
  if (body === undefined) throw new Error('tokens.css에 :root 블록이 없습니다')
  const vars: Record<string, string> = {}
  for (const m of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) vars[m[1]] = m[2].trim()
  return vars
}

const FONT_STACK = '"Pretendard", -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif'

/** 시안 tokens.css의 obj-1~8 값(스펙 §4: obj-1~8 = blue, teal, green, purple, pink, gray, sky, brown). */
const HANDOFF_OBJ: Record<(typeof COLOR_KEYS)[number], string> = {
  blue: '#4A7FD0',
  teal: '#159C92',
  green: '#6F9636',
  purple: '#8A6AD4',
  pink: '#C2559E',
  gray: '#5B7386',
  sky: '#2BA3C7',
  brown: '#9A8449',
}

describe('THEME ↔ tokens.css', () => {
  it('tokens.css :root의 변수와 THEME가 키·값 모두 같다', () => {
    const vars = rootVars(tokensCss)
    expect(Object.keys(vars)).toHaveLength(60)
    expect(THEME).toEqual(vars)
  })

  it('라이트(:root) 블록 하나만 있고 다크 테마 블록은 없다(D21)', () => {
    const css = tokensCss.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(css.match(/\{/g)).toHaveLength(1)
    expect(css).not.toContain('data-theme')
  })

  it('물건 색은 obj-<ColorKey> 이름이고 시안 obj-1~8 순서의 값이다', () => {
    expect(Object.keys(THEME).filter((k) => /^obj-\d/.test(k))).toEqual([])
    for (const key of COLOR_KEYS) {
      expect(THEME[`obj-${key}`]).toBe(HANDOFF_OBJ[key])
      expect(THEME[`obj-${key}-fill`]).toBe(`${HANDOFF_OBJ[key]}3D`)
    }
    expect(THEME['obj-sky']).toBe('#2BA3C7')
    expect(THEME['obj-sky-fill']).toBe('#2BA3C73D')
  })

  it('글꼴 토큰은 Pretendard 우선 스택이다(숫자도 같은 글꼴)', () => {
    expect(THEME['font-sans']).toBe(FONT_STACK)
    expect(THEME['font-num']).toBe(FONT_STACK)
  })

  it('캔버스와 패널이 쓰는 키가 모두 있다', () => {
    const keys = [
      'bg-app', 'bg-surface', 'tent-outline', 'inner-stroke', 'inner-fill', 'vest-fill', 'vest-stroke',
      'danger', 'warn', 'select', 'grid-fine', 'grid-mid', 'grid-strong', 'canvas-bg',
      'text-primary', 'text-secondary', 'accent', 'border',
    ]
    for (const k of keys) expect(THEME[k], k).toMatch(/^#[0-9A-F]{6}([0-9A-F]{2})?$/)
  })

  it('THEME는 고칠 수 없다', () => {
    expect(Object.isFrozen(THEME)).toBe(true)
  })
})

describe('objColor', () => {
  it('8개 ColorKey 모두 테두리 #RRGGBB와 같은 색의 24% 채움 #RRGGBB3D를 준다', () => {
    expect(COLOR_KEYS).toHaveLength(8)
    for (const key of COLOR_KEYS) {
      const c = objColor(key)
      expect(c.stroke).toMatch(/^#[0-9A-F]{6}$/)
      expect(c.fill).toBe(`${c.stroke}3D`)
    }
    expect(objColor('brown')).toEqual({ stroke: '#9A8449', fill: '#9A84493D' })
  })
})

describe('cssVar (node — document 없음)', () => {
  it('THEME 값을 돌려준다. 이름 앞의 --는 있어도 된다', () => {
    expect(typeof document).toBe('undefined')
    expect(cssVar('select')).toBe('#1F6FEB')
    expect(cssVar('--select')).toBe('#1F6FEB')
    expect(cssVar('obj-teal-fill')).toBe('#159C923D')
  })

  it('없는 이름은 빈 문자열', () => {
    expect(cssVar('no-such-token')).toBe('')
  })
})
