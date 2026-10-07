import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { area, intersect, region, subtract, worldRing } from './geom'
import {
  EPS_AREA,
  createLayout,
  type Inner,
  type Item,
  type ItemCategory,
  type Layout,
  type Pt,
  type Shape,
  type Tent,
} from './model'
import {
  computeStats,
  formatM2,
  formatPercent,
  itemWarnings,
  itemZoneAreas,
  percentOf,
  type ItemZoneArea,
  type StatRow,
  type Stats,
} from './stats'
import { buildZones } from './zones'

// 골든 공통 조건(스펙 §13.2): 외곽 rect 600×300 @원점, 이너 rect 300×300 @(150,0)(오른쪽 벽 공유), 매트 200×60
const rect = (w: number, h: number): Shape => ({ kind: 'rect', w, h })
const inner = (id: string, w: number, h: number, x: number, y: number, name = id): Inner => ({
  id,
  name,
  shape: rect(w, h),
  x,
  y,
  rotation: 0,
})
const tent = (inners: Inner[], outer: Shape = rect(600, 300)): Tent => ({ name: '시험 텐트', outer, inners })
const baseTent = (): Tent => tent([inner('in1', 300, 300, 150, 0, '이너 1')])

function item(
  id: string,
  shape: Shape,
  x: number,
  y: number,
  opts: { rotation?: number; countsArea?: boolean; category?: ItemCategory } = {},
): Item {
  return {
    id,
    name: id,
    shape,
    x,
    y,
    rotation: opts.rotation ?? 0,
    color: 'green',
    category: opts.category ?? 'MAT',
    countsArea: opts.countsArea ?? true,
  }
}
const mat = (id: string, x: number, y: number, rotation = 0): Item => item(id, rect(200, 60), x, y, { rotation })

function layoutOf(t: Tent, items: Item[]): Layout {
  return { ...createLayout(t, { name: '시험 배치', id: 'layout-1', now: '2026-10-07T00:00:00.000Z' }), items }
}

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

function expectRow(r: StatRow | undefined, want: { key: string; name: string; area: number; occupied: number; percent: number | null }): void {
  expect(r).toBeDefined()
  const row = r as StatRow
  expect(row.key).toBe(want.key)
  expect(row.name).toBe(want.name)
  near(row.area, want.area)
  near(row.occupied, want.occupied)
  near(row.free, want.area - want.occupied)
  expect(row.percent).toBe(want.percent)
}

function allRows(s: Stats): StatRow[] {
  return [...s.inners, ...s.pieces, s.totalInner, s.totalFloor, s.totalTent]
}

/** 고리 둘레(cm). 성질 테스트의 반올림 허용 오차 계산용 */
function ringPerimeter(ring: Pt[]): number {
  return ring.reduce((acc, p, i) => {
    const q = at(ring, (i + 1) % ring.length)
    return acc + Math.hypot(q[0] - p[0], q[1] - p[1])
  }, 0)
}

