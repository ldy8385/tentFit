// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { installFakeMatchMedia, type FakeMedia } from './fakeMatchMedia'
import { COARSE_POINTER_QUERY, DESKTOP_QUERY, useCoarsePointer, useIsDesktop } from './useIsDesktop'

let media: FakeMedia | null = null
afterEach(() => {
  cleanup()
  media?.restore()
  media = null
})

describe('useIsDesktop', () => {
  it("질의는 '(min-width: 768px)'이다", () => {
    expect(DESKTOP_QUERY).toBe('(min-width: 768px)')
  })

  it('768px 이상이면 true, 창을 줄이면 false로 바뀐다', () => {
    media = installFakeMatchMedia({ [DESKTOP_QUERY]: true })
    const { result } = renderHook(() => useIsDesktop())
    expect(result.current).toBe(true)
    act(() => media!.set(DESKTOP_QUERY, false))
    expect(result.current).toBe(false)
  })

  it('matchMedia가 없으면 false(모바일 셸)', () => {
    const original = window.matchMedia
    // @ts-expect-error 일부러 지웁니다
    delete window.matchMedia
    try {
      const { result } = renderHook(() => useIsDesktop())
      expect(result.current).toBe(false)
    } finally {
      window.matchMedia = original
    }
  })
})

describe('useCoarsePointer', () => {
  it('(pointer: coarse)를 따른다', () => {
    media = installFakeMatchMedia({ [COARSE_POINTER_QUERY]: true })
    const { result } = renderHook(() => useCoarsePointer())
    expect(result.current).toBe(true)
  })
})
