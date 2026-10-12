import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { worldRing } from './geom'
import type { Inner, Pt, Shape, ShapeTemplate } from './model'
import {
  ATTACH_SIDE_LABELS,
  attachBBoxToWall,
  attachedInner,
  attachSidesFor,
  defaultInnerTemplate,
  defaultOuterTemplate,
  round10,
  templateFromBBox,
  newInnerSide,
  ngonDiameterFromSide,
  ngonSideFromDiameter,
  shapeFromTemplate,
  shapesEqual,
  type AttachSide,
} from './templates'
import { buildZones } from './zones'

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

describe('붙일 위치(§4.4-1, R7)', () => {
  it('라벨과 선택지 순서: 사각형 = 뒤·앞·왼쪽·오른쪽, 사다리꼴 = 뒤·앞, 그 밖 = []', () => {
    expect(ATTACH_SIDE_LABELS).toEqual({ front: '앞', back: '뒤', left: '왼쪽', right: '오른쪽' })
    expect(attachSidesFor({ kind: 'rect', w: 620, h: 320 })).toEqual(['back', 'front', 'left', 'right'])
    expect(attachSidesFor({ kind: 'trapezoid', front: 300, back: 200, depth: 250, offset: 0 })).toEqual(['back', 'front'])
    expect(attachSidesFor({ kind: 'ngon', n: 6, sizeBy: 'diameter', size: 400 })).toEqual([])
    expect(attachSidesFor({ kind: 'circle', d: 400 })).toEqual([])
    expect(attachSidesFor(undefined)).toEqual([])
  })

  it('사각형 620×320에 폭 300·깊이 220: 뒤 → y −50, 앞 → y +50(회전 0, w = 폭·h = 깊이)', () => {
    const outer: ShapeTemplate = { kind: 'rect', w: 620, h: 320 }
    expect(attachedInner(outer, 'back', 300, 220)).toEqual({
      x: 0,
      y: -50,
      rotation: 0,
      template: { kind: 'rect', w: 300, h: 220 },
      shape: { kind: 'rect', w: 300, h: 220 },
    })
    expect(attachedInner(outer, 'front', 300, 220)).toMatchObject({ x: 0, y: 50, shape: { kind: 'rect', w: 300, h: 220 } })
  })

  it('사각형 왼쪽·오른쪽 벽은 회전 0이고 w = 깊이·h = 폭', () => {
    const outer: ShapeTemplate = { kind: 'rect', w: 620, h: 320 }
    expect(attachedInner(outer, 'left', 300, 220)).toEqual({
      x: -200,
      y: 0,
      rotation: 0,
      template: { kind: 'rect', w: 220, h: 300 },
      shape: { kind: 'rect', w: 220, h: 300 },
    })
    expect(attachedInner(outer, 'right', 300, 220)).toMatchObject({ x: 200, y: 0, rotation: 0, shape: { kind: 'rect', w: 220, h: 300 } })
  })

  it('정사각형 체크면 세로 = 가로로 보고 붙인다', () => {
    expect(attachedInner({ kind: 'rect', w: 400, h: 100, square: true }, 'front', 200, 100)).toMatchObject({ x: 0, y: 150 })
  })

  it('사다리꼴 front 300·back 200·depth 250·offset 30: 뒤는 뒷변 중점(x 30), 앞은 앞변 중점(x 0)', () => {
    const trap: ShapeTemplate = { kind: 'trapezoid', front: 300, back: 200, depth: 250, offset: 30 }
    expect(attachedInner(trap, 'back', 160, 100)).toEqual({
      x: 30,
      y: -75,
      rotation: 0,
      template: { kind: 'rect', w: 160, h: 100 },
      shape: { kind: 'rect', w: 160, h: 100 },
    })
    expect(attachedInner(trap, 'front', 160, 100)).toMatchObject({ x: 0, y: 75, shape: { kind: 'rect', w: 160, h: 100 } })
  })

  it('사다리꼴 offset 100은 바운딩 박스 중심이 옮겨지므로 벽 중점도 따라간다', () => {
    const trap: ShapeTemplate = { kind: 'trapezoid', front: 300, back: 200, depth: 250, offset: 100 }
    // 꼭짓점: 뒷변 (−25,−125)~(175,−125), 앞변 (−175,125)~(125,125)
    expect(attachedInner(trap, 'back', 100, 50)).toMatchObject({ x: 75, y: -100 })
    expect(attachedInner(trap, 'front', 100, 50)).toMatchObject({ x: -25, y: 100 })
  })

  it('그 모양에 그 벽이 없으면 null: 사다리꼴 왼쪽·오른쪽, 원·정N각형 전부', () => {
    const trap: ShapeTemplate = { kind: 'trapezoid', front: 300, back: 200, depth: 250, offset: 0 }
    expect(attachedInner(trap, 'left', 100, 100)).toBeNull()
    expect(attachedInner(trap, 'right', 100, 100)).toBeNull()
    const sides: AttachSide[] = ['front', 'back', 'left', 'right']
    for (const side of sides) {
      expect(attachedInner({ kind: 'circle', d: 400 }, side, 100, 100)).toBeNull()
      expect(attachedInner({ kind: 'ngon', n: 6, sizeBy: 'diameter', size: 400 }, side, 100, 100)).toBeNull()
    }
  })

  it('폭·깊이는 1~5000으로 자르고 0.1cm로 반올림한다(−0 없음)', () => {
    const outer: ShapeTemplate = { kind: 'rect', w: 620, h: 320 }
    expect(attachedInner(outer, 'back', 0, 9999)).toMatchObject({ shape: { kind: 'rect', w: 1, h: 5000 } })
    const r = attachedInner(outer, 'back', 300.04, 220.06)
    expect(r).toMatchObject({ shape: { kind: 'rect', w: 300, h: 220.1 }, y: -49.9 })
    expect(Object.is(r?.x, -0)).toBe(false)
  })

  it('성질: 사각형 외곽의 벽에 붙인 이너는 그 벽 위에 한 변을 두고, 벽 안에 들어가면 이탈이 없다', () => {
    const tenth = (min: number, max: number) => fc.integer({ min: min * 10, max: max * 10 }).map((v) => v / 10)
    const arb = fc
      .record({ W: tenth(100, 1500), H: tenth(100, 1500), side: fc.constantFrom<AttachSide>('front', 'back', 'left', 'right') })
      .chain(({ W, H, side }) => {
        const along = side === 'front' || side === 'back' ? W : H
        const across = side === 'front' || side === 'back' ? H : W
        return fc.record({
          W: fc.constant(W),
          H: fc.constant(H),
          side: fc.constant(side),
          width: tenth(1, along),
          depth: tenth(1, across),
        })
      })
    fc.assert(
      fc.property(arb, ({ W, H, side, width, depth }) => {
        const placed = attachedInner({ kind: 'rect', w: W, h: H }, side, width, depth)
        if (placed === null) return false
        const ring = worldRing(placed)
        const xs = ring.map((p) => p[0])
        const ys = ring.map((p) => p[1])
        const wall = { back: Math.min(...ys) + H / 2, front: Math.max(...ys) - H / 2, left: Math.min(...xs) + W / 2, right: Math.max(...xs) - W / 2 }[side]
        expect(Math.abs(wall)).toBeLessThanOrEqual(0.1)
        const inner: Inner = { id: 'i', name: '이너 1', ...placed }
        expect(buildZones({ name: 't', outer: { kind: 'rect', w: W, h: H }, inners: [inner] }).innerEscapes).toEqual([])
        return true
      }),
      { numRuns: 60 },
    )
  })

  it('성질: 사다리꼴 앞·뒤 벽에 붙인 이너는 그 벽(수평) 위에 한 변을 두고 벽 중점에 가운데가 온다', () => {
    const tenth = (min: number, max: number) => fc.integer({ min: min * 10, max: max * 10 }).map((v) => v / 10)
    const arb = fc.record({
      front: tenth(50, 1500),
      back: tenth(50, 1500),
      depth: tenth(50, 1500),
      offset: tenth(-300, 300),
      side: fc.constantFrom<AttachSide>('front', 'back'),
      width: tenth(1, 400),
      depth2: tenth(1, 400),
    })
    fc.assert(
      fc.property(arb, ({ front, back, depth, offset, side, width, depth2 }) => {
        const tpl: ShapeTemplate = { kind: 'trapezoid', front, back, depth, offset }
        const shape = shapeFromTemplate(tpl)
        if (shape.kind !== 'polygon') return false
        const [bl, br, fr, fl] = shape.points as [Pt, Pt, Pt, Pt]
        const placed = attachedInner(tpl, side, width, depth2)
        if (placed === null) return false
        const ring = worldRing(placed)
        const ys = ring.map((p) => p[1])
        const wallY = side === 'back' ? bl[1] : fl[1]
        const edgeY = side === 'back' ? Math.min(...ys) : Math.max(...ys)
        expect(Math.abs(edgeY - wallY)).toBeLessThanOrEqual(0.1)
        const midX = side === 'back' ? (bl[0] + br[0]) / 2 : (fl[0] + fr[0]) / 2
        expect(Math.abs(placed.x - midX)).toBeLessThanOrEqual(0.05 + 1e-9)
        return true
      }),
      { numRuns: 60 },
    )
  })
})

