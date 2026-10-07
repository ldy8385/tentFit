import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { worldRing } from './geom'
import { createLayout, normAngle, round1, type Item, type Layout, type Pt, type Shape, type Tent } from './model'
import {
  buildSnapContext,
  edgesOfRing,
  gridOriginOf,
  snapMove,
  snapPointToGrid,
  snapRotate,
  type SnapContext,
} from './snap'
import { itemWarnings } from './stats'
import { buildZones } from './zones'

// ── 테스트 도우미 ──────────────────────────────────────────────────────
const RAD = Math.PI / 180
const T = 8

function rectTent(w: number, h: number, inners: Tent['inners'] = []): Tent {
  return { name: '테스트 텐트', outer: { kind: 'rect', w, h }, inners }
}

/** 스펙 §13.2 공통: 외곽 600×300, 이너 300×300 @(150,0) */
const goldenTent: Tent = rectTent(600, 300, [
  { id: 'in1', name: '이너 1', shape: { kind: 'rect', w: 300, h: 300 }, x: 150, y: 0, rotation: 0 },
])

/** 사다리꼴 외곽(front 300, back 200, depth 250). 오른쪽 벽 = (100,−125)→(150,125) */
const trapTent: Tent = {
  name: '사다리꼴',
  outer: { kind: 'polygon', points: [[-150, 125], [150, 125], [100, -125], [-100, -125]] },
  inners: [],
}

function item(id: string, shape: Shape, x: number, y: number, rotation = 0): Item {
  return { id, name: id, shape, x, y, rotation, color: 'green', category: 'MAT', countsArea: true }
}

function layoutOf(tent: Tent, items: Item[] = []): Layout {
  return { ...createLayout(tent, { name: '스냅 테스트', id: 'L1', now: '2026-10-07T00:00:00.000Z' }), items }
}

function rectRing(w: number, h: number, x: number, y: number, rotation = 0): Pt[] {
  return worldRing({ shape: { kind: 'rect', w, h }, x, y, rotation })
}

function moved(ring: Pt[], d: Pt): Pt[] {
  return ring.map((p) => [p[0] + d[0], p[1] + d[1]] as Pt)
}

function ctxOf(layout: Layout, exclude: string[] = []): SnapContext {
  return buildSnapContext(layout, { exclude: new Set(exclude), mode: 'items' })
}

// ── edgesOfRing ───────────────────────────────────────────────────────
describe('edgesOfRing', () => {
  it('고리 방향과 무관하게 바깥 법선을 준다', () => {
    const a = edgesOfRing([[0, 0], [10, 0], [10, 10], [0, 10]], 'item', 'k')
    expect(a.map((e) => e.key)).toEqual(['k#0', 'k#1', 'k#2', 'k#3'])
    expect(a.map((e) => e.n)).toEqual([[0, -1], [1, 0], [0, 1], [-1, 0]])
    expect(a.every((e) => e.kind === 'item')).toBe(true)

    const b = edgesOfRing([[0, 10], [10, 10], [10, 0], [0, 0]], 'outer', 'o')
    expect(b.map((e) => e.n)).toEqual([[0, 1], [1, 0], [0, -1], [-1, 0]])
  })

  it('길이 0인 변은 건너뛰고 번호는 원래 꼭짓점 번호를 쓴다', () => {
    const e = edgesOfRing([[0, 0], [0, 0], [10, 0], [10, 10]], 'inner', 'i')
    expect(e.map((x) => x.key)).toEqual(['i#1', 'i#2', 'i#3'])
  })

  it('꼭짓점이 3개 미만이면 빈 목록', () => {
    expect(edgesOfRing([[0, 0], [10, 0]], 'item', 'k')).toEqual([])
  })
})

