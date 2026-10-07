import { describe, expect, it } from 'vitest'
import {
  EMPTY_REGION,
  SCALE,
  area,
  circleRing,
  circleSegments,
  inflate,
  intersect,
  labelPoint,
  outerRing,
  pieces,
  pointInRing,
  region,
  regionOf,
  regionRings,
  ringArea,
  ringBBox,
  ringSelfIntersects,
  shapeRing,
  subtract,
  transformRing,
  unionAll,
  worldRing,
} from './geom'
import type { Region } from './geom'
import type { Pt } from './model'

// 스펙 §13.2 공통 조건: 외곽 rect 600×300 @원점(180,000cm²), 이너 rect 300×300 @(150,0), 매트 200×60
const rectAt = (w: number, h: number, x: number, y: number, rotation = 0): Region =>
  region(worldRing({ shape: { kind: 'rect', w, h }, x, y, rotation }))
const O = region(outerRing({ outer: { kind: 'rect', w: 600, h: 300 } }))
const INNER = rectAt(300, 300, 150, 0)
const mat = (x: number, y: number, rotation = 0): Region => rectAt(200, 60, x, y, rotation)

/** |actual − expected| ≤ tol */
function near(actual: number, expected: number, tol: number): void {
  expect(actual).toBeGreaterThanOrEqual(expected - tol)
  expect(actual).toBeLessThanOrEqual(expected + tol)
}

// ㄷ자(아래가 열린) 외곽: 무게중심 (0, −40)이 오목한 홈 안(바깥)에 떨어진다
const U_RING: Pt[] = [
  [-300, -150],
  [300, -150],
  [300, 150],
  [200, 150],
  [200, -50],
  [-200, -50],
  [-200, 150],
  [-300, 150],
]

describe('상수와 빈 영역', () => {
  it('SCALE은 100(1cm = 100 정수 단위)', () => {
    expect(SCALE).toBe(100)
  })

  it('빈 영역은 넓이 0, 조각 없음, 라벨 [0,0], 고리 없음', () => {
    expect(area(EMPTY_REGION)).toBe(0)
    expect(pieces(EMPTY_REGION)).toEqual([])
    expect(labelPoint(EMPTY_REGION)).toEqual([0, 0])
    expect(regionRings(EMPTY_REGION)).toEqual([])
    expect(area(unionAll([]))).toBe(0)
    expect(area(intersect(O, EMPTY_REGION))).toBe(0)
    expect(area(subtract(O, EMPTY_REGION))).toBe(180000)
    expect(area(subtract(EMPTY_REGION, O))).toBe(0)
    expect(area(inflate(EMPTY_REGION, 0.5))).toBe(0)
  })

  it('넓이 0인 고리·꼭짓점 2개 고리는 빈 영역', () => {
    expect(area(region([[0, 0], [100, 0], [200, 0]]))).toBe(0)
    expect(area(region([[0, 0], [100, 0]]))).toBe(0)
    expect(pieces(region([[0, 0], [100, 0], [200, 0]]))).toEqual([])
  })

  it('연속 중복점이 있어도 넓이는 같다', () => {
    expect(area(region([[0, 0], [0, 0], [100, 0], [100, 100], [100, 100], [0, 100], [0, 0]]))).toBe(10000)
  })

  it('유한하지 않은 좌표는 RangeError', () => {
    expect(() => region([[0, 0], [Number.NaN, 0], [0, 10]])).toThrow(RangeError)
  })
})

describe('원 근사(§6.2, G4)', () => {
  it('꼭짓점 수 N = max(16, ceil(π / acos(1 − 0.1/r)))', () => {
    expect(circleSegments(0.5)).toBe(16)
    expect(circleSegments(20)).toBe(32)
    expect(circleSegments(200)).toBe(100)
    expect(circleSegments(250)).toBe(112)
    expect(circleSegments(2500)).toBe(352)
    expect(circleRing(250)).toHaveLength(112)
  })

  it('G4: 원 d=500 → 196,349.54cm²(±1), d=40·d=400도 πr²(±1)', () => {
    near(area(region(circleRing(250))), 196349.54, 1)
    near(area(region(circleRing(20))), Math.PI * 20 * 20, 1)
    near(area(region(circleRing(200))), Math.PI * 200 * 200, 1)
    near(area(region(outerRing({ outer: { kind: 'circle', d: 500 } }))), 196349.54, 1)
  })

  it('중심을 옮겨도 넓이는 같고 바운딩 박스 중심이 그 점이다', () => {
    const ring = circleRing(20, 100, -50)
    near(area(region(ring)), Math.PI * 400, 1)
    const b = ringBBox(ring)
    near((b.minX + b.maxX) / 2, 100, 0.05)
    near((b.minY + b.maxY) / 2, -50, 0.05)
  })

  it('원 물건은 회전을 무시하고 중심만 옮긴다', () => {
    expect(worldRing({ shape: { kind: 'circle', d: 40 }, x: 10, y: 20, rotation: 33 })).toEqual(circleRing(20, 10, 20))
  })
})

