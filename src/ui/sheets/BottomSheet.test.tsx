// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BottomSheet, SHEET_KEYBOARD_TOP_GAP, sheetLift } from './BottomSheet'

const INITIAL_INNER_HEIGHT = window.innerHeight

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'visualViewport')
  window.innerHeight = INITIAL_INNER_HEIGHT
})

describe('sheetLift', () => {
  it('아래에 이미 떨어진 거리(툴바)만큼은 빼고 올린다, 음수는 0', () => {
    expect(sheetLift(0, 56)).toBe(0)
    expect(sheetLift(336, 56)).toBe(280)
    expect(sheetLift(336, 0)).toBe(336)
    expect(sheetLift(40, 56)).toBe(0)
    expect(sheetLift(336, -10)).toBe(336)
  })
})

describe('BottomSheet', () => {
  it('제목·본문·testId, ×는 onClose', () => {
    const onClose = vi.fn()
    render(
      <BottomSheet title="롤테이블" onClose={onClose} testId="selection-sheet">
        <p>본문</p>
      </BottomSheet>,
    )
    const sheet = screen.getByTestId('selection-sheet')
    expect(sheet.getAttribute('aria-label')).toBe('롤테이블')
    expect(screen.getByRole('heading', { name: '롤테이블' })).toBeTruthy()
    expect(screen.getByText('본문')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('onToggleExpand가 있으면 grabber가 펼치기·접기 버튼이다', () => {
    const onToggleExpand = vi.fn()
    const { rerender } = render(
      <BottomSheet title="시트" onClose={vi.fn()} expanded={false} onToggleExpand={onToggleExpand} testId="s">
        <p>본문</p>
      </BottomSheet>,
    )
    const grabber = screen.getByRole('button', { name: '펼치기' })
    expect(grabber.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(grabber)
    expect(onToggleExpand).toHaveBeenCalledTimes(1)
    rerender(
      <BottomSheet title="시트" onClose={vi.fn()} expanded onToggleExpand={onToggleExpand} testId="s">
        <p>본문</p>
      </BottomSheet>,
    )
    expect(screen.getByRole('button', { name: '접기' }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByTestId('s').getAttribute('data-expanded')).toBe('true')
  })

  it('onToggleExpand가 없으면 grabber는 버튼이 아니다', () => {
    render(
      <BottomSheet title="시트" onClose={vi.fn()}>
        <p>본문</p>
      </BottomSheet>,
    )
    expect(screen.queryByRole('button', { name: '펼치기' })).toBeNull()
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('키보드가 없으면 그대로 둔다', () => {
    render(
      <BottomSheet title="시트" onClose={vi.fn()} testId="s">
        <p>본문</p>
      </BottomSheet>,
    )
    const sheet = screen.getByTestId('s')
    expect(sheet.style.transform).toBe('')
    expect(sheet.style.maxHeight).toBe('')
  })

  it('키보드가 올라오면 툴바 높이를 뺀 만큼 위로 올리고, 높이를 보이는 영역 안으로 줄인다', () => {
    window.innerHeight = 844
    const vv = Object.assign(new EventTarget(), { height: 508, offsetTop: 0 })
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true, writable: true })
    // 셸이 시트를 높이 56px 툴바 바로 위에 놓았다고 봅니다: 시트 아래 끝 = 844 − 56
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 500, width: 390, height: 288 }),
    )
    render(
      <BottomSheet title="시트" onClose={vi.fn()} testId="s">
        <input aria-label="가로" />
      </BottomSheet>,
    )
    const sheet = screen.getByTestId('s')
    expect(sheet.style.transform).toBe('translateY(-280px)')
    expect(sheet.style.maxHeight).toBe(`${508 - SHEET_KEYBOARD_TOP_GAP}px`)
  })
})
