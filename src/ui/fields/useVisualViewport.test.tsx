// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { readVisualViewport, useVisualViewport } from './useVisualViewport'

/** window.visualViewport 대역: resize·scroll 이벤트를 보낼 수 있는 객체 */
class FakeVisualViewport extends EventTarget {
  height: number
  offsetTop: number
  constructor(height: number, offsetTop = 0) {
    super()
    this.height = height
    this.offsetTop = offsetTop
  }
}

const INITIAL_INNER_HEIGHT = window.innerHeight

function installViewport(vv: FakeVisualViewport | undefined): void {
  Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true, writable: true })
}

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'visualViewport')
  window.innerHeight = INITIAL_INNER_HEIGHT
})

describe('readVisualViewport', () => {
  it('visualViewport가 없으면 innerHeight 기준, 가려짐 0', () => {
    expect(readVisualViewport({ innerHeight: 844 })).toEqual({ height: 844, offsetTop: 0, keyboardInset: 0 })
    expect(readVisualViewport({ innerHeight: 844, visualViewport: null })).toEqual({
      height: 844,
      offsetTop: 0,
      keyboardInset: 0,
    })
  })

  it('keyboardInset = innerHeight − (height + offsetTop)', () => {
    expect(readVisualViewport({ innerHeight: 844, visualViewport: { height: 508, offsetTop: 0 } })).toEqual({
      height: 508,
      offsetTop: 0,
      keyboardInset: 336,
    })
    expect(readVisualViewport({ innerHeight: 844, visualViewport: { height: 508, offsetTop: 120 } })).toEqual({
      height: 508,
      offsetTop: 120,
      keyboardInset: 216,
    })
  })

  it('음수(보이는 영역이 더 큼)면 0', () => {
    expect(readVisualViewport({ innerHeight: 844, visualViewport: { height: 850, offsetTop: 10 } }).keyboardInset).toBe(0)
  })
})

describe('useVisualViewport', () => {
  it('visualViewport가 없으면 innerHeight를 쓴다', () => {
    installViewport(undefined)
    window.innerHeight = 700
    const { result } = renderHook(() => useVisualViewport())
    expect(result.current).toEqual({ height: 700, offsetTop: 0, keyboardInset: 0 })
  })

  it('키보드가 올라오면(resize·scroll) 다시 계산하고, 값이 같으면 같은 객체를 준다', () => {
    const vv = new FakeVisualViewport(844)
    installViewport(vv)
    window.innerHeight = 844
    const { result, rerender } = renderHook(() => useVisualViewport())
    expect(result.current.keyboardInset).toBe(0)
    const first = result.current
    rerender()
    expect(result.current).toBe(first)

    act(() => {
      vv.height = 508
      vv.dispatchEvent(new Event('resize'))
    })
    expect(result.current).toEqual({ height: 508, offsetTop: 0, keyboardInset: 336 })

    act(() => {
      vv.offsetTop = 100
      vv.dispatchEvent(new Event('scroll'))
    })
    expect(result.current).toEqual({ height: 508, offsetTop: 100, keyboardInset: 236 })
  })

  it('창 크기가 바뀌어도 다시 계산한다', () => {
    const vv = new FakeVisualViewport(600)
    installViewport(vv)
    window.innerHeight = 600
    const { result } = renderHook(() => useVisualViewport())
    expect(result.current.keyboardInset).toBe(0)
    act(() => {
      window.innerHeight = 900
      window.dispatchEvent(new Event('resize'))
    })
    expect(result.current.keyboardInset).toBe(300)
  })
})
