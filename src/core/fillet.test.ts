// 모서리 곡률(소유자 요청 2026-10-14): 사각형·다각형 꼭짓점마다 반지름(radii), 윤곽은 원호를 다각형으로 근사합니다.
import { describe, expect, it } from 'vitest'
import { cornerRing, effectiveRadii, ringArea, ringBBox, shapeRing } from './geom'
import type { Pt, Shape } from './model'

const corner = (r: number) => r * r - (Math.PI * r * r) / 4
/** 원호를 0.1cm 오차 현으로 근사하므로 넓이는 모서리마다 수 cm² 안에서 맞습니다. */
const near = (v: number, want: number, tol = 3) => expect(Math.abs(v - want)).toBeLessThan(tol)

describe('effectiveRadii', () => {
  it('변 길이 안이면 요청값 그대로, 없는 칸은 0', () => {
    const sq: Pt[] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ]
    expect(effectiveRadii(sq, [10, 0, 20])).toEqual([10, 0, 20, 0])
    expect(effectiveRadii(sq, undefined)).toEqual([0, 0, 0, 0])
  })

  it('두 모서리의 접점이 변 길이를 넘으면 같은 비율로 줄입니다(긴 사각형 → 양끝 반원)', () => {
    const r = effectiveRadii(cornerRing({ kind: 'rect', w: 200, h: 60 }), [100, 100, 100, 100])
    for (const v of r) expect(v).toBeCloseTo(30, 6)
  })

  it('일직선 꼭짓점·음수·NaN은 0', () => {
    const pts: Pt[] = [
      [0, 0],
      [50, 0],
      [100, 0],
      [100, 100],
    ]
    const r = effectiveRadii(pts, [-5, 10, Number.NaN, 0])
    expect(r[0]).toBe(0)
    expect(r[1]).toBe(0)
    expect(r[2]).toBe(0)
  })
})

describe('shapeRing(둥근 윤곽)·cornerRing(꼭짓점)', () => {
  it('반지름이 없으면 예전과 같은 고리', () => {
    expect(shapeRing({ kind: 'rect', w: 200, h: 60 })).toEqual(cornerRing({ kind: 'rect', w: 200, h: 60 }))
    expect(shapeRing({ kind: 'rect', w: 200, h: 60, radii: [0, 0, 0, 0] })).toEqual([
      [-100, -30],
      [100, -30],
      [100, 30],
      [-100, 30],
    ])
  })

  it('둥근 사각형: 넓이 = 사각형 − 모서리 4개, 바깥 상자는 그대로', () => {
    const s: Shape = { kind: 'rect', w: 200, h: 60, radii: [10, 10, 10, 10] }
    const ring = shapeRing(s)
    near(ringArea(ring), 12000 - 4 * corner(10), 4)
    expect(ringBBox(ring)).toEqual({ minX: -100, minY: -30, maxX: 100, maxY: 30 })
    // 꼭짓점 자리 그대로인 점은 없음
    expect(ring.some(([x, y]) => Math.abs(x) === 100 && Math.abs(y) === 30)).toBe(false)
    expect(cornerRing(s)).toHaveLength(4)
  })

  it('너무 큰 반지름은 양끝 반원(스타디움)', () => {
    const ring = shapeRing({ kind: 'rect', w: 200, h: 60, radii: [500, 500, 500, 500] })
    near(ringArea(ring), 140 * 60 + Math.PI * 30 * 30, 15)
    const b = ringBBox(ring)
    expect(b.maxX - b.minX).toBeCloseTo(200, 1)
    expect(b.maxY - b.minY).toBeCloseTo(60, 1)
  })

  it('한 꼭짓점만: 그 꼭짓점만 깎이고 다른 꼭짓점은 그대로', () => {
    const pts: Pt[] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ]
    const ring = shapeRing({ kind: 'polygon', points: pts, radii: [0, 0, 20, 0] })
    expect(ring).toContainEqual([0, 0])
    expect(ring).toContainEqual([100, 0])
    expect(ring).toContainEqual([0, 100])
    expect(ring).not.toContainEqual([100, 100])
    near(ringArea(ring), 10000 - corner(20))
  })

  it('오목한 꼭짓점은 살이 붙습니다(ㄱ자)', () => {
    const pts: Pt[] = [
      [0, 0],
      [100, 0],
      [100, 50],
      [50, 50],
      [50, 100],
      [0, 100],
    ]
    const ring = shapeRing({ kind: 'polygon', points: pts, radii: [0, 0, 0, 10, 0, 0] })
    near(ringArea(ring), 7500 + corner(10))
  })

  it('원호 근사: 반지름에서 벗어난 거리 0.1cm 이하', () => {
    const r = 30
    const ring = shapeRing({ kind: 'rect', w: 200, h: 200, radii: [r, r, r, r] })
    // 오른쪽 아래 모서리 원의 중심 (70, 70)
    const arc = ring.filter(([x, y]) => x > 70 && y > 70)
    expect(arc.length).toBeGreaterThan(3)
    for (const [x, y] of arc) expect(Math.abs(Math.hypot(x - 70, y - 70) - r)).toBeLessThan(1e-6)
  })

  it('원은 반지름이 없음(cornerRing = 원 근사 고리)', () => {
    expect(cornerRing({ kind: 'circle', d: 100 })).toEqual(shapeRing({ kind: 'circle', d: 100 }))
  })
})
