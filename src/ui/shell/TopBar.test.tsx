// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
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

  it('이 계획에 없는 버튼(모드 토글·측정·파일)은 두지 않는다', () => {
    renderBar('desktop')
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)
    expect(names).toEqual(['실행 취소', '다시 실행', '보기'])
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
    expect(items).toEqual(['다시 실행', '격자 보이기', '맞춤 보기'])
    expect((screen.getByRole('menuitem', { name: '다시 실행' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: '격자 보이기' }))
    expect(stores.ui.getState().gridVisible).toBe(false)
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