describe('itemWarnings — 골든', () => {
  const zones = buildZones(baseTent())

  it('G2: 매트 @(0,0)은 이너 벽에 걸침, 나감 아님', () => {
    expect(itemWarnings(worldRing(mat('m', 0, 0)), true, zones)).toEqual({ outside: false, straddles: ['in1'] })
  })

  it.each([
    { x: 100, straddles: [] as string[] },
    { x: -100, straddles: [] as string[] },
    { x: 99.6, straddles: [] as string[] },
    { x: 99.4, straddles: ['in1'] },
  ])('G3: 매트 @($x,0) → 걸침 $straddles', ({ x, straddles }) => {
    expect(itemWarnings(worldRing(mat('m', x, 0)), true, zones)).toEqual({ outside: false, straddles })
  })

  it('G3: @(99.4,0)의 (P∩O)−I⁺ 넓이는 6cm², @(99.6,0)은 0', () => {
    const k = at(zones.inners, 0)
    const leftover = (x: number): number =>
      area(subtract(intersect(region(worldRing(mat('m', x, 0))), zones.outer), k.plus))
    near(leftover(99.4), 6)
    near(leftover(99.6), 0)
  })

  it('G10: 오른쪽 벽 공유 구간의 매트 @(250,0) → 나감 1, 걸침 0, 나간 넓이 2,970', () => {
    const ring = worldRing(mat('m', 250, 0))
    expect(itemWarnings(ring, true, zones)).toEqual({ outside: true, straddles: [] })
    near(area(subtract(region(ring), zones.outerPlus)), 2970)
  })

  it('O1: 이너와 전실에 걸쳐 깐 깔개(countsArea=false)는 걸침 경고 없음, 같은 도형도 countsArea=true면 걸침', () => {
    const rug = worldRing(item('rug', rect(300, 200), 0, 0, { countsArea: false, category: 'RUG' }))
    expect(itemWarnings(rug, false, zones)).toEqual({ outside: false, straddles: [] })
    expect(itemWarnings(rug, true, zones)).toEqual({ outside: false, straddles: ['in1'] })
  })

  it('깔개도 밖으로 나가면 나감 경고는 뜬다', () => {
    const rug = worldRing(item('rug', rect(300, 200), -250, 0, { countsArea: false, category: 'RUG' }))
    expect(itemWarnings(rug, false, zones)).toEqual({ outside: true, straddles: [] })
  })

  it('나감과 걸침이 동시에 뜰 수 있다(세운 매트가 아래 벽을 뚫고 이너 벽에 걸침)', () => {
    // 90° 회전한 200×60 매트 @(0,150): x −30~30, y 50~250
    expect(itemWarnings(worldRing(mat('m', 0, 150, 90)), true, zones)).toEqual({ outside: true, straddles: ['in1'] })
  })
})

