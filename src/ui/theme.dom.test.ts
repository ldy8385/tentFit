// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cssVar } from './theme'

afterEach(() => {
  document.documentElement.removeAttribute('style')
  for (const el of document.head.querySelectorAll('style')) el.remove()
})

describe('cssVar (브라우저 — getComputedStyle)', () => {
  it('문서에 적용된 값을 읽는다(스타일시트)', () => {
    const style = document.createElement('style')
    style.textContent = ':root { --select: #000000; }'
    document.head.append(style)
    expect(cssVar('select')).toBe('#000000')
    expect(cssVar('--select')).toBe('#000000')
  })

  it('인라인 스타일로 바꾼 값도 읽는다', () => {
    document.documentElement.style.setProperty('--danger', '#FF0000')
    expect(cssVar('danger')).toBe('#FF0000')
  })

  it('문서에 값이 없으면 THEME 값으로 돌아간다', () => {
    expect(getComputedStyle(document.documentElement).getPropertyValue('--warn')).toBe('')
    expect(cssVar('warn')).toBe('#D4790F')
    expect(cssVar('no-such-token')).toBe('')
  })
})
