// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StoresProvider, createStores, type Stores } from '../../app/stores'
import { createLayout, type Item, type Tent } from '../../core/model'
import { SelectionSheet } from './SelectionSheet'

afterEach(cleanup)

const TENT: Tent = { name: '테스트 텐트', outer: { kind: 'rect', w: 600, h: 300 }, inners: [] }

function item(id: string, over: Partial<Item> = {}): Item {
  return {
    id,
    name: '롤테이블',
    shape: { kind: 'rect', w: 90, h: 60 },
    x: 0,
    y: 0,
    rotation: 0,
    color: 'green',
    category: 'TABLE',
    countsArea: true,
    ...over,
  }
}

function setup(items: Item[], selection: string[]): Stores {
  const layout = createLayout(TENT, { name: '배치', id: 'L1', now: '2026-10-08T00:00:00.000Z' })
  layout.items = items
  const stores = createStores(layout)
  stores.ui.getState().setSelection(selection)
  stores.ui.getState().patch({ mobileSheet: 'selection' })
  render(
    <StoresProvider stores={stores}>
      <SelectionSheet />
    </StoresProvider>,
  )
  return stores
}

function sheet(): HTMLElement {
  return screen.getByTestId('selection-sheet')
}

describe('SelectionSheet 1개', () => {
  it('제목은 이름, 요약 줄은 치수 · 회전, 버튼은 [90도][복제][삭제]', () => {
    setup([item('a')], ['a'])
    expect(screen.getByRole('heading', { name: '롤테이블' })).toBeTruthy()
    expect(screen.getByText('90×60cm · 회전 0°')).toBeTruthy()
    for (const name of ['90도', '복제', '삭제']) expect(screen.getByRole('button', { name })).toBeTruthy()
    expect(screen.queryByLabelText('가로')).toBeNull() // 접힌 상태
  })

  it('× = 선택 해제, 시트도 닫힘(mobileSheet none)', () => {
    const stores = setup([item('a')], ['a'])
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(stores.ui.getState().selection).toEqual([])
    expect(stores.ui.getState().mobileSheet).toBe('none')
    expect(screen.queryByTestId('selection-sheet')).toBeNull()
    expect(stores.doc.getState().layout.items).toHaveLength(1)
  })

  it('[90도]는 요약 줄에 바로 반영된다', () => {
    const stores = setup([item('a')], ['a'])
    fireEvent.click(screen.getByRole('button', { name: '90도' }))
    expect(stores.doc.getState().layout.items[0]?.rotation).toBe(90)
    expect(screen.getByText('90×60cm · 회전 90°')).toBeTruthy()
  })

  it('[복제]하면 복제본이 선택되어 제목이 바뀐다', () => {
    const stores = setup([item('a')], ['a'])
    fireEvent.click(screen.getByRole('button', { name: '복제' }))
    const copy = stores.doc.getState().layout.items[1]
    expect(stores.ui.getState().selection).toEqual([copy?.id])
    expect(screen.getByRole('heading', { name: '롤테이블 2' })).toBeTruthy()
  })

  it('[삭제]하면 물건이 사라지고 선택이 비며 시트가 닫힌다', () => {
    const stores = setup([item('a')], ['a'])
    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
    expect(stores.doc.getState().layout.items).toHaveLength(0)
    expect(stores.ui.getState().selection).toEqual([])
    expect(stores.ui.getState().mobileSheet).toBe('none')
    expect(screen.queryByTestId('selection-sheet')).toBeNull()
  })

  it('펼치면 상세 속성(ItemFields compact)이 나오고 버튼은 겹치지 않는다', () => {
    const stores = setup([item('a')], ['a'])
    fireEvent.click(screen.getByRole('button', { name: '펼치기' }))
    expect(sheet().getAttribute('data-expanded')).toBe('true')
    expect((screen.getByLabelText('가로') as HTMLInputElement).value).toBe('90')
    expect(screen.getAllByRole('button', { name: '복제' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: '90도' })).toHaveLength(1)
    const el = screen.getByLabelText('세로') as HTMLInputElement
    act(() => el.focus())
    fireEvent.change(el, { target: { value: '75' } })
    act(() => el.blur())
    expect(stores.doc.getState().layout.items[0]?.shape).toEqual({ kind: 'rect', w: 90, h: 75 })
    expect(screen.getByText('90×75cm · 회전 0°')).toBeTruthy()
  })
})

describe('SelectionSheet 여러 개', () => {
  it("제목은 'N개 선택됨', 펼치면 선택 칩·회전 입력이고 크기 입력은 없다", () => {
    setup([item('a', { name: '자충매트 1' }), item('b', { name: '자충매트 2' })], ['a', 'b'])
    expect(screen.getByRole('heading', { name: '2개 선택됨' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '펼치기' }))
    expect(screen.getByRole('button', { name: '자충매트 1 선택에서 빼기' })).toBeTruthy()
    expect(screen.getByLabelText('회전')).toBeTruthy()
    expect(screen.queryByLabelText('가로')).toBeNull()
    expect(screen.getAllByRole('button', { name: '삭제' })).toHaveLength(1)
  })

  it('선택이 없으면 아무것도 그리지 않는다', () => {
    setup([item('a')], [])
    expect(screen.queryByTestId('selection-sheet')).toBeNull()
  })
})
