import { describe, expect, it } from 'vitest'
import { applyPatches, enablePatches, produce, produceWithPatches } from 'immer'
import { createLayout, type Item, type Layout, type Tent } from '../model'
import { reorder, type OrderOp } from './order'

enablePatches()

const NOW = '2026-10-07T00:00:00.000Z'

function tent(): Tent {
  return { name: '테스트 텐트', outer: { kind: 'rect', w: 600, h: 300 }, inners: [] }
}

// 'b@g1'처럼 쓰면 groupId가 g1인 물건
function layoutOf(spec: string[]): Layout {
  const base = createLayout(tent(), { name: '순서', id: 'L1', now: NOW })
  const groups = new Set<string>()
  const items: Item[] = spec.map((s) => {
    const [id = s, gid] = s.split('@')
    const it: Item = {
      id,
      name: id,
      shape: { kind: 'rect', w: 50, h: 50 },
      x: 0,
      y: 0,
      rotation: 0,
      color: 'gray',
      category: 'ETC',
      countsArea: true,
    }
    if (gid !== undefined) {
      it.groupId = gid
      groups.add(gid)
    }
    return it
  })
  return { ...base, items, groups: [...groups].map((id) => ({ id })) }
}

const idsOf = (l: Layout) => l.items.map((it) => it.id)

function order(spec: string[], ids: string[], op: OrderOp, scope?: string): string[] {
  return idsOf(produce(layoutOf(spec), (d) => reorder(d, ids, op, scope)))
}

describe('reorder — 그룹 없음', () => {
  it('맨 앞으로: 떨어진 여러 개를 상대 순서를 유지하며 맨 위로 모은다', () => {
    expect(order(['a', 'b', 'c', 'd', 'e'], ['d', 'b'], 'front')).toEqual(['a', 'c', 'e', 'b', 'd'])
  })

  it('맨 뒤로: 떨어진 여러 개를 상대 순서를 유지하며 맨 아래로 모은다', () => {
    expect(order(['a', 'b', 'c', 'd', 'e'], ['b', 'd'], 'back')).toEqual(['b', 'd', 'a', 'c', 'e'])
  })

  it('앞으로·뒤로는 한 칸씩, 이어 붙은 선택은 함께 움직인다', () => {
    expect(order(['a', 'b', 'c'], ['a'], 'forward')).toEqual(['b', 'a', 'c'])
    expect(order(['a', 'b', 'c', 'd'], ['a', 'b'], 'forward')).toEqual(['c', 'a', 'b', 'd'])
    expect(order(['a', 'b', 'c'], ['c'], 'backward')).toEqual(['a', 'c', 'b'])
  })

  it('이미 맨 위에서 앞으로 / 맨 아래에서 뒤로는 바뀌지 않는다(같은 참조)', () => {
    const l = layoutOf(['a', 'b', 'c'])
    expect(produce(l, (d) => reorder(d, ['c'], 'forward'))).toBe(l)
    expect(produce(l, (d) => reorder(d, ['a'], 'backward'))).toBe(l)
    expect(produce(l, (d) => reorder(d, ['c'], 'front'))).toBe(l)
  })
})

describe('reorder — 그룹 블록', () => {
  it('블록 밖 물건을 앞으로 옮기면 이웃 그룹 블록을 통째로 건너뛴다', () => {
    expect(order(['a', 'b@g', 'c@g', 'd'], ['a'], 'forward')).toEqual(['b', 'c', 'a', 'd'])
  })

  it('블록 밖 물건을 뒤로 옮길 때도 그룹 블록을 통째로 건너뛴다', () => {
    expect(order(['a', 'b@g', 'c@g', 'd'], ['d'], 'backward')).toEqual(['a', 'd', 'b', 'c'])
  })

  it('그룹 멤버 하나를 골라도 블록 전체가 움직인다', () => {
    expect(order(['a', 'b@g', 'c@g', 'd'], ['b'], 'forward')).toEqual(['a', 'd', 'b', 'c'])
    expect(order(['a', 'b@g', 'c@g', 'd'], ['c'], 'back')).toEqual(['b', 'c', 'a', 'd'])
  })

  it('맨 앞으로 여러 개: 그룹 블록과 낱개를 상대 순서대로 모은다', () => {
    expect(order(['a', 'b@g', 'c@g', 'd', 'e'], ['a', 'b'], 'front')).toEqual(['d', 'e', 'a', 'b', 'c'])
  })
})

describe('reorder — 그룹 안 편집(scope)', () => {
  const spec = ['a', 'b@g', 'c@g', 'd@g', 'e']

  it('블록 안에서만 움직이고 블록 밖은 그대로', () => {
    expect(order(spec, ['b'], 'forward', 'g')).toEqual(['a', 'c', 'b', 'd', 'e'])
    expect(order(spec, ['b'], 'front', 'g')).toEqual(['a', 'c', 'd', 'b', 'e'])
    expect(order(spec, ['d'], 'back', 'g')).toEqual(['a', 'd', 'b', 'c', 'e'])
    expect(order(spec, ['b'], 'backward', 'g')).toEqual(spec.map((s) => s.split('@')[0]))
  })

  it('scope 밖 id는 무시한다', () => {
    expect(order(spec, ['a', 'c'], 'front', 'g')).toEqual(['a', 'b', 'd', 'c', 'e'])
  })
})

describe('reorder — 실행 취소 패치', () => {
  it('역패치를 적용하면 원래 배치로 돌아간다', () => {
    const l = layoutOf(['a', 'b@g', 'c@g', 'd', 'e'])
    const [next, patches, inverse] = produceWithPatches(l, (d) => reorder(d, ['a', 'd'], 'front'))
    expect(idsOf(next)).toEqual(['b', 'c', 'e', 'a', 'd'])
    expect(patches.length).toBeGreaterThan(0)
    expect(applyPatches(next, inverse)).toEqual(l)
    expect(applyPatches(l, patches)).toEqual(next)
  })
})