// ── buildSnapContext ──────────────────────────────────────────────────
describe('buildSnapContext', () => {
  const layout = layoutOf(
    rectTent(600, 300, [
      { id: 'in1', name: '이너 1', shape: { kind: 'rect', w: 300, h: 300 }, x: 150, y: 0, rotation: 0 },
      { id: 'in2', name: '이너 2', shape: { kind: 'circle', d: 100 }, x: -200, y: 0, rotation: 0 },
    ]),
    [
      item('a', { kind: 'rect', w: 100, h: 50 }, -150, 0),
      item('b', { kind: 'circle', d: 40 }, 0, 100),
      item('c', { kind: 'rect', w: 20, h: 20 }, -250, 100),
    ],
  )

  it('items 모드: 외곽·이너·물건 변, 끄는 물건과 원은 뺀다', () => {
    const ctx = buildSnapContext(layout, { exclude: new Set(['a']), mode: 'items' })
    const prefixes = ctx.edges.map((e) => e.key.split('#')[0])
    expect(prefixes.filter((p) => p === 'outer')).toHaveLength(4)
    expect(prefixes.filter((p) => p === 'inner:in1')).toHaveLength(4)
    expect(prefixes.filter((p) => p === 'item:c')).toHaveLength(4)
    expect(prefixes).not.toContain('item:a')
    expect(prefixes).not.toContain('item:b')
    expect(prefixes).not.toContain('inner:in2')
    expect(ctx.walls).toHaveLength(8)
    expect(ctx.walls.every((w) => w.kind !== 'item')).toBe(true)
    expect(ctx.gridOrigin).toEqual([-300, -150])
    expect(ctx.gridStep).toBe(10)
  })

  it('외곽 변의 법선은 텐트 바깥을 향한다', () => {
    const ctx = buildSnapContext(layout, { exclude: new Set(), mode: 'items' })
    for (const e of ctx.edges.filter((x) => x.kind === 'outer')) {
      const mid: Pt = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2]
      expect(mid[0] * e.n[0] + mid[1] * e.n[1]).toBeGreaterThan(0)
      expect(Math.hypot(e.n[0], e.n[1])).toBeCloseTo(1, 12)
    }
  })

  it('inner 모드: 물건은 대상이 아니고 끄는 이너는 뺀다', () => {
    const ctx = buildSnapContext(layout, { exclude: new Set(['in1']), mode: 'inner' })
    expect(ctx.edges.every((e) => e.kind === 'outer')).toBe(true)
    expect(ctx.edges).toHaveLength(4)
    expect(ctx.walls).toHaveLength(4)
  })

  it('원 외곽은 변이 없고 격자 원점은 (−r, −r)', () => {
    const ctx = buildSnapContext(layoutOf({ name: '벨', outer: { kind: 'circle', d: 400 }, inners: [] }), {
      exclude: new Set(),
      mode: 'items',
    })
    expect(ctx.edges).toEqual([])
    expect(ctx.walls).toEqual([])
    expect(ctx.gridOrigin).toEqual([-200, -200])
  })

  it('gridOriginOf: 다각형 외곽은 꼭짓점 바운딩 박스 왼쪽 위', () => {
    expect(gridOriginOf(trapTent)).toEqual([-150, -125])
    expect(gridOriginOf({ outer: { kind: 'circle', d: 45 } })).toEqual([-22.5, -22.5])
  })
})