describe('computeStats — 골든', () => {
  it('G2: 이너 6,000 / 전실 6,000, 걸침 1, 합계 행 이름·키', () => {
    const s = computeStats(layoutOf(baseTent(), [mat('m1', 0, 0)]))
    expectRow(s.inners[0], { key: 'in1', name: '이너 1', area: 90000, occupied: 6000, percent: 6 })
    expectRow(s.pieces[0], { key: 'piece-0', name: '전실 1', area: 90000, occupied: 6000, percent: 6 })
    expectRow(s.totalInner, { key: 'total-inner', name: '이너 전체', area: 90000, occupied: 6000, percent: 6 })
    expectRow(s.totalFloor, { key: 'total-floor', name: '전실 전체', area: 90000, occupied: 6000, percent: 6 })
    expectRow(s.totalTent, { key: 'total-tent', name: '텐트 전체', area: 180000, occupied: 12000, percent: 6 })
    expect(s.warnings).toEqual({ m1: { outside: false, straddles: ['in1'] } })
    expect(s.innerEscapes).toEqual([])
    expect(s.warningCount).toBe(1)
  })

  it('G1: 맞닿은 매트 2장 점유 24,000, 33° 회전판도 24,000(±2)', () => {
    const flat = computeStats(layoutOf(baseTent(), [mat('a', 0, -30), mat('b', 0, 30)]))
    near(flat.totalTent.occupied, 24000)

    const t = (33 * Math.PI) / 180
    const n: Pt = [-Math.sin(t) * 30, Math.cos(t) * 30] // 긴 변의 법선 방향으로 ±30
    const turned = computeStats(layoutOf(baseTent(), [mat('a', -n[0], -n[1], 33), mat('b', n[0], n[1], 33)]))
    near(turned.totalTent.occupied, 24000, 2)
  })

  it('G7: 러그(countsArea=false) 위 매트 → 점유 12,000(러그 제외), 경고 0', () => {
    const rug = item('rug', rect(300, 200), -150, 0, { countsArea: false, category: 'RUG' })
    const s = computeStats(layoutOf(baseTent(), [rug, mat('m1', -150, 0)]))
    near(s.totalTent.occupied, 12000)
    near(s.pieces[0]?.occupied, 12000)
    near(s.inners[0]?.occupied, 0)
    expect(s.warnings).toEqual({})
    expect(s.warningCount).toBe(0)
  })

  it('G7(O1): 이너와 전실에 걸쳐 깐 러그만 있으면 점유 0, 경고 0', () => {
    const rug = item('rug', rect(300, 200), 0, 0, { countsArea: false, category: 'RUG' })
    const s = computeStats(layoutOf(baseTent(), [rug]))
    near(s.totalTent.occupied, 0)
    expect(s.totalTent.percent).toBe(0)
    expect(s.warnings).toEqual({})
    expect(s.warningCount).toBe(0)
  })

  it('G9: 방향이 반대인 100×100 두 개 @(−25,0), @(25,0) → 점유 15,000', () => {
    const cw: Pt[] = [
      [-50, -50],
      [50, -50],
      [50, 50],
      [-50, 50],
    ]
    const ccw: Pt[] = [...cw].reverse()
    const s = computeStats(
      layoutOf(baseTent(), [
        item('a', { kind: 'polygon', points: cw }, -25, 0),
        item('b', { kind: 'polygon', points: ccw }, 25, 0),
      ]),
    )
    near(s.totalTent.occupied, 15000)
    near(s.inners[0]?.occupied, 7500) // x 0~75
    near(s.pieces[0]?.occupied, 7500) // x −75~0
  })

  it('G10: 밖으로 나간 부분은 어느 구역에도 안 들어감 → 점유 9,000, 나감 1', () => {
    const s = computeStats(layoutOf(baseTent(), [mat('m1', 250, 0)]))
    near(s.totalTent.occupied, 9000) // x 150~300만
    near(s.inners[0]?.occupied, 9000)
    near(s.pieces[0]?.occupied, 0)
    expect(s.warnings).toEqual({ m1: { outside: true, straddles: [] } })
    expect(s.warningCount).toBe(1)
  })

  it('G8: 이너 이탈은 경고 수에 더해지고, 나감·걸침이 동시에 뜬 물건은 1개로 센다', () => {
    // 이너 구역은 x 50~300. m1 @(0,0): x −100~100 → 이너에 50×60 = 3,000, 벽 x=50에 걸침
    // m2 = 세운 매트 @(60,150): x 30~90, y 50~250 → 아래 벽 밖으로 나가고, 이너에 40×100 = 4,000 걸침
    const t = tent([inner('in1', 300, 300, 200, 0)])
    const s = computeStats(layoutOf(t, [mat('m1', 0, 0), mat('m2', 60, 150, 90)]))
    // 7,000 / 75,000 = 9.3% → 9
    expectRow(s.inners[0], { key: 'in1', name: 'in1', area: 75000, occupied: 7000, percent: 9 })
    expect(s.innerEscapes).toEqual(['in1'])
    expect(s.warnings).toEqual({
      m1: { outside: false, straddles: ['in1'] },
      m2: { outside: true, straddles: ['in1'] },
    })
    expect(s.warningCount).toBe(3)
  })

  it('G5-b: 이너 행은 이너 순서·이름, 조각 행은 "전실 n" 순서', () => {
    const t = tent([inner('a', 100, 300, -100, 0, '앞 이너'), inner('b', 100, 300, 100, 0, '뒤 이너')])
    const s = computeStats(layoutOf(t, [mat('m1', -200, 0)]))
    expect(s.inners.map((r) => [r.key, r.name])).toEqual([
      ['a', '앞 이너'],
      ['b', '뒤 이너'],
    ])
    expect(s.pieces.map((r) => [r.key, r.name])).toEqual([
      ['piece-0', '전실 1'],
      ['piece-1', '전실 2'],
      ['piece-2', '전실 3'],
    ])
    near(s.totalInner.area, 60000)
    near(s.totalFloor.area, 120000)
    // 매트 @(−200,0): x −300~−100 → 왼쪽 조각 x −300~−150에 9,000, 이너 a(x −150~−50)에 3,000
    near(s.pieces[0]?.occupied, 9000)
    near(s.inners[0]?.occupied, 3000)
  })

  it('zones를 넘기면 그것을 쓰고, 안 넘기면 buildZones(layout.tent)와 같은 결과', () => {
    const layout = layoutOf(baseTent(), [mat('m1', 0, 0), mat('m2', -200, 100)])
    expect(computeStats(layout)).toEqual(computeStats(layout, buildZones(layout.tent)))
  })
})

