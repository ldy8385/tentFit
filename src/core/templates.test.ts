import { describe, expect, it } from 'vitest'
import type { Pt, Shape } from './model'
import { ngonDiameterFromSide, ngonSideFromDiameter, shapeFromTemplate, shapesEqual } from './templates'

/** 부호 없는 신발끈 넓이(cm²) */
function polyArea(points: Pt[]): number {
  let s = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]!
    const [x2, y2] = points[(i + 1) % points.length]!
    s += x1 * y2 - x2 * y1
  }
  return Math.abs(s) / 2
}

function pointsOf(shape: Shape): Pt[] {
  if (shape.kind !== 'polygon') throw new Error(`polygon이 아님: ${shape.kind}`)
  return shape.points
}

describe('shapeFromTemplate — 사각형·원', () => {
  it('rect는 rect, square면 h=w', () => {
    expect(shapeFromTemplate({ kind: 'rect', w: 300, h: 100 })).toEqual({ kind: 'rect', w: 300, h: 100 })
    expect(shapeFromTemplate({ kind: 'rect', w: 300, h: 100, square: true })).toEqual({ kind: 'rect', w: 300, h: 300 })
    expect(shapeFromTemplate({ kind: 'rect', w: 300, h: 100, square: false })).toEqual({ kind: 'rect', w: 300, h: 100 })
  })

  it('circle은 circle', () => {
    expect(shapeFromTemplate({ kind: 'circle', d: 400 })).toEqual({ kind: 'circle', d: 400 })
  })
})

describe('shapeFromTemplate — 사다리꼴', () => {
  it('front 300 / back 200 / depth 250 / offset 0: 넓이 62,500, 앞변은 아래(y+)', () => {
    const pts = pointsOf(shapeFromTemplate({ kind: 'trapezoid', front: 300, back: 200, depth: 250, offset: 0 }))
    expect(pts).toEqual([
      [-100, -125],
      [100, -125],
      [150, 125],
      [-150, 125],
    ])
    expect(polyArea(pts)).toBe(62500)
  })

  it('offset 20이면 뒷변 중심 x가 앞변 중심보다 +20', () => {
    const pts = pointsOf(shapeFromTemplate({ kind: 'trapezoid', front: 300, back: 200, depth: 250, offset: 20 }))
    const backCenter = (pts[0]![0] + pts[1]![0]) / 2
    const frontCenter = (pts[2]![0] + pts[3]![0]) / 2
    expect(backCenter - frontCenter).toBeCloseTo(20, 9)
    expect(polyArea(pts)).toBe(62500)
  })

  it('바운딩 박스 중심을 원점으로 맞춘다(offset 100)', () => {
    const pts = pointsOf(shapeFromTemplate({ kind: 'trapezoid', front: 300, back: 200, depth: 250, offset: 100 }))
    expect(pts).toEqual([
      [-25, -125],
      [175, -125],
      [125, 125],
      [-175, 125],
    ])
  })

  it('offset이 음수면 뒷변이 왼쪽(x−)으로 간다', () => {
    const pts = pointsOf(shapeFromTemplate({ kind: 'trapezoid', front: 300, back: 200, depth: 250, offset: -100 }))
    expect(pts).toEqual([
      [-175, -125],
      [25, -125],
      [175, 125],
      [-125, 125],
    ])
  })
})

describe('정N각형 환산', () => {
  it('정6각형 지름 400의 한 변 = 200', () => {
    expect(ngonSideFromDiameter(6, 400)).toBeCloseTo(200, 9)
    expect(ngonDiameterFromSide(6, 200)).toBeCloseTo(400, 9)
  })

  it('지름 ↔ 한 변 왕복', () => {
    for (let n = 5; n <= 12; n++) {
      expect(ngonDiameterFromSide(n, ngonSideFromDiameter(n, 333))).toBeCloseTo(333, 9)
    }
  })
})

