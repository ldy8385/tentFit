import { describe, expect, it } from 'vitest'
import { createLayout, type Item, type Layout, type Tent } from '../core/model'
import { addItem, deleteItems, duplicateItems, makeItem, moveItems } from '../core/ops/items'
import { COALESCE_MS, HISTORY_LIMIT, createDocStore, type DocStore } from './doc'

const T0 = Date.UTC(2026, 9, 8, 0, 0, 0) // 2026-10-08T00:00:00.000Z
const iso = (ms: number) => new Date(T0 + ms).toISOString()

const TENT: Tent = { name: '터널 4인 예시', outer: { kind: 'rect', w: 600, h: 300 }, inners: [] }

function item(id: string, name: string, x: number, groupId?: string): Item {
  const it: Item = {
    id,
    name,
    shape: { kind: 'rect', w: 200, h: 60 },
    x,
    y: 0,
    rotation: 0,
    color: 'blue',
    category: 'MAT',
    countsArea: true,
  }
  if (groupId !== undefined) it.groupId = groupId
  return it
}

function layoutWith(items: Item[], groups: { id: string }[] = []): Layout {
  const base = createLayout(TENT, { name: '터널 4인 예시 배치', id: 'L1', now: '2026-10-01T00:00:00.000Z' })
  return { ...base, items, groups }
}

/** 테스트가 시각(ms, T0 기준)을 직접 정하는 시계와 그 시계를 쓰는 스토어. */
function setup(layout: Layout = layoutWith([item('a', '매트', 0)]), historyLimit?: number) {
  let t = T0
  const opts: { now: () => number; historyLimit?: number } = { now: () => t }
  if (historyLimit !== undefined) opts.historyLimit = historyLimit
  const doc = createDocStore(layout, opts)
  return {
    doc,
    at(ms: number) {
      t = T0 + ms
      return doc.getState()
    },
  }
}

const s = (doc: DocStore) => doc.getState()
const xOf = (doc: DocStore, id = 'a') => s(doc).layout.items.find((it) => it.id === id)?.x
/** 실행 취소 대상(tent·items·groups)만 뽑습니다. */
const undoPart = (l: Layout) => ({ tent: l.tent, items: l.items, groups: l.groups })
/** 실행 취소를 더는 안 될 때까지 누르고 누른 횟수를 돌려줍니다. */
function undoAll(doc: DocStore): number {
  let n = 0
  while (s(doc).undo()) n++
  return n
}

describe('createDocStore — 시작 상태', () => {
  it('받은 배치를 그대로 들고, 기록·제스처는 비어 있다', () => {
    const layout = layoutWith([item('a', '매트', 0)])
    const doc = createDocStore(layout)
    expect(s(doc).layout).toBe(layout)
    expect(s(doc)).toMatchObject({ canUndo: false, canRedo: false, inGesture: false })
    expect(HISTORY_LIMIT).toBe(200)
    expect(COALESCE_MS).toBe(500)
  })
})

describe('commit', () => {
  it('recipe로 바꾸고 true. updatedAt은 now() 시각이고 원래 배치 객체는 그대로다', () => {
    const before = layoutWith([item('a', '매트', 0)])
    const { doc, at } = setup(before)
    expect(at(1234).commit((d) => moveItems(d, ['a'], 10, 0))).toBe(true)
    expect(xOf(doc)).toBe(10)
    expect(s(doc).layout.updatedAt).toBe(iso(1234))
    expect(s(doc)).toMatchObject({ canUndo: true, canRedo: false })
    expect(before.items[0]?.x).toBe(0)
    expect(before.updatedAt).toBe('2026-10-01T00:00:00.000Z')
  })

  it('바뀐 게 없으면 false이고 배치 객체·updatedAt·기록이 그대로다', () => {
    const { doc, at } = setup()
    const before = s(doc).layout
    expect(at(10).commit((d) => moveItems(d, ['a'], 0, 0))).toBe(false)
    expect(at(20).commit(() => {})).toBe(false)
    expect(at(30).commit((d) => moveItems(d, ['없는 id'], 5, 5))).toBe(false)
    expect(s(doc).layout).toBe(before)
    expect(s(doc).canUndo).toBe(false)
  })

  it('값을 돌려주는 recipe(duplicateItems)를 화살표 식 본문으로 넘겨도 된다(반환값은 버림)', () => {
    const { doc } = setup()
    let created: string[] = []
    expect(s(doc).commit((d) => duplicateItems(d, ['a']))).toBe(true)
    expect(s(doc).layout.items.map((it) => it.name)).toEqual(['매트', '매트 2'])
    expect(
      s(doc).commit((d) => {
        created = duplicateItems(d, ['a'])
      }),
    ).toBe(true)
    expect(created).toHaveLength(1)
    expect(s(doc).layout.items).toHaveLength(3)
  })

  it('구독자에게는 실제로 바뀐 커밋만 한 번씩 알린다', () => {
    const { doc } = setup()
    let calls = 0
    const unsubscribe = doc.subscribe(() => {
      calls++
    })
    s(doc).commit((d) => moveItems(d, ['a'], 0, 0))
    expect(calls).toBe(0)
    s(doc).commit((d) => moveItems(d, ['a'], 1, 0))
    expect(calls).toBe(1)
    unsubscribe()
  })

  it('커밋 결과는 얼려 있어 화면 코드가 실수로 고칠 수 없다', () => {
    const { doc } = setup()
    s(doc).commit((d) => moveItems(d, ['a'], 1, 0))
    expect(Object.isFrozen(s(doc).layout)).toBe(true)
    expect(Object.isFrozen(s(doc).layout.items[0])).toBe(true)
  })
})