describe('computeStats — 이너 0개(Review Focus 1)', () => {
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

  it('티피: "바닥 1"·"바닥 전체", 이너 전체 점유율은 null("—")', () => {
    const s = computeStats(layoutOf(tent([], hexagon), [mat('m1', 0, 0)]))
    expect(s.inners).toEqual([])
    expectRow(s.totalInner, { key: 'total-inner', name: '이너 전체', area: 0, occupied: 0, percent: null })
    expect(formatPercent(s.totalInner.percent)).toBe('—')
    // 12,000 / 103,920 = 11.5…% → 11
    expectRow(s.pieces[0], { key: 'piece-0', name: '바닥 1', area: 103920, occupied: 12000, percent: 11 })
    expectRow(s.totalFloor, { key: 'total-floor', name: '바닥 전체', area: 103920, occupied: 12000, percent: 11 })
    expectRow(s.totalTent, { key: 'total-tent', name: '텐트 전체', area: 103920, occupied: 12000, percent: 11 })
    expect(s.warningCount).toBe(0)
  })
})

describe('computeStats — 넓이 0 구역(Review Focus 3)', () => {
  it('이너가 외곽을 꽉 채우면 전실 0: 조각 없음, 전실 전체 점유율 null, NaN 없음', () => {
    const s = computeStats(layoutOf(tent([inner('full', 600, 300, 0, 0, '이너 1')]), [mat('m1', 0, 0)]))
    expect(s.pieces).toEqual([])
    expectRow(s.totalFloor, { key: 'total-floor', name: '전실 전체', area: 0, occupied: 0, percent: null })
    expectRow(s.inners[0], { key: 'full', name: '이너 1', area: 180000, occupied: 12000, percent: 6 })
    expectRow(s.totalTent, { key: 'total-tent', name: '텐트 전체', area: 180000, occupied: 12000, percent: 6 })
    for (const r of allRows(s)) {
      for (const v of [r.area, r.occupied, r.free]) expect(Number.isNaN(v)).toBe(false)
    }
    expect(formatPercent(s.totalFloor.percent)).toBe('—')
  })

  it('물건이 없으면 모든 구역 점유 0%, 경고 0', () => {
    const s = computeStats(layoutOf(baseTent(), []))
    for (const r of allRows(s)) {
      expect(r.occupied).toBe(0)
      expect(r.percent).toBe(0)
    }
    expect(s.warnings).toEqual({})
    expect(s.warningCount).toBe(0)
  })
})

describe('computeStats — 점유율 경계', () => {
  it('이너 99.6% 점유 → 99, 꽉 차면 100', () => {
    // 300×298.8 @(150,0.6): 이너의 y −148.8~150 → 89,640 / 90,000 = 99.6%
    const almost = computeStats(layoutOf(baseTent(), [item('big', rect(300, 298.8), 150, 0.6)]))
    near(almost.inners[0]?.occupied, 89640)
    expect(almost.inners[0]?.percent).toBe(99)
    const full = computeStats(layoutOf(baseTent(), [item('big', rect(300, 300), 150, 0)]))
    expect(full.inners[0]?.percent).toBe(100)
    near(full.inners[0]?.free, 0)
    expect(full.warnings).toEqual({})
  })
})

