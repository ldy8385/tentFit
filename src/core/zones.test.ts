import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { area, region, worldRing } from './geom'
import { MIN_PIECE_AREA, type Inner, type Pt, type Shape, type Tent } from './model'
import { buildZones, type Zones } from './zones'

// 골든 공통 조건(스펙 §13.2): 외곽 rect 600×300 @원점, 이너 rect 300×300 @(150,0)
const rect = (w: number, h: number): Shape => ({ kind: 'rect', w, h })
const inner = (id: string, w: number, h: number, x: number, y: number, rotation = 0, name = id): Inner => ({
  id,
  name,
  shape: rect(w, h),
  x,
  y,
  rotation,
})
const tent = (inners: Inner[], outer: Shape = rect(600, 300)): Tent => ({ name: '시험 텐트', outer, inners })

/** 배열 i번째 항목. 없으면 테스트를 바로 실패시킨다(non-null 단언 대신). */
function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i]
  if (v === undefined) throw new Error(`${i}번째 항목이 없음 (길이 ${arr.length})`)
  return v
}

/** 축에 나란한 골든의 허용 오차는 0.01cm²(스펙 §13.1) */
function near(actual: number | undefined, expected: number, tol = 0.01): void {
  expect(actual, `기댓값 ${expected} ±${tol}`).toBeTypeOf('number')
  expect(Math.abs((actual as number) - expected), `실제 ${actual}, 기댓값 ${expected} ±${tol}`).toBeLessThanOrEqual(tol)
}

function zoneSum(z: Zones): number {
  return z.inners.reduce((s, k) => s + k.area, 0) + z.floorArea
}

function labelOf(z: Zones, i: number): Pt {
  return at(z.pieces, i).label
}