describe('newInnerSide(§4.4-4 새 이너 한 변)', () => {
  it('min(200, 짧은 변 × 0.6)을 10cm로 반올림, 최소 10', () => {
    expect(newInnerSide({ kind: 'rect', w: 600, h: 300 })).toBe(180)
    expect(newInnerSide({ kind: 'rect', w: 400, h: 300 })).toBe(180)
    expect(newInnerSide({ kind: 'rect', w: 40, h: 40 })).toBe(20)
    expect(newInnerSide({ kind: 'rect', w: 1000, h: 800 })).toBe(200)
    expect(newInnerSide({ kind: 'rect', w: 500, h: 210 })).toBe(130)
    expect(newInnerSide({ kind: 'rect', w: 10, h: 10 })).toBe(10)
    expect(newInnerSide({ kind: 'rect', w: 5, h: 5 })).toBe(10)
  })

  it('원은 지름 × 지름 상자, 다각형은 꼭짓점 상자, 꼭짓점이 없으면 10', () => {
    expect(newInnerSide({ kind: 'circle', d: 300 })).toBe(180)
    expect(newInnerSide({ kind: 'polygon', points: [[0, 0], [500, 0], [500, 150], [0, 150]] })).toBe(90)
    expect(newInnerSide({ kind: 'polygon', points: [] })).toBe(10)
  })
})

