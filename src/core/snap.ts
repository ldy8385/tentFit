import { normAngle, type Layout, type Pt, type Tent } from './model'
import { outerRing, ringBBox, worldRing } from './geom'

// ── 타입(계약) ─────────────────────────────────────────────────────────
export type Seg = { a: Pt; b: Pt }
export type EdgeKind = 'item' | 'outer' | 'inner'
/** n = 단위 바깥 법선(고리 방향과 무관하게 도형 바깥을 가리킴) */
export type TargetEdge = { key: string; a: Pt; b: Pt; n: Pt; kind: EdgeKind }
export type SnapContext = { edges: TargetEdge[]; walls: TargetEdge[]; gridOrigin: Pt; gridStep: number }
export type SnapLock = { firstKey?: string; secondKey?: string }
/**
 * rings = 끄는 물건들의 시작 시점 월드 고리(원은 넣지 않음).
 * gridRings = 격자 계산에만 쓰는 고리. 끄는 원의 바운딩 정사각형 [[x−r,y−r],[x+r,y−r],[x+r,y+r],[x−r,y+r]]을 넣습니다.
 *   변 맞붙임에는 쓰지 않습니다. (계약에 더한 선택 필드)
 */
export type MoveInput = {
  rings: Pt[][]
  axisAligned: boolean
  delta: Pt
  T: number
  lock?: SnapLock
  gridRings?: Pt[][]
}
export type MoveResult = { delta: Pt; guides: Seg[]; lock: SnapLock }
/** 각도는 모두 °. localEdgeAngles = 물건 변들의 로컬 방향 각도, proposed = 핸들이 제안한 회전값 */
export type RotateInput = { center: Pt; localEdgeAngles: number[]; proposed: number }

// ── 상수(§6.6) ─────────────────────────────────────────────────────────
/** 화면에서 붙는 거리(px). T(cm) = SNAP_PX / zoom */
export const SNAP_PX = 8
export const GRID_STEP = 10
/** 고정(lock)한 대상은 T의 이 배수까지 유지합니다(손 떨림 대비). */
export const LOCK_FACTOR = 1.5
const PARALLEL_DEG = 0.5
const SECOND_MIN_DEG = 30
const ROTATE_STEP_DEG = 15
const ROTATE_TOL_DEG = 3
const WALL_NEAR_CM = 100

const RAD = Math.PI / 180
const SIN_PARALLEL = Math.sin(PARALLEL_DEG * RAD)
const COS_AXIS = Math.cos(PARALLEL_DEG * RAD)
const SIN_SECOND = Math.sin(SECOND_MIN_DEG * RAD)
const LEN_EPS = 1e-9
const OVERLAP_EPS = 1e-6
const TIE_EPS = 1e-9

// ── 벡터 도우미 ────────────────────────────────────────────────────────
const add = (p: Pt, q: Pt): Pt => [p[0] + q[0], p[1] + q[1]]
const sub = (p: Pt, q: Pt): Pt => [p[0] - q[0], p[1] - q[1]]
const mul = (p: Pt, k: number): Pt => [p[0] * k, p[1] * k]
const dot = (p: Pt, q: Pt): number => p[0] * q[0] + p[1] * q[1]
const cross = (p: Pt, q: Pt): number => p[0] * q[1] - p[1] * q[0]
/** -0 을 0 으로 */
const clean = (v: number): number => v + 0

function unit(a: Pt, b: Pt): Pt | null {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy)
  return len < LEN_EPS ? null : [dx / len, dy / len]
}

function signedArea2(ring: Pt[]): number {
  let s = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    s += a[0] * b[1] - b[0] * a[1]
  }
  return s
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const ab = sub(b, a)
  const len2 = dot(ab, ab)
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / len2))
  return Math.hypot(p[0] - (a[0] + ab[0] * t), p[1] - (a[1] + ab[1] * t))
}

