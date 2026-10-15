// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { installAutoTitle } from './autoTitle'

let uninstall: (() => void) | null = null
afterEach(() => {
  uninstall?.()
  uninstall = null
  document.body.innerHTML = ''
})

/** 크기를 정한 말줄임 요소(happy-dom은 배치를 하지 않아 크기를 직접 줌) */
function box(style: string, text: string, size: { sw: number; cw: number; sh?: number; ch?: number }): HTMLElement {
  const el = document.createElement('span')
  el.setAttribute('style', style)
  el.textContent = text
  Object.defineProperty(el, 'scrollWidth', { configurable: true, get: () => size.sw })
  Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => size.cw })
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => size.sh ?? 20 })
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => size.ch ?? 20 })
  document.body.appendChild(el)
  return el
}

function hover(target: Element, pointerType = 'mouse'): void {
  const e = new Event('pointerover', { bubbles: true }) as Event & { pointerType: string }
  Object.defineProperty(e, 'pointerType', { value: pointerType })
  target.dispatchEvent(e)
}

const ELLIPSIS = 'overflow: hidden; white-space: nowrap; text-overflow: ellipsis'

describe('말줄임 글자 툴팁(소유자 요청 2026-10-15)', () => {
  it('실제로 잘린 글자에 마우스를 올리면 전체 글자를 title로', () => {
    uninstall = installAutoTitle(document)
    const el = box(ELLIPSIS, ' NEMO 텐서 올시즌 레귤러 와이드 ', { sw: 300, cw: 120 })
    hover(el)
    expect(el.title).toBe('NEMO 텐서 올시즌 레귤러 와이드')
  })

  it('안쪽 글자 조각에 올려도 말줄임 요소에 붙임', () => {
    uninstall = installAutoTitle(document)
    const el = box(ELLIPSIS, '', { sw: 300, cw: 120 })
    const inner = document.createElement('b')
    inner.textContent = '아주 긴 이름'
    el.appendChild(inner)
    hover(inner)
    expect(el.title).toBe('아주 긴 이름')
  })

  it('두 줄 자르기(line-clamp)는 높이로 판단', () => {
    uninstall = installAutoTitle(document)
    const el = box('display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden', '긴 매트 이름', { sw: 100, cw: 100, sh: 60, ch: 36 })
    hover(el)
    expect(el.title).toBe('긴 매트 이름')
  })

  it('잘리지 않았으면 붙이지 않고, 붙였던 것은 다시 올렸을 때 뗌', () => {
    uninstall = installAutoTitle(document)
    const size = { sw: 300, cw: 120 }
    const el = box(ELLIPSIS, '이름', size)
    hover(el)
    expect(el.title).toBe('이름')
    size.cw = 400
    hover(el)
    expect(el.hasAttribute('title')).toBe(false)
  })

  it('원래 title이 있으면 그대로, 터치는 무시, 해제 뒤에는 동작 안 함', () => {
    uninstall = installAutoTitle(document)
    const own = box(ELLIPSIS, '이름', { sw: 300, cw: 120 })
    own.title = '설명'
    hover(own)
    expect(own.title).toBe('설명')
    const touch = box(ELLIPSIS, '이름', { sw: 300, cw: 120 })
    hover(touch, 'touch')
    expect(touch.hasAttribute('title')).toBe(false)
    uninstall()
    uninstall = null
    const late = box(ELLIPSIS, '이름', { sw: 300, cw: 120 })
    hover(late)
    expect(late.hasAttribute('title')).toBe(false)
  })
})
