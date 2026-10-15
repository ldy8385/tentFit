// 모서리 반지름이 기존 조작(정리·비교·꼭짓점 편집·템플릿 치수·물건 크기)에서 사라지지 않는지(소유자 요청 2026-10-14).
import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { createLayout, type Item, type Layout, type Shape } from './model'
import { applyTransform, resizeItem } from './ops/items'
import { deleteVertex, insertVertex, setOuterTemplate, setTargetPolygon, setVertex, targetWorldOutline, targetWorldRing } from './ops/tent'
import { normalizeShape } from './ops/util'
import { normalizeRadii, radiiOf, withRadii } from './radii'
import { shapesEqual } from './templates'
import { validateLayout } from './validate'

const NOW = '2026-10-14T00:00:00.000Z'

function layoutWith(outer: Shape, items: Item[] = []): Layout {
  const l = createLayout({ name: 't', outer, inners: [] }, { name: 'l', id: 'l1', now: NOW })
  return { ...l, items }
}

function mat(shape: Shape): Item {
  return { id: 'm', name: '매트', shape, x: 0, y: 0, rotation: 0, color: 'green', category: 'MAT', countsArea: true }
}

const square: Shape = { kind: 'polygon', points: [[0, 0], [100, 0], [100, 100], [0, 100]], radii: [0, 10, 0, 20] }

describe('radii 도우미', () => {
  it('normalizeRadii: 칸 수 맞춤·반올림·음수 0, 모두 0이면 없음', () => {
    expect(normalizeRadii([1.234, -3], 3)).toEqual([1.2, 0, 0])
    expect(normalizeRadii([0, 0], 2)).toBeUndefined()
    expect(normalizeRadii(undefined, 4)).toBeUndefined()
  })

  it('withRadii·radiiOf', () => {
    const r = withRadii({ kind: 'rect', w: 10, h: 10 }, [2, 2, 2, 2])
    expect(r).toEqual({ kind: 'rect', w: 10, h: 10, radii: [2, 2, 2, 2] })
    expect(withRadii(r, [0, 0, 0, 0])).toEqual({ kind: 'rect', w: 10, h: 10 })
    expect(radiiOf({ kind: 'rect', w: 10, h: 10 })).toEqual([0, 0, 0, 0])
    expect(radiiOf({ kind: 'circle', d: 10 })).toEqual([])
  })
})

describe('정리·비교', () => {
  it('normalizeShape는 radii를 지킵니다(모두 0이면 뺌)', () => {
    expect(normalizeShape(square)).toEqual(square)
    expect(normalizeShape({ kind: 'rect', w: 10, h: 10, radii: [0, 0, 0, 0] })).toEqual({ kind: 'rect', w: 10, h: 10 })
  })

  it('shapesEqual은 반지름이 다르면 다름', () => {
    const plain: Shape = { kind: 'polygon', points: square.kind === 'polygon' ? square.points : [] }
    expect(shapesEqual(square, plain)).toBe(false)
    expect(shapesEqual(square, normalizeShape(square))).toBe(true)
    expect(shapesEqual({ kind: 'rect', w: 1, h: 1 }, { kind: 'rect', w: 1, h: 1, radii: [0, 0, 0, 0] })).toBe(true)
  })
})