/** a − b 를 (−180, 180] 로 */
function angleDiff(a: number, b: number): number {
  let d = (a - b) % 360
  if (d <= -180) d += 360
  if (d > 180) d -= 360
  return d
}

// ── 변 목록과 문맥 ─────────────────────────────────────────────────────
/** 고리의 변들. key = `${keyPrefix}#${i}`(i = 시작 꼭짓점 번호). 길이 0인 변은 건너뜁니다. */
export function edgesOfRing(ring: Pt[], kind: EdgeKind, keyPrefix: string): TargetEdge[] {
  const out: TargetEdge[] = []
  if (ring.length < 3) return out
  const ccwInMath = signedArea2(ring) >= 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const u = unit(a, b)
    if (!u) continue
    const n: Pt = ccwInMath ? [clean(u[1]), clean(-u[0])] : [clean(-u[1]), clean(u[0])]
    out.push({ key: `${keyPrefix}#${i}`, a: [a[0], a[1]], b: [b[0], b[1]], n, kind })
  }
  return out
}

/** 격자 원점 = 외곽 바운딩 박스 왼쪽 위(§4.6·§6.6). 원 외곽은 근사 다각형이 아니라 정확한 (−r, −r) */
export function gridOriginOf(tent: Pick<Tent, 'outer'>): Pt {
  if (tent.outer.kind === 'circle') {
    const r = tent.outer.d / 2
    return [clean(-r), clean(-r)]
  }
  const bb = ringBBox(outerRing(tent))
  return [bb.minX, bb.minY]
}

/**
 * 끄는 동안 붙을 대상.
 * - mode 'items': 대상 = 외곽 + 이너 + exclude 에 없는 물건. 원은 모두 뺍니다.
 * - mode 'inner': 대상 = 외곽 + exclude 에 없는 이너(이너를 끄거나 꼭짓점을 끌 때).
 * walls(회전 스냅의 벽) = 외곽 + exclude 에 없는 이너. gridOrigin = 외곽 바운딩 박스 왼쪽 위.
 */
export function buildSnapContext(
  layout: Layout,
  opts: { exclude: Set<string>; mode: 'items' | 'inner' },
): SnapContext {
  const tent = layout.tent
  const walls: TargetEdge[] = []
  if (tent.outer.kind !== 'circle') walls.push(...edgesOfRing(outerRing(tent), 'outer', 'outer'))
  for (const inner of tent.inners) {
    if (opts.exclude.has(inner.id) || inner.shape.kind === 'circle') continue
    walls.push(...edgesOfRing(worldRing(inner), 'inner', `inner:${inner.id}`))
  }
  const edges: TargetEdge[] = [...walls]
  if (opts.mode === 'items') {
    for (const item of layout.items) {
      if (opts.exclude.has(item.id) || item.shape.kind === 'circle') continue
      edges.push(...edgesOfRing(worldRing(item), 'item', `item:${item.id}`))
    }
  }
  return { edges, walls, gridOrigin: gridOriginOf(tent), gridStep: GRID_STEP }
}

// ── 이동 스냅 ──────────────────────────────────────────────────────────
type DragEdge = { a: Pt; b: Pt; u: Pt; n: Pt; center: Pt }
type Target = { f: TargetEdge; u: Pt; len: number }
type PairEval = { s: number; m: Pt }
type FirstHit = { e: DragEdge; t: Target; ev: PairEval }

function dragEdgesOf(rings: Pt[][]): DragEdge[] {
  const out: DragEdge[] = []
  rings.forEach((ring, ri) => {
    if (ring.length < 3) return
    const bb = ringBBox(ring)
    const center: Pt = [(bb.minX + bb.maxX) / 2, (bb.minY + bb.maxY) / 2]
    for (const e of edgesOfRing(ring, 'item', `drag${ri}`)) {
      const u = unit(e.a, e.b)
      if (u) out.push({ a: e.a, b: e.b, u, n: e.n, center })
    }
  })
  return out
}