// ── 변 맞붙임: 법선 조건 ──────────────────────────────────────────────
describe('snapMove — 법선 조건', () => {
  it('물건끼리는 서로 마주 볼 때만 붙는다', () => {
    const ctx = ctxOf(layoutOf(rectTent(2000, 2000), [item('b', { kind: 'rect', w: 100, h: 100 }, 0, 0)]))
    const facing = snapMove(ctx, { rings: [rectRing(100, 100, 155, 0)], axisAligned: false, delta: [-50, 0], T })
    expect(facing.delta).toEqual([-55, 0])
    expect(facing.lock.firstKey?.startsWith('item:b#')).toBe(true)
    expect(facing.guides[0].a[0]).toBe(50)
    expect(facing.guides[0].b[0]).toBe(50)

    // 오른쪽 변끼리 3cm 차이지만 법선이 같은 쪽 → 짝이 아님
    const sameSide = snapMove(ctx, { rings: [rectRing(20, 100, 43, 0)], axisAligned: false, delta: [0, 0], T })
    expect(sameSide.delta).toEqual([0, 0])
    expect(sameSide.lock).toEqual({})
    expect(sameSide.guides).toEqual([])
  })

  it('외곽 변은 텐트 안쪽에서만 붙는다', () => {
    const ctx = ctxOf(layoutOf(rectTent(600, 300)))
    const inside = snapMove(ctx, { rings: [rectRing(200, 60, 193, 0)], axisAligned: false, delta: [2, 0], T })
    expect(inside.delta).toEqual([7, 0])
    expect(inside.lock.firstKey?.startsWith('outer#')).toBe(true)

    const outside = snapMove(ctx, { rings: [rectRing(200, 60, 407, 0)], axisAligned: false, delta: [-1, 0], T })
    expect(outside.delta).toEqual([-1, 0])
    expect(outside.lock).toEqual({})
  })

  it('이너 변은 안쪽과 전실 쪽 모두에서 붙고, 조금 파고든 경우도 밀어낸다', () => {
    const ctx = ctxOf(layoutOf(goldenTent))
    const fromInside = snapMove(ctx, { rings: [rectRing(200, 60, 104, 0)], axisAligned: false, delta: [0, 0], T })
    expect(fromInside.delta).toEqual([-4, 0])
    expect(fromInside.lock.firstKey?.startsWith('inner:in1#')).toBe(true)

    const fromVestibule = snapMove(ctx, { rings: [rectRing(200, 60, -104, 0)], axisAligned: false, delta: [0, 0], T })
    expect(fromVestibule.delta).toEqual([4, 0])

    const straddling = snapMove(ctx, { rings: [rectRing(200, 60, -97, 0)], axisAligned: false, delta: [0, 0], T })
    expect(straddling.delta).toEqual([-3, 0])
  })
})

// ── 두 번째 스냅·끝 맞춤·우선순위 ─────────────────────────────────────
describe('snapMove — 모서리 끼우기와 끝 맞춤', () => {
  it('바닥 벽에 붙은 뒤 상자 옆면으로 미끄러져 모서리에 끼운다(격자보다 우선)', () => {
    const layout = layoutOf(rectTent(600, 300), [item('box', { kind: 'rect', w: 40, h: 40 }, -253, 100)])
    const r = snapMove(ctxOf(layout), { rings: [rectRing(200, 60, -128, 116)], axisAligned: true, delta: [0, 0], T })
    // 바닥 +4, 상자 오른쪽 변(x=−233)까지 −5. 격자였다면 x=−230 이나 −240.
    expect(r.delta).toEqual([-5, 4])
    expect(r.lock.firstKey?.startsWith('outer#')).toBe(true)
    expect(r.lock.secondKey?.startsWith('item:box#')).toBe(true)
    expect(r.guides).toHaveLength(2)
  })

  it('첫 대상 변과 30° 미만 차이 나는 변은 두 번째 후보가 아니다', () => {
    /** 밑변이 수평이고 왼쪽 변이 α° 기운 사다리꼴(밑변 y=0) */
    const dragged = (alpha: number): Pt[] => [[0, 0], [100, 0], [100, -30], [-30 / Math.tan(alpha * RAD), -30]]
    /** 오른쪽 면이 dragged 의 왼쪽 변과 평행하고 수평으로 5cm 떨어진 평행사변형 */
    const wedge = (alpha: number): Pt[] => {
      const f1: Pt = [-5, 0]
      const f2: Pt = [-5 - 60 * Math.cos(alpha * RAD), -60 * Math.sin(alpha * RAD)]
      return [f1, f2, [f2[0] - 50, f2[1]], [f1[0] - 50, f1[1]]]
    }
    const floorBlock: Pt[] = [[-200, 0], [200, 0], [200, 40], [-200, 40]]
    const run = (alpha: number) => {
      const ctx: SnapContext = {
        edges: [...edgesOfRing(floorBlock, 'item', 'floor'), ...edgesOfRing(wedge(alpha), 'item', 'wedge')],
        walls: [],
        gridOrigin: [0, 0],
        gridStep: 10,
      }
      return snapMove(ctx, { rings: [dragged(alpha)], axisAligned: false, delta: [0, -3], T })
    }
    const r20 = run(20)
    expect(r20.delta[0]).toBeCloseTo(0, 9)
    expect(r20.delta[1]).toBeCloseTo(0, 9)
    expect(r20.lock.secondKey).toBeUndefined()

    const r40 = run(40)
    expect(r40.delta[0]).toBeCloseTo(-5, 9)
    expect(r40.delta[1]).toBeCloseTo(0, 9)
    expect(r40.lock.firstKey?.startsWith('floor#')).toBe(true)
    expect(r40.lock.secondKey?.startsWith('wedge#')).toBe(true)
  })

  it('맞붙은 변을 따라 끝점이 T 안이면 끝을 맞춘다(격자보다 우선)', () => {
    const layout = layoutOf(rectTent(600, 300), [item('b', { kind: 'rect', w: 200, h: 60 }, 3, 0)])
    // A 아래 변 y=−33(틈 3), x −93~107. B 위 변 x −97~103 → 끝 맞춤 −4. 격자였다면 +3.
    const r = snapMove(ctxOf(layout), { rings: [rectRing(200, 60, 7, -63)], axisAligned: true, delta: [0, 0], T })
    expect(r.delta).toEqual([-4, 3])
    expect(r.lock).toEqual({ firstKey: r.lock.firstKey })
    expect(r.lock.firstKey?.startsWith('item:b#')).toBe(true)
  })
})