describe('도형과 좌표 변환', () => {
  it('rect 로컬 고리는 중심이 원점', () => {
    expect(shapeRing({ kind: 'rect', w: 200, h: 60 })).toEqual([
      [-100, -30],
      [100, -30],
      [100, 30],
      [-100, 30],
    ])
  })

  it('polygon 로컬 고리는 복사본', () => {
    const points: Pt[] = [
      [0, 0],
      [10, 0],
      [0, 10],
    ]
    const ring = shapeRing({ kind: 'polygon', points })
    expect(ring).toEqual(points)
    expect(ring).not.toBe(points)
    expect(ring[0]).not.toBe(points[0])
  })

  it('90° 회전은 시계 방향(y 아래)이고 정확하다', () => {
    expect(transformRing([[10, 0], [0, 5]], 100, 200, 90)).toEqual([
      [100, 210],
      [95, 200],
    ])
    expect(transformRing([[10, 0], [0, 5]], 0, 0, -90)).toEqual([
      [0, -10],
      [5, 0],
    ])
    expect(transformRing([[1, 0]], 0, 0, 450)).toEqual([[0, 1]])
  })

  it('180° 회전 결과에 -0이 남지 않는다', () => {
    const [p] = transformRing([[0, 0]], 0, 0, 180)
    expect(Object.is(p?.[0], -0)).toBe(false)
    expect(Object.is(p?.[1], -0)).toBe(false)
  })

  it('33° 회전', () => {
    const [p] = transformRing([[100, 0]], 0, 0, 33)
    expect(p?.[0]).toBeCloseTo(83.867, 3)
    expect(p?.[1]).toBeCloseTo(54.464, 3)
  })

  it('worldRing = 회전 후 이동', () => {
    expect(worldRing({ shape: { kind: 'rect', w: 200, h: 60 }, x: 10, y: 20, rotation: 90 })).toEqual([
      [40, -80],
      [40, 120],
      [-20, 120],
      [-20, -80],
    ])
  })
})

describe('원시 골든(스펙 §13.2를 다각형 연산으로)', () => {
  it('외곽 넓이 180,000', () => {
    expect(area(O)).toBe(180000)
  })

  it('G1: 맞닿은 매트 2장 합집합 = 24,000', () => {
    near(area(unionAll([mat(0, -30), mat(0, 30)])), 24000, 0.01)
  })

  it('G1 회전판: 33° 회전 후 맞닿은 두 장 = 24,000(±2)', () => {
    const t = (33 * Math.PI) / 180
    const a = mat(30 * Math.sin(t), -30 * Math.cos(t), 33)
    const b = mat(-30 * Math.sin(t), 30 * Math.cos(t), 33)
    near(area(unionAll([a, b])), 24000, 2)
  })

  it('G2: 매트 @(0,0) → 이너 쪽 6,000 / 나머지 6,000', () => {
    near(area(intersect(mat(0, 0), INNER)), 6000, 0.01)
    near(area(subtract(mat(0, 0), INNER)), 6000, 0.01)
  })

  it.each([
    // x, area(P ∩ I⁻), area((P ∩ O) − I⁺)
    [100, 11970, 0],
    [-100, 0, 11970],
    [99.6, 11946, 0],
    [99.4, 11934, 6],
  ])('G3: 매트 @(%d,0) → P∩I⁻ = %d, (P∩O)−I⁺ = %d', (x, inMinus, outPlus) => {
    const p = mat(x, 0)
    near(area(intersect(p, inflate(INNER, -0.5))), inMinus, 0.01)
    near(area(subtract(intersect(p, O), inflate(INNER, 0.5))), outPlus, 0.01)
  })

  it('G5: 이너 200×300 @(0,0) → 60,000 두 조각, 동률은 x가 작은 쪽이 먼저', () => {
    const ps = pieces(subtract(O, rectAt(200, 300, 0, 0)))
    expect(ps.map((p) => p.area)).toEqual([60000, 60000])
    expect(ps.map((p) => p.centroid)).toEqual([
      [-200, 0],
      [200, 0],
    ])
  })

  it('G5: 이너 100×300 두 개 @(±100,0) → 45,000 · 45,000 · 30,000', () => {
    const ps = pieces(subtract(O, unionAll([rectAt(100, 300, -100, 0), rectAt(100, 300, 100, 0)])))
    expect(ps.map((p) => p.area)).toEqual([45000, 45000, 30000])
    expect(ps.map((p) => p.centroid)).toEqual([
      [-225, 0],
      [225, 0],
      [0, 0],
    ])
  })

  it('G8: 이너 300×300 @(200,0) ∩ 외곽 = 75,000', () => {
    near(area(intersect(rectAt(300, 300, 200, 0), O)), 75000, 0.01)
  })

  it('G9: 방향이 반대인 100×100 두 개 @(−25,0)·@(25,0) → 합집합 15,000', () => {
    const a = worldRing({ shape: { kind: 'rect', w: 100, h: 100 }, x: -25, y: 0, rotation: 0 })
    const b = worldRing({ shape: { kind: 'rect', w: 100, h: 100 }, x: 25, y: 0, rotation: 0 }).reverse()
    expect(area(region(b))).toBe(10000)
    near(area(regionOf([a, b])), 15000, 0.01)
    near(area(unionAll([region(a), region(b)])), 15000, 0.01)
  })

  it('G10: 매트 @(250,0) − O⁺ = 2,970 (x 300.5~350: 49.5×60)', () => {
    near(area(subtract(mat(250, 0), inflate(O, 0.5))), 2970, 0.01)
  })
})