const segOf = (f: TargetEdge): Seg => ({ a: [f.a[0], f.a[1]], b: [f.b[0], f.b[1]] })

function prepareTargets(edges: TargetEdge[]): Target[] {
  const out: Target[] = []
  for (const f of edges) {
    const u = unit(f.a, f.b)
    if (u) out.push({ f, u, len: Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]) })
  }
  return out
}

/**
 * 끄는 변 e(off 만큼 옮긴 상태)와 대상 변의 짝 판정(§6.6 법선 조건·투영 겹침)과 부호 거리.
 * s = 겹치는 구간 양 끝에서 대상 변까지 부호 거리 중 작은 값. `+`는 끄는 물건이 있어야 할 쪽.
 */
function evalPair(e: DragEdge, t: Target, off: Pt): PairEval | null {
  if (Math.abs(cross(e.u, t.u)) > SIN_PARALLEL) return null
  const nd = dot(e.n, t.f.n)
  if (t.f.kind === 'item' && !(nd < 0)) return null
  if (t.f.kind === 'outer' && !(nd > 0)) return null
  const ea = add(e.a, off)
  const eb = add(e.b, off)
  let m: Pt
  if (t.f.kind === 'item') m = t.f.n
  else if (t.f.kind === 'outer') m = mul(t.f.n, -1)
  else m = dot(sub(add(e.center, off), t.f.a), t.f.n) >= 0 ? t.f.n : mul(t.f.n, -1)
  const t1 = dot(sub(ea, t.f.a), t.u)
  const t2 = dot(sub(eb, t.f.a), t.u)
  const lo = Math.max(0, Math.min(t1, t2))
  const hi = Math.min(t.len, Math.max(t1, t2))
  if (hi - lo <= OVERLAP_EPS) return null
  const sAt = (tt: number): number => {
    const tau = (tt - t1) / (t2 - t1)
    const p = add(ea, mul(sub(eb, ea), tau))
    return dot(sub(p, t.f.a), m)
  }
  return { s: Math.min(sAt(lo), sAt(hi)), m }
}

function bestFirst(drag: DragEdge[], targets: Target[], off: Pt, limit: number): FirstHit | null {
  let best: FirstHit | null = null
  for (const t of targets) {
    for (const e of drag) {
      const ev = evalPair(e, t, off)
      if (!ev || Math.abs(ev.s) > limit) continue
      if (!best || Math.abs(ev.s) < Math.abs(best.ev.s) - TIE_EPS) best = { e, t, ev }
    }
  }
  return best
}

function bestSecond(
  drag: DragEdge[],
  targets: Target[],
  first: FirstHit,
  off: Pt,
  limit: number,
): { t: Target; lambda: number } | null {
  const u1 = first.t.u
  let best: { t: Target; lambda: number } | null = null
  for (const t of targets) {
    if (t.f.key === first.t.f.key) continue
    if (Math.abs(cross(u1, t.u)) < SIN_SECOND - TIE_EPS) continue // 30° 미만 차이는 후보 아님
    for (const e of drag) {
      const ev = evalPair(e, t, off)
      if (!ev) continue
      const k = dot(u1, ev.m)
      if (Math.abs(k) < LEN_EPS) continue
      const lambda = -ev.s / k
      if (Math.abs(lambda) > limit) continue
      const off2 = add(off, mul(u1, lambda))
      // 미끄러진 뒤에도 첫 번째 짝(과 두 번째 짝)의 투영이 겹쳐야 인정
      if (!evalPair(first.e, first.t, off2) || !evalPair(e, t, off2)) continue
      if (!best || Math.abs(lambda) < Math.abs(best.lambda) - TIE_EPS) best = { t, lambda }
    }
  }
  return best
}