describe('undo · redo', () => {
  it('커밋 → 실행 취소 → 다시 실행이 왕복한다', () => {
    const { doc } = setup()
    const original = undoPart(s(doc).layout)
    s(doc).commit((d) => addItem(d, makeItem({ name: '의자', shape: { kind: 'circle', d: 50 }, color: 'teal', category: 'CHAIR', countsArea: true }, [100, 50])))
    const committed = undoPart(s(doc).layout)
    expect(committed.items).toHaveLength(2)

    expect(s(doc).undo()).toBe(true)
    expect(undoPart(s(doc).layout)).toEqual(original)
    expect(s(doc)).toMatchObject({ canUndo: false, canRedo: true })

    expect(s(doc).redo()).toBe(true)
    expect(undoPart(s(doc).layout)).toEqual(committed)
    expect(s(doc)).toMatchObject({ canUndo: true, canRedo: false })
  })

  it('기록이 없으면 false이고 아무것도 바꾸지 않는다', () => {
    const { doc } = setup()
    const before = s(doc).layout
    expect(s(doc).undo()).toBe(false)
    expect(s(doc).redo()).toBe(false)
    expect(s(doc).layout).toBe(before)
  })

  it('실행 취소·다시 실행도 updatedAt을 그 시각으로 바꾼다(updatedAt 자체는 기록 밖)', () => {
    const { doc, at } = setup()
    at(10).commit((d) => moveItems(d, ['a'], 5, 0))
    at(20).undo()
    expect(s(doc).layout.updatedAt).toBe(iso(20))
    at(30).redo()
    expect(s(doc).layout.updatedAt).toBe(iso(30))
    expect(xOf(doc)).toBe(5)
  })

  it('실행 취소 뒤 새 커밋은 다시 실행 기록을 버린다', () => {
    const { doc } = setup()
    s(doc).commit((d) => moveItems(d, ['a'], 5, 0))
    s(doc).undo()
    expect(s(doc).canRedo).toBe(true)
    s(doc).commit((d) => moveItems(d, ['a'], 7, 0))
    expect(s(doc).canRedo).toBe(false)
    expect(s(doc).redo()).toBe(false)
    expect(xOf(doc)).toBe(7)
  })

  it('삭제 후 실행 취소로 물건이 같은 순서·그룹으로 돌아온다(Review Focus 4)', () => {
    // b·c가 그룹 g. b를 지우면 멤버 1개 그룹이라 g가 풀리고 c의 groupId도 빠진다(normalizeGroups).
    const original = layoutWith([item('a', '매트', 0), item('b', '의자', 50, 'g'), item('c', '테이블', 100, 'g')], [{ id: 'g' }])
    const { doc } = setup(original)
    expect(s(doc).commit((d) => deleteItems(d, ['b']))).toBe(true)
    expect(s(doc).layout.items.map((it) => it.id)).toEqual(['a', 'c'])
    expect(s(doc).layout.items[1]?.groupId).toBeUndefined()
    expect(s(doc).layout.groups).toEqual([])

    expect(s(doc).undo()).toBe(true)
    expect(s(doc).layout.items).toEqual(original.items)
    expect(s(doc).layout.groups).toEqual([{ id: 'g' }])
  })

  it('텐트(tent 경로) 변경도 실행 취소한다', () => {
    const { doc } = setup()
    s(doc).commit((d) => {
      d.tent.name = '바꾼 텐트'
    })
    expect(s(doc).undo()).toBe(true)
    expect(s(doc).layout.tent.name).toBe('터널 4인 예시')
  })
})

