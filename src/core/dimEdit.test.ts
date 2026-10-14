// 도형 위 치수 편집 계산(소유자 요청 2026-10-14): 변·가로·세로·모서리 반지름, 비율 유지 켬 = 전체 같은 배율, 끔 = 그 변·축만.
import { describe, expect, it } from 'vitest'
import { dimValue, editDim, outlineSize, setAllRadii, type DimKey, type ShapeSpec } from './dimEdit'
import { cornerRing, ringBBox } from './geom'
import type { Pt, Shape } from './model'
import { edgeLengths, setAnyEdgeLength } from './polygonEdit'
import { shapeFromTemplate } from './templates'

const E = (index: number): DimKey => ({ kind: 'edge', index })
const W: DimKey = { kind: 'w' }
const H: DimKey = { kind: 'h' }
const R = (index: number): DimKey => ({ kind: 'radius', index })

function ok(r: ReturnType<typeof editDim>): ShapeSpec {
  if (!r.ok) throw new Error(`거부됨: ${r.reason}`)
  return r.spec
}

const tri: Pt[] = [
  [0, 0],
  [100, 0],
  [0, 50],
]

describe('dimValue·outlineSize', () => {
  it('사각형 변은 [가로, 세로, 가로, 세로], 원은 지름', () => {
    const rect: Shape = { kind: 'rect', w: 200, h: 60 }
    expect([0, 1, 2, 3].map((i) => dimValue(rect, E(i)))).toEqual([200, 60, 200, 60])
    expect(dimValue({ kind: 'circle', d: 80 }, W)).toBe(80)
    expect(dimValue({ kind: 'circle', d: 80 }, E(0))).toBeNull()
  })

  it('가로·세로는 보이는 윤곽 기준(뾰족한 꼭짓점이 깎이면 줄어듦)', () => {
    const s: Shape = { kind: 'polygon', points: [[0, 0], [100, 50], [0, 100]], radii: [0, 20, 0] }
    expect(outlineSize(s).w).toBeLessThan(100)
    expect(outlineSize({ kind: 'rect', w: 200, h: 60, radii: [10, 10, 10, 10] })).toEqual({ w: 200, h: 60 })
  })

  it('반지름은 실제로 쓰는 값', () => {
    expect(dimValue({ kind: 'rect', w: 200, h: 60, radii: [100, 0, 0, 0] }, R(0))).toBeCloseTo(60, 6)
  })
})

describe('비율 유지 켬: 전체를 같은 배율로', () => {
  it('사각형 가로 → 세로·반지름도 같이', () => {
    const spec = ok(editDim({ shape: { kind: 'rect', w: 200, h: 60, radii: [10, 10, 10, 10] } }, W, 100, true))
    expect(spec.shape).toEqual({ kind: 'rect', w: 100, h: 30, radii: [5, 5, 5, 5] })
  })

  it('템플릿은 템플릿째로(사다리꼴 모든 값 × 배율)', () => {
    const t = { kind: 'trapezoid', front: 200, back: 100, depth: 150, offset: 10 } as const
    const spec = ok(editDim({ shape: shapeFromTemplate(t), template: t }, E(0), 200, true))
    expect(spec.template).toEqual({ kind: 'trapezoid', front: 400, back: 200, depth: 300, offset: 20 })
    expect(spec.shape).toEqual(shapeFromTemplate(spec.template!))
  })

  it('다각형: 변 하나를 바꾸면 모든 변이 같은 비율, 가운데 그대로', () => {
    const spec = ok(editDim({ shape: { kind: 'polygon', points: tri } }, E(1), Math.hypot(100, 50) * 2, true))
    const lens = edgeLengths(cornerRing(spec.shape))
    expect(lens[0]).toBeCloseTo(200, 6)
    expect(lens[2]).toBeCloseTo(100, 6)
    const b = ringBBox(cornerRing(spec.shape))
    expect((b.minX + b.maxX) / 2).toBeCloseTo(50, 6)
    expect((b.minY + b.maxY) / 2).toBeCloseTo(25, 6)
  })

  it('원은 지름', () => {
    expect(ok(editDim({ shape: { kind: 'circle', d: 80 } }, W, 100, true)).shape).toEqual({ kind: 'circle', d: 100 })
  })

  it('범위를 넘으면 거부(5000 초과)', () => {
    const r = editDim({ shape: { kind: 'rect', w: 200, h: 60 } }, H, 6000, true)
    expect(r).toEqual({ ok: false, reason: 'range' })
    const r2 = editDim({ shape: { kind: 'rect', w: 4000, h: 60 } }, H, 120, true)
    expect(r2).toEqual({ ok: false, reason: 'range' })
  })
})