describe('itemZoneAreas — 구역별 물건 면적(OD-16)', () => {
  /** 구역 key의 목록. 없으면 테스트를 바로 실패시킨다. */
  function zoneList(z: Record<string, ItemZoneArea[]>, key: string): ItemZoneArea[] {
    const list = z[key]
    if (list === undefined) throw new Error(`구역 ${key} 없음 (있는 key: ${Object.keys(z).join(', ')})`)
    return list
  }

  it('이너 벽에 걸친 아이스박스 60×40은 이너와 전실에 1,200씩 나뉜다', () => {
    // @(0,0): x −30~30, 이너는 x 0~300 → 이너 30×40, 전실 30×40
    const ice = item('ice', rect(60, 40), 0, 0, { category: 'FURNITURE' })
    const z = itemZoneAreas(layoutOf(baseTent(), [ice]))
    expect(Object.keys(z)).toEqual(['in1', 'piece-0'])
    const inInner = at(zoneList(z, 'in1'), 0)
    const inFloor = at(zoneList(z, 'piece-0'), 0)
    expect(inInner).toMatchObject({ itemId: 'ice', name: 'ice', excluded: false })
    expect(inFloor).toMatchObject({ itemId: 'ice', name: 'ice', excluded: false })
    near(inInner.area, 1200)
    near(inFloor.area, 1200)
  })

  it('텐트 밖으로 나간 의자는 안쪽 부분만 센다(50×60 중 1,650)', () => {
    // @(−297.5,0): x −322.5~−272.5 → 외곽 안은 x −300~−272.5, 27.5×60
    const chair = item('chair', rect(50, 60), -297.5, 0, { category: 'CHAIR' })
    const z = itemZoneAreas(layoutOf(baseTent(), [chair]))
    expect(zoneList(z, 'in1')).toEqual([])
    const rows = zoneList(z, 'piece-0')
    expect(rows.map((r) => r.itemId)).toEqual(['chair'])
    near(at(rows, 0).area, 1650)
  })

  it('countsArea=false 러그는 넓이를 계산해 excluded: true로 넣고, 목록은 넓이 내림차순', () => {
    // 러그 300×200 @(0,0): 이너 150×200, 전실 150×200 / 매트 @(−150,0): 전실 12,000
    const rug = item('rug', rect(300, 200), 0, 0, { countsArea: false, category: 'RUG' })
    const layout = layoutOf(baseTent(), [mat('m1', -150, 0), rug])
    const z = itemZoneAreas(layout)
    const inner = zoneList(z, 'in1')
    expect(inner.map((r) => [r.itemId, r.excluded])).toEqual([['rug', true]])
    near(at(inner, 0).area, 30000)
    const floor = zoneList(z, 'piece-0')
    expect(floor.map((r) => [r.itemId, r.excluded])).toEqual([
      ['rug', true],
      ['m1', false],
    ])
    near(at(floor, 0).area, 30000)
    near(at(floor, 1).area, 12000)
    // 점유율은 러그를 빼고 센다(물건 행의 합과 다를 수 있음)
    near(computeStats(layout).pieces[0]?.occupied, 12000)
  })

  it('넓이가 ε 이하인 구역에는 나오지 않고, 물건 없는 구역은 빈 배열, 이너 0개면 조각 key만', () => {
    // 매트 @(−100,0): x −200~0 → 이너 벽 x=0에 맞닿기만 함(이너 넓이 0)
    const z = itemZoneAreas(layoutOf(baseTent(), [mat('m1', -100, 0)]))
    expect(zoneList(z, 'in1')).toEqual([])
    expect(zoneList(z, 'piece-0').map((r) => r.itemId)).toEqual(['m1'])
    expect(itemZoneAreas(layoutOf(baseTent(), []))).toEqual({ in1: [], 'piece-0': [] })
    const tipi = tent([], { kind: 'circle', d: 500 })
    const layout = layoutOf(tipi, [mat('m1', 0, 0)])
    const zones = buildZones(tipi)
    expect(Object.keys(itemZoneAreas(layout, zones))).toEqual(['piece-0'])
    near(at(zoneList(itemZoneAreas(layout, zones), 'piece-0'), 0).area, 12000)
  })
})

