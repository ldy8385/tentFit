import { EPS_AREA, type Item, type Layout, type Pt } from './model'
import { area, intersect, labelPoint, outerRing, pointInRing, region, worldRing } from './geom'

// ── 타입(계약) ─────────────────────────────────────────────────────────
/**
 * wall: 'outer' 또는 이너 id. edge: 그 벽 월드 고리의 변 번호(꼭짓점 edge → edge+1, 마지막은 n−1 → 0).
 * 원 외곽·원 이너는 곡선 변 하나라 edge는 0뿐입니다(OD-15).
 */
export type MeasureTarget =
  | { kind: 'point'; p: Pt }
  | { kind: 'item'; id: string }
  | { kind: 'wall'; wall: 'outer' | string; edge: number }
/** p1 은 첫 대상(a) 위, p2 는 둘째 대상(b) 위의 가장 가까운 점 */
export type MeasureResult = { p1: Pt; p2: Pt; distance: number; relation: 'gap' | 'touch' | 'overlap'; label: string }

/** 이 거리(cm) 미만이면 맞닿음으로 표시 */
export const TOUCH_CM = 0.05

// ── 벡터 도우미 ────────────────────────────────────────────────────────
const sub = (p: Pt, q: Pt): Pt => [p[0] - q[0], p[1] - q[1]]
const cross = (p: Pt, q: Pt): number => p[0] * q[1] - p[1] * q[0]
const copy = (p: Pt): Pt => [p[0] + 0, p[1] + 0]
const dist = (p: Pt, q: Pt): number => Math.hypot(p[0] - q[0], p[1] - q[1])
/** from → to 단위 방향. 같은 점이면 +x */
function dirOf(from: Pt, to: Pt): Pt {
  const L = dist(from, to)
  return L === 0 ? [1, 0] : [(to[0] - from[0]) / L, (to[1] - from[1]) / L]
}
/** c 에서 dir 방향으로 r 만큼 간 점 */
const at = (c: Pt, dir: Pt, r: number): Pt => [c[0] + dir[0] * r, c[1] + dir[1] * r]

// ── 거리 기본 연산(계약) ───────────────────────────────────────────────
/** 점 p 에서 선분 ab 까지 최단 거리 d 와 선분 위의 가장 가까운 점 q */
export function pointSegment(p: Pt, a: Pt, b: Pt): { d: number; q: Pt } {
  const abx = b[0] - a[0]
  const aby = b[1] - a[1]
  const len2 = abx * abx + aby * aby
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / len2))
  const q: Pt = [a[0] + abx * t, a[1] + aby * t]
  return { d: dist(p, q), q }
}

/** 두 선분 사이 최단 거리. p 는 선분 a 위, q 는 선분 b 위. 교차하면 d = 0, p = q = 교점 */
export function segmentSegment(a1: Pt, a2: Pt, b1: Pt, b2: Pt): { d: number; p: Pt; q: Pt } {
  const r = sub(a2, a1)
  const s = sub(b2, b1)
  const denom = cross(r, s)
  if (denom !== 0) {
    const w = sub(b1, a1)
    const t = cross(w, s) / denom
    const u = cross(w, r) / denom
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      const x: Pt = [a1[0] + r[0] * t, a1[1] + r[1] * t]
      return { d: 0, p: x, q: copy(x) }
    }
  }
  const c1 = pointSegment(a1, b1, b2)
  const c2 = pointSegment(a2, b1, b2)
  const c3 = pointSegment(b1, a1, a2)
  const c4 = pointSegment(b2, a1, a2)
  let best = { d: c1.d, p: copy(a1), q: c1.q }
  if (c2.d < best.d) best = { d: c2.d, p: copy(a2), q: c2.q }
  if (c3.d < best.d) best = { d: c3.d, p: c3.q, q: copy(b1) }
  if (c4.d < best.d) best = { d: c4.d, p: c4.q, q: copy(b2) }
  return best
}

