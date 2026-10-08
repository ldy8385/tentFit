import { describe, expect, it } from 'vitest'
import { createLayout, type Item, type Layout, type Tent } from '../core/model'
import { makeItem } from '../core/ops/items'
import { createDocStore } from '../store/doc'
import { createUiStore } from '../store/ui'
import { layoutBBox, worldToScreen } from '../view/viewport'
import { runShortcut, shortcutFor, type ShortcutKeyEvent } from './shortcuts'
import type { Stores } from './stores'

const TENT: Tent = { name: '시험 텐트', outer: { kind: 'rect', w: 400, h: 300 }, inners: [] }

function key(code: string, over: Partial<ShortcutKeyEvent> = {}): ShortcutKeyEvent {
  return { code, key: code, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, isComposing: false, ...over }
}
const OUT = { inInput: false }

function mat(name: string, x: number, y: number): Item {
  return makeItem({ name, shape: { kind: 'rect', w: 200, h: 60 }, color: 'blue', category: 'MAT', countsArea: true }, [x, y])
}

/** 물건이 미리 들어 있는 배치(기록 0칸)와, 시간을 손으로 돌리는 시계 */
function setup(items: Item[] = [mat('매트', 0, 0), mat('매트 2', 100, 50)]) {
  const layout: Layout = { ...createLayout(TENT, { name: '배치', now: '2026-10-08T00:00:00.000Z' }), items }
  let clock = 0
  const stores: Stores = { doc: createDocStore(layout, { now: () => clock }), ui: createUiStore() }
  return {
    stores,
    ids: items.map((it) => it.id),
    tick(ms: number) {
      clock += ms
    },
    item(id: string) {
      return stores.doc.getState().layout.items.find((it) => it.id === id)
    },
  }
}

describe('shortcutFor — event.code 기준(스펙 §4.5)', () => {
  it('표의 키를 동작으로 바꾼다', () => {
    expect(shortcutFor(key('Delete'), OUT)).toEqual({ type: 'delete' })
    expect(shortcutFor(key('Backspace'), OUT)).toEqual({ type: 'delete' })
    expect(shortcutFor(key('KeyZ', { ctrlKey: true }), OUT)).toEqual({ type: 'undo' })
    expect(shortcutFor(key('KeyZ', { metaKey: true }), OUT)).toEqual({ type: 'undo' })
    expect(shortcutFor(key('KeyZ', { ctrlKey: true, shiftKey: true }), OUT)).toEqual({ type: 'redo' })
    expect(shortcutFor(key('KeyZ', { metaKey: true, shiftKey: true }), OUT)).toEqual({ type: 'redo' })
    expect(shortcutFor(key('KeyY', { ctrlKey: true }), OUT)).toEqual({ type: 'redo' })
    expect(shortcutFor(key('KeyD', { ctrlKey: true }), OUT)).toEqual({ type: 'duplicate' })
    expect(shortcutFor(key('KeyD', { metaKey: true }), OUT)).toEqual({ type: 'duplicate' })
    expect(shortcutFor(key('KeyR'), OUT)).toEqual({ type: 'rotate90' })
    expect(shortcutFor(key('Digit1', { shiftKey: true, key: '!' }), OUT)).toEqual({ type: 'fit' })
    expect(shortcutFor(key('Escape'), OUT)).toEqual({ type: 'escape' })
  })

  it('화살표는 1cm, Shift+화살표는 10cm', () => {
    expect(shortcutFor(key('ArrowLeft'), OUT)).toEqual({ type: 'nudge', dx: -1, dy: 0 })
    expect(shortcutFor(key('ArrowRight'), OUT)).toEqual({ type: 'nudge', dx: 1, dy: 0 })
    expect(shortcutFor(key('ArrowUp'), OUT)).toEqual({ type: 'nudge', dx: 0, dy: -1 })
    expect(shortcutFor(key('ArrowDown', { shiftKey: true }), OUT)).toEqual({ type: 'nudge', dx: 0, dy: 10 })
    expect(shortcutFor(key('ArrowLeft', { shiftKey: true }), OUT)).toEqual({ type: 'nudge', dx: -10, dy: 0 })
  })

  it('한글 자판에서 key가 ㄱ이어도 code가 KeyR이면 90도 회전, KeyD+Ctrl이면 복제', () => {
    expect(shortcutFor(key('KeyR', { key: 'ㄱ' }), OUT)).toEqual({ type: 'rotate90' })
    expect(shortcutFor(key('KeyD', { key: 'ㅇ', ctrlKey: true }), OUT)).toEqual({ type: 'duplicate' })
    expect(shortcutFor(key('KeyZ', { key: 'ㅋ', metaKey: true }), OUT)).toEqual({ type: 'undo' })
  })

  it('Review Focus 3: 한글 조합 중(isComposing)에는 Backspace·R·화살표가 null', () => {
    for (const code of ['Backspace', 'Delete', 'KeyR', 'ArrowLeft', 'ArrowDown']) {
      expect(shortcutFor(key(code, { isComposing: true }), OUT)).toBeNull()
    }
    expect(shortcutFor(key('KeyZ', { ctrlKey: true, isComposing: true }), OUT)).toBeNull()
  })

  it("Review Focus 3: key가 'Process'(IME가 가로챈 키)면 null", () => {
    for (const code of ['Backspace', 'KeyR', 'ArrowUp', 'Digit1']) {
      expect(shortcutFor(key(code, { key: 'Process', shiftKey: code === 'Digit1' }), OUT)).toBeNull()
    }
  })

  it('Review Focus 3: 입력칸에 포커스가 있으면 null(입력칸 안 Ctrl+Z는 브라우저 기본)', () => {
    const IN = { inInput: true }
    for (const code of ['Backspace', 'Delete', 'KeyR', 'ArrowRight']) {
      expect(shortcutFor(key(code), IN)).toBeNull()
    }
    expect(shortcutFor(key('KeyZ', { ctrlKey: true }), IN)).toBeNull()
    expect(shortcutFor(key('KeyD', { metaKey: true }), IN)).toBeNull()
  })

  it('Esc는 입력 중·조합 중에도 동작한다', () => {
    expect(shortcutFor(key('Escape'), { inInput: true })).toEqual({ type: 'escape' })
    expect(shortcutFor(key('Escape', { isComposing: true, key: 'Process' }), OUT)).toEqual({ type: 'escape' })
  })

  it('브라우저·OS 조합(Ctrl+R 새로고침, Alt+화살표 뒤로 가기, Cmd+Y 기록, Shift+R)은 건드리지 않는다', () => {
    expect(shortcutFor(key('KeyR', { ctrlKey: true }), OUT)).toBeNull()
    expect(shortcutFor(key('KeyR', { metaKey: true }), OUT)).toBeNull()
    expect(shortcutFor(key('KeyR', { shiftKey: true }), OUT)).toBeNull()
    expect(shortcutFor(key('ArrowLeft', { altKey: true }), OUT)).toBeNull()
    expect(shortcutFor(key('ArrowLeft', { metaKey: true }), OUT)).toBeNull()
    expect(shortcutFor(key('KeyY', { metaKey: true }), OUT)).toBeNull()
    expect(shortcutFor(key('KeyZ', { ctrlKey: true, altKey: true }), OUT)).toBeNull()
    expect(shortcutFor(key('Digit1'), OUT)).toBeNull()
    expect(shortcutFor(key('KeyA'), OUT)).toBeNull()
  })
})