describe('예시 모양 기본값(설계 §2.1)', () => {
  it('외곽: 사각형 400×300, 사다리꼴 400/300/300, 정6각형 지름 400, 원 400', () => {
    expect(defaultOuterTemplate('rect')).toEqual({ kind: 'rect', w: 400, h: 300 })
    expect(defaultOuterTemplate('trapezoid')).toEqual({ kind: 'trapezoid', front: 400, back: 300, depth: 300, offset: 0 })
    expect(defaultOuterTemplate('ngon')).toEqual({ kind: 'ngon', n: 6, sizeBy: 'diameter', size: 400 })
    expect(defaultOuterTemplate('circle')).toEqual({ kind: 'circle', d: 400 })
  })

  it('이너: s = newInnerSide(외곽), 사다리꼴 뒷변 = round10(0.7s)', () => {
    const outer: Shape = { kind: 'rect', w: 600, h: 300 }
    expect(newInnerSide(outer)).toBe(180)
    expect(defaultInnerTemplate('rect', outer)).toEqual({ kind: 'rect', w: 180, h: 180 })
    expect(defaultInnerTemplate('trapezoid', outer)).toEqual({ kind: 'trapezoid', front: 180, back: 130, depth: 180, offset: 0 })
    expect(defaultInnerTemplate('ngon', outer)).toEqual({ kind: 'ngon', n: 6, sizeBy: 'diameter', size: 180 })
    expect(defaultInnerTemplate('circle', outer)).toEqual({ kind: 'circle', d: 180 })
    expect(defaultInnerTemplate('trapezoid', { kind: 'rect', w: 10, h: 10 })).toMatchObject({ front: 10, back: 10 })
  })

  it('round10은 10cm 단위 반올림', () => {
    expect(round10(124)).toBe(120)
    expect(round10(125)).toBe(130)
    expect(round10(126)).toBe(130)
  })
})

