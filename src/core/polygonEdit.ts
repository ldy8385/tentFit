// 자유 다각형 편집·그리기 계산(설계 2026-10-12 §2.2·§2.3). 순수 함수이고 입력 배열을 바꾸지 않습니다.
// 번호는 모두 0부터입니다: 변 i = p[i] → p[(i+1) % n], 꼭짓점 i = p[i].
// UI는 1부터 셉니다: 「변 i」 = 변 i−1, 「꼭짓점 i」 = 꼭짓점 i−1. 마지막 변(닫는 변)·첫 꼭짓점·마지막 꼭짓점은 계산값입니다.
// 좌표계는 y 아래, 회전은 시계 방향 양수(ops/util.rotateAround와 같은 방향)입니다.
import { ringBBox } from './geom'
import { round1, type Pt, type Tent } from './model'
import { gridOriginOf } from './snap'
import { ringIssue } from './validate'

/** 첫 점 격자(cm) */
export const DRAW_GRID_CM = 10
/** 다음 점 방향 단위(도) */
export const DRAW_ANGLE_STEP_DEG = 15
/** 이보다 짧은 변이 생기는 입력은 거부합니다(cm) */
export const MIN_EDGE_CM = 0.05

function copy(points: readonly Pt[]): Pt[] {
  return points.map((p): Pt => [p[0], p[1]])
}

function at(points: readonly Pt[], i: number): Pt {
  const n = points.length
  return points[((i % n) + n) % n] as Pt
}

/** 부호 있는 신발끈 넓이의 부호(+1 / −1). 넓이가 0이면 +1. */
function orientation(points: readonly Pt[]): 1 | -1 {
  let s = 0
  for (let i = 0; i < points.length; i++) {
    const a = at(points, i)
    const b = at(points, i + 1)
    s += a[0] * b[1] - b[0] * a[1]
  }
  return s < 0 ? -1 : 1
}

function rotateAbout(p: Pt, pivot: Pt, rad: number): Pt {
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  const dx = p[0] - pivot[0]
  const dy = p[1] - pivot[1]
  return [pivot[0] + dx * c - dy * s, pivot[1] + dx * s + dy * c]
}

/** 변 i(0부터) = p[i] → p[(i+1) % n]의 길이. n개(닫는 변 포함). */
export function edgeLengths(points: readonly Pt[]): number[] {
  return points.map((p, i) => {
    const q = at(points, i + 1)
    return Math.hypot(q[0] - p[0], q[1] - p[1])
  })
}

/** 꼭짓점 i(0부터)의 내각(도, 0~360). 다각형 방향(부호 있는 넓이)으로 안쪽을 정합니다. */
export function interiorAngles(points: readonly Pt[]): number[] {
  const sigma = orientation(points)
  return points.map((b, i) => {
    const a = at(points, i - 1)
    const c = at(points, i + 1)
    const e1x = b[0] - a[0]
    const e1y = b[1] - a[1]
    const e2x = c[0] - b[0]
    const e2y = c[1] - b[1]
    const turn = Math.atan2(e1x * e2y - e1y * e2x, e1x * e2x + e1y * e2y)
    return 180 - (sigma * turn * 180) / Math.PI
  })
}

/**
 * 변 edgeIndex(0부터, 0 ≤ edgeIndex ≤ n−2)의 길이를 length로: p[edgeIndex+1 … n−1]을
 * (length − 지금 길이) × 그 변 단위 방향만큼 옮깁니다. 다른 변(닫는 변 제외)의 길이·방향은 그대로, p0 고정.
 * 반올림하지 않습니다. 번호가 범위 밖이거나 지금 길이가 0이면 그대로 복사본.
 */
export function setEdgeLength(points: readonly Pt[], edgeIndex: number, length: number): Pt[] {
  const out = copy(points)
  const n = out.length
  if (!Number.isInteger(edgeIndex) || edgeIndex < 0 || edgeIndex > n - 2) return out
  const a = at(out, edgeIndex)
  const b = at(out, edgeIndex + 1)
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  if (!(len > 1e-9)) return out
  const k = (length - len) / len
  const dx = (b[0] - a[0]) * k
  const dy = (b[1] - a[1]) * k
  for (let i = edgeIndex + 1; i < n; i++) {
    const p = at(out, i)
    out[i] = [p[0] + dx, p[1] + dy]
  }
  return out
}

/**
 * 꼭짓점 vertexIndex(0부터, 1 ≤ vertexIndex ≤ n−2)의 내각을 deg로: p[vertexIndex+1 … n−1]을
 * p[vertexIndex] 둘레로 (지금 내각 − deg)만큼(다각형 방향에 맞춘 쪽으로) 돌립니다. 반올림하지 않습니다.
 * 번호가 범위 밖이면 그대로 복사본.
 */
export function setVertexAngle(points: readonly Pt[], vertexIndex: number, deg: number): Pt[] {
  const out = copy(points)
  const n = out.length
  if (!Number.isInteger(vertexIndex) || vertexIndex < 1 || vertexIndex > n - 2) return out
  const current = interiorAngles(out)[vertexIndex]
  if (current === undefined) return out
  const rad = (orientation(out) * (current - deg) * Math.PI) / 180
  const pivot = at(out, vertexIndex)
  for (let i = vertexIndex + 1; i < n; i++) out[i] = rotateAbout(at(out, i), pivot, rad)
  return out
}

/** bbox 가운데를 기준으로 x축은 가로 w, y축은 세로 h가 되게 비율대로 늘이거나 줄입니다. 반올림하지 않습니다. */
export function scaleToSize(points: readonly Pt[], w: number, h: number): Pt[] {
  const bb = ringBBox(copy(points))
  const bw = bb.maxX - bb.minX
  const bh = bb.maxY - bb.minY
  const cx = (bb.minX + bb.maxX) / 2
  const cy = (bb.minY + bb.maxY) / 2
  const sx = bw > 0 ? w / bw : 1
  const sy = bh > 0 ? h / bh : 1
  return points.map((p): Pt => [cx + (p[0] - cx) * sx, cy + (p[1] - cy) * sy])
}