/** 끝 맞춤: 맞붙은 변을 따라 끝점끼리 T 안이면 맞춤. 첫 대상 변 방향(u1)으로의 이동량, 없으면 null */
function endAlign(first: FirstHit, off: Pt, T: number): number | null {
  const { e, t } = first
  const t1 = dot(sub(add(e.a, off), t.f.a), t.u)
  const t2 = dot(sub(add(e.b, off), t.f.a), t.u)
  const cStart = 0 - Math.min(t1, t2)
  const cEnd = t.len - Math.max(t1, t2)
  const c = Math.abs(cEnd) < Math.abs(cStart) - TIE_EPS ? cEnd : cStart
  return Math.abs(c) <= T ? c : null
}

function bboxMoved(rings: Pt[][], off: Pt): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const ring of rings) {
    if (ring.length === 0) continue
    const bb = ringBBox(ring)
    minX = Math.min(minX, bb.minX + off[0])
    minY = Math.min(minY, bb.minY + off[1])
    maxX = Math.max(maxX, bb.maxX + off[0])
    maxY = Math.max(maxY, bb.maxY + off[1])
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY }
}

/** 바운딩 박스의 두 변 중 격자선에 가까운 쪽: d = 이동량, g = 붙을 격자선 좌표 */
function gridShift(vMin: number, vMax: number, origin: number, step: number): { d: number; g: number } {
  const gMin = origin + Math.round((vMin - origin) / step) * step
  const gMax = origin + Math.round((vMax - origin) / step) * step
  const dMin = gMin - vMin
  const dMax = gMax - vMax
  return Math.abs(dMax) < Math.abs(dMin) - TIE_EPS ? { d: dMax, g: gMax } : { d: dMin, g: gMin }
}

/**
 * §6.6 변 맞붙임(첫 번째 → 두 번째 / 끝 맞춤) → 격자.
 * 같은 축 우선순위: 두 번째 변 스냅 > 끝 맞춤 > 격자.
 * lock: 이전 결과의 lock 을 넘기면, 그 대상 변이 1.5T 안에 있는 동안 계속 그 변을 씁니다.
 */
export function snapMove(ctx: SnapContext, input: MoveInput): MoveResult {
  const { T, lock } = input
  const base: Pt = [input.delta[0], input.delta[1]]
  const drag = dragEdgesOf(input.rings)
  const targets = prepareTargets(ctx.edges)
  const guides: Seg[] = []
  const outLock: SnapLock = {}
  let delta: Pt = base

  let first: FirstHit | null = null
  if (lock?.firstKey) {
    const key = lock.firstKey
    first = bestFirst(drag, targets.filter((t) => t.f.key === key), base, T * LOCK_FACTOR)
  }
  if (!first) first = bestFirst(drag, targets, base, T)

  let slideTaken = false
  if (first) {
    delta = add(base, mul(first.ev.m, -first.ev.s))
    guides.push(segOf(first.t.f))
    outLock.firstKey = first.t.f.key

    let second: { t: Target; lambda: number } | null = null
    if (lock?.secondKey && lock.firstKey === first.t.f.key) {
      const key = lock.secondKey
      second = bestSecond(drag, targets.filter((t) => t.f.key === key), first, delta, T * LOCK_FACTOR)
    }
    if (!second) second = bestSecond(drag, targets, first, delta, T)
    if (second) {
      delta = add(delta, mul(first.t.u, second.lambda))
      guides.push(segOf(second.t.f))
      outLock.secondKey = second.t.f.key
      slideTaken = true
    } else {
      const c = endAlign(first, delta, T)
      if (c !== null) {
        delta = add(delta, mul(first.t.u, c))
        slideTaken = true
      }
    }
  }

  if (input.axisAligned) {
    const allRings = [...input.rings, ...(input.gridRings ?? [])]
    let allowX = true
    let allowY = true
    if (first) {
      const n = first.t.f.n
      if (Math.abs(n[0]) >= COS_AXIS) {
        allowX = false
        allowY = !slideTaken
      } else if (Math.abs(n[1]) >= COS_AXIS) {
        allowY = false
        allowX = !slideTaken
      } else {
        allowX = false
        allowY = false
      }
    }
    const [ox, oy] = ctx.gridOrigin
    const step = ctx.gridStep
    let snappedX: number | null = null
    let snappedY: number | null = null
    const bb = bboxMoved(allRings, delta)
    if (bb && allowX) {
      const { d, g } = gridShift(bb.minX, bb.maxX, ox, step)
      // 첫 번째 스냅이 있으면 맞붙은 상태를 깨지 않도록 첫 변 방향으로 미끄러뜨림
      const move: Pt | null = first
        ? Math.abs(d / first.t.u[0]) <= T ? mul(first.t.u, d / first.t.u[0]) : null
        : Math.abs(d) <= T ? [d, 0] : null
      if (move) {
        delta = add(delta, move)
        snappedX = g
      }
    }
    if (bb && allowY) {
      const { d, g } = gridShift(bb.minY, bb.maxY, oy, step)
      const move: Pt | null = first
        ? Math.abs(d / first.t.u[1]) <= T ? mul(first.t.u, d / first.t.u[1]) : null
        : Math.abs(d) <= T ? [0, d] : null
      if (move) {
        delta = add(delta, move)
        snappedY = g
      }
    }
    const fb = bboxMoved(allRings, delta)
    if (fb && snappedX !== null) guides.push({ a: [snappedX, fb.minY], b: [snappedX, fb.maxY] })
    if (fb && snappedY !== null) guides.push({ a: [fb.minX, snappedY], b: [fb.maxX, snappedY] })
  }

  return { delta: [clean(delta[0]), clean(delta[1])], guides, lock: outLock }
}