describe('실행 취소 기록 범위 — tent·items·groups만(§8)', () => {
  it('rename은 기록 밖: canUndo가 켜지지 않고, 실행 취소해도 이름은 그대로다', () => {
    const { doc, at } = setup()
    at(5).rename('바닷가 배치')
    expect(s(doc).layout.name).toBe('바닷가 배치')
    expect(s(doc).layout.updatedAt).toBe(iso(5))
    expect(s(doc).canUndo).toBe(false)

    s(doc).commit((d) => moveItems(d, ['a'], 10, 0))
    expect(s(doc).undo()).toBe(true)
    expect(xOf(doc)).toBe(0)
    expect(s(doc).layout.name).toBe('바닷가 배치')
  })

  it('rename은 다시 실행 기록을 지우지 않는다', () => {
    const { doc } = setup()
    s(doc).commit((d) => moveItems(d, ['a'], 10, 0))
    s(doc).undo()
    s(doc).rename('새 이름')
    expect(s(doc).canRedo).toBe(true)
    expect(s(doc).redo()).toBe(true)
    expect(xOf(doc)).toBe(10)
    expect(s(doc).layout.name).toBe('새 이름')
  })

  it('같은 이름으로 rename하면 아무것도 바꾸지 않는다', () => {
    const { doc } = setup()
    const before = s(doc).layout
    s(doc).rename('터널 4인 예시 배치')
    expect(s(doc).layout).toBe(before)
  })

  it('commit에서 기록 밖 필드(sourcePresetId)만 바꾸면 적용하고 true지만 기록은 없다', () => {
    const { doc } = setup()
    expect(
      s(doc).commit((d) => {
        d.sourcePresetId = 'generic/tunnel-4'
      }),
    ).toBe(true)
    expect(s(doc).layout.sourcePresetId).toBe('generic/tunnel-4')
    expect(s(doc).canUndo).toBe(false)
  })

  it('한 커밋에 섞여 있으면 tent·items·groups 부분만 되돌린다', () => {
    const { doc } = setup()
    s(doc).commit((d) => {
      d.name = '섞은 커밋'
      moveItems(d, ['a'], 10, 0)
    })
    expect(s(doc).undo()).toBe(true)
    expect(xOf(doc)).toBe(0)
    expect(s(doc).layout.name).toBe('섞은 커밋')
  })
})

describe('제스처 중 실행 취소 무시(§8 예외 처리)', () => {
  it('beginGesture ~ endGesture 사이의 undo·redo는 false이고 배치를 바꾸지 않는다', () => {
    const { doc } = setup()
    s(doc).commit((d) => moveItems(d, ['a'], 10, 0))
    s(doc).beginGesture()
    expect(s(doc).inGesture).toBe(true)
    const during = s(doc).layout
    expect(s(doc).undo()).toBe(false)
    expect(s(doc).layout).toBe(during)
    s(doc).endGesture()
    expect(s(doc).inGesture).toBe(false)
    expect(s(doc).undo()).toBe(true)

    s(doc).beginGesture()
    expect(s(doc).redo()).toBe(false)
    expect(xOf(doc)).toBe(0)
    s(doc).endGesture()
    expect(s(doc).redo()).toBe(true)
    expect(xOf(doc)).toBe(10)
  })

  it('제스처 중에도 commit은 된다(끌기 끝 커밋은 endGesture 앞뒤 어디서 불러도 됨)', () => {
    const { doc } = setup()
    s(doc).beginGesture()
    expect(s(doc).commit((d) => moveItems(d, ['a'], 3, 0))).toBe(true)
    s(doc).endGesture()
    expect(s(doc).canUndo).toBe(true)
  })

  it('endGesture만 불러도(제스처 취소) 기록은 생기지 않는다', () => {
    const { doc } = setup()
    const before = s(doc).layout
    s(doc).beginGesture()
    s(doc).endGesture()
    expect(s(doc).layout).toBe(before)
    expect(s(doc).canUndo).toBe(false)
  })
})

