// 텐트 전체 회전(소유자 요청 2026-10-14 「회전은 전부」): 외곽 + 이너를 외곽 가운데 기준으로, 물건은 그대로.
import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { createLayout, type Inner, type Item, type Layout, type Shape, type ShapeTemplate } from './model'
import { rotateTent } from './ops/tent'

const NOW = '2026-10-14T00:00:00.000Z'
const IN: Inner = { id: 'i', name: '이너 1', shape: { kind: 'rect', w: 100, h: 50 }, template: { kind: 'rect', w: 100, h: 50 }, x: 100, y: 0, rotation: 0 }
const MAT: Item = { id: 'm', name: '매트', shape: { kind: 'rect', w: 200, h: 60 }, x: 10, y: 20, rotation: 0, color: 'green', category: 'MAT', countsArea: true }

function layout(outer: Shape, outerTemplate?: ShapeTemplate): Layout {
  const tent = outerTemplate === undefined ? { name: 't', outer, inners: [IN] } : { name: 't', outer, outerTemplate, inners: [IN] }
  return { ...createLayout(tent, { name: 'l', id: 'L', now: NOW }), items: [MAT] }
}

describe('rotateTent', () => {
  it('사각형 템플릿 90°: 가로·세로를 바꾸고 템플릿 유지, 모서리 반지름도 같이 돎, 이너는 피벗 둘레로·회전 더함, 물건 그대로', () => {
    const l = layout({ kind: 'rect', w: 600, h: 300, radii: [10, 0, 0, 0] }, { kind: 'rect', w: 600, h: 300 })
    const next = produce(l, (d) => rotateTent(d, 90))
    expect(next.tent.outerTemplate).toEqual({ kind: 'rect', w: 300, h: 600 })
    expect(next.tent.outer).toEqual({ kind: 'rect', w: 300, h: 600, radii: [0, 10, 0, 0] })
    expect(next.tent.inners[0]).toMatchObject({ x: 0, y: 100, rotation: 90 })
    expect(next.items).toEqual(l.items)
  })

  it('180°는 사각형 모양 그대로(반지름은 맞은편으로)', () => {
    const next = produce(layout({ kind: 'rect', w: 600, h: 300, radii: [10, 0, 0, 0] }), (d) => rotateTent(d, 180))
    expect(next.tent.outer).toEqual({ kind: 'rect', w: 600, h: 300, radii: [0, 0, 10, 0] })
  })

  it('그 밖의 각도·다각형은 꼭짓점을 돌린 자유 다각형(템플릿 버림, 반지름 유지), 0°는 그대로', () => {
    const tri: Shape = { kind: 'polygon', points: [[0, 0], [100, 0], [0, 100]], radii: [0, 5, 0] }
    const l = layout(tri, { kind: 'trapezoid', front: 1, back: 1, depth: 1, offset: 0 })
    const next = produce(l, (d) => rotateTent(d, 90))
    // 피벗 = 윤곽 상자 가운데. 반지름 5인 꼭짓점이 상자를 줄이지 않는 쪽이라 (50,50)
    expect(next.tent.outerTemplate).toBeUndefined()
    expect(next.tent.outer.kind).toBe('polygon')
    expect(next.tent.outer.kind === 'polygon' && next.tent.outer.radii).toEqual([0, 5, 0])
    expect(produce(l, (d) => rotateTent(d, 0))).toBe(l)
    expect(produce(l, (d) => rotateTent(d, 360))).toBe(l)
  })

  it('원 외곽은 그대로, 이너만 돎', () => {
    const next = produce(layout({ kind: 'circle', d: 500 }, { kind: 'circle', d: 500 }), (d) => rotateTent(d, -90))
    expect(next.tent.outer).toEqual({ kind: 'circle', d: 500 })
    expect(next.tent.inners[0]).toMatchObject({ x: 0, y: -100, rotation: 270 })
  })
})
