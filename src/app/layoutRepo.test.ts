import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createLayout, type Tent } from '../core/model'
import {
  clearLayoutRepo,
  createLayoutFromTent,
  getLastLayoutId,
  getLayout,
  layoutCount,
  listLayoutSummaries,
  putLayout,
  setLastLayoutId,
} from './layoutRepo'

function tunnel(): Tent {
  return {
    name: '터널 4인 예시',
    outer: { kind: 'rect', w: 620, h: 320 },
    outerTemplate: { kind: 'rect', w: 620, h: 320 },
    inners: [{ id: 'in1', name: '이너 1', shape: { kind: 'rect', w: 220, h: 300 }, x: -200, y: 0, rotation: 0 }],
  }
}

beforeEach(() => clearLayoutRepo())
afterEach(() => clearLayoutRepo())

describe('createLayoutFromTent', () => {
  it("이름은 '<텐트 이름> 배치', 같은 이름이 있으면 ' 2'·' 3'을 붙이고 보관한다", () => {
    const a = createLayoutFromTent(tunnel(), { sourcePresetId: 'generic/tunnel-4p' })
    const b = createLayoutFromTent(tunnel())
    const c = createLayoutFromTent(tunnel())
    expect([a.name, b.name, c.name]).toEqual(['터널 4인 예시 배치', '터널 4인 예시 배치 2', '터널 4인 예시 배치 3'])
    expect(getLayout(a.id)).toBe(a)
    expect(layoutCount()).toBe(3)
  })

  it('sourcePresetId는 줄 때만 기록하고, 새 배치는 물건·그룹이 비어 있다', () => {
    const a = createLayoutFromTent(tunnel(), { sourcePresetId: 'generic/tunnel-4p' })
    const b = createLayoutFromTent(tunnel())
    expect(a.sourcePresetId).toBe('generic/tunnel-4p')
    expect('sourcePresetId' in b).toBe(false)
    expect(a.items).toEqual([])
    expect(a.groups).toEqual([])
  })

  it('tent는 복사본이라 원본 텐트를 고쳐도 배치는 바뀌지 않는다', () => {
    const source = tunnel()
    const layout = createLayoutFromTent(source)
    source.name = '바뀐 이름'
    const inner = source.inners[0]
    if (inner) inner.x = 999
    expect(layout.tent.name).toBe('터널 4인 예시')
    expect(layout.tent.inners[0]?.x).toBe(-200)
  })
})

describe('listLayoutSummaries', () => {
  it('updatedAt 내림차순이고, 같으면 이름순이다', () => {
    const make = (id: string, name: string, at: string, items = 0) => {
      const l = createLayout(tunnel(), { id, name, now: at })
      for (let i = 0; i < items; i++) {
        l.items.push({ id: `${id}-${i}`, name: '매트', shape: { kind: 'rect', w: 200, h: 60 }, x: 0, y: 0, rotation: 0, color: 'blue', category: 'MAT', countsArea: true })
      }
      putLayout(l)
    }
    make('old', '가 배치', '2026-10-01T00:00:00.000Z')
    make('new', '나 배치', '2026-10-08T00:00:00.000Z', 2)
    make('tieB', '다 배치', '2026-10-05T00:00:00.000Z')
    make('tieA', '라 배치', '2026-10-05T00:00:00.000Z', 1)
    expect(listLayoutSummaries()).toEqual([
      { id: 'new', name: '나 배치', updatedAt: '2026-10-08T00:00:00.000Z', itemCount: 2 },
      { id: 'tieB', name: '다 배치', updatedAt: '2026-10-05T00:00:00.000Z', itemCount: 0 },
      { id: 'tieA', name: '라 배치', updatedAt: '2026-10-05T00:00:00.000Z', itemCount: 1 },
      { id: 'old', name: '가 배치', updatedAt: '2026-10-01T00:00:00.000Z', itemCount: 0 },
    ])
  })

  it('시간대가 다른 표기도 실제 시각으로 비교한다', () => {
    putLayout(createLayout(tunnel(), { id: 'kst', name: 'A', now: '2026-10-08T08:00:00+09:00' })) // = 전날 23:00Z
    putLayout(createLayout(tunnel(), { id: 'utc', name: 'B', now: '2026-10-07T23:30:00.000Z' }))
    expect(listLayoutSummaries().map((s) => s.id)).toEqual(['utc', 'kst'])
  })

  it('putLayout으로 같은 id를 다시 넣으면 최신으로 바뀐다(목록 수 그대로)', () => {
    const l = createLayoutFromTent(tunnel())
    putLayout({ ...l, name: '캠핑 첫날' })
    expect(layoutCount()).toBe(1)
    expect(listLayoutSummaries()[0]?.name).toBe('캠핑 첫날')
  })
})

describe('마지막 배치(lastLayoutId)', () => {
  it('처음에는 null, 넣은 값을 돌려주고, clearLayoutRepo가 비운다', () => {
    expect(getLastLayoutId()).toBeNull()
    setLastLayoutId('abc')
    expect(getLastLayoutId()).toBe('abc')
    createLayoutFromTent(tunnel())
    clearLayoutRepo()
    expect(getLastLayoutId()).toBeNull()
    expect(layoutCount()).toBe(0)
  })
})