describe('percentOf · formatPercent · formatM2', () => {
  it('percentOf: 내림, 남은 넓이 ε 이하만 100, 넓이 ε 이하는 null', () => {
    expect(percentOf(9960, 10000)).toBe(99)
    expect(percentOf(9999.98, 10000)).toBe(99) // 남은 0.02 > ε
    expect(percentOf(9999.995, 10000)).toBe(100) // 남은 0.005 ≤ ε
    expect(percentOf(10000, 10000)).toBe(100)
    expect(percentOf(0, 10000)).toBe(0)
    expect(percentOf(6000, 90000)).toBe(6)
    expect(percentOf(5, 0)).toBeNull()
    expect(percentOf(0, EPS_AREA)).toBeNull()
    expect(percentOf(0, Number.NaN)).toBeNull()
  })

  it('formatPercent: null → "—", 그 외 "n%"', () => {
    expect(formatPercent(null)).toBe('—')
    expect(formatPercent(0)).toBe('0%')
    expect(formatPercent(99)).toBe('99%')
    expect(formatPercent(100)).toBe('100%')
  })

  it('formatM2: m² 소수 둘째 자리, "-0.00" 없음', () => {
    expect(formatM2(12000)).toBe('1.20m²')
    expect(formatM2(0)).toBe('0.00m²')
    expect(formatM2(196349.54)).toBe('19.63m²')
    expect(formatM2(180000)).toBe('18.00m²')
    expect(formatM2(50)).toBe('0.01m²')
    expect(formatM2(49)).toBe('0.00m²')
    expect(formatM2(-0.4)).toBe('0.00m²')
  })
})

describe('computeStats — 성질(fast-check)', () => {
  const tenth = (min: number, max: number): fc.Arbitrary<number> =>
    fc.integer({ min: min * 10, max: max * 10 }).map((v) => v / 10)
  const shapeArb: fc.Arbitrary<Shape> = fc.oneof(
    fc.record({ w: tenth(1, 400), h: tenth(1, 400) }).map(({ w, h }) => rect(w, h)),
    tenth(1, 300).map((d): Shape => ({ kind: 'circle', d })),
  )
  const itemArb = fc.record({
    shape: shapeArb,
    x: tenth(-400, 400),
    y: tenth(-250, 250),
    rotation: fc.integer({ min: 0, max: 35999 }).map((v) => v / 100),
    countsArea: fc.boolean(),
  })
  const tentArb = fc.constantFrom<Tent>(
    baseTent(),
    tent([inner('a', 100, 300, -100, 0), inner('b', 100, 300, 100, 0)]),
    tent([inner('esc', 300, 300, 200, 0)]),
    tent([inner('full', 600, 300, 0, 0)]),
    tent([], { kind: 'circle', d: 500 }),
  )
  const layoutArb = fc.record({ t: tentArb, specs: fc.array(itemArb, { maxLength: 6 }) }).map(({ t, specs }) =>
    layoutOf(
      t,
      specs.map((s, i) => item(`it${i}`, s.shape, s.x, s.y, { rotation: s.rotation, countsArea: s.countsArea })),
    ),
  )

  it('점유율은 null 또는 0~100 정수이고, 0 ≤ 점유 ≤ 넓이, 남은 넓이 = 넓이 − 점유', () => {
    fc.assert(
      fc.property(layoutArb, (layout) => {
        const s = computeStats(layout)
        for (const r of allRows(s)) {
          expect(Number.isNaN(r.area) || Number.isNaN(r.occupied) || Number.isNaN(r.free)).toBe(false)
          expect(r.occupied).toBeGreaterThanOrEqual(0)
          expect(r.occupied).toBeLessThanOrEqual(r.area)
          expect(r.free).toBeCloseTo(r.area - r.occupied, 9)
          if (r.area <= EPS_AREA) {
            expect(r.percent).toBeNull()
          } else {
            expect(Number.isInteger(r.percent)).toBe(true)
            expect(r.percent).toBeGreaterThanOrEqual(0)
            expect(r.percent).toBeLessThanOrEqual(100)
          }
        }
      }),
      { numRuns: 200 },
    )
  })

  it('점유 넓이(합집합)는 물건 넓이의 합보다 크지 않고, 구역별 점유의 합은 텐트 전체 점유와 같다', () => {
    fc.assert(
      fc.property(layoutArb, (layout) => {
        const zones = buildZones(layout.tent)
        const s = computeStats(layout, zones)
        const counted = layout.items.filter((it) => it.countsArea)
        const sumOfItems = counted.reduce((acc, it) => acc + area(region(worldRing(it))), 0)
        // 교차점 반올림 여유(P1 Task 4 작성자 메모 5): 물건 변끼리, 물건 변과 구역 경계가 만나는 점은 0.01cm 격자로
        // 반올림되어 물건 변에서 최대 0.0071cm 벗어난다. 그래서 넓이 차는 ε + 0.0071 × (점유 물건 둘레 합)을 넘지 않는다.
        // (물건마다 1cm²로 두면 길고 기울어진 물건에서 2만~4만 번에 한 번꼴로 거짓 실패가 난다.)
        const tol = EPS_AREA + 0.0071 * counted.reduce((acc, it) => acc + ringPerimeter(worldRing(it)), 0)
        expect(s.totalTent.occupied).toBeLessThanOrEqual(sumOfItems + tol)
        const byZone = s.inners.reduce((acc, r) => acc + r.occupied, 0) + s.totalFloor.occupied
        expect(Math.abs(byZone - s.totalTent.occupied)).toBeLessThanOrEqual(tol)
      }),
      { numRuns: 200 },
    )
  })

  it('경고 수 = 경고 물건 수 + 이탈 이너 수, 깔개(countsArea=false)는 걸침이 없다', () => {
    fc.assert(
      fc.property(layoutArb, (layout) => {
        const s = computeStats(layout)
        expect(s.warningCount).toBe(Object.keys(s.warnings).length + s.innerEscapes.length)
        for (const it of layout.items) {
          const w = s.warnings[it.id]
          if (w) expect(w.outside || w.straddles.length > 0).toBe(true)
          if (!it.countsArea && w) expect(w.straddles).toEqual([])
        }
      }),
      { numRuns: 200 },
    )
  })
})