/** 두 고리의 경계(선분 고리) 사이 최단 거리. 경계가 교차하면 0. 한쪽이 다른 쪽 안에 들어 있어도 경계 거리 */
export function ringToRing(r1: Pt[], r2: Pt[]): { d: number; p: Pt; q: Pt } {
  let best: { d: number; p: Pt; q: Pt } = { d: Infinity, p: [0, 0], q: [0, 0] }
  for (let i = 0; i < r1.length; i++) {
    const a1 = r1[i]
    const a2 = r1[(i + 1) % r1.length]
    for (let j = 0; j < r2.length; j++) {
      const res = segmentSegment(a1, a2, r2[j], r2[(j + 1) % r2.length])
      if (res.d < best.d) {
        best = res
        if (best.d === 0) return best
      }
    }
  }
  return best
}

/** 고리 경계와 선분 ab 사이 최단 거리. p 는 고리 위, q 는 선분 위. 고리 경계가 선분과 만날 때만 0 */
function ringToSegment(ring: Pt[], a: Pt, b: Pt): { d: number; p: Pt; q: Pt } {
  let best: { d: number; p: Pt; q: Pt } = { d: Infinity, p: [0, 0], q: [0, 0] }
  for (let i = 0; i < ring.length; i++) {
    const res = segmentSegment(ring[i], ring[(i + 1) % ring.length], a, b)
    if (res.d < best.d) {
      best = res
      if (best.d === 0) return best
    }
  }
  return best
}

/** 점에서 고리 경계까지 */
function pointRing(p: Pt, ring: Pt[]): { d: number; q: Pt } {
  let best: { d: number; q: Pt } = { d: Infinity, q: copy(p) }
  for (let i = 0; i < ring.length; i++) {
    const res = pointSegment(p, ring[i], ring[(i + 1) % ring.length])
    if (res.d < best.d) best = res
  }
  return best
}

// ── 대상 → 기하 ────────────────────────────────────────────────────────
type Geo =
  | { t: 'pt'; p: Pt }
  | { t: 'disk'; c: Pt; r: number } // 원 물건(채워진 면)
  | { t: 'poly'; ring: Pt[] } // 다각형 물건(채워진 면)
  | { t: 'circleWall'; c: Pt; r: number } // 원 외곽·이너의 경계(곡선 변 하나)
  | { t: 'seg'; a: Pt; b: Pt } // 다각형 외곽·이너의 변 하나

function itemGeo(it: Item): Geo {
  return it.shape.kind === 'circle' ? { t: 'disk', c: [it.x, it.y], r: it.shape.d / 2 } : { t: 'poly', ring: worldRing(it) }
}

/** 벽 하나의 변 목록. 원 벽은 곡선 변 하나, 다각형 벽은 월드 고리의 변 순서(꼭짓점 i → i+1) */
function wallEdgeGeos(layout: Layout, wall: string): Geo[] {
  let ring: Pt[]
  if (wall === 'outer') {
    const outer = layout.tent.outer
    if (outer.kind === 'circle') return [{ t: 'circleWall', c: [0, 0], r: outer.d / 2 }]
    ring = outerRing(layout.tent)
  } else {
    const inner = layout.tent.inners.find((x) => x.id === wall)
    if (!inner) throw new Error(`측정 대상 이너가 없어요: ${wall}`)
    if (inner.shape.kind === 'circle') return [{ t: 'circleWall', c: [inner.x, inner.y], r: inner.shape.d / 2 }]
    ring = worldRing(inner)
  }
  return ring.map((a, i): Geo => ({ t: 'seg', a: copy(a), b: copy(ring[(i + 1) % ring.length]) }))
}

function resolve(layout: Layout, target: MeasureTarget): Geo {
  if (target.kind === 'point') return { t: 'pt', p: copy(target.p) }
  if (target.kind === 'item') {
    const it = layout.items.find((x) => x.id === target.id)
    if (!it) throw new Error(`측정 대상 물건이 없어요: ${target.id}`)
    return itemGeo(it)
  }
  const edges = wallEdgeGeos(layout, target.wall)
  const g = Number.isInteger(target.edge) ? edges[target.edge] : undefined
  if (g === undefined) throw new Error(`측정 대상 변이 없어요: ${target.wall} 변 ${target.edge}`)
  return g
}

// ── 거리 계산 ──────────────────────────────────────────────────────────
type Raw = { d: number; p: Pt; q: Pt; overlap: boolean }
const RANK: Record<Geo['t'], number> = { pt: 0, disk: 1, poly: 2, circleWall: 3, seg: 4 }