describe('buildZones — 골든', () => {
  it('기본 텐트: 외곽 180,000 = 이너 90,000 + 전실 90,000, 조각 이름은 "전실 1"', () => {
    const z = buildZones(tent([inner('in1', 300, 300, 150, 0, 0, '이너 1')]))
    near(z.outerArea, 180000)
    expect(z.inners).toHaveLength(1)
    expect(z.inners[0]).toMatchObject({ innerId: 'in1', name: '이너 1' })
    near(z.inners[0]?.area, 90000)
    near(z.floorArea, 90000)
    expect(z.floorLabel).toBe('전실')
    expect(z.pieces.map((p) => [p.key, p.name])).toEqual([['piece-0', '전실 1']])
    near(z.pieces[0]?.area, 90000)
    expect(z.innerEscapes).toEqual([])
    // 라벨은 조각 안(x −300~0)
    const [lx, ly] = labelOf(z, 0)
    expect(lx).toBeGreaterThan(-300)
    expect(lx).toBeLessThan(0)
    expect(Math.abs(ly)).toBeLessThan(150)
    // 이너 라벨도 이너 안(x 0~300)
    const [ix] = at(z.inners, 0).label
    expect(ix).toBeGreaterThan(0)
    expect(ix).toBeLessThan(300)
  })

  it('이너 plus/minus는 구역을 ±0.5cm 오프셋한 것, outerPlus는 외곽 +0.5cm', () => {
    const z = buildZones(tent([inner('in1', 300, 300, 150, 0)]))
    const k = at(z.inners, 0)
    // 볼록 사각형을 안쪽으로 줄이면 모서리가 그대로 각진다: 299 × 299
    near(area(k.minus), 299 * 299)
    // 바깥으로 둥글게 늘이면 301×301에서 모서리 4개(1 − π/4)·0.25 ≈ 0.21만큼 빠진다
    expect(area(k.plus)).toBeGreaterThan(301 * 301 - 0.3)
    expect(area(k.plus)).toBeLessThan(301 * 301)
    expect(area(z.outerPlus)).toBeGreaterThan(601 * 301 - 0.3)
    expect(area(z.outerPlus)).toBeLessThan(601 * 301)
  })

  it('G5-a: 이너 200×300 @(0,0) → 전실 60,000 두 조각, 넓이 동률이면 x가 작은 왼쪽이 "전실 1"', () => {
    const z = buildZones(tent([inner('in1', 200, 300, 0, 0)]))
    near(z.inners[0]?.area, 60000)
    near(z.floorArea, 120000)
    expect(z.pieces.map((p) => p.name)).toEqual(['전실 1', '전실 2'])
    expect(z.pieces.map((p) => p.key)).toEqual(['piece-0', 'piece-1'])
    near(z.pieces[0]?.area, 60000)
    near(z.pieces[1]?.area, 60000)
    expect(labelOf(z, 0)[0]).toBeLessThan(-100)
    expect(labelOf(z, 1)[0]).toBeGreaterThan(100)
  })

  it('동률 규칙: 넓이가 같으면 무게중심 y가 작은(위쪽) 조각이 먼저', () => {
    const z = buildZones(tent([inner('band', 600, 100, 0, 0)]))
    expect(z.pieces.map((p) => p.name)).toEqual(['전실 1', '전실 2'])
    near(z.pieces[0]?.area, 60000)
    near(z.pieces[1]?.area, 60000)
    expect(labelOf(z, 0)[1]).toBeLessThan(-50)
    expect(labelOf(z, 1)[1]).toBeGreaterThan(50)
  })

  it('G5-b: 이너 100×300 두 개 @(−100,0), @(100,0) → 45,000 · 45,000 · 30,000', () => {
    const z = buildZones(tent([inner('a', 100, 300, -100, 0), inner('b', 100, 300, 100, 0)]))
    expect(z.inners.map((k) => k.innerId)).toEqual(['a', 'b'])
    near(z.inners[0]?.area, 30000)
    near(z.inners[1]?.area, 30000)
    expect(z.pieces.map((p) => p.name)).toEqual(['전실 1', '전실 2', '전실 3'])
    near(z.pieces[0]?.area, 45000)
    near(z.pieces[1]?.area, 45000)
    near(z.pieces[2]?.area, 30000)
    // 동률(45,000) 두 조각은 왼쪽(x −300~−150)이 먼저, 가운데 조각(x −50~50)이 마지막
    expect(labelOf(z, 0)[0]).toBeLessThan(-150)
    expect(labelOf(z, 1)[0]).toBeGreaterThan(150)
    expect(Math.abs(labelOf(z, 2)[0])).toBeLessThan(50)
  })

  it('G8: 이너 300×300 @(200,0) → 이너 75,000, 전실 105,000, 이너 이탈 1', () => {
    const z = buildZones(tent([inner('in1', 300, 300, 200, 0)]))
    near(z.inners[0]?.area, 75000)
    near(z.floorArea, 105000)
    expect(z.pieces).toHaveLength(1)
    near(z.pieces[0]?.area, 105000)
    expect(z.innerEscapes).toEqual(['in1'])
  })
})

describe('buildZones — 이너 0개(Review Focus 1)', () => {
  // 티피 6각: 지름 400, 아래 변 수평. 꼭짓점을 0.1cm로 맞춘 넓이 = 600 × 173.2 = 103,920
  const hexagon: Shape = {
    kind: 'polygon',
    points: [
      [200, 0],
      [100, 173.2],
      [-100, 173.2],
      [-200, 0],
      [-100, -173.2],
      [100, -173.2],
    ],
  }

  it('이너가 없으면 외곽 전체가 하나의 바닥 구역: "바닥 1", floorLabel "바닥"', () => {
    const z = buildZones(tent([], hexagon))
    expect(z.inners).toEqual([])
    expect(z.floorLabel).toBe('바닥')
    near(z.outerArea, 103920)
    near(z.floorArea, 103920)
    expect(z.pieces.map((p) => [p.key, p.name])).toEqual([['piece-0', '바닥 1']])
    near(z.pieces[0]?.area, 103920)
    expect(z.innerEscapes).toEqual([])
  })

  it('외곽과 전혀 안 겹치는 이너는 구역에서 빠지고(유효 이너 0개 → "바닥") 이탈로만 남는다', () => {
    const z = buildZones(tent([inner('far', 100, 100, 1000, 0)]))
    expect(z.inners).toEqual([])
    expect(z.floorLabel).toBe('바닥')
    expect(z.pieces.map((p) => p.name)).toEqual(['바닥 1'])
    near(z.floorArea, 180000)
    expect(z.innerEscapes).toEqual(['far'])
  })
})