/** 첫 점 격자 원점(설계 §2.2): 외곽 bbox 왼쪽 위, 외곽이 아직 없으면(만들기 화면) 월드 원점. */
export function drawGridOrigin(tent: Pick<Tent, 'outer'>, outerPending: boolean): Pt {
  return outerPending ? [0, 0] : gridOriginOf(tent)
}

/** 상하좌우로만 그릴 때(Shift·[상하좌우] 토글)의 방향 단위(도) */
export const DRAW_RIGHT_ANGLE_DEG = 90

/**
 * 그리는 점 맞춤(설계 §2.2). prev가 null이면 gridOrigin 기준 10cm 격자,
 * 아니면 prev에서 raw까지의 방향을 stepDeg(기본 15°) 단위로, 길이를 10cm 단위(최소 10cm)로. 0.1cm 반올림.
 */
export function snapDrawPoint(prev: Pt | null, raw: Pt, gridOrigin: Pt, stepDeg: number = DRAW_ANGLE_STEP_DEG): Pt {
  if (prev === null) {
    const g = (v: number, o: number) => round1(o + Math.round((v - o) / DRAW_GRID_CM) * DRAW_GRID_CM)
    return [g(raw[0], gridOrigin[0]), g(raw[1], gridOrigin[1])]
  }
  const vx = raw[0] - prev[0]
  const vy = raw[1] - prev[1]
  const step = (stepDeg * Math.PI) / 180
  const angle = Math.round(Math.atan2(vy, vx) / step) * step
  const len = Math.max(DRAW_GRID_CM, Math.round(Math.hypot(vx, vy) / DRAW_GRID_CM) * DRAW_GRID_CM)
  return [round1(prev[0] + len * Math.cos(angle)), round1(prev[1] + len * Math.sin(angle))]
}

// 0.01cm 정수 격자 판정(geom.ringSelfIntersects와 같은 방식)
type IPt = { x: number; y: number }
const toI = (p: Pt): IPt => ({ x: Math.round(p[0] * 100), y: Math.round(p[1] * 100) })

function orient(a: IPt, b: IPt, c: IPt): number {
  const v = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  return v > 0 ? 1 : v < 0 ? -1 : 0
}

function onSegment(a: IPt, b: IPt, p: IPt): boolean {
  return Math.min(a.x, b.x) <= p.x && p.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= p.y && p.y <= Math.max(a.y, b.y)
}

function segmentsTouch(p1: IPt, p2: IPt, q1: IPt, q2: IPt): boolean {
  const o1 = orient(p1, p2, q1)
  const o2 = orient(p1, p2, q2)
  const o3 = orient(q1, q2, p1)
  const o4 = orient(q1, q2, p2)
  if (o1 !== o2 && o3 !== o4) return true
  if (o1 === 0 && onSegment(p1, p2, q1)) return true
  if (o2 === 0 && onSegment(p1, p2, q2)) return true
  if (o3 === 0 && onSegment(q1, q2, p1)) return true
  if (o4 === 0 && onSegment(q1, q2, p2)) return true
  return false
}

/**
 * 그리는 중 새 변(마지막 점 → next)을 거부할지: 길이 0이거나, 바로 앞 변으로 되접히거나,
 * 이웃이 아닌 이미 있는 변(닫는 변은 아직 없음)에 닿거나 교차하면 true.
 */
export function segmentCrosses(points: readonly Pt[], next: Pt): boolean {
  const n = points.length
  if (n === 0) return false
  const last = toI(at(points, n - 1))
  const q = toI(next)
  if (last.x === q.x && last.y === q.y) return true
  if (n >= 2) {
    const p = toI(at(points, n - 2))
    const dot = (last.x - p.x) * (q.x - last.x) + (last.y - p.y) * (q.y - last.y)
    if (orient(p, last, q) === 0 && dot < 0) return true
  }
  for (let i = 0; i <= n - 3; i++) {
    if (segmentsTouch(toI(at(points, i)), toI(at(points, i + 1)), last, q)) return true
  }
  return false
}

export type CloseCheck = { ok: true } | { ok: false; reason: 'too-few' | 'cross' | 'tiny' }

/** 그린 점으로 닫을 수 있는지: 3점 이상, 꼬임 없음, 넓이 > 1cm²(validate.ringIssue와 같은 기준). */
export function canClosePolygon(points: readonly Pt[]): CloseCheck {
  const code = ringIssue(copy(points))
  if (code === null) return { ok: true }
  if (code === 'too-few-points') return { ok: false, reason: 'too-few' }
  if (code === 'self-intersect') return { ok: false, reason: 'cross' }
  return { ok: false, reason: 'tiny' }
}

/** bbox 가운데(0.1cm 반올림)가 원점이 되게 옮깁니다. 첫 외곽·그린 이너의 로컬 도형용. */
export function centerPolygon(points: readonly Pt[]): { center: Pt; points: Pt[] } {
  const bb = ringBBox(copy(points))
  const center: Pt = [round1((bb.minX + bb.maxX) / 2), round1((bb.minY + bb.maxY) / 2)]
  return { center, points: points.map((p): Pt => [round1(p[0] - center[0]), round1(p[1] - center[1])]) }
}

/** 가장 짧은 변 길이(닫는 변 포함). 점이 2개 미만이면 0. */
export function minEdgeLength(points: readonly Pt[]): number {
  if (points.length < 2) return 0
  return Math.min(...edgeLengths(points))
}
