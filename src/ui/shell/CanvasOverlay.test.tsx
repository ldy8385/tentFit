// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStores, StoresProvider, type Stores } from '../../app/stores'
import { createLayout, type Layout, type Tent } from '../../core/model'
import { addItem, makeItem } from '../../core/ops/items'
import { fitView, layoutBBox } from '../../view/viewport'
import { tunnelLayout } from '../area/testLayouts'
import {
  CanvasOverlay,
  EMPTY_BODY_DESKTOP,
  EMPTY_BODY_MOBILE,
  EMPTY_TITLE,
  MODE_CHIP_COLLAPSE_MS,
  SWAP_TENT_BUTTON,
} from './CanvasOverlay'
import {
  EMPTY_CARD_BOTTOM_GAP_PX,
  EMPTY_CARD_DOCKED_HEIGHT_PX,
  EMPTY_CARD_MAX_WIDTH_PX,
  EMPTY_CARD_TOP_GAP_PX,
  emptyCardPlacement,
  tentScreenBox,
} from './emptyCardPlacement'

// 텐트 바꾸기 대화상자가 열리면 목록을 불러옵니다. 이 파일은 "열렸는지"만 보므로 끝나지 않는 Promise로 둡니다.
vi.mock('../../app/tentCatalog', () => ({ loadTentCatalog: () => new Promise(() => {}) }))

