// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StoresProvider, createStores, type Stores } from '../../app/stores'
import { createLayout, type Group, type Item, type Tent } from '../../core/model'
import { PropertiesPanel } from './PropertiesPanel'

afterEach(cleanup)

const TENT: Tent = { name: '테스트 텐트', outer: { kind: 'rect', w: 600, h: 300 }, inners: [] }

function item(id: string, over: Partial<Item> = {}): Item {
  return {
    id,
    name: `물건 ${id}`,
    shape: { kind: 'rect', w: 100, h: 50 },
    x: 0,
    y: 0,
    rotation: 0,
    color: 'blue',
    category: 'MAT',
    countsArea: true,
    ...over,
  }
}

function setup(items: Item[], selection: string[], groups: Group[] = []): Stores {
  const layout = createLayout(TENT, { name: '배치', id: 'L1', now: '2026-10-08T00:00:00.000Z' })
  layout.items = items
  layout.groups = groups
  const stores = createStores(layout)
  stores.ui.getState().setSelection(selection)
  render(
    <StoresProvider stores={stores}>
      <PropertiesPanel />
    </StoresProvider>,
  )
  return stores
}

function docItem(stores: Stores, id: string): Item | undefined {
  return stores.doc.getState().layout.items.find((it) => it.id === id)
}

function typeAndEnter(label: string, text: string): void {
  const el = screen.getByLabelText(label) as HTMLInputElement
  act(() => el.focus())
  fireEvent.change(el, { target: { value: text } })
  fireEvent.keyDown(el, { key: 'Enter' })
}

const LEFT_RIGHT = [item('a', { x: -100 }), item('b', { x: 100 })]

describe('MultiFields', () => {
  it('2개 이상이면 제목에 개수, 크기 입력칸은 없고 회전은 있다(D17)', () => {
    setup(LEFT_RIGHT, ['a', 'b'])
    expect(screen.getByRole('heading', { name: '선택한 물건 2개' })).toBeTruthy()
    expect(screen.queryByLabelText('가로')).toBeNull()
    expect(screen.queryByLabelText('세로')).toBeNull()
    expect(screen.queryByLabelText('지름')).toBeNull()
    expect(screen.queryByLabelText('이름')).toBeNull()
    expect(screen.getByLabelText('회전')).toBeTruthy()
  })

  it('회전 입력은 선택 전체를 바운딩 박스 중심 기준으로 함께 돌린다', () => {
    const stores = setup(LEFT_RIGHT, ['a', 'b'])
    typeAndEnter('회전', '90')
    expect(docItem(stores, 'a')).toMatchObject({ x: 0, y: -100, rotation: 90 })
    expect(docItem(stores, 'b')).toMatchObject({ x: 0, y: 100, rotation: 90 })
    expect((screen.getByLabelText('회전') as HTMLInputElement).value).toBe('90')
  })

  it('각도가 섞여 있으면 안내를 보이고, 첫 물건 기준 차이만큼 모두 돌린다', () => {
    const stores = setup([item('a', { x: -100 }), item('b', { x: 100, rotation: 30 })], ['a', 'b'])
    expect(screen.getByText(/각도가 다른 물건이 섞여 있어요/)).toBeTruthy()
    typeAndEnter('회전', '90')
    expect(docItem(stores, 'a')?.rotation).toBe(90)
    expect(docItem(stores, 'b')?.rotation).toBe(120)
  })

  it('[90도]도 같은 피벗으로 돌린다', () => {
    const stores = setup(LEFT_RIGHT, ['a', 'b'])
    fireEvent.click(screen.getByRole('button', { name: '90도' }))
    expect(docItem(stores, 'a')).toMatchObject({ x: 0, y: -100, rotation: 90 })
    expect(docItem(stores, 'b')).toMatchObject({ x: 0, y: 100, rotation: 90 })
  })

  it('목록 항목을 누르면 선택에서 빼고, 1개가 남으면 1개 패널로 바뀐다', () => {
    const stores = setup(LEFT_RIGHT, ['a', 'b'])
    const list = screen.getByRole('list', { name: '선택한 물건 목록' })
    expect(list.querySelectorAll('li')).toHaveLength(2)
    expect(list.textContent).toContain('100×50')
    fireEvent.click(screen.getByRole('button', { name: '물건 b 선택에서 빼기' }))
    expect(stores.ui.getState().selection).toEqual(['a'])
    expect(screen.getByLabelText('가로')).toBeTruthy()
  })

  it('그룹 멤버를 빼면 그 그룹 전체가 선택에서 빠진다', () => {
    const stores = setup(
      [item('a', { groupId: 'g1' }), item('b', { groupId: 'g1' }), item('c')],
      ['a', 'b', 'c'],
      [{ id: 'g1' }],
    )
    fireEvent.click(screen.getByRole('button', { name: '물건 a 선택에서 빼기' }))
    expect(stores.ui.getState().selection).toEqual(['c'])
  })

  it('[복제]는 복제본들을 선택하고, [삭제]는 모두 지우고 선택을 비운다', () => {
    const stores = setup(LEFT_RIGHT, ['a', 'b'])
    fireEvent.click(screen.getByRole('button', { name: '복제' }))
    const items = stores.doc.getState().layout.items
    expect(items.map((it) => it.name)).toEqual(['물건 a', '물건 a 2', '물건 b', '물건 b 2'])
    expect(stores.ui.getState().selection).toEqual([items[1]?.id, items[3]?.id])
    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
    expect(stores.doc.getState().layout.items.map((it) => it.id)).toEqual(['a', 'b'])
    expect(stores.ui.getState().selection).toEqual([])
  })
})
