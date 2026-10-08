// @vitest-environment happy-dom
import { act, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createLayout, type Item, type Tent } from '../core/model'
import { makeItem } from '../core/ops/items'
import { useShortcuts, isTextEntry } from './shortcuts'
import { createStores, StoresProvider, type Stores } from './stores'

const TENT: Tent = { name: '시험 텐트', outer: { kind: 'rect', w: 400, h: 300 }, inners: [] }

function mat(name: string, x: number): Item {
  return makeItem({ name, shape: { kind: 'rect', w: 200, h: 60 }, color: 'blue', category: 'MAT', countsArea: true }, [x, 0])
}

function Harness() {
  useShortcuts()
  return (
    <div>
      <input aria-label="가로" defaultValue="200" />
      <input aria-label="점유 면적에 포함" type="checkbox" />
      <div aria-label="메모" contentEditable suppressContentEditableWarning>
        메모
      </div>
    </div>
  )
}

function setup() {
  const a = mat('매트', 0)
  const b = mat('매트 2', 100)
  const stores: Stores = createStores({ ...createLayout(TENT, { name: '배치' }), items: [a, b] })
  const view = render(
    <StoresProvider stores={stores}>
      <Harness />
    </StoresProvider>,
  )
  stores.ui.getState().setSelection([a.id])
  return { stores, a, b, view }
}

/** target에서 keydown을 일으켜 window까지 올라가게 하고, preventDefault 여부를 돌려줍니다. */
function press(target: EventTarget, init: KeyboardEventInit): boolean {
  const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  act(() => {
    target.dispatchEvent(e)
  })
  return e.defaultPrevented
}

describe('useShortcuts', () => {
  it('포커스가 입력칸 밖이면 Backspace가 선택한 물건을 지우고 preventDefault한다', () => {
    const { stores, a, b } = setup()
    expect(press(document.body, { code: 'Backspace', key: 'Backspace' })).toBe(true)
    expect(stores.doc.getState().layout.items.map((it) => it.id)).toEqual([b.id])
    expect(stores.doc.getState().layout.items.find((it) => it.id === a.id)).toBeUndefined()
  })

  it('Review Focus 3: 입력칸에 포커스가 있으면 Backspace·Delete·R·화살표가 물건을 바꾸지 않는다', () => {
    const { stores, view } = setup()
    const input = view.getByLabelText('가로')
    input.focus()
    const before = stores.doc.getState().layout
    for (const code of ['Backspace', 'Delete', 'KeyR', 'ArrowLeft']) {
      expect(press(input, { code, key: code })).toBe(false)
    }
    expect(stores.doc.getState().layout).toBe(before)
  })

  it('Review Focus 3: contenteditable 안에서도 무시한다', () => {
    const { stores, view } = setup()
    const memo = view.getByLabelText('메모')
    memo.focus()
    const before = stores.doc.getState().layout
    press(memo, { code: 'Delete', key: 'Delete' })
    expect(stores.doc.getState().layout).toBe(before)
  })

  it("Review Focus 3: 한글 조합 중(isComposing)·key 'Process'면 입력칸 밖이어도 무시한다", () => {
    const { stores } = setup()
    const before = stores.doc.getState().layout
    expect(press(document.body, { code: 'KeyR', key: 'ㄱ', isComposing: true })).toBe(false)
    expect(press(document.body, { code: 'Backspace', key: 'Process' })).toBe(false)
    expect(press(document.body, { code: 'ArrowDown', key: 'Process' })).toBe(false)
    expect(stores.doc.getState().layout).toBe(before)
  })

  it('체크박스에 포커스가 있어도 Delete는 물건을 지운다(글자 입력칸이 아님)', () => {
    const { stores, view, b } = setup()
    const box = view.getByLabelText('점유 면적에 포함')
    box.focus()
    press(box, { code: 'Delete', key: 'Delete' })
    expect(stores.doc.getState().layout.items.map((it) => it.id)).toEqual([b.id])
  })

  it('입력칸에서 Esc를 누르면 입력칸을 blur하고 선택을 해제한다', () => {
    const { stores, view } = setup()
    const input = view.getByLabelText('가로')
    input.focus()
    expect(document.activeElement).toBe(input)
    expect(press(input, { code: 'Escape', key: 'Escape' })).toBe(true)
    expect(document.activeElement).not.toBe(input)
    expect(stores.ui.getState().selection).toEqual([])
  })

  it('Ctrl+D는 선택이 없어도 브라우저 기본(북마크)을 막고, 문서는 그대로다', () => {
    const { stores } = setup()
    act(() => stores.ui.getState().clearSelection())
    const before = stores.doc.getState().layout
    expect(press(document.body, { code: 'KeyD', key: 'd', ctrlKey: true })).toBe(true)
    expect(stores.doc.getState().layout).toBe(before)
  })

  it('처리하지 않은 키(선택 없는 화살표)는 preventDefault하지 않는다', () => {
    const { stores } = setup()
    act(() => stores.ui.getState().clearSelection())
    expect(press(document.body, { code: 'ArrowLeft', key: 'ArrowLeft' })).toBe(false)
  })

  it('이미 다른 곳에서 처리한(defaultPrevented) 키는 건너뛴다', () => {
    const { stores, a } = setup()
    const e = new KeyboardEvent('keydown', { code: 'Delete', key: 'Delete', bubbles: true, cancelable: true })
    e.preventDefault()
    act(() => {
      document.body.dispatchEvent(e)
    })
    expect(stores.doc.getState().layout.items.some((it) => it.id === a.id)).toBe(true)
  })

  it('Ctrl+Z로 지운 물건이 돌아오고, 언마운트하면 단축키가 풀린다', () => {
    const { stores, a, view } = setup()
    press(document.body, { code: 'Delete', key: 'Delete' })
    expect(press(document.body, { code: 'KeyZ', key: 'z', ctrlKey: true })).toBe(true)
    expect(stores.doc.getState().layout.items.some((it) => it.id === a.id)).toBe(true)
    view.unmount()
    act(() => stores.ui.getState().setSelection([a.id]))
    press(document.body, { code: 'Delete', key: 'Delete' })
    expect(stores.doc.getState().layout.items.some((it) => it.id === a.id)).toBe(true)
  })
})

describe('isTextEntry', () => {
  it('글자 입력 요소만 true', () => {
    const make = (html: string) => {
      const host = document.createElement('div')
      host.innerHTML = html
      document.body.appendChild(host)
      return host.firstElementChild
    }
    expect(isTextEntry(make('<input type="text">'))).toBe(true)
    expect(isTextEntry(make('<input>'))).toBe(true)
    expect(isTextEntry(make('<input type="number">'))).toBe(true)
    expect(isTextEntry(make('<textarea></textarea>'))).toBe(true)
    expect(isTextEntry(make('<select><option>a</option></select>'))).toBe(true)
    expect(isTextEntry(make('<input type="checkbox">'))).toBe(false)
    expect(isTextEntry(make('<button>복제</button>'))).toBe(false)
    expect(isTextEntry(null)).toBe(false)
  })
})
