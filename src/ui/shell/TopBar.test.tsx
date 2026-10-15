// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { clearPickReturn, getPickReturn } from '../../app/PickRoute'
import { createStores, StoresProvider, type Stores } from '../../app/stores'
import { createLayout, type Tent } from '../../core/model'
import { addItem, makeItem } from '../../core/ops/items'
import { installFakeMatchMedia, type FakeMedia } from './fakeMatchMedia'
import { MobileTopBar } from './MobileTopBar'
import { TopBar } from './TopBar'
import { COARSE_POINTER_QUERY } from './useIsDesktop'

const TENT: Tent = { name: '시험 텐트', outer: { kind: 'rect', w: 400, h: 300 }, inners: [] }

let media: FakeMedia | null = null
afterEach(() => {
  cleanup()
  media?.restore()
  media = null
})

function renderBar(bar: 'desktop' | 'mobile', coarse = false): Stores {
  media = installFakeMatchMedia({ [COARSE_POINTER_QUERY]: coarse })
  const stores = createStores(createLayout(TENT, { name: '가을 캠핑' }))
  stores.ui.getState().setSize({ width: 800, height: 600 })
  render(<StoresProvider stores={stores}>{bar === 'desktop' ? <TopBar /> : <MobileTopBar />}</StoresProvider>)
  return stores
}

function addMat(stores: Stores) {
  const item = makeItem({ name: '매트', shape: { kind: 'rect', w: 200, h: 60 }, color: 'blue', category: 'MAT', countsArea: true }, [0, 0])
  act(() => {
    stores.doc.getState().commit((d) => addItem(d, item))
  })
}