describe('기록 한도', () => {
  it(`${HISTORY_LIMIT + 1}번 커밋하면 실행 취소는 ${HISTORY_LIMIT}번까지(가장 오래된 칸을 버림)`, () => {
    const { doc } = setup()
    for (let i = 0; i < HISTORY_LIMIT + 1; i++) s(doc).commit((d) => moveItems(d, ['a'], 1, 0))
    expect(xOf(doc)).toBe(201)
    expect(undoAll(doc)).toBe(200)
    expect(xOf(doc)).toBe(1)
    expect(s(doc).canUndo).toBe(false)
  })

  it('historyLimit 옵션으로 한도를 바꾼다', () => {
    const { doc } = setup(undefined, 2)
    for (let i = 0; i < 3; i++) s(doc).commit((d) => moveItems(d, ['a'], 1, 0))
    expect(undoAll(doc)).toBe(2)
    expect(xOf(doc)).toBe(1)
  })
})

describe('합치기 — coalesceKey(§8 화살표 이동)', () => {
  const nudge = (d: Layout) => moveItems(d, ['a'], 1, 0)

  it('같은 키로 0·300·700ms에 커밋하면 1칸(마지막 커밋 뒤 500ms 기준이라 700은 300의 400ms 뒤)', () => {
    const { doc, at } = setup()
    at(0).commit(nudge, { coalesceKey: 'nudge:a' })
    at(300).commit(nudge, { coalesceKey: 'nudge:a' })
    at(700).commit(nudge, { coalesceKey: 'nudge:a' })
    expect(xOf(doc)).toBe(3)
    expect(s(doc).undo()).toBe(true)
    expect(xOf(doc)).toBe(0)
    expect(s(doc).canUndo).toBe(false)
    expect(s(doc).redo()).toBe(true)
    expect(xOf(doc)).toBe(3)
  })

  it('마지막 커밋 뒤 500ms까지는 합치고, 그보다 늦으면 새 칸', () => {
    const { doc, at } = setup()
    at(0).commit(nudge, { coalesceKey: 'nudge:a' })
    at(500).commit(nudge, { coalesceKey: 'nudge:a' })
    at(1001).commit(nudge, { coalesceKey: 'nudge:a' })
    expect(s(doc).undo()).toBe(true)
    expect(xOf(doc)).toBe(2)
    expect(s(doc).undo()).toBe(true)
    expect(xOf(doc)).toBe(0)
    expect(s(doc).canUndo).toBe(false)
  })

  it('다른 키는 따로 쌓인다', () => {
    const { doc, at } = setup()
    at(0).commit(nudge, { coalesceKey: 'nudge:a' })
    at(100).commit(nudge, { coalesceKey: 'nudge:a,b' })
    expect(undoAll(doc)).toBe(2)
  })

  it('키 없는 커밋이 끼면 끊긴다', () => {
    const { doc, at } = setup()
    at(0).commit(nudge, { coalesceKey: 'nudge:a' })
    at(100).commit(nudge)
    at(200).commit(nudge, { coalesceKey: 'nudge:a' })
    expect(undoAll(doc)).toBe(3)
  })

  it('실행 취소 뒤의 같은 키 커밋은 그 아래 칸에 붙지 않는다', () => {
    const { doc, at } = setup()
    at(0).commit((d) => moveItems(d, ['a'], 100, 0))
    at(100).commit(nudge, { coalesceKey: 'nudge:a' })
    at(150).undo()
    at(200).commit(nudge, { coalesceKey: 'nudge:a' })
    expect(xOf(doc)).toBe(101)
    expect(s(doc).undo()).toBe(true)
    expect(xOf(doc)).toBe(100)
    expect(s(doc).canUndo).toBe(true)
  })
})

describe('load', () => {
  it('배치를 바꾸고 실행 취소·다시 실행 기록과 제스처 상태를 비운다(§8 배치를 바꾸면 기록을 비움)', () => {
    const { doc } = setup()
    s(doc).commit((d) => moveItems(d, ['a'], 1, 0))
    s(doc).commit((d) => moveItems(d, ['a'], 1, 0))
    s(doc).undo()
    s(doc).beginGesture()
    const other = layoutWith([item('z', '해먹', 0)])
    s(doc).load(other)
    expect(s(doc).layout).toBe(other)
    expect(s(doc)).toMatchObject({ canUndo: false, canRedo: false, inGesture: false })
    expect(s(doc).undo()).toBe(false)
    expect(s(doc).redo()).toBe(false)
  })
})