describe('텐트 꼭짓점 편집', () => {
  it('꼭짓점 옮기기는 반지름 그대로', () => {
    const next = produce(layoutWith(square), (d) => setVertex(d, 'outer', 2, [120, 100]))
    expect(radiiOf(next.tent.outer)).toEqual([0, 10, 0, 20])
  })

  it('꼭짓점 넣기는 그 자리에 0, 지우기는 그 칸을 뺌', () => {
    const ins = produce(layoutWith(square), (d) => insertVertex(d, 'outer', 1))
    expect(radiiOf(ins.tent.outer)).toEqual([0, 10, 0, 0, 20])
    const del = produce(layoutWith(square), (d) => {
      deleteVertex(d, 'outer', 1)
    })
    expect(radiiOf(del.tent.outer)).toEqual([0, 0, 20])
  })

  it('사각형 꼭짓점을 옮겨 다각형이 되어도 반지름 그대로', () => {
    const rect: Shape = { kind: 'rect', w: 100, h: 60, radii: [5, 5, 5, 5] }
    const next = produce(layoutWith(rect), (d) => setVertex(d, 'outer', 0, [-60, -30]))
    expect(next.tent.outer.kind).toBe('polygon')
    expect(radiiOf(next.tent.outer)).toEqual([5, 5, 5, 5])
  })

  it('cm 맞추기(keepRadii)는 지키고, 다시 그리기는 버림', () => {
    const pts = square.kind === 'polygon' ? square.points.map(([x, y]): [number, number] => [x * 2, y]) : []
    const kept = produce(layoutWith(square), (d) => setTargetPolygon(d, 'outer', pts, 'local', { keepRadii: true }))
    expect(radiiOf(kept.tent.outer)).toEqual([0, 10, 0, 20])
    const redrawn = produce(layoutWith(square), (d) => setTargetPolygon(d, 'outer', pts, 'world'))
    expect(radiiOf(redrawn.tent.outer)).toEqual([0, 0, 0, 0])
  })

  it('템플릿 치수를 바꿔도 꼭짓점 수가 같으면 반지름 그대로, 같은 값이면 쓰지 않음', () => {
    const base = layoutWith({ kind: 'rect', w: 300, h: 200, radii: [10, 10, 10, 10] })
    const withTpl = produce(base, (d) => {
      d.tent.outerTemplate = { kind: 'rect', w: 300, h: 200 }
    })
    const next = produce(withTpl, (d) => setOuterTemplate(d, { kind: 'rect', w: 320, h: 200 }))
    expect(next.tent.outer).toEqual({ kind: 'rect', w: 320, h: 200, radii: [10, 10, 10, 10] })
    expect(produce(withTpl, (d) => setOuterTemplate(d, { kind: 'rect', w: 300, h: 200 }))).toBe(withTpl)
  })

  it('윤곽 고리(targetWorldOutline)는 둥글고, 꼭짓점 고리(targetWorldRing)는 뾰족', () => {
    const l = layoutWith(square)
    expect(targetWorldRing(l, 'outer')).toHaveLength(4)
    expect(targetWorldOutline(l, 'outer').length).toBeGreaterThan(8)
  })
})

describe('검사(validateLayout)·프리셋 읽기', () => {
  it('템플릿 도형의 모서리 반지름은 다시 만들 때도 그대로(이슈 없음)', () => {
    const l = layoutWith({ kind: 'rect', w: 600, h: 300, radii: [20, 20, 20, 20] })
    const withTpl: Layout = { ...l, tent: { ...l.tent, outerTemplate: { kind: 'rect', w: 600, h: 300 } } }
    const v = validateLayout(withTpl)
    expect(v.issues).toEqual([])
    expect(v.layout.tent.outer).toEqual({ kind: 'rect', w: 600, h: 300, radii: [20, 20, 20, 20] })
  })
})

describe('물건 크기', () => {
  it('다각형 물건 가로·세로 입력과 핸들 변형은 반지름 그대로', () => {
    const l = layoutWith({ kind: 'rect', w: 600, h: 400 }, [mat(square)])
    const resized = produce(l, (d) => resizeItem(d, 'm', { w: 150 }))
    expect(radiiOf(resized.items[0]!.shape)).toEqual([0, 10, 0, 20])
    const scaled = produce(l, (d) => applyTransform(d, 'm', { x: 0, y: 0, rotation: 0, scaleX: 2, scaleY: 1 }))
    expect(radiiOf(scaled.items[0]!.shape)).toEqual([0, 10, 0, 20])
  })

  it('사각형 물건은 크기를 바꿔도 반지름 그대로', () => {
    const l = layoutWith({ kind: 'rect', w: 600, h: 400 }, [mat({ kind: 'rect', w: 200, h: 60, radii: [8, 8, 8, 8] })])
    const resized = produce(l, (d) => resizeItem(d, 'm', { w: 190 }))
    expect(resized.items[0]!.shape).toEqual({ kind: 'rect', w: 190, h: 60, radii: [8, 8, 8, 8] })
  })
})