/** 두 원판 겹친 넓이(렌즈) */
function lensArea(r1: number, r2: number, d: number): number {
  if (d >= r1 + r2) return 0
  if (d <= Math.abs(r1 - r2)) return Math.PI * Math.min(r1, r2) ** 2
  const a1 = Math.acos(Math.max(-1, Math.min(1, (d * d + r1 * r1 - r2 * r2) / (2 * d * r1))))
  const a2 = Math.acos(Math.max(-1, Math.min(1, (d * d + r2 * r2 - r1 * r1) / (2 * d * r2))))
  const k = (-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2)
  return r1 * r1 * a1 + r2 * r2 * a2 - 0.5 * Math.sqrt(Math.max(0, k))
}

/** 원 경계(중심 c, 반지름 r)와 다각형 경계(또는 선분: 점 2개) 사이. 경계끼리 만나면 0 */
function circleLineToRing(c: Pt, r: number, ring: Pt[]): { d: number; pCircle: Pt; qRing: Pt } {
  const near = pointRing(c, ring)
  let far: { d: number; q: Pt } = { d: -Infinity, q: copy(c) }
  for (const v of ring) {
    const dv = dist(c, v)
    if (dv > far.d) far = { d: dv, q: copy(v) }
  }
  if (near.d > r) return { d: near.d - r, pCircle: at(c, dirOf(c, near.q), r), qRing: near.q }
  if (far.d < r) return { d: r - far.d, pCircle: at(c, dirOf(c, far.q), r), qRing: far.q }
  const x = at(c, dirOf(c, near.d > 0 ? near.q : far.q), r)
  return { d: 0, pCircle: x, qRing: copy(x) }
}

/** 원 중심에서 다각형 경계까지 거리 − r(0 이상). p 는 원 위, q 는 경계 위 */
function diskToBoundary(c: Pt, r: number, ring: Pt[]): Raw {
  const near = pointRing(c, ring)
  const d = Math.max(0, near.d - r)
  return { d, p: d === 0 ? copy(near.q) : at(c, dirOf(c, near.q), r), q: near.q, overlap: false }
}

/** 원 중심에서 선분까지 거리 − r(0 이상). p 는 원 위, q 는 선분 위 */
function diskToSegment(c: Pt, r: number, a: Pt, b: Pt): Raw {
  const near = pointSegment(c, a, b)
  const d = Math.max(0, near.d - r)
  return { d, p: d === 0 ? copy(near.q) : at(c, dirOf(c, near.q), r), q: near.q, overlap: false }
}