describe('리뷰 회귀: 기울어진 벽에 붙인 이너를 꽉 채우면 100%', () => {
  const pts: Pt[] = [[-200, 150], [200, 150], [150, -150], [-150, -150]]
  const [A, B] = [pts[1]!, pts[2]!]
  const ux = B[0] - A[0]
  const uy = B[1] - A[1]
  const len = Math.hypot(ux, uy)
  const nIn: Pt = [-uy / len, ux / len]
  const sign = (0 - A[0]) * nIn[0] + (0 - A[1]) * nIn[1] > 0 ? 1 : -1
  const n: Pt = [nIn[0] * sign, nIn[1] * sign]
  const rot = Math.round((Math.atan2(uy, ux) * 18000) / Math.PI) / 100
  const r1 = (v: number) => Math.round(v * 10) / 10
  for (const gap of [-0.05, -0.03, -0.01, 0.01, 0.03, 0.05]) {
    it(`벽과 간격 ${gap}cm`, () => {
      const cx = r1(A[0] + ux * 0.5 + n[0] * (50 + gap))
      const cy = r1(A[1] + uy * 0.5 + n[1] * (50 + gap))
      const tent: Tent = {
        name: 't',
        outer: { kind: 'polygon', points: pts },
        inners: [{ id: 'a', name: '이너 1', shape: { kind: 'rect', w: 150, h: 100 }, x: cx, y: cy, rotation: rot }],
      }
      const layout = createLayout(tent, { name: 'x', id: 'L', now: '2026-10-07T00:00:00.000Z' })
      layout.items.push({ id: 'm', name: '매트', shape: { kind: 'rect', w: 150, h: 100 }, x: cx, y: cy, rotation: rot, color: 'blue', category: 'MAT', countsArea: true })
      const s = computeStats(layout)
      expect(s.inners[0]!.percent).toBe(100)
      expect(s.inners[0]!.occupied + s.inners[0]!.free).toBeCloseTo(s.inners[0]!.area, 6)
    })
  }
})