// ── 격자 ──────────────────────────────────────────────────────────────
describe('snapMove — 격자', () => {
  it('원점은 외곽 바운딩 박스 왼쪽 위: 폭 250 텐트의 양쪽 벽이 격자선 위에 있다', () => {
    const ctx = ctxOf(layoutOf(rectTent(250, 200)))
    expect(ctx.gridOrigin).toEqual([-125, -100])
    expect(snapPointToGrid(ctx, [123, 1], T)).toEqual([125, 0])
    expect(snapPointToGrid(ctx, [-121, -96.5], T)).toEqual([-125, -100])
    // 월드 원점 기준이었다면 120 이나 130 이 되었을 자리
    expect(snapPointToGrid(ctx, [127.9, 0], T)).toEqual([125, 0])
    // T 밖이면 그대로
    expect(snapPointToGrid(ctx, [129, 3], 2)).toEqual([129, 3])
  })

  it('축에 나란할 때만, 바운딩 박스의 가까운 쪽 변을 축마다 붙인다', () => {
    const ctx: SnapContext = { ...ctxOf(layoutOf(rectTent(250, 200))), edges: [] }
    const ring = rectRing(105, 47, 0, 0)
    const r = snapMove(ctx, { rings: [ring], axisAligned: true, delta: [3, 1], T })
    // x: 오른쪽 변 55.5 → 55(−0.5). y: 위 변 −22.5 → −20(+2.5)
    expect(r.delta).toEqual([2.5, 3.5])
    expect(r.guides).toEqual([
      { a: [55, -20], b: [55, 27] },
      { a: [-50, -20], b: [55, -20] },
    ])
    expect(r.lock).toEqual({})

    const rotated = snapMove(ctx, { rings: [ring], axisAligned: false, delta: [3, 1], T })
    expect(rotated.delta).toEqual([3, 1])
    expect(rotated.guides).toEqual([])
  })

  it('첫 번째 스냅의 법선이 y축이면 y 격자만 끄고 x 격자는 첫 변을 따라 적용한다', () => {
    const layout = layoutOf(rectTent(600, 300), [item('shelf', { kind: 'rect', w: 300, h: 20 }, -100, 117)])
    const r = snapMove(ctxOf(layout), { rings: [rectRing(200, 60, -128, 74)], axisAligned: true, delta: [0, 0], T })
    // 선반 위 변(y=107)에 +3. y 격자(+3 더)는 꺼짐. x 는 −228 → −230.
    expect(r.delta).toEqual([-2, 3])
  })

  it('첫 번째 스냅의 법선이 축과 0.5° 넘게 다르면 격자를 모두 끈다', () => {
    const ctx = ctxOf(layoutOf(trapTent))
    const wallDeg = Math.atan2(250, 50) / RAD
    const ring = rectRing(200, 60, 90.68, 6.86, wallDeg + 0.4)
    const off = snapMove(ctx, { rings: [ring], axisAligned: false, delta: [0, 0], T })
    const on = snapMove(ctx, { rings: [ring], axisAligned: true, delta: [0, 0], T })
    expect(off.lock.firstKey).toBeDefined()
    expect(on.delta).toEqual(off.delta)
    expect(on.guides).toHaveLength(1)
  })

  it('원은 변 맞붙임에서 빠지고 gridRings 로 격자만 받는다', () => {
    // 원 d=45 @(0,0)의 바운딩 정사각형. 왼쪽 2.5cm 옆에 상자 변이 있지만 붙지 않는다.
    const layout = layoutOf(rectTent(600, 300), [item('box', { kind: 'rect', w: 20, h: 20 }, -34.5, 0)])
    const square: Pt[] = [[-22.5, -22.5], [22.5, -22.5], [22.5, 22.5], [-22.5, 22.5]]
    const r = snapMove(ctxOf(layout), { rings: [], gridRings: [square], axisAligned: true, delta: [1, 1], T })
    expect(r.delta).toEqual([2.5, 2.5])
    expect(r.lock).toEqual({})
  })
})

