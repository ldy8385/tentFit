// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStores, StoresProvider, type Stores } from '../../app/stores'
import { createLayout, type Tent } from '../../core/model'
import { addItem, makeItem } from '../../core/ops/items'
import { CanvasOverlay, EMPTY_BODY_DESKTOP, EMPTY_BODY_MOBILE, EMPTY_TITLE, MODE_CHIP_COLLAPSE_MS } from './CanvasOverlay'

const TENT: Tent = { name: '시험 텐트', outer: { kind: 'rect', w: 400, h: 300 }, inners: [] }
const PLACE_TEXT = '배치 모드 · 텐트는 잠겨 있어요'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function renderOverlay(variant: 'desktop' | 'mobile'): Stores {
  const stores = createStores(createLayout(TENT, { name: '배치' }))
  stores.ui.getState().setSize({ width: 800, height: 600 })
  stores.ui.getState().setView({ zoom: 1.2, panX: 0, panY: 0 })
  render(
    <StoresProvider stores={stores}>
      <CanvasOverlay variant={variant} />
    </StoresProvider>,
  )
  return stores
}

function addMat(stores: Stores) {
  const item = makeItem({ name: '매트', shape: { kind: 'rect', w: 200, h: 60 }, color: 'blue', category: 'MAT', countsArea: true }, [0, 0])
  act(() => {
    stores.doc.getState().commit((d) => addItem(d, item))
  })
}

describe('CanvasOverlay — PC', () => {
  it('모드 안내 칩 문구를 보여 주고 접지 않는다', () => {
    vi.useFakeTimers()
    renderOverlay('desktop')
    expect(screen.getByText(PLACE_TEXT)).toBeTruthy()
    act(() => vi.advanceTimersByTime(MODE_CHIP_COLLAPSE_MS * 2))
    expect(screen.getByText(PLACE_TEXT)).toBeTruthy()
  })

  it('물건이 0개면 안내 카드, 물건을 놓으면 사라진다', () => {
    const stores = renderOverlay('desktop')
    expect(screen.getByText(EMPTY_TITLE)).toBeTruthy()
    expect(screen.getByText(EMPTY_BODY_DESKTOP)).toBeTruthy()
    expect(screen.queryByRole('button', { name: '물건 추가' })).toBeNull()
    addMat(stores)
    expect(screen.queryByTestId('empty-card')).toBeNull()
  })

  it('측정 중이거나 텐트 편집 모드면 안내 카드를 숨긴다', () => {
    const stores = renderOverlay('desktop')
    act(() => stores.ui.getState().patch({ measuring: true }))
    expect(screen.queryByTestId('empty-card')).toBeNull()
    act(() => stores.ui.getState().patch({ measuring: false, mode: 'tent' }))
    expect(screen.queryByTestId('empty-card')).toBeNull()
    expect(screen.getByText('텐트 편집 · 물건은 잠겨 있어요')).toBeTruthy()
  })

  it('확대·축소·맞춤 보기 버튼(44px 묶음)이 보기를 바꾼다', () => {
    const stores = renderOverlay('desktop')
    fireEvent.click(screen.getByRole('button', { name: '확대' }))
    expect(stores.ui.getState().view.zoom).toBeCloseTo(1.5, 10)
    fireEvent.click(screen.getByRole('button', { name: '축소' }))
    expect(stores.ui.getState().view.zoom).toBeCloseTo(1.2, 10)
    fireEvent.click(screen.getByRole('button', { name: '맞춤 보기' }))
    expect(stores.ui.getState().view.zoom).not.toBeCloseTo(1.2, 3)
  })

  it('배율 끝에서는 확대(20)·축소(0.1) 버튼을 막는다', () => {
    const stores = renderOverlay('desktop')
    act(() => stores.ui.getState().setView({ zoom: 20, panX: 0, panY: 0 }))
    expect((screen.getByRole('button', { name: '확대' }) as HTMLButtonElement).disabled).toBe(true)
    act(() => stores.ui.getState().setView({ zoom: 0.1, panX: 0, panY: 0 }))
    expect((screen.getByRole('button', { name: '축소' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('축척 막대: 0·50·100cm, 끝 눈금에만 단위', () => {
    renderOverlay('desktop')
    const bar = screen.getByTestId('scale-bar')
    expect(Array.from(bar.querySelectorAll('.shell-scalebar__tick'), (el) => el.textContent)).toEqual(['0', '50', '100cm'])
    expect(bar.style.width).toBe('120px')
  })
})

describe('CanvasOverlay — 모바일', () => {
  it('모드 안내 칩은 3초 뒤 접히고(요약 칩을 가리지 않음), 누르면 다시 펼쳐진다', () => {
    vi.useFakeTimers()
    renderOverlay('mobile')
    expect(screen.getByText(PLACE_TEXT)).toBeTruthy()
    act(() => vi.advanceTimersByTime(MODE_CHIP_COLLAPSE_MS - 1))
    expect(screen.getByText(PLACE_TEXT)).toBeTruthy()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByText(PLACE_TEXT)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: PLACE_TEXT }))
    expect(screen.getByText(PLACE_TEXT)).toBeTruthy()
  })

  it('확대·축소 버튼은 PC에만 있다(모바일은 핀치·메뉴의 맞춤 보기)', () => {
    renderOverlay('mobile')
    expect(screen.queryByRole('button', { name: '확대' })).toBeNull()
    expect(screen.queryByRole('button', { name: '맞춤 보기' })).toBeNull()
  })

  it('빈 안내 카드는 모바일 문구와 [물건 추가]를 보여 주고, 누르면 라이브러리 시트를 연다', () => {
    const stores = renderOverlay('mobile')
    expect(screen.getByText(EMPTY_BODY_MOBILE)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '물건 추가' }))
    expect(stores.ui.getState().mobileSheet).toBe('library')
    expect(screen.queryByTestId('empty-card')).toBeNull()
  })

  it('아래 컨트롤은 시트 높이만큼 올라간다(insets.bottom → CSS 변수)', () => {
    const stores = renderOverlay('mobile')
    act(() => stores.ui.getState().setInsets({ top: 0, bottom: 280 }))
    expect(screen.getByTestId('canvas-overlay').style.getPropertyValue('--overlay-bottom')).toBe('280px')
  })
})