describe('shapeFromTemplate — 정N각형', () => {
  it('정6각형 지름 400: 아래 변 길이 200이고 수평', () => {
    const pts = pointsOf(shapeFromTemplate({ kind: 'ngon', n: 6, sizeBy: 'diameter', size: 400 }))
    expect(pts).toEqual([
      [-100, 173.2],
      [-200, 0],
      [-100, -173.2],
      [100, -173.2],
      [200, 0],
      [100, 173.2],
    ])
    const bottomLeft = pts[0]!
    const bottomRight = pts[5]!
    expect(bottomRight[0] - bottomLeft[0]).toBe(200)
    expect(bottomRight[1]).toBe(bottomLeft[1])
  })

  it('정5각형: 아래 변이 수평이고 가장 아래(y 최대), 바운딩 박스 중심이 원점', () => {
    const pts = pointsOf(shapeFromTemplate({ kind: 'ngon', n: 5, sizeBy: 'diameter', size: 400 }))
    expect(pts).toEqual([
      [-117.6, 180.9],
      [-190.2, -42.7],
      [0, -180.9],
      [190.2, -42.7],
      [117.6, 180.9],
    ])
    const ys = pts.map((p) => p[1])
    expect(pts[0]![1]).toBe(pts[4]![1])
    expect(pts[0]![1]).toBe(Math.max(...ys))
    expect(Math.max(...ys) + Math.min(...ys)).toBe(0)
    expect(Object.is(pts[2]![0], -0)).toBe(false)
  })

  it('n=5~12 모두 아래 변이 수평이고 꼭짓점 수가 n', () => {
    for (let n = 5; n <= 12; n++) {
      const pts = pointsOf(shapeFromTemplate({ kind: 'ngon', n, sizeBy: 'diameter', size: 400 }))
      expect(pts).toHaveLength(n)
      expect(pts[0]![1]).toBe(pts[n - 1]![1])
      expect(pts[0]![1]).toBe(Math.max(...pts.map((p) => p[1])))
    }
  })

  it('sizeBy side는 지름으로 환산해 같은 도형을 만든다', () => {
    const bySide = shapeFromTemplate({ kind: 'ngon', n: 6, sizeBy: 'side', size: 200 })
    const byDiameter = shapeFromTemplate({ kind: 'ngon', n: 6, sizeBy: 'diameter', size: 400 })
    expect(bySide).toEqual(byDiameter)
  })
})

describe('shapesEqual', () => {
  it('기본 허용 0.1cm: 0.05 차이는 같음, 0.2 차이는 다름', () => {
    const a: Shape = { kind: 'rect', w: 200, h: 60 }
    expect(shapesEqual(a, { kind: 'rect', w: 200.05, h: 60 })).toBe(true)
    expect(shapesEqual(a, { kind: 'rect', w: 200.2, h: 60 })).toBe(false)
    expect(shapesEqual(a, { kind: 'rect', w: 200.1, h: 60 })).toBe(true)
    expect(shapesEqual({ kind: 'circle', d: 40 }, { kind: 'circle', d: 40.05 })).toBe(true)
    expect(shapesEqual({ kind: 'circle', d: 40 }, { kind: 'circle', d: 40.2 })).toBe(false)
  })

  it('다각형은 같은 순서의 꼭짓점끼리 비교한다', () => {
    const p: Shape = { kind: 'polygon', points: [[0, 0], [100, 0], [0, 100]] }
    expect(shapesEqual(p, { kind: 'polygon', points: [[0.05, 0], [100, -0.05], [0, 100]] })).toBe(true)
    expect(shapesEqual(p, { kind: 'polygon', points: [[0.2, 0], [100, 0], [0, 100]] })).toBe(false)
    expect(shapesEqual(p, { kind: 'polygon', points: [[0, 0], [100, 0]] })).toBe(false)
  })

  it('종류가 다르면 다르다', () => {
    expect(shapesEqual({ kind: 'rect', w: 40, h: 40 }, { kind: 'circle', d: 40 })).toBe(false)
    expect(
      shapesEqual({ kind: 'rect', w: 100, h: 100 }, { kind: 'polygon', points: [[-50, -50], [50, -50], [50, 50], [-50, 50]] }),
    ).toBe(false)
  })

  it('tol을 바꿀 수 있다', () => {
    expect(shapesEqual({ kind: 'rect', w: 200, h: 60 }, { kind: 'rect', w: 201, h: 60 }, 1)).toBe(true)
    expect(shapesEqual({ kind: 'rect', w: 200, h: 60 }, { kind: 'rect', w: 200.05, h: 60 }, 0.01)).toBe(false)
  })
})
