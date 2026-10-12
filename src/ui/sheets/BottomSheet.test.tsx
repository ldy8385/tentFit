// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BottomSheet,
  SHEET_BOUNDS_ATTR,
  SHEET_KEYBOARD_TOP_GAP,
  SHEET_MIN_KEYBOARD_HEIGHT,
  sheetLift,
  sheetMaxHeight,
} from './BottomSheet'

const INITIAL_INNER_HEIGHT = window.innerHeight

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'visualViewport')
  window.innerHeight = INITIAL_INNER_HEIGHT
})

/** 화면 키보드: 레이아웃 높이 844, 보이는 영역 높이 vvHeight(위쪽 밀림 offsetTop) */
function keyboard(vvHeight: number, offsetTop = 0): void {
  window.innerHeight = 844
  const vv = Object.assign(new EventTarget(), { height: vvHeight, offsetTop })
  Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true, writable: true })
}

/** 시트 자리(SHEET_BOUNDS_ATTR) 위 끝은 boundsTop, 시트는 높이 56px 툴바 바로 위(아래 끝 844 − 56)에 있다고 봅니다. */
function mockRects(boundsTop: number): void {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.hasAttribute(SHEET_BOUNDS_ATTR)) return DOMRect.fromRect({ x: 0, y: boundsTop, width: 390, height: 788 - boundsTop })
    return DOMRect.fromRect({ x: 0, y: 500, width: 390, height: 288 })
  })
}

describe('sheetLift', () => {
  it('아래에 이미 떨어진 거리(툴바)만큼은 빼고 올린다, 음수는 0', () => {
    expect(sheetLift(0, 56)).toBe(0)
    expect(sheetLift(336, 56)).toBe(280)
    expect(sheetLift(336, 0)).toBe(336)
    expect(sheetLift(40, 56)).toBe(0)
    expect(sheetLift(336, -10)).toBe(336)
  })
})

describe('sheetMaxHeight(보류 Minor #13)', () => {
  it('보이는 영역 아래 끝에서 시트 자리 위 끝(상단 바 아래)까지, 위에 캔버스 여백을 남긴다', () => {
    // 상단 바 56 + safe-area 47 = 103
    expect(sheetMaxHeight(0, 508, 103)).toBe(508 - 103 - SHEET_KEYBOARD_TOP_GAP)
  })

  it('보이는 영역이 아래로 밀려(offsetTop) 시트 자리 위 끝보다 낮으면 보이는 영역 위 끝 기준', () => {
    expect(sheetMaxHeight(150, 650, 56)).toBe(650 - 150 - SHEET_KEYBOARD_TOP_GAP)
  })

  it('남는 높이가 작으면 최소 높이', () => {
    expect(sheetMaxHeight(0, 200, 56)).toBe(SHEET_MIN_KEYBOARD_HEIGHT)
  })
})

describe('BottomSheet', () => {
  it('제목·본문·testId, ×는 onClose(기본 이름 닫기)', () => {
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

  it('보류 Minor #19: closeLabel이 있으면 ×의 이름이 그것이다', () => {
    const onClose = vi.fn()
    render(
      <BottomSheet title="이너 1" closeLabel="선택 해제" onClose={onClose}>
        <p>본문</p>
      </BottomSheet>,
    )
    expect(screen.queryByRole('button', { name: '닫기' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '선택 해제' }))
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

  it('키보드가 올라오면 툴바 높이를 뺀 만큼 위로 올리고, 높이를 시트 자리 위 끝(상단 바 아래) 안으로 줄인다', () => {
    keyboard(508)
    mockRects(56)
    render(
      <main {...{ [SHEET_BOUNDS_ATTR]: '' }}>
        <BottomSheet title="시트" onClose={vi.fn()} testId="s">
          <input aria-label="가로" />
        </BottomSheet>
      </main>,
    )
    const sheet = screen.getByTestId('s')
    expect(sheet.style.transform).toBe('translateY(-280px)')
    expect(sheet.style.maxHeight).toBe(`${508 - 56 - SHEET_KEYBOARD_TOP_GAP}px`)
  })

  it('보류 Minor #13 회귀: 줄인 시트의 위 끝이 상단 바(시트 자리 위 끝) 위로 올라가지 않는다', () => {
    keyboard(508)
    mockRects(103)
    render(
      <main {...{ [SHEET_BOUNDS_ATTR]: '' }}>
        <BottomSheet title="시트" onClose={vi.fn()} testId="s">
          <input aria-label="가로" />
        </BottomSheet>
      </main>,
    )
    const sheet = screen.getByTestId('s')
    const sheetTop = 508 - Number.parseFloat(sheet.style.maxHeight)
    expect(sheetTop).toBeGreaterThanOrEqual(103 + SHEET_KEYBOARD_TOP_GAP)
  })

  it('키보드가 내려가면 높이 제한과 올림을 지운다', () => {
    keyboard(508)
    mockRects(56)
    render(
      <main {...{ [SHEET_BOUNDS_ATTR]: '' }}>
        <BottomSheet title="시트" onClose={vi.fn()} testId="s">
          <input aria-label="가로" />
        </BottomSheet>
      </main>,
    )
    const vv = window.visualViewport as unknown as EventTarget & { height: number }
    vv.height = 844
    act(() => {
      vv.dispatchEvent(new Event('resize'))
    })
    const sheet = screen.getByTestId('s')
    expect(sheet.style.transform).toBe('')
    expect(sheet.style.maxHeight).toBe('')
  })
})