describe('runShortcut', () => {
  it('선택이 없으면 delete·nudge·rotate90·duplicate는 false이고 문서가 그대로', () => {
    const { stores } = setup()
    const before = stores.doc.getState().layout
    expect(runShortcut({ type: 'delete' }, stores)).toBe(false)
    expect(runShortcut({ type: 'nudge', dx: 1, dy: 0 }, stores)).toBe(false)
    expect(runShortcut({ type: 'rotate90' }, stores)).toBe(false)
    expect(runShortcut({ type: 'duplicate' }, stores)).toBe(false)
    expect(stores.doc.getState().layout).toBe(before)
    expect(stores.doc.getState().canUndo).toBe(false)
  })

  it('delete: 선택한 물건을 지우고 선택을 비운다. 실행 취소하면 돌아온다(Review Focus 4)', () => {
    const { stores, ids } = setup()
    stores.ui.getState().setSelection([ids[0]!])
    expect(runShortcut({ type: 'delete' }, stores)).toBe(true)
    expect(stores.doc.getState().layout.items.map((it) => it.id)).toEqual([ids[1]])
    expect(stores.ui.getState().selection).toEqual([])
    expect(runShortcut({ type: 'undo' }, stores)).toBe(true)
    expect(stores.doc.getState().layout.items.map((it) => it.id)).toEqual(ids)
  })

  it('nudge: 화살표 연타(500ms 안)는 실행 취소 1칸으로 합쳐진다', () => {
    const t = setup()
    const id = t.ids[0]!
    t.stores.ui.getState().setSelection([id])
    const right = shortcutFor(key('ArrowRight'), OUT)!
    expect(runShortcut(right, t.stores)).toBe(true)
    t.tick(100)
    runShortcut(right, t.stores)
    t.tick(100)
    runShortcut(right, t.stores)
    expect(t.item(id)?.x).toBe(3)
    expect(t.stores.doc.getState().undo()).toBe(true)
    expect(t.item(id)?.x).toBe(0)
    expect(t.stores.doc.getState().canUndo).toBe(false)
  })

  it('nudge: 쉬었다가 다시 누르면 따로 기록되고, Shift+화살표는 10cm', () => {
    const t = setup()
    const id = t.ids[0]!
    t.stores.ui.getState().setSelection([id])
    runShortcut(shortcutFor(key('ArrowDown', { shiftKey: true }), OUT)!, t.stores)
    t.tick(2000)
    runShortcut(shortcutFor(key('ArrowDown', { shiftKey: true }), OUT)!, t.stores)
    expect(t.item(id)?.y).toBe(20)
    t.stores.doc.getState().undo()
    expect(t.item(id)?.y).toBe(10)
    t.stores.doc.getState().undo()
    expect(t.item(id)?.y).toBe(0)
  })

  it('nudge: 선택이 바뀌면 500ms 안이어도 따로 기록된다', () => {
    const t = setup()
    const [a, b] = [t.ids[0]!, t.ids[1]!]
    t.stores.ui.getState().setSelection([a])
    runShortcut({ type: 'nudge', dx: 1, dy: 0 }, t.stores)
    t.tick(100)
    t.stores.ui.getState().setSelection([b])
    runShortcut({ type: 'nudge', dx: 1, dy: 0 }, t.stores)
    t.stores.doc.getState().undo()
    expect(t.item(a)?.x).toBe(1)
    expect(t.item(b)?.x).toBe(100)
  })

  it('nudge: 여러 개를 함께 옮긴다', () => {
    const t = setup()
    t.stores.ui.getState().setSelection(t.ids)
    runShortcut({ type: 'nudge', dx: -10, dy: 0 }, t.stores)
    expect(t.item(t.ids[0]!)?.x).toBe(-10)
    expect(t.item(t.ids[1]!)?.x).toBe(90)
  })

  it('rotate90: 1개면 제자리에서 90도', () => {
    const t = setup()
    const id = t.ids[1]!
    t.stores.ui.getState().setSelection([id])
    expect(runShortcut({ type: 'rotate90' }, t.stores)).toBe(true)
    expect(t.item(id)).toMatchObject({ x: 100, y: 50, rotation: 90 })
  })

  it('duplicate: 복제본이 생기고 새 물건이 선택된다', () => {
    const t = setup()
    t.stores.ui.getState().setSelection([t.ids[0]!])
    expect(runShortcut({ type: 'duplicate' }, t.stores)).toBe(true)
    const items = t.stores.doc.getState().layout.items
    expect(items).toHaveLength(3)
    const sel = t.stores.ui.getState().selection
    expect(sel).toHaveLength(1)
    expect(t.ids).not.toContain(sel[0])
  })

  it('undo·redo: 기록이 있을 때만 true', () => {
    const t = setup()
    expect(runShortcut({ type: 'undo' }, t.stores)).toBe(false)
    t.stores.ui.getState().setSelection([t.ids[0]!])
    runShortcut({ type: 'nudge', dx: 1, dy: 0 }, t.stores)
    expect(runShortcut({ type: 'undo' }, t.stores)).toBe(true)
    expect(runShortcut({ type: 'redo' }, t.stores)).toBe(true)
    expect(t.item(t.ids[0]!)?.x).toBe(1)
    expect(runShortcut({ type: 'redo' }, t.stores)).toBe(false)
  })

  it('fit: 배치 전체가 캔버스 가운데에 오게 맞춘다', () => {
    const t = setup()
    t.stores.ui.getState().setSize({ width: 800, height: 600 })
    expect(runShortcut({ type: 'fit' }, t.stores)).toBe(true)
    const v = t.stores.ui.getState().view
    const b = layoutBBox(t.stores.doc.getState().layout)
    const [cx, cy] = worldToScreen(v, [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2])
    expect(cx).toBeCloseTo(400, 0)
    expect(cy).toBeCloseTo(300, 0)
  })

  it('escape: 선택과 그룹 안 편집을 끝낸다. 끝낼 것이 없으면 false', () => {
    const t = setup()
    expect(runShortcut({ type: 'escape' }, t.stores)).toBe(false)
    t.stores.ui.getState().setSelection([t.ids[0]!])
    t.stores.ui.getState().patch({ scopeGroupId: 'g1' })
    expect(runShortcut({ type: 'escape' }, t.stores)).toBe(true)
    expect(t.stores.ui.getState().selection).toEqual([])
    expect(t.stores.ui.getState().scopeGroupId).toBeNull()
  })

  it('제스처(끌기·변형) 중에는 모든 단축키가 false이고 문서·선택이 그대로', () => {
    const t = setup()
    t.stores.ui.getState().setSelection([t.ids[0]!])
    t.stores.doc.getState().beginGesture()
    const before = t.stores.doc.getState().layout
    for (const a of [
      { type: 'delete' },
      { type: 'nudge', dx: 1, dy: 0 },
      { type: 'rotate90' },
      { type: 'duplicate' },
      { type: 'undo' },
      { type: 'fit' },
      { type: 'escape' },
    ] as const) {
      expect(runShortcut(a, t.stores)).toBe(false)
    }
    expect(t.stores.doc.getState().layout).toBe(before)
    expect(t.stores.ui.getState().selection).toEqual([t.ids[0]])
  })
})