// ── 고정(lock) ────────────────────────────────────────────────────────
describe('snapMove — 손 떨림 고정', () => {
  const ring = rectRing(200, 60, 0, 100) // 아래 변 y=130, 바닥 벽 y=150

  it('고정한 변은 1.5T 안에서 유지하고(1.2T), 넘으면 푼다(1.6T)', () => {
    const ctx = ctxOf(layoutOf(rectTent(600, 300)))
    const first = snapMove(ctx, { rings: [ring], axisAligned: false, delta: [0, 16], T })
    expect(first.delta).toEqual([0, 20])
    expect(first.lock.firstKey?.startsWith('outer#')).toBe(true)

    const held = snapMove(ctx, { rings: [ring], axisAligned: false, delta: [0, 20 - 1.2 * T], T, lock: first.lock })
    expect(held.delta[0]).toBe(0)
    expect(held.delta[1]).toBeCloseTo(20, 9)
    expect(held.lock.firstKey).toBe(first.lock.firstKey)

    const fresh = snapMove(ctx, { rings: [ring], axisAligned: false, delta: [0, 20 - 1.2 * T], T })
    expect(fresh.delta[1]).toBeCloseTo(20 - 1.2 * T, 9)
    expect(fresh.lock).toEqual({})

    const released = snapMove(ctx, { rings: [ring], axisAligned: false, delta: [0, 20 - 1.6 * T], T, lock: first.lock })
    expect(released.delta[1]).toBeCloseTo(20 - 1.6 * T, 9)
    expect(released.lock).toEqual({})
  })

  it('고정 중에는 더 가까운 대상이 생겨도 바꾸지 않는다', () => {
    // 위쪽 상자 아래 변 y=76
    const ctx = ctxOf(layoutOf(rectTent(600, 300), [item('top', { kind: 'rect', w: 200, h: 60 }, 0, 46)]))
    const first = snapMove(ctx, { rings: [ring], axisAligned: false, delta: [0, 16], T })
    expect(first.delta).toEqual([0, 20])
    const lockedKey = first.lock.firstKey
    expect(lockedKey?.startsWith('outer#')).toBe(true)

    // 바닥 벽 9.6(=1.2T), 위 상자 4.4 → 고정이 없으면 상자, 있으면 벽
    const withLock = snapMove(ctx, { rings: [ring], axisAligned: false, delta: [0, 10.4], T, lock: first.lock })
    expect(withLock.delta[1]).toBeCloseTo(20, 9)
    expect(withLock.lock.firstKey).toBe(lockedKey)

    const noLock = snapMove(ctx, { rings: [ring], axisAligned: false, delta: [0, 10.4], T })
    expect(noLock.delta[1]).toBeCloseTo(6, 9)
    expect(noLock.lock.firstKey?.startsWith('item:top#')).toBe(true)
  })
})