describe('비율 유지 끔: 그 변·축만', () => {
  it('사각형 위 변 = 가로만, 옆 변 = 세로만', () => {
    expect(ok(editDim({ shape: { kind: 'rect', w: 200, h: 60 } }, E(2), 190, false)).shape).toEqual({ kind: 'rect', w: 190, h: 60 })
    expect(ok(editDim({ shape: { kind: 'rect', w: 200, h: 60 } }, E(3), 70, false)).shape).toEqual({ kind: 'rect', w: 200, h: 70 })
    const tpl = { kind: 'rect', w: 200, h: 60 } as const
    expect(ok(editDim({ shape: shapeFromTemplate(tpl), template: tpl }, H, 80, false)).template).toEqual({ kind: 'rect', w: 200, h: 80 })
  })

  it('사다리꼴 뒷변·앞변은 템플릿 값, 옆변은 자유 다각형으로', () => {
    const t = { kind: 'trapezoid', front: 200, back: 100, depth: 150, offset: 0 } as const
    const spec: ShapeSpec = { shape: shapeFromTemplate(t), template: t }
    expect(ok(editDim(spec, E(0), 120, false)).template).toEqual({ ...t, back: 120 })
    expect(ok(editDim(spec, E(2), 220, false)).template).toEqual({ ...t, front: 220 })
    const side = ok(editDim(spec, E(1), 200, false))
    expect(side.template).toBeUndefined()
    expect(edgeLengths(cornerRing(side.shape))[1]).toBeCloseTo(200, 6)
  })

  it('육각형 윗·아랫변 = edge(가로보다 길면 거부), 가로·세로 = w·h', () => {
    const t = { kind: 'hexagon', w: 400, h: 300, edge: 200 } as const
    const spec: ShapeSpec = { shape: shapeFromTemplate(t), template: t }
    expect(ok(editDim(spec, E(3), 250, false)).template).toEqual({ ...t, edge: 250 })
    expect(editDim(spec, E(0), 450, false)).toEqual({ ok: false, reason: 'hexagon-edge' })
    expect(ok(editDim(spec, W, 500, false)).template).toEqual({ ...t, w: 500 })
  })

  it('다각형 닫는 변도 바꿀 수 있음(앞 변이 흡수)', () => {
    const sq: Pt[] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ]
    const spec = ok(editDim({ shape: { kind: 'polygon', points: sq } }, E(3), 150, false))
    const lens = edgeLengths(cornerRing(spec.shape))
    expect(lens[3]).toBeCloseTo(150, 6)
    expect(lens[0]).toBeCloseTo(100, 6)
    expect(lens[1]).toBeCloseTo(100, 6)
  })

  it('다각형 가로만: 보이는 윤곽 가로가 입력값이 되게(둥근 꼭짓점도)', () => {
    const s: Shape = { kind: 'polygon', points: [[0, 0], [100, 50], [0, 100]], radii: [0, 20, 0] }
    const spec = ok(editDim({ shape: s }, W, 150, false))
    expect(outlineSize(spec.shape).w).toBeCloseTo(150, 1)
    expect(outlineSize(spec.shape).h).toBeCloseTo(outlineSize(s).h, 6)
  })

  it('원 가로 = 지름', () => {
    expect(ok(editDim({ shape: { kind: 'circle', d: 80 } }, H, 90, false)).shape).toEqual({ kind: 'circle', d: 90 })
  })

  it('변이 꼬이면 거부(invalid)', () => {
    const L: Pt[] = [
      [0, 0],
      [100, 0],
      [100, 10],
      [10, 10],
      [10, 100],
      [0, 100],
    ]
    expect(editDim({ shape: { kind: 'polygon', points: L } }, E(2), 200, false)).toEqual({ ok: false, reason: 'invalid' })
  })
})

describe('모서리 반지름', () => {
  it('한 꼭짓점: 그 값으로, 너무 크면 실제로 되는 값으로 저장, 템플릿 유지', () => {
    const tpl = { kind: 'rect', w: 200, h: 60 } as const
    const spec = ok(editDim({ shape: shapeFromTemplate(tpl), template: tpl }, R(1), 15, true))
    expect(spec.template).toEqual(tpl)
    expect(spec.shape).toEqual({ kind: 'rect', w: 200, h: 60, radii: [0, 15, 0, 0] })
    const big = ok(editDim({ shape: { kind: 'rect', w: 200, h: 60 } }, R(0), 500, false))
    expect(big.shape).toEqual({ kind: 'rect', w: 200, h: 60, radii: [60, 0, 0, 0] })
  })

  it('0이면 뾰족(radii 없음), 음수는 거부, 원은 거부', () => {
    expect(ok(editDim({ shape: { kind: 'rect', w: 10, h: 10, radii: [2, 0, 0, 0] } }, R(0), 0, false)).shape).toEqual({
      kind: 'rect',
      w: 10,
      h: 10,
    })
    expect(editDim({ shape: { kind: 'rect', w: 10, h: 10 } }, R(0), -1, false)).toEqual({ ok: false, reason: 'range' })
    expect(editDim({ shape: { kind: 'circle', d: 10 } }, R(0), 1, false)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('setAllRadii: 모든 꼭짓점 같은 값(실제로 되는 값)', () => {
    const r = setAllRadii({ shape: { kind: 'rect', w: 200, h: 60 } }, 100)
    expect(r.ok && r.spec.shape).toEqual({ kind: 'rect', w: 200, h: 60, radii: [30, 30, 30, 30] })
  })
})

describe('setAnyEdgeLength', () => {
  it('마지막 변이 아니면 setEdgeLength와 같음, 마지막 변은 앞 변이 흡수', () => {
    const out = setAnyEdgeLength(tri, 2, 80)
    const lens = edgeLengths(out)
    expect(lens[2]).toBeCloseTo(80, 6)
    expect(lens[0]).toBeCloseTo(100, 6)
  })
})
