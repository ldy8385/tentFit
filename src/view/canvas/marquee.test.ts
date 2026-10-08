import { describe, expect, it } from 'vitest'
import { createLayout, type Item, type Layout, type Shape } from '../../core/model'
import { itemsInRect, itemWorldBBox, rectFromCorners } from './marquee'

function item(id: string, shape: Shape, x: number, y: number, extra: Partial<Item> = {}): Item {
  return { id, name: id, shape, x, y, rotation: 0, color: 'blue', category: 'MAT', countsArea: true, ...extra }
}

function layoutOf(items: Item[], groups: string[] = []): Layout {
  const l = createLayout(
    { name: 't', outer: { kind: 'rect', w: 600, h: 300 }, inners: [] },
    { name: 'b', id: 'L', now: '2026-10-08T00:00:00.000Z' },
  )
  l.items = items
  l.groups = groups.map((id) => ({ id }))
  return l
}

const sq = (s: number): Shape => ({ kind: 'rect', w: s, h: s })

describe('itemWorldBBox', () => {
  it('원은 정확한 원의 bbox, 회전한 사각형은 돌린 꼭짓점의 bbox', () => {
    expect(itemWorldBBox(item('c', { kind: 'circle', d: 40 }, 10, 20))).toEqual({ minX: -10, minY: 0, maxX: 30, maxY: 40 })
    expect(itemWorldBBox(item('r', { kind: 'rect', w: 200, h: 60 }, 0, 0, { rotation: 90 }))).toEqual({
      minX: -30,
      minY: -100,
      maxX: 30,
      maxY: 100,
    })
  })
})

describe('rectFromCorners', () => {
  it('어느 방향으로 끌어도 같은 bbox', () => {
    expect(rectFromCorners(10, 20, -5, 0)).toEqual({ minX: -5, minY: 0, maxX: 10, maxY: 20 })
  })
})

describe('itemsInRect', () => {
  it('완전히 들어간 물건만(경계에 닿은 것은 포함), 배열 순서', () => {
    const l = layoutOf([item('b', sq(20), 50, 0), item('a', sq(20), 0, 0), item('half', sq(20), 100, 0)])
    // a: −10..10, b: 40..60, half: 90..110
    expect(itemsInRect(l, { minX: -10, minY: -10, maxX: 100, maxY: 10 }, null)).toEqual(['b', 'a'])
  })

  it('그룹은 모든 멤버가 들어갈 때만 고른다', () => {
    const l = layoutOf(
      [item('g1', sq(20), 0, 0, { groupId: 'G' }), item('g2', sq(20), 200, 0, { groupId: 'G' }), item('x', sq(20), 50, 0)],
      ['G'],
    )
    expect(itemsInRect(l, { minX: -20, minY: -20, maxX: 100, maxY: 20 }, null)).toEqual(['x'])
    expect(itemsInRect(l, { minX: -20, minY: -20, maxX: 220, maxY: 20 }, null)).toEqual(['g1', 'g2', 'x'])
  })

  it('그룹 안 편집이면 그 그룹 멤버만 하나씩 고른다', () => {
    const l = layoutOf(
      [item('g1', sq(20), 0, 0, { groupId: 'G' }), item('g2', sq(20), 200, 0, { groupId: 'G' }), item('x', sq(20), 50, 0)],
      ['G'],
    )
    expect(itemsInRect(l, { minX: -20, minY: -20, maxX: 100, maxY: 20 }, 'G')).toEqual(['g1'])
  })

  it('아무것도 안 들어가면 빈 배열', () => {
    const l = layoutOf([item('a', sq(20), 0, 0)])
    expect(itemsInRect(l, { minX: 100, minY: 100, maxX: 200, maxY: 200 }, null)).toEqual([])
  })
})