/** rank(x) <= rank(y) 인 경우만 처리. p 는 x 위, q 는 y 위 */
function ordered(x: Geo, y: Geo): Raw {
  if (x.t === 'pt') {
    const p = x.p
    if (y.t === 'pt') return { d: dist(p, y.p), p, q: copy(y.p), overlap: false }
    if (y.t === 'disk') {
      const L = dist(p, y.c)
      if (L <= y.r) return { d: 0, p, q: copy(p), overlap: false }
      return { d: L - y.r, p, q: at(y.c, dirOf(y.c, p), y.r), overlap: false }
    }
    if (y.t === 'poly') {
      if (pointInRing(p, y.ring)) return { d: 0, p, q: copy(p), overlap: false }
      const res = pointRing(p, y.ring)
      return { d: res.d, p, q: res.q, overlap: false }
    }
    if (y.t === 'circleWall') return { d: Math.abs(dist(p, y.c) - y.r), p, q: at(y.c, dirOf(y.c, p), y.r), overlap: false }
    const res = pointSegment(p, y.a, y.b)
    return { d: res.d, p, q: res.q, overlap: false }
  }

  if (x.t === 'disk') {
    if (y.t === 'disk') {
      const L = dist(x.c, y.c)
      const dir = dirOf(x.c, y.c)
      if (lensArea(x.r, y.r, L) > EPS_AREA) {
        // 겹친 부분 안의 점: 포함이면 작은 원 중심, 아니면 두 원 경계의 중점(중심선 위)
        const a = at(x.c, dir, x.r)
        const b = at(y.c, dir, -y.r)
        const m: Pt = L <= Math.abs(x.r - y.r) ? copy(x.r <= y.r ? x.c : y.c) : [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
        return { d: 0, p: m, q: copy(m), overlap: true }
      }
      const d = Math.max(0, L - x.r - y.r)
      const p = at(x.c, dir, x.r)
      return { d, p, q: d === 0 ? copy(p) : at(y.c, dir, -y.r), overlap: false }
    }
    if (y.t === 'poly') {
      // §6.7 공식: 근사 다각형(circleRing)은 꼭짓점이 원 밖으로 약 0.07cm 나가 정확한 맞닿음도
      // 교집합 > ε이 되므로, 겹침은 해석적으로 판정한다(리뷰 Important).
      const near = pointRing(x.c, y.ring)
      const inside = pointInRing(x.c, y.ring)
      if (inside || x.r - near.d > TOUCH_CM) {
        const m: Pt = inside ? copy(x.c) : [(x.c[0] + near.q[0]) / 2, (x.c[1] + near.q[1]) / 2]
        return { d: 0, p: m, q: copy(m), overlap: true }
      }
      return diskToBoundary(x.c, x.r, y.ring)
    }
    if (y.t === 'circleWall') {
      const L = dist(x.c, y.c)
      const dir = dirOf(y.c, x.c) // 벽 중심 → 원 물건 중심
      const q = at(y.c, dir, y.r)
      const d = Math.max(0, Math.abs(L - y.r) - x.r)
      if (d === 0) return { d, p: copy(q), q, overlap: false }
      // 벽 안쪽이면 바깥 방향 끝, 벽 바깥이면 안쪽 방향 끝
      return { d, p: at(x.c, dir, L < y.r ? x.r : -x.r), q, overlap: false }
    }
    if (y.t === 'seg') return diskToSegment(x.c, x.r, y.a, y.b)
  }

  if (x.t === 'poly') {
    if (y.t === 'poly') {
      const inter = intersect(region(x.ring), region(y.ring))
      if (area(inter) > EPS_AREA) {
        const m = labelPoint(inter)
        return { d: 0, p: m, q: copy(m), overlap: true }
      }
      return { ...ringToRing(x.ring, y.ring), overlap: false }
    }
    if (y.t === 'circleWall') {
      const res = circleLineToRing(y.c, y.r, x.ring)
      return { d: res.d, p: res.qRing, q: res.pCircle, overlap: false }
    }
    if (y.t === 'seg') return { ...ringToSegment(x.ring, y.a, y.b), overlap: false }
  }

  if (x.t === 'circleWall') {
    if (y.t === 'circleWall') {
      const L = dist(x.c, y.c)
      const dir = dirOf(x.c, y.c)
      if (L + Math.min(x.r, y.r) <= Math.max(x.r, y.r)) {
        // 한 원이 다른 원 안: 큰 원 중심 → 작은 원 중심 방향에서 가장 가까움
        const s = x.r >= y.r ? 1 : -1
        return { d: Math.max(x.r, y.r) - L - Math.min(x.r, y.r), p: at(x.c, dir, s * x.r), q: at(y.c, dir, s * y.r), overlap: false }
      }
      if (L >= x.r + y.r) return { d: L - x.r - y.r, p: at(x.c, dir, x.r), q: at(y.c, dir, -y.r), overlap: false }
      const m = at(x.c, dir, x.r)
      return { d: 0, p: m, q: copy(m), overlap: false }
    }
    if (y.t === 'seg') {
      const res = circleLineToRing(x.c, x.r, [y.a, y.b])
      return { d: res.d, p: res.pCircle, q: res.qRing, overlap: false }
    }
  }

  if (x.t === 'seg' && y.t === 'seg') return { ...segmentSegment(x.a, x.b, y.a, y.b), overlap: false }
  throw new Error('측정 조합을 처리할 수 없어요')
}

function between(a: Geo, b: Geo): Raw {
  if (RANK[a.t] <= RANK[b.t]) return ordered(a, b)
  const r = ordered(b, a)
  return { d: r.d, p: r.q, q: r.p, overlap: r.overlap }
}

/** §6.7 거리 계산. 겹침(물건끼리 넓이 > ε) → '겹침', 0.05cm 미만 → '0cm(맞닿음)', 그 외 소수 첫째 자리 */
export function measure(layout: Layout, a: MeasureTarget, b: MeasureTarget): MeasureResult {
  const raw = between(resolve(layout, a), resolve(layout, b))
  const p1 = copy(raw.p)
  const p2 = copy(raw.q)
  if (raw.overlap) return { p1, p2, distance: 0, relation: 'overlap', label: '겹침' }
  const distance = raw.d + 0
  if (distance < TOUCH_CM) return { p1, p2, distance, relation: 'touch', label: '0cm(맞닿음)' }
  return { p1, p2, distance, relation: 'gap', label: `${distance.toFixed(1)}cm` }
}

// ── 대상 고르기 ────────────────────────────────────────────────────────
function itemContains(it: Item, p: Pt): boolean {
  if (it.shape.kind === 'circle') return dist(p, [it.x, it.y]) <= it.shape.d / 2
  return pointInRing(p, worldRing(it))
}

function itemBorderDistance(it: Item, p: Pt): number {
  if (it.shape.kind === 'circle') return Math.abs(dist(p, [it.x, it.y]) - it.shape.d / 2)
  return pointRing(p, worldRing(it)).d
}

/** 탭 위치에서 변 하나(곡선 변 포함)까지 거리 */
function edgeDistance(g: Geo, p: Pt): number {
  if (g.t === 'circleWall') return Math.abs(dist(p, g.c) - g.r)
  if (g.t === 'seg') return pointSegment(p, g.a, g.b).d
  return Infinity
}

/**
 * §6.7 대상 판정(반경 radiusCm 안). 순서:
 * 1 외곽·이너 꼭짓점(가장 가까운 것, 점 대상) → 2 탭 위치를 품은 맨 위 물건
 * → 3 외곽·이너의 변 하나(가장 가까운 변, OD-15. 같으면 외곽 → 이너 배열 순서, 같은 벽 안에서는 앞 번호)
 * → 4 물건 테두리(가장 가까운 것, 같으면 위의 것) → 5 자유 점
 */
export function pickTarget(layout: Layout, p: Pt, radiusCm: number): MeasureTarget {
  const tent = layout.tent
  // 1. 꼭짓점
  const vertexRings: Pt[][] = []
  if (tent.outer.kind !== 'circle') vertexRings.push(outerRing(tent))
  for (const inner of tent.inners) if (inner.shape.kind !== 'circle') vertexRings.push(worldRing(inner))
  let vBest: { d: number; v: Pt } | null = null
  for (const ring of vertexRings) {
    for (const v of ring) {
      const d = dist(p, v)
      if (d <= radiusCm && (vBest === null || d < vBest.d)) vBest = { d, v }
    }
  }
  if (vBest) return { kind: 'point', p: copy(vBest.v) }

  // 2. 품은 물건(맨 위 = 배열 뒤쪽)
  for (let i = layout.items.length - 1; i >= 0; i--) {
    const it = layout.items[i]
    if (itemContains(it, p)) return { kind: 'item', id: it.id }
  }

  // 3. 외곽·이너의 가장 가까운 변 하나
  let wBest: { d: number; wall: string; edge: number } | null = null
  const walls = ['outer', ...tent.inners.map((inner) => inner.id)]
  for (const wall of walls) {
    const edges = wallEdgeGeos(layout, wall)
    for (let edge = 0; edge < edges.length; edge++) {
      const d = edgeDistance(edges[edge], p)
      if (d <= radiusCm && (wBest === null || d < wBest.d)) wBest = { d, wall, edge }
    }
  }
  if (wBest) return { kind: 'wall', wall: wBest.wall, edge: wBest.edge }

  // 4. 물건 테두리
  let iBest: { d: number; id: string } | null = null
  for (let i = layout.items.length - 1; i >= 0; i--) {
    const it = layout.items[i]
    const d = itemBorderDistance(it, p)
    if (d <= radiusCm && (iBest === null || d < iBest.d)) iBest = { d, id: it.id }
  }
  if (iBest) return { kind: 'item', id: iBest.id }

  // 5. 자유 점
  return { kind: 'point', p: copy(p) }
}