// ── G11 ───────────────────────────────────────────────────────────────
describe('G11 — 0.4° 어긋난 매트 맞붙임', () => {
  it('바닥 벽: 가장 가까운 점이 벽에 닿고, 반올림해 반영해도 경고 0', () => {
    const tent = goldenTent
    const mat = item('mat', { kind: 'rect', w: 200, h: 60 }, -150, 115, 0.4)
    const ctx = ctxOf(layoutOf(tent, [mat]), ['mat'])
    const ring0 = worldRing(mat)
    const r = snapMove(ctx, { rings: [ring0], axisAligned: false, delta: [0, 0], T })
    const after = moved(ring0, r.delta)
    const ys = after.map((p) => p[1]).sort((a, b) => b - a)
    expect(ys[0]).toBeCloseTo(150, 9)
    // 반대쪽 아래 꼭짓점은 200·sin(0.4°) ≈ 1.396cm 떠 있음
    expect(150 - ys[1]).toBeCloseTo(200 * Math.sin(0.4 * RAD), 6)
    expect(r.delta[0]).toBeCloseTo(0, 9)

    const placed = { ...mat, x: round1(mat.x + r.delta[0]), y: round1(mat.y + r.delta[1]), rotation: normAngle(0.4) }
    expect(itemWarnings(worldRing(placed), true, buildZones(tent))).toEqual({ outside: false, straddles: [] })
  })

  it('사다리꼴의 기울어진 벽: 가장 가까운 점이 벽에 닿고 경고 0', () => {
    const a: Pt = [100, -125]
    const len = Math.hypot(50, 250)
    const inward: Pt = [-250 / len, 50 / len]
    const wallDeg = Math.atan2(250, 50) / RAD
    const cx = 125 + inward[0] * 35
    const cy = 0 + inward[1] * 35
    const mat = item('mat', { kind: 'rect', w: 200, h: 60 }, cx, cy, wallDeg + 0.4)
    const ctx = ctxOf(layoutOf(trapTent, [mat]), ['mat'])
    const ring0 = worldRing(mat)
    const r = snapMove(ctx, { rings: [ring0], axisAligned: false, delta: [0, 0], T })
    const inside = (p: Pt) => (p[0] - a[0]) * inward[0] + (p[1] - a[1]) * inward[1]
    const before = Math.min(...ring0.map(inside))
    expect(before).toBeGreaterThan(4)
    expect(before).toBeLessThan(T)
    const after = moved(ring0, r.delta).map(inside)
    expect(Math.min(...after)).toBeCloseTo(0, 9)
    expect(after.every((d) => d > -1e-9)).toBe(true)

    const placed = {
      ...mat,
      x: round1(mat.x + r.delta[0]),
      y: round1(mat.y + r.delta[1]),
      rotation: normAngle(mat.rotation),
    }
    expect(itemWarnings(worldRing(placed), true, buildZones(trapTent))).toEqual({ outside: false, straddles: [] })
  })
})