describe('조각(§6.3): 구멍과 섬', () => {
  // 200×200 테두리(두께 20)를 이너 4개로 만든다 → 가운데 160×160 섬
  const frame = unionAll([
    rectAt(200, 20, 0, -90),
    rectAt(200, 20, 0, 90),
    rectAt(20, 160, -90, 0),
    rectAt(20, 160, 90, 0),
  ])
  const floor = subtract(O, frame)

  it('섬은 별도 조각이고 넓이를 이중으로 세지 않는다', () => {
    expect(area(frame)).toBe(14400)
    expect(area(floor)).toBe(165600)
    const ps = pieces(floor)
    expect(ps.map((p) => p.area)).toEqual([140000, 25600])
    expect(ps[0]?.area ?? 0).toBe(180000 - 40000)
    expect((ps[0]?.area ?? 0) + (ps[1]?.area ?? 0)).toBe(area(floor))
    expect(regionRings(ps[0]?.region ?? EMPTY_REGION)).toHaveLength(2) // 바깥 + 구멍
    expect(regionRings(ps[1]?.region ?? EMPTY_REGION)).toHaveLength(1)
    expect(ps.map((p) => p.centroid)).toEqual([
      [0, 0],
      [0, 0],
    ])
  })

  it('조각 Region은 다른 연산에 그대로 쓸 수 있다', () => {
    const island = pieces(floor)[1]?.region ?? EMPTY_REGION
    near(area(intersect(island, mat(0, 0))), 160 * 60, 0.01)
    const ring = pieces(floor)[0]?.region ?? EMPTY_REGION
    near(area(intersect(ring, mat(0, 0))), 0, 0.01)
  })

  it('구멍이 있는 영역을 넓히면 바깥은 커지고 구멍은 줄어든다', () => {
    // 바깥 201×201(모서리 둥긂) − 구멍 159×159 = 40,400.785 − 25,281
    near(area(inflate(frame, 0.5)), 15119.785, 0.5)
  })
})

describe('inflate', () => {
  const sq = rectAt(100, 100, 0, 0)

  it('+10cm: 100² + 4·100·10 + π·10² (±1)', () => {
    near(area(inflate(sq, 10)), 14314.16, 1)
  })

  it('−10cm: 80×80 = 6,400', () => {
    near(area(inflate(sq, -10)), 6400, 0.01)
  })

  it('0cm는 그대로', () => {
    expect(area(inflate(sq, 0))).toBe(10000)
  })
})

describe('labelPoint(polylabel)', () => {
  it('직사각형은 중심', () => {
    const [x, y] = labelPoint(O)
    near(x, 0, 1)
    near(y, 0, 1)
  })

  it('ㄷ자 외곽: 무게중심은 바깥이지만 라벨은 안쪽', () => {
    const u = region(U_RING)
    expect(area(u)).toBe(100000)
    const c = pieces(u)[0]?.centroid ?? [0, 0]
    expect(c).toEqual([0, -40])
    expect(pointInRing(c, U_RING)).toBe(false)
    expect(pointInRing(labelPoint(u), U_RING)).toBe(true)
  })

  it('여러 조각이면 가장 큰 조각 안', () => {
    const two = unionAll([rectAt(100, 100, -200, 0), rectAt(300, 200, 200, 0)])
    const p = labelPoint(two)
    expect(pointInRing(p, worldRing({ shape: { kind: 'rect', w: 300, h: 200 }, x: 200, y: 0, rotation: 0 }))).toBe(true)
  })
})