// ── 회전 스냅 ──────────────────────────────────────────────────────────
/**
 * 후보: 15°의 배수, 근처 벽(중심에서 100cm 이내인 외곽·이너 변)과 평행해지는 각도(벽 각도 − 변 로컬 각도 + 180°·k).
 * ±3° 안에서 가장 가까운 후보, 거리가 같으면 벽 후보. 후보가 없으면 proposed.
 * 반환값은 normAngle 을 거친 [0,360) 값입니다.
 */
export function snapRotate(ctx: SnapContext, input: RotateInput): number {
  const { center, localEdgeAngles, proposed } = input
  const candidates: Array<{ angle: number; wall: boolean }> = [
    { angle: Math.round(proposed / ROTATE_STEP_DEG) * ROTATE_STEP_DEG, wall: false },
  ]
  for (const w of ctx.walls) {
    if (distToSegment(center, w.a, w.b) > WALL_NEAR_CM) continue
    const wallDeg = Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0]) / RAD
    for (const local of localEdgeAngles) {
      const baseAngle = wallDeg - local
      candidates.push({ angle: baseAngle + 180 * Math.round((proposed - baseAngle) / 180), wall: true })
    }
  }
  let best: { angle: number; diff: number; wall: boolean } | null = null
  for (const c of candidates) {
    const diff = Math.abs(angleDiff(c.angle, proposed))
    if (diff > ROTATE_TOL_DEG + TIE_EPS) continue
    if (
      best === null ||
      diff < best.diff - TIE_EPS ||
      (Math.abs(diff - best.diff) <= TIE_EPS && c.wall && !best.wall)
    ) {
      best = { angle: c.angle, diff, wall: c.wall }
    }
  }
  return normAngle(best === null ? proposed : best.angle)
}

// ── 점 격자 스냅(꼭짓점 끌기) ──────────────────────────────────────────
/** 축마다 가장 가까운 격자선이 T 이하이면 그 선으로 */
export function snapPointToGrid(ctx: SnapContext, p: Pt, T: number): Pt {
  const snap1 = (v: number, o: number): number => {
    const g = o + Math.round((v - o) / ctx.gridStep) * ctx.gridStep
    return Math.abs(g - v) <= T ? g : v
  }
  return [clean(snap1(p[0], ctx.gridOrigin[0])), clean(snap1(p[1], ctx.gridOrigin[1]))]
}