describe('buildZones — 조각 규칙(Review Focus 2)', () => {
  it('섬 조각: 이너 4개가 둘러싼 섬은 별도 조각이고, 바깥 조각 넓이는 구멍을 빼고 센다', () => {
    const ring = [
      inner('top', 300, 50, 0, -75), // x −150~150, y −100~−50
      inner('bottom', 300, 50, 0, 75), // y 50~100
      inner('left', 50, 100, -125, 0), // x −150~−100, y −50~50
      inner('right', 50, 100, 125, 0), // x 100~150
    ]
    const z = buildZones(tent(ring))
    near(z.inners.reduce((s, k) => s + k.area, 0), 40000)
    near(z.floorArea, 140000)
    expect(z.pieces.map((p) => p.name)).toEqual(['전실 1', '전실 2'])
    // 바깥 조각 = 180,000 − 300×200 (이중 계산 없이)
    near(z.pieces[0]?.area, 120000)
    near(area(at(z.pieces, 0).region), 120000)
    // 섬 = 200 × 100
    near(z.pieces[1]?.area, 20000)
    near(area(at(z.pieces, 1).region), 20000)
    // 바깥 조각 라벨은 구멍(x −150~150) 밖, 섬 라벨은 섬 안
    expect(Math.abs(labelOf(z, 0)[0])).toBeGreaterThan(150)
    expect(Math.abs(labelOf(z, 1)[0])).toBeLessThan(100)
    expect(Math.abs(labelOf(z, 1)[1])).toBeLessThan(50)
  })

  it('100cm² 미만 조각은 이름·목록에서 빠지고 floorArea 합계에만 들어간다', () => {
    // 이너 a: x −150~50, 이너 b: x 50.3~300.3 → 사이에 0.3 × 300 = 90cm² 띠
    const z = buildZones(tent([inner('a', 200, 300, -50, 0), inner('b', 250, 300, 175.3, 0)]))
    expect(z.innerEscapes).toEqual([]) // b는 0.3cm만 나가므로 5mm 허용 안
    near(z.inners[0]?.area, 60000)
    near(z.inners[1]?.area, 249.7 * 300)
    expect(z.pieces.map((p) => p.name)).toEqual(['전실 1'])
    near(z.pieces[0]?.area, 45000)
    near(z.floorArea, 45000 + 90)
    expect(z.pieces.every((p) => p.area >= MIN_PIECE_AREA)).toBe(true)
  })
})