describe('clipper2-ts 이슈 #36 회귀(되접힌 수평 변 → 무한 반복)', () => {
  // 이슈 본문의 고리(정수 단위)를 y −2,460,000 옮겨 cm로 바꾼 것. 정리 없이 union하면 힙이 고갈된다.
  const ring: Pt[] = [
    [7612.06, 30.86],
    [7612.52, 30.86],
    [7612.58, 30.86],
    [7612.09, 30.87],
    [7612.13, 30.87],
    [7612.81, 30.86],
    [7613.23, 30.86],
    [7613.68, 30.86],
  ]

  it('region이 끝나고 넓이 13.5단위²(= 0.00135cm²)', () => {
    expect(area(region(ring))).toBeCloseTo(0.00135, 6)
  })

  it('그 영역을 다른 연산에 넣어도 끝난다', () => {
    const r = region(ring)
    const big = region([
      [7000, 0],
      [8000, 0],
      [8000, 100],
      [7000, 100],
    ])
    near(area(subtract(big, r)), 100000 - 0.00135, 0.0001)
    near(area(unionAll([big, r])), 100000, 0.0001)
    expect(area(inflate(r, 0.5))).toBeGreaterThan(1)
  })

  it('큰 고리 안의 되접힌 수평 뾰족점도 정리된다', () => {
    const spiky: Pt[] = [
      [0, 0],
      [100, 0],
      [100, 50],
      [160, 50],
      [120, 50],
      [100, 50.5],
      [100, 100],
      [0, 100],
    ]
    near(area(region(spiky)), 10005, 0.01)
  })
})

describe('cm 고리 보조 함수', () => {
  it('ringArea는 방향과 무관한 절댓값', () => {
    const tri: Pt[] = [
      [0, 0],
      [4, 0],
      [0, 3],
    ]
    expect(ringArea(tri)).toBe(6)
    expect(ringArea([...tri].reverse())).toBe(6)
    expect(ringArea(U_RING)).toBe(100000)
  })

  it('ringBBox', () => {
    expect(ringBBox(U_RING)).toEqual({ minX: -300, minY: -150, maxX: 300, maxY: 150 })
    expect(ringBBox([])).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 })
  })

  it('regionRings는 cm 고리', () => {
    const rings = regionRings(intersect(mat(0, 0), INNER))
    expect(rings).toHaveLength(1)
    expect(ringBBox(rings[0] ?? [])).toEqual({ minX: 0, minY: -30, maxX: 100, maxY: 30 })
    expect(ringArea(rings[0] ?? [])).toBe(6000)
  })

  it.each<[string, Pt[], boolean]>([
    ['나비 모양', [[0, 0], [100, 100], [100, 0], [0, 100]], true],
    ['사각형', [[0, 0], [100, 0], [100, 100], [0, 100]], false],
    ['ㄷ자', U_RING, false],
    ['삼각형', [[0, 0], [100, 0], [0, 100]], false],
    ['꼭짓점이 다른 변에 닿음', [[0, 0], [100, 0], [100, 100], [50, 0], [0, 100]], true],
    ['되접힘(180° 꺾임)', [[0, 0], [100, 0], [50, 0], [50, 50]], true],
    ['연속 중복점', [[0, 0], [0, 0], [100, 0], [100, 100]], false],
  ])('ringSelfIntersects: %s → %s', (_name, ring, expected) => {
    expect(ringSelfIntersects(ring)).toBe(expected)
  })

  it.each<[Pt, boolean]>([
    [[0, 0], true],
    [[301, 0], false],
    [[300, 0], true], // 경계 위는 안
    [[-300, -150], true], // 꼭짓점
  ])('pointInRing(%j, 600×300 외곽) → %s', (p, expected) => {
    expect(pointInRing(p, outerRing({ outer: { kind: 'rect', w: 600, h: 300 } }))).toBe(expected)
  })

  it.each<[Pt, boolean]>([
    [[0, 50], false], // 홈
    [[0, -100], true], // 윗변 띠
    [[250, 100], true], // 다리
    [[0, 200], false], // 바깥
  ])('pointInRing(%j, ㄷ자) → %s', (p, expected) => {
    expect(pointInRing(p, U_RING)).toBe(expected)
  })
})

describe('리뷰 회귀: pieces()가 음수 넓이 최상위 노드를 구멍으로 붙임', () => {
  it('사다리꼴 − 기울어진 이너: 조각 넓이 합 = area(V), 조각 1개', async () => {
    const { shapeFromTemplate } = await import('./templates')
    const outer = shapeRing(shapeFromTemplate({ kind: 'trapezoid', front: 500, back: 200, depth: 260, offset: -40 }))
    const O = region(outer)
    const I = intersect(region(worldRing({ shape: { kind: 'rect', w: 84.8, h: 69.4 }, x: -178.9, y: 51, rotation: 292.93 })), O)
    const V = subtract(O, I)
    const ps = pieces(V)
    const sum = ps.reduce((s, p) => s + p.area, 0)
    expect(Math.abs(sum - area(V))).toBeLessThan(1)
    expect(ps).toHaveLength(1)
  })
})