describe('templateFromBBox(설계 §3 모양 바꾸기: 로컬 bbox w×h 이어받기)', () => {
  it('사각형 w×h, 사다리꼴 앞·뒤 w·깊이 h, 정6각형·원 지름 min(w,h)', () => {
    expect(templateFromBBox('rect', 300, 200)).toEqual({ kind: 'rect', w: 300, h: 200 })
    expect(templateFromBBox('trapezoid', 300, 200)).toEqual({ kind: 'trapezoid', front: 300, back: 300, depth: 200, offset: 0 })
    expect(templateFromBBox('ngon', 300, 200)).toEqual({ kind: 'ngon', n: 6, sizeBy: 'diameter', size: 200 })
    expect(templateFromBBox('circle', 300, 200)).toEqual({ kind: 'circle', d: 200 })
  })

  it('1~5000으로 자르고 0.1cm 반올림', () => {
    expect(templateFromBBox('rect', 0.04, 9000)).toEqual({ kind: 'rect', w: 1, h: 5000 })
    expect(templateFromBBox('rect', 300.04, 199.96)).toEqual({ kind: 'rect', w: 300, h: 200 })
  })
})

describe('attachBBoxToWall(설계 §2.4: 월드 bbox를 벽에 맞닿게, 벽 가운데로)', () => {
  const rect: ShapeTemplate = { kind: 'rect', w: 620, h: 320 }
  const bbox = { minX: 0, maxX: 100, minY: -30, maxY: 70 }

  it('사각형 외곽 네 벽', () => {
    expect(attachBBoxToWall(rect, bbox, 'back')).toEqual({ dx: -50, dy: -130 })
    expect(attachBBoxToWall(rect, bbox, 'front')).toEqual({ dx: -50, dy: 90 })
    expect(attachBBoxToWall(rect, bbox, 'left')).toEqual({ dx: -310, dy: -20 })
    expect(attachBBoxToWall(rect, bbox, 'right')).toEqual({ dx: 210, dy: -20 })
  })

  it('사다리꼴 offset 100의 뒷변 가운데(x 75, y −125)', () => {
    const trap: ShapeTemplate = { kind: 'trapezoid', front: 300, back: 200, depth: 250, offset: 100 }
    expect(attachBBoxToWall(trap, { minX: 0, maxX: 100, minY: 0, maxY: 50 }, 'back')).toEqual({ dx: 25, dy: -125 })
  })

  it('그 모양에 그 벽이 없으면 null', () => {
    const trap: ShapeTemplate = { kind: 'trapezoid', front: 300, back: 200, depth: 250, offset: 0 }
    expect(attachBBoxToWall(trap, bbox, 'left')).toBeNull()
    expect(attachBBoxToWall({ kind: 'circle', d: 400 }, bbox, 'back')).toBeNull()
    expect(attachBBoxToWall({ kind: 'ngon', n: 6, sizeBy: 'diameter', size: 400 }, bbox, 'front')).toBeNull()
  })
})