describe('TopBar', () => {
  it("로고 'tentFit'과 배치 이름을 보여 준다", () => {
    renderBar('desktop')
    const bar = screen.getByTestId('top-bar')
    expect(within(bar).getByText('tentFit')).toBeTruthy()
    expect((within(bar).getByLabelText('배치 이름') as HTMLInputElement).value).toBe('가을 캠핑')
  })

  it('실행 취소·다시 실행 버튼이 canUndo·canRedo를 따른다', () => {
    const stores = renderBar('desktop')
    const undo = screen.getByRole('button', { name: '실행 취소' }) as HTMLButtonElement
    const redo = screen.getByRole('button', { name: '다시 실행' }) as HTMLButtonElement
    expect(undo.disabled).toBe(true)
    expect(redo.disabled).toBe(true)
    addMat(stores)
    expect(undo.disabled).toBe(false)
    fireEvent.click(undo)
    expect(stores.doc.getState().layout.items).toHaveLength(0)
    expect(undo.disabled).toBe(true)
    expect(redo.disabled).toBe(false)
    fireEvent.click(redo)
    expect(stores.doc.getState().layout.items).toHaveLength(1)
  })

  it('배치 이름을 고치고 Enter하면 rename되고, 실행 취소 기록에는 남지 않는다', () => {
    const stores = renderBar('desktop')
    const input = screen.getByLabelText('배치 이름') as HTMLInputElement
    act(() => input.focus())
    fireEvent.change(input, { target: { value: '  겨울 캠핑  ' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
    expect(stores.doc.getState().layout.name).toBe('겨울 캠핑')
    expect(input.value).toBe('겨울 캠핑')
    expect(stores.doc.getState().canUndo).toBe(false)
  })

  it('빈 이름은 되돌리고, Esc는 고치던 값을 버린다', () => {
    const stores = renderBar('desktop')
    const input = screen.getByLabelText('배치 이름') as HTMLInputElement
    act(() => input.focus())
    fireEvent.change(input, { target: { value: '   ' } })
    act(() => input.blur())
    expect(stores.doc.getState().layout.name).toBe('가을 캠핑')
    expect(input.value).toBe('가을 캠핑')
    act(() => input.focus())
    fireEvent.change(input, { target: { value: '버릴 이름' } })
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' })
    expect(stores.doc.getState().layout.name).toBe('가을 캠핑')
    expect(input.value).toBe('가을 캠핑')
  })

  it('[보기] 메뉴: 격자 보이기 켜고 끄기, 맞춤 보기', () => {
    const stores = renderBar('desktop')
    fireEvent.click(screen.getByRole('button', { name: '보기' }))
    const grid = screen.getByRole('menuitemcheckbox', { name: '격자 보이기' })
    expect(grid.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(grid)
    expect(stores.ui.getState().gridVisible).toBe(false)
    expect(screen.queryByRole('menu')).toBeNull()

    // 정렬 안내선(2026-10-15): 기본 켬, 끄면 이 브라우저에 기억
    fireEvent.click(screen.getByRole('button', { name: '보기' }))
    const guides = screen.getByRole('menuitemcheckbox', { name: '정렬 안내선' })
    expect(guides.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(guides)
    expect(stores.ui.getState().guidesVisible).toBe(false)
    expect(localStorage.getItem('tentfit.guidesVisible')).toBe('false')
    localStorage.removeItem('tentfit.guidesVisible')

    const before = stores.ui.getState().view
    fireEvent.click(screen.getByRole('button', { name: '보기' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '맞춤 보기' }))
    expect(stores.ui.getState().view).not.toEqual(before)
  })

  it('메뉴는 Esc로 닫히고, 그 Esc는 선택 해제까지 가지 않는다', () => {
    const stores = renderBar('desktop')
    addMat(stores)
    const id = stores.doc.getState().layout.items[0]!.id
    act(() => stores.ui.getState().setSelection([id]))
    let reachedWindow = false
    const onKey = () => {
      reachedWindow = true
    }
    window.addEventListener('keydown', onKey)
    fireEvent.click(screen.getByRole('button', { name: '보기' }))
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape', code: 'Escape' })
    window.removeEventListener('keydown', onKey)
    expect(screen.queryByRole('menu')).toBeNull()
    expect(reachedWindow).toBe(false)
  })

  it('메뉴 바깥을 누르면 닫힌다', () => {
    renderBar('desktop')
    fireEvent.click(screen.getByRole('button', { name: '보기' }))
    expect(screen.getByRole('menu')).toBeTruthy()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('[선택] 토글은 굵은 포인터(터치) 기기에서만 보이고, 누르면 selectToggle이 켜진다', () => {
    renderBar('desktop', false)
    expect(screen.queryByRole('button', { name: '선택' })).toBeNull()
    cleanup()
    media?.restore()
    const stores = renderBar('desktop', true)
    const toggle = screen.getByRole('button', { name: '선택' })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(toggle)
    expect(stores.ui.getState().selectToggle).toBe(true)
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
  })

  it('이 계획에 없는 버튼(측정·파일)은 두지 않는다(모드 토글은 radio라 버튼 목록에 없음)', () => {
    renderBar('desktop')
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)
    expect(names).toEqual(['처음 화면으로', '측정', '실행 취소', '다시 실행', '파일', '보기']) // 측정 = Plan 5, 파일 = Plan 7(전체 백업·불러오기)
  })
})

/** 항목 자체나 묶음(radiogroup)이 막혀 있는지(disabled 또는 aria-disabled) */
function isDisabled(el: HTMLElement): boolean {
  const group = el.closest('[role="radiogroup"]')
  return (
    el.hasAttribute('disabled') ||
    el.getAttribute('aria-disabled') === 'true' ||
    group?.getAttribute('aria-disabled') === 'true'
  )
}

describe('TopBar — 모드 토글(스펙 §4.1·§4.3)', () => {
  it('가운데에 [배치 | 텐트 편집] 두 칸, 순서는 배치 → 텐트 편집이고 지금 모드가 켜져 있다', () => {
    renderBar('desktop')
    const group = within(screen.getByTestId('mode-toggle')).getByRole('radiogroup', { name: '편집 모드' })
    const radios = within(group).getAllByRole('radio')
    expect(radios.map((r) => r.textContent)).toEqual(['배치', '텐트 편집'])
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false'])
  })

  it('텐트 편집을 누르면 모드가 바뀌고 물건 선택이 비며, 배치를 누르면 돌아온다', () => {
    const stores = renderBar('desktop')
    addMat(stores)
    const id = stores.doc.getState().layout.items[0]!.id
    act(() => stores.ui.getState().setSelection([id]))
    fireEvent.click(screen.getByRole('radio', { name: '텐트 편집' }))
    expect(stores.ui.getState().mode).toBe('tent')
    expect(stores.ui.getState().selection).toEqual([])
    expect(screen.getByRole('radio', { name: '텐트 편집' }).getAttribute('aria-checked')).toBe('true')
    act(() => stores.ui.getState().selectTentTarget('outer'))
    fireEvent.click(screen.getByRole('radio', { name: '배치' }))
    expect(stores.ui.getState().mode).toBe('place')
    expect(stores.ui.getState().tentTarget).toBeNull()
    expect(screen.getByRole('radio', { name: '배치' }).getAttribute('aria-checked')).toBe('true')
  })

  it('모드를 바꿔도 실행 취소 기록은 그대로다(모드는 화면 상태)', () => {
    const stores = renderBar('desktop')
    fireEvent.click(screen.getByRole('radio', { name: '텐트 편집' }))
    expect(stores.doc.getState().canUndo).toBe(false)
  })

  it('측정 중(tentControlsEnabled false)에는 토글이 막히고 모드가 바뀌지 않는다', () => {
    const stores = renderBar('desktop')
    act(() => stores.ui.getState().patch({ measuring: true }))
    const tent = screen.getByRole('radio', { name: '텐트 편집' })
    expect(isDisabled(tent)).toBe(true)
    fireEvent.click(tent)
    expect(stores.ui.getState().mode).toBe('place')
    act(() => stores.ui.getState().patch({ measuring: false }))
    expect(isDisabled(screen.getByRole('radio', { name: '텐트 편집' }))).toBe(false)
  })
})

describe('MobileTopBar', () => {
  it('☰ 메뉴·배치 이름·실행 취소가 있고, 메뉴에 다시 실행·격자 보이기·맞춤 보기가 있다', () => {
    const stores = renderBar('mobile')
    const bar = screen.getByTestId('mobile-top-bar')
    expect((within(bar).getByLabelText('배치 이름') as HTMLInputElement).value).toBe('가을 캠핑')
    const undo = within(bar).getByRole('button', { name: '실행 취소' }) as HTMLButtonElement
    expect(undo.disabled).toBe(true)

    fireEvent.click(within(bar).getByRole('button', { name: '메뉴' }))
    const items = Array.from(screen.getByRole('menu').querySelectorAll('button'), (el) => el.textContent)
    expect(items).toEqual(['처음 화면', '다시 실행', '격자 보이기', '격자 간격 (10cm)', '자석 맞춤', '정렬 안내선', '맞춤 보기', '거리 재기', '전체 백업(파일로 내려받기)', '파일 불러오기', 'PNG로 저장'])
    expect((screen.getByRole('menuitem', { name: '다시 실행' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: '격자 보이기' }))
    expect(stores.ui.getState().gridVisible).toBe(false)
    // 격자 간격(휴대폰은 캔버스 칩 대신 메뉴에서 창을 엶)
    fireEvent.click(within(bar).getByRole('button', { name: '메뉴' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '격자 간격 (10cm)' }))
    expect(stores.ui.getState().gridPanelOpen).toBe(true)
    // 정렬 안내선 끄기(2026-10-15)
    fireEvent.click(within(bar).getByRole('button', { name: '메뉴' }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: '정렬 안내선' }))
    expect(stores.ui.getState().guidesVisible).toBe(false)
  })

  it('실행 취소 → 메뉴의 다시 실행으로 되돌린다', () => {
    const stores = renderBar('mobile')
    addMat(stores)
    fireEvent.click(screen.getByRole('button', { name: '실행 취소' }))
    expect(stores.doc.getState().layout.items).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: '메뉴' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '다시 실행' }))
    expect(stores.doc.getState().layout.items).toHaveLength(1)
  })
})

describe('그리는 중 실행 취소·다시 실행(Plan 4.1 판단 Q5)', () => {
  it('PC 상단 바의 실행 취소·다시 실행은 그리는 중 비활성', () => {
    const stores = renderBar('desktop')
    addMat(stores)
    act(() => {
      stores.ui.getState().setMode('tent')
      stores.ui.getState().startDrawing('newInner')
    })
    expect((screen.getByRole('button', { name: '실행 취소' }) as HTMLButtonElement).disabled).toBe(true)
    act(() => stores.ui.getState().endDrawing())
    expect((screen.getByRole('button', { name: '실행 취소' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('휴대폰 상단 바 실행 취소·메뉴의 다시 실행도 그리는 중 비활성', () => {
    const stores = renderBar('mobile')
    addMat(stores)
    act(() => stores.doc.getState().undo())
    act(() => {
      stores.ui.getState().setMode('tent')
      stores.ui.getState().startDrawing('newInner')
    })
    fireEvent.click(screen.getByRole('button', { name: '메뉴' }))
    expect((screen.getByRole('menuitem', { name: '다시 실행' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('처음 화면으로(소유자 요청 2026-10-15: "홈으로 가기가 없나?")', () => {
  afterEach(() => {
    clearPickReturn()
    window.location.hash = ''
  })

  it('PC: 로고 tentFit을 누르면 텐트 고르기 화면, [취소]로 돌아올 배치 = 지금 배치', () => {
    const stores = renderBar('desktop')
    fireEvent.click(screen.getByRole('button', { name: '처음 화면으로' }))
    expect(window.location.hash).toBe('#/pick')
    expect(getPickReturn()).toEqual({ layoutId: stores.doc.getState().layout.id })
  })

  it('휴대폰: ☰ 메뉴 「처음 화면」', () => {
    const stores = renderBar('mobile')
    fireEvent.click(screen.getByRole('button', { name: '메뉴' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '처음 화면' }))
    expect(window.location.hash).toBe('#/pick')
    expect(getPickReturn()).toEqual({ layoutId: stores.doc.getState().layout.id })
  })
})