// ── 회전 스냅 ─────────────────────────────────────────────────────────
describe('snapRotate', () => {
  const farCtx = ctxOf(layoutOf(rectTent(2000, 2000)))

  it('±3° 안의 15° 배수로 붙고, 없으면 제안값(정규화)', () => {
    expect(snapRotate(farCtx, { center: [0, 0], localEdgeAngles: [0, 90], proposed: 43 })).toBe(45)
    expect(snapRotate(farCtx, { center: [0, 0], localEdgeAngles: [0, 90], proposed: 41 })).toBe(41)
    expect(snapRotate(farCtx, { center: [0, 0], localEdgeAngles: [0, 90], proposed: 358.5 })).toBe(0)
    expect(snapRotate(farCtx, { center: [0, 0], localEdgeAngles: [0, 90], proposed: -31 })).toBe(330)
  })

  it('근처 벽과 평행해지는 각도를 후보로 쓰고, 거리가 같으면 벽 후보가 이긴다', () => {
    const ctx = ctxOf(layoutOf(trapTent))
    const wallDeg = Math.atan2(250, 50) / RAD // 78.69…
    expect(snapRotate(ctx, { center: [90, 0], localEdgeAngles: [0, 90], proposed: 77 })).toBe(normAngle(wallDeg))
    const tie = (75 + wallDeg) / 2
    expect(snapRotate(ctx, { center: [90, 0], localEdgeAngles: [0, 90], proposed: tie })).toBe(normAngle(wallDeg))
    // 중심에서 100cm 넘게 떨어진 벽은 후보가 아니다(가장 가까운 벽까지 약 122.6cm)
    expect(snapRotate(ctx, { center: [0, 0], localEdgeAngles: [0, 90], proposed: 77 })).toBe(75)
  })

  it('벽 각도 − 변의 로컬 각도 + 180°·k', () => {
    const ctx = ctxOf(layoutOf(rectTent(600, 300)))
    // 바닥 벽(0°)에서 50cm, 로컬 10° 변 → 170°(차이 2) vs 15° 배수 165°(차이 3)
    expect(snapRotate(ctx, { center: [0, 100], localEdgeAngles: [10], proposed: 168 })).toBe(170)
  })

  it('원 외곽에는 벽 후보가 없다', () => {
    const ctx = ctxOf(layoutOf({ name: '벨', outer: { kind: 'circle', d: 400 }, inners: [] }))
    expect(snapRotate(ctx, { center: [150, 0], localEdgeAngles: [10], proposed: 168 })).toBe(165)
  })
})

// ── 성질 테스트 ───────────────────────────────────────────────────────
describe('성질(fast-check)', () => {
  it('스냅 보정량: 첫 법선·첫 변 방향 성분이 각각 T 이하, 격자만이면 x·y 각각 T 이하', () => {
    const layout = layoutOf(goldenTent, [
      item('r1', { kind: 'rect', w: 100, h: 80 }, -150, -60, 33),
      item('m1', { kind: 'rect', w: 200, h: 60 }, -150, 80),
    ])
    const ctx = ctxOf(layout)
    const eps = 1e-6
    fc.assert(
      fc.property(
        fc.record({
          w: fc.double({ min: 10, max: 250, noNaN: true }),
          h: fc.double({ min: 10, max: 250, noNaN: true }),
          rotation: fc.oneof(
            fc.constantFrom(0, 90, 180, 270, 33, 123, 213, 303),
            fc.double({ min: 0, max: 359.99, noNaN: true }),
          ),
          x: fc.double({ min: -320, max: 320, noNaN: true }),
          y: fc.double({ min: -170, max: 170, noNaN: true }),
          dx: fc.double({ min: -30, max: 30, noNaN: true }),
          dy: fc.double({ min: -30, max: 30, noNaN: true }),
          T: fc.double({ min: 1, max: 20, noNaN: true }),
        }),
        (g) => {
          const axisAligned = g.rotation % 90 === 0
          const ring = rectRing(g.w, g.h, g.x, g.y, g.rotation)
          const res = snapMove(ctx, { rings: [ring], axisAligned, delta: [g.dx, g.dy], T: g.T })
          const c: Pt = [res.delta[0] - g.dx, res.delta[1] - g.dy]
          if (res.lock.firstKey) {
            const f = ctx.edges.find((e) => e.key === res.lock.firstKey)
            if (!f) return false
            const len = Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1])
            const u: Pt = [(f.b[0] - f.a[0]) / len, (f.b[1] - f.a[1]) / len]
            return (
              Math.abs(c[0] * f.n[0] + c[1] * f.n[1]) <= g.T + eps && Math.abs(c[0] * u[0] + c[1] * u[1]) <= g.T + eps
            )
          }
          if (res.lock.secondKey) return false
          if (!axisAligned) return c[0] === 0 && c[1] === 0
          return Math.abs(c[0]) <= g.T + eps && Math.abs(c[1]) <= g.T + eps
        },
      ),
      { numRuns: 500, seed: 7 },
    )
  })
})