describe('buildZones — 이너 미세 겹침', () => {
  it('0.3cm 겹치면 배열 앞 이너가 겹친 부분을 갖고, 넓이 합 = 외곽', () => {
    const a = inner('a', 200, 300, -100, 0) // x −200~0
    const b = inner('b', 200, 300, 99.7, 0) // x −0.3~199.7
    const ab = buildZones(tent([a, b]))
    near(ab.inners[0]?.area, 60000)
    near(ab.inners[1]?.area, 199.7 * 300)
    near(zoneSum(ab), 180000)

    const ba = buildZones(tent([b, a]))
    expect(ba.inners.map((k) => k.innerId)).toEqual(['b', 'a'])
    near(ba.inners[0]?.area, 60000)
    near(ba.inners[1]?.area, 199.7 * 300)
    near(zoneSum(ba), 180000)
  })

  it('회전한 이너가 0.3cm 미만으로 파고들어도 넓이 합 = 외곽(±구역 수 × 1cm²)', () => {
    const a = inner('a', 200, 300, -100, 0) // x −200~0, 위아래 벽에 닿음
    const b = inner('b', 200, 296, 100, 0, 0.1) // 왼쪽 변이 x ≈ −0.26~0.26으로 기울어 a를 조금 파고듦
    const bArea = area(region(worldRing(b)))

    const ab = buildZones(tent([a, b]))
    near(ab.inners[0]?.area, 60000)
    expect(at(ab.inners, 1).area).toBeLessThan(bArea - 1)
    expect(Math.abs(zoneSum(ab) - 180000)).toBeLessThanOrEqual(ab.inners.length + ab.pieces.length)

    const ba = buildZones(tent([b, a]))
    near(ba.inners[0]?.area, bArea, 1)
    expect(at(ba.inners, 1).area).toBeLessThan(60000 - 1)
    expect(Math.abs(zoneSum(ba) - 180000)).toBeLessThanOrEqual(ba.inners.length + ba.pieces.length)
  })
})

describe('buildZones — 성질(fast-check)', () => {
  const tenth = (min: number, max: number): fc.Arbitrary<number> =>
    fc.integer({ min: min * 10, max: max * 10 }).map((v) => v / 10)
  const unit = fc.integer({ min: 0, max: 1000 }).map((v) => v / 1000)
  const r1 = (v: number): number => Math.round(v * 10) / 10

  /**
   * 이너 k개를 외곽 가로를 k칸으로 나눈 칸에 하나씩 둔다. 대각선이 칸 폭보다 짧아서
   * 어떻게 회전해도 서로 겹치지 않는다(유효한 텐트, 스펙 §5.3-4). y는 외곽 밖까지 흩어 이탈·잘림도 섞는다.
   */
  function slotInners(width: number, height: number, slots: { fw: number; fh: number; fy: number; rotation: number }[]): Inner[] {
    const slot = width / Math.max(1, slots.length)
    return slots.map((q, i) => {
      const diag = slot * 0.98
      const w = r1(Math.max(10, (0.2 + 0.8 * q.fw) * diag * 0.7))
      const h = r1(Math.max(10, Math.sqrt(Math.max(0, diag * diag - w * w)) * (0.2 + 0.8 * q.fh)))
      return inner(`in${i}`, w, h, r1(-width / 2 + (i + 0.5) * slot), r1((q.fy - 0.5) * height * 1.2), q.rotation)
    })
  }
  const slotArb = fc.record({
    fw: unit,
    fh: unit,
    fy: unit,
    rotation: fc.integer({ min: 0, max: 35999 }).map((v) => v / 100),
  })

  function checkPieces(z: Zones): void {
    z.pieces.forEach((p, i) => {
      expect(p.area).toBeGreaterThanOrEqual(MIN_PIECE_AREA)
      expect(p.name).toBe(`${z.floorLabel} ${i + 1}`)
      expect(p.key).toBe(`piece-${i}`)
      if (i > 0) expect(p.area).toBeLessThanOrEqual(at(z.pieces, i - 1).area)
    })
    expect(z.floorLabel).toBe(z.inners.length === 0 ? '바닥' : '전실')
    // 조각 넓이(PolyTree)와 floorArea(경로 넓이 합)는 clipper가 남긴 1단위 가시 때문에 조각마다 1cm² 안에서 다를 수 있다.
    expect(z.pieces.reduce((s, p) => s + p.area, 0)).toBeLessThanOrEqual(z.floorArea + Math.max(1, z.pieces.length))
  }

  /** 정N각형(지름 d, 아래 변 수평) 꼭짓점을 0.1cm로 맞춘 것 */
  function ngonPoints(n: number, d: number): Pt[] {
    return Array.from({ length: n }, (_, i) => {
      const t = Math.PI / 2 + Math.PI / n + (2 * Math.PI * i) / n
      return [r1((d / 2) * Math.cos(t)), r1((d / 2) * Math.sin(t))] as Pt
    })
  }
  /** 외곽 도형과 그 바운딩 박스 크기(이너 칸 나누기용) */
  const outerArb: fc.Arbitrary<{ outer: Shape; w: number; h: number }> = fc.oneof(
    fc.record({ w: tenth(200, 1000), h: tenth(200, 800) }).map(({ w, h }) => ({ outer: rect(w, h), w, h })),
    tenth(200, 1000).map((d) => ({ outer: { kind: 'circle', d } as Shape, w: d, h: d })),
    fc.record({ f: tenth(200, 900), b: tenth(100, 900), d: tenth(200, 700), off: tenth(-100, 100) }).map(({ f, b, d, off }) => {
      const points: Pt[] = [
        [r1(-f / 2), r1(d / 2)],
        [r1(f / 2), r1(d / 2)],
        [r1(off + b / 2), r1(-d / 2)],
        [r1(off - b / 2), r1(-d / 2)],
      ]
      const xs = points.map((q) => q[0])
      return { outer: { kind: 'polygon', points } as Shape, w: Math.max(...xs) - Math.min(...xs), h: d }
    }),
    fc.record({ n: fc.integer({ min: 5, max: 12 }), d: tenth(200, 800) }).map(({ n, d }) => ({
      outer: { kind: 'polygon', points: ngonPoints(n, d) } as Shape,
      w: d,
      h: d,
    })),
  )

  it('구역 넓이 합 = 외곽 넓이(±구역 수 × 1cm², 스펙 §13.1·§13.3) — 사각형·원·사다리꼴·정N각형 외곽', () => {
    fc.assert(
      fc.property(outerArb, fc.array(slotArb, { maxLength: 4 }), ({ outer, w, h }, slots) => {
        const z = buildZones(tent(slotInners(w, h, slots), outer))
        const zoneCount = z.inners.length + Math.max(1, z.pieces.length)
        expect(Math.abs(zoneSum(z) - z.outerArea)).toBeLessThanOrEqual(zoneCount * 1)
        expect(z.floorArea).toBeGreaterThanOrEqual(0)
        z.inners.forEach((k) => expect(k.area).toBeGreaterThanOrEqual(0))
        checkPieces(z)
      }),
      { numRuns: 200 },
    )
  })
})