const TENT: Tent = { name: '시험 텐트', outer: { kind: 'rect', w: 400, h: 300 }, inners: [] }
const PLACE_TEXT = '배치 모드 · 텐트는 잠겨 있어요'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function renderOverlay(variant: 'desktop' | 'mobile', layout: Layout = createLayout(TENT, { name: '배치' })): Stores {
  const stores = createStores(layout)
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

  it('물건이 0개면 안내 카드(스펙 §4.7-10 문구), 물건을 놓으면 사라진다', () => {
    const stores = renderOverlay('desktop')
    expect(screen.getByText(EMPTY_TITLE)).toBeTruthy()
    expect(EMPTY_BODY_DESKTOP).toBe('라이브러리에서 누르면 추가돼요')
    expect(screen.getByText(EMPTY_BODY_DESKTOP)).toBeTruthy()
    expect(screen.queryByRole('button', { name: '물건 추가' })).toBeNull()
    addMat(stores)
    expect(screen.queryByTestId('empty-card')).toBeNull()
  })

  it('안내 카드 버튼은 [텐트 바꾸기]만이고, 누르면 텐트 바꾸기 대화상자를 연다(배치 모드 그대로)', () => {
    const stores = renderOverlay('desktop')
    const card = screen.getByTestId('empty-card')
    expect(within(card).getAllByRole('button').map((b) => b.textContent)).toEqual([SWAP_TENT_BUTTON])
    fireEvent.click(within(card).getByRole('button', { name: SWAP_TENT_BUTTON }))
    expect(stores.ui.getState().editorDialog).toBe('swapTent')
    expect(stores.ui.getState().mode).toBe('place')
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('텐트 바꾸기')
    expect(document.body.contains(dialog)).toBe(true)
    expect(screen.getByTestId('canvas-overlay').contains(dialog)).toBe(false)
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

describe('CanvasOverlay — 토스트', () => {
  it('ui.toast를 보여 주고 2500ms 뒤 지운다(dismissToast)', () => {
    vi.useFakeTimers()
    const stores = renderOverlay('desktop')
    act(() => stores.ui.getState().showToast('빈 공간이 부족해요'))
    expect(screen.getByText('빈 공간이 부족해요')).toBeTruthy()
    act(() => vi.advanceTimersByTime(2499))
    expect(screen.getByText('빈 공간이 부족해요')).toBeTruthy()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByText('빈 공간이 부족해요')).toBeNull()
    expect(stores.ui.getState().toast).toBeNull()
  })

  it('모바일에서도 같은 자리에 토스트를 그린다', () => {
    const stores = renderOverlay('mobile')
    act(() => stores.ui.getState().showToast('빈 공간이 부족해요'))
    expect(screen.getByText('빈 공간이 부족해요')).toBeTruthy()
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

  it('빈 안내 카드 버튼은 [물건 추가]·[텐트 바꾸기] 순서이고, [텐트 바꾸기]는 대화상자를 연다', () => {
    const stores = renderOverlay('mobile')
    const card = screen.getByTestId('empty-card')
    expect(within(card).getAllByRole('button').map((b) => b.textContent)).toEqual(['물건 추가', SWAP_TENT_BUTTON])
    fireEvent.click(within(card).getByRole('button', { name: SWAP_TENT_BUTTON }))
    expect(stores.ui.getState().editorDialog).toBe('swapTent')
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('물건이 있으면 카드(와 [텐트 바꾸기])가 없다', () => {
    const stores = renderOverlay('mobile')
    addMat(stores)
    expect(screen.queryByTestId('empty-card')).toBeNull()
    expect(screen.queryByRole('button', { name: SWAP_TENT_BUTTON })).toBeNull()
  })

  it('빈 안내 카드는 모바일 문구와 [물건 추가]를 보여 주고, 누르면 라이브러리 시트를 연다', () => {
    const stores = renderOverlay('mobile')
    expect(screen.getByText(EMPTY_BODY_MOBILE)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '물건 추가' }))
    expect(stores.ui.getState().mobileSheet).toBe('library')
    expect(screen.queryByTestId('empty-card')).toBeNull()
  })

  it('보류 Minor #15: 390×730 캔버스에 터널 4인을 맞춤 보기하면 카드는 아래쪽에 붙고 폭이 줄어든다', () => {
    const layout = tunnelLayout()
    const stores = createStores(layout)
    const size = { width: 390, height: 730 }
    stores.ui.getState().setSize(size)
    stores.ui.getState().setView(fitView(layoutBBox(layout), size, { top: 0, bottom: 0 }))
    render(
      <StoresProvider stores={stores}>
        <CanvasOverlay variant="mobile" />
      </StoresProvider>,
    )
    const card = screen.getByTestId('empty-card')
    expect(card.className).toContain('shell-empty--docked')
    expect(card.style.bottom).toBe(`${EMPTY_CARD_BOTTOM_GAP_PX}px`)
    expect(card.style.top).toBe('')
    expect(card.style.width).toBe(`${EMPTY_CARD_MAX_WIDTH_PX}px`)
  })

  it('아래 컨트롤은 시트 높이만큼 올라간다(insets.bottom → CSS 변수)', () => {
    const stores = renderOverlay('mobile')
    act(() => stores.ui.getState().setInsets({ top: 0, bottom: 280 }))
    expect(screen.getByTestId('canvas-overlay').style.getPropertyValue('--overlay-bottom')).toBe('280px')
  })
})

describe('emptyCardPlacement(순수)', () => {
  const canvas = (width: number, height: number, bottom = 0) => ({ width, height, insets: { top: 0, bottom } })

  it('390×730 + 터널 4인 맞춤 보기: 아래 붙임, 텐트와 겹침 0', () => {
    const layout = tunnelLayout()
    const c = canvas(390, 730)
    const view = fitView(layoutBBox(layout), c, c.insets)
    const tent = tentScreenBox(layout.tent, view)
    const p = emptyCardPlacement(c, tent)
    expect(p.anchor).toBe('bottom')
    expect(p.overlapPx2).toBe(0)
    expect(p.box.top).toBeGreaterThanOrEqual(tent.bottom)
    expect(p.box.bottom).toBe(730 - EMPTY_CARD_BOTTOM_GAP_PX)
    expect(p.box.bottom - p.box.top).toBe(EMPTY_CARD_DOCKED_HEIGHT_PX)
    expect(p.widthPx).toBe(EMPTY_CARD_MAX_WIDTH_PX)
    expect(p.box.left).toBe((390 - EMPTY_CARD_MAX_WIDTH_PX) / 2)
  })

  it('아래 자리가 텐트와 겹치고 위 자리가 비면 위에 붙인다', () => {
    const tent = { left: 50, right: 340, top: 400, bottom: 700 }
    const p = emptyCardPlacement(canvas(390, 730), tent)
    expect(p.anchor).toBe('top')
    expect(p.offsetPx).toBe(EMPTY_CARD_TOP_GAP_PX)
    expect(p.overlapPx2).toBe(0)
  })

  it('위아래 모두 겹치면 덜 겹치는 쪽, 같으면 아래', () => {
    const all = { left: -100, right: 500, top: -100, bottom: 900 }
    expect(emptyCardPlacement(canvas(390, 730), all).anchor).toBe('bottom')
    const mostlyBottom = { left: 0, right: 390, top: 200, bottom: 730 }
    const p = emptyCardPlacement(canvas(390, 730), mostlyBottom)
    expect(p.anchor).toBe('top')
    expect(p.overlapPx2).toBeGreaterThan(0)
  })

  it('시트 높이(insets.bottom)만큼 위로 올린다', () => {
    const p = emptyCardPlacement(canvas(390, 730, 280), null)
    expect(p.anchor).toBe('bottom')
    expect(p.offsetPx).toBe(280 + EMPTY_CARD_BOTTOM_GAP_PX)
  })

  it('좁은 화면에서는 좌우 16px씩 남기고 폭을 줄인다', () => {
    expect(emptyCardPlacement(canvas(300, 600), null).widthPx).toBe(268)
  })

  it('위 자리가 시트 쪽으로 넘치는 낮은 캔버스면 위로 옮기지 않는다', () => {
    // 아래 자리(52~202)는 다 겹치고 위 자리(104~254)는 덜 겹치지만, 위 자리가 시트 위 끝(250)을 넘습니다.
    const tent = { left: 0, right: 390, top: 52, bottom: 202 }
    const p = emptyCardPlacement({ width: 390, height: 400, insets: { top: 0, bottom: 150 } }, tent)
    expect(p.anchor).toBe('bottom')
    expect(p.overlapPx2).toBe(EMPTY_CARD_MAX_WIDTH_PX * EMPTY_CARD_DOCKED_HEIGHT_PX)
  })

  it('텐트 화면 사각형은 외곽 bbox를 보기로 옮긴 것', () => {
    const box = tentScreenBox(TENT, { zoom: 2, panX: 100, panY: 50 })
    expect(box).toEqual({ left: -300, top: -250, right: 500, bottom: 350 })
  })
})

describe('CanvasOverlay — 그리기 막대(Plan 4.1 §3)', () => {
  it('PC는 그리는 중 캔버스 위에 안내와 [점 되돌리기]·[그리기 완료]·[그리기 취소]', () => {
    const stores = renderOverlay('desktop')
    expect(screen.queryByRole('toolbar', { name: '그리기' })).toBeNull()
    act(() => {
      stores.ui.getState().setMode('tent')
      stores.ui.getState().startDrawing('newInner')
    })
    const bar = screen.getByRole('toolbar', { name: '그리기' })
    expect(within(bar).getByText('점을 찍어 그리세요 · 첫 점을 누르면 닫혀요')).toBeTruthy()
    expect(within(bar).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual([
      '점 되돌리기',
      '그리기 완료',
      '그리기 취소',
    ])
    fireEvent.click(within(bar).getByRole('button', { name: '그리기 취소' }))
    expect(stores.ui.getState().drawing).toBeNull()
  })

  it('휴대폰은 막대 대신 툴바가 같은 버튼을 가진다(여기에는 막대 없음)', () => {
    const stores = renderOverlay('mobile')
    act(() => {
      stores.ui.getState().setMode('tent')
      stores.ui.getState().startDrawing('newInner')
    })
    expect(screen.queryByRole('toolbar', { name: '그리기' })).toBeNull()
  })
})