describe('buildZones — 기울어진 벽 회귀', () => {
  it('기울어진 외곽 벽을 가로지르는 회전 이너: 전실 조각 넓이 = floorArea, 이너 + 전실 = 외곽', () => {
    // 외곽 변과 이너 변의 교차점을 따로 반올림하면 벽에서 0.01cm 떨어진 가짜 구멍이 생기고,
    // PolyTree가 그 구멍을 부모 밑에 넣지 못해 조각 넓이가 이너만큼 부풀던 경우(fast-check 반례).
    const outer: Shape = {
      kind: 'polygon',
      points: [
        [-209.6, 113.9],
        [209.6, 113.9],
        [-25.7, -113.9],
        [-125.7, -113.9],
      ],
    }
    const z = buildZones(tent([inner('slant', 71.5, 15.6, -157.2, 1.1, 137.43)], outer))
    expect(z.inners).toHaveLength(1)
    expect(z.innerEscapes).toEqual(['slant']) // 일부가 왼쪽 벽 밖으로 나감
    const innerArea = at(z.inners, 0).area
    expect(innerArea).toBeGreaterThan(800)
    expect(innerArea).toBeLessThan(71.5 * 15.6)
    expect(Math.abs(zoneSum(z) - z.outerArea)).toBeLessThanOrEqual(2)
    expect(z.pieces.map((p) => p.name)).toEqual(['전실 1'])
    near(z.pieces[0]?.area, z.floorArea, 1)
    near(z.pieces[0]?.area, z.outerArea - innerArea, 2)
  })
})
