// 기하 연산 래퍼(스펙 §6.1·§6.2·§6.3).
// clipper2-ts와 polylabel은 이 파일에서만 import한다. 다른 모듈은 Region을 이름으로만 다룬다.
// 좌표 단위: Pt·고리는 cm(소수), Region 안쪽은 정수(1cm = SCALE). Region은 불변으로 다룬다(고치지 않고 새로 만든다).
import {
  ClipType,
  EndType,
  FillRule,
  JoinType,
  PolyTree64,
  area as clipperArea,
  booleanOpWithPolyTree,
  difference as clipperDifference,
  inflatePaths,
  intersect as clipperIntersect,
  trimCollinear,
  union as clipperUnion,
} from 'clipper2-ts'
import type { Path64, Paths64, Point64, PolyPath64 } from 'clipper2-ts'
import polylabel from 'polylabel'
import { EPS_AREA } from './model'
import type { Pt, Shape, Tent } from './model'

/** clipper Paths64의 별칭. 바깥 경로는 양(+)의 방향, 구멍은 음(−)의 방향인 정리된 영역. */
export type Region = Paths64
export const SCALE = 100
export const EMPTY_REGION: Region = Object.freeze([]) as unknown as Region

export type Piece = { region: Region; area: number; centroid: Pt }

const AREA_DIV = SCALE * SCALE
const LABEL_PRECISION = 0.5 // cm

/** -0을 0으로 바꾼다. */
function nz(v: number): number {
  return v === 0 ? 0 : v
}

function toInt(v: number): number {
  if (!Number.isFinite(v)) throw new RangeError(`geom: 유한하지 않은 좌표 ${v}`)
  return nz(Math.round(v * SCALE))
}

function ringToPath(ring: Pt[]): Path64 {
  return ring.map(([x, y]) => ({ x: toInt(x), y: toInt(y) }))
}

/**
 * 경로 정리: 연속 중복점·일직선 꼭짓점·되접힌 뾰족점(180° 꺾임)을 지우고, 꼭짓점 3개 미만이거나 넓이 0이면 버린다.
 * 되접힌 수평 변은 clipper2-ts 2.0.1-18 이슈 #36(무한 반복·힙 고갈)의 원인이라 모든 연산 입구에서 지운다.
 */
function cleanPath(p: Path64): Path64 | null {
  const t = trimCollinear(p, false)
  if (t.length < 3) return null
  if (clipperArea(t) === 0) return null
  return t
}

/** Region 입력 정리(방향은 그대로 둔다: 구멍은 음의 방향이어야 함). */
function prep(r: Region): Paths64 {
  const out: Paths64 = []
  for (const p of r) {
    const c = cleanPath(p)
    if (c) out.push(c)
  }
  return out
}

function finish(paths: Paths64): Region {
  return paths.length === 0 ? EMPTY_REGION : paths
}

// ── 원 근사(§6.2) ────────────────────────────────────────────

export function circleSegments(r: number): number {
  if (!(r > 0.05)) return 16
  return Math.max(16, Math.ceil(Math.PI / Math.acos(1 - 0.1 / r)))
}

type GridVertex = { x: number; y: number; dx: number; dy: number }

/**
 * 넓이를 보존하는 N각형(N = circleSegments(r), 꼭짓점 반지름 r′ = r·√(2π / (N·sin(2π/N))), 첫 꼭짓점은 x+ 방향).
 * 중심에서 본 꼭짓점 위치를 0.01cm 정수 격자에 맞춘다. 격자 반올림만 하면 d=500에서 넓이가 약 1.4cm² 어긋나므로,
 * 꼭짓점을 바깥(또는 안)쪽 축 방향으로 한 칸씩 옮겨 πr²에 가장 가깝게 맞춘다(옮김은 꼭짓점마다 최대 0.01cm).
 */
export function circleRing(r: number, cx = 0, cy = 0): Pt[] {
  const n = circleSegments(r)
  const step = (2 * Math.PI) / n
  const rr = r * Math.sqrt((2 * Math.PI) / (n * Math.sin(step)))
  const vs: GridVertex[] = []
  for (let i = 0; i < n; i++) {
    const c = Math.cos(i * step)
    const s = Math.sin(i * step)
    const axisX = Math.abs(c) >= Math.abs(s)
    vs.push({
      x: nz(Math.round(rr * c * SCALE)),
      y: nz(Math.round(rr * s * SCALE)),
      dx: axisX ? Math.sign(c) : 0,
      dy: axisX ? 0 : Math.sign(s),
    })
  }
  const at = (i: number): GridVertex => vs[(i + n) % n] as GridVertex
  let twice = 0 // 2 × 넓이(정수 단위²)
  for (let i = 0; i < n; i++) twice += at(i).x * at(i + 1).y - at(i + 1).x * at(i).y
  const target = 2 * Math.PI * r * r * SCALE * SCALE
  for (let pass = 0; pass < 3; pass++) {
    let moved = false
    for (let i = 0; i < n; i++) {
      const v = at(i)
      const prev = at(i - 1)
      const next = at(i + 1)
      // v를 바깥쪽으로 한 칸 옮길 때 2×넓이 변화(넓이는 꼭짓점마다 일차식이라 정확함)
      const gain = v.dx * (next.y - prev.y) + v.dy * (prev.x - next.x)
      const err = twice - target
      const dir = err < 0 ? 1 : -1
      if (Math.abs(err + dir * gain) < Math.abs(err)) {
        v.x += dir * v.dx
        v.y += dir * v.dy
        twice += dir * gain
        moved = true
      }
    }
    if (!moved) break
  }
  return vs.map((v): Pt => [nz(cx + v.x / SCALE), nz(cy + v.y / SCALE)])
}

// ── 도형 → 고리 ───────────────────────────────────────────────

/** 로컬 좌표 고리. rect는 왼쪽 위부터 시계 방향(y 아래), circle은 넓이 보존 다각형. */
export function shapeRing(shape: Shape): Pt[] {
  switch (shape.kind) {
    case 'rect': {
      const hw = shape.w / 2
      const hh = shape.h / 2
      return [
        [nz(-hw), nz(-hh)],
        [hw, nz(-hh)],
        [hw, hh],
        [nz(-hw), hh],
      ]
    }
    case 'circle':
      return circleRing(shape.d / 2)
    case 'polygon':
      return shape.points.map(([x, y]): Pt => [x, y])
  }
}

function cosSin(deg: number): [number, number] {
  const d = ((deg % 360) + 360) % 360
  if (d === 0) return [1, 0]
  if (d === 90) return [0, 1]
  if (d === 180) return [-1, 0]
  if (d === 270) return [0, -1]
  const t = (d * Math.PI) / 180
  return [Math.cos(t), Math.sin(t)]
}

/** 로컬 원점 기준으로 회전한 뒤 (x, y)로 이동. 각도는 시계 방향 양수(y 아래 화면 좌표). 90° 배수는 정확히 계산. */
export function transformRing(ring: Pt[], x: number, y: number, rotationDeg: number): Pt[] {
  const [c, s] = cosSin(rotationDeg)
  return ring.map(([px, py]): Pt => [nz(px * c - py * s + x), nz(px * s + py * c + y)])
}

/** 원은 회전해도 같은 원이므로 회전을 무시하고 중심만 옮긴다(격자에 맞춘 넓이 보존 꼭짓점을 그대로 쓰기 위해). */
export function worldRing(p: { shape: Shape; x: number; y: number; rotation: number }): Pt[] {
  if (p.shape.kind === 'circle') return circleRing(p.shape.d / 2, p.x, p.y)
  return transformRing(shapeRing(p.shape), p.x, p.y, p.rotation)
}

/** 외곽은 월드 원점·회전 0이므로 로컬 고리가 곧 월드 고리다. */
export function outerRing(tent: Pick<Tent, 'outer'>): Pt[] {
  return shapeRing(tent.outer)
}

// ── 고리 → Region, 불리언 연산(NonZero) ─────────────────────────

/** 정수화 → 정리 → 방향 통일(양) → NonZero 합집합으로 정리된 Region. 넓이 0이면 EMPTY_REGION. */
export function region(ring: Pt[]): Region {
  return regionOf([ring])
}

/** 여러 고리의 합집합. 고리마다 방향을 통일한 뒤 한 번에 합친다(D18: 방향이 반대인 고리도 빠지지 않음). */
export function regionOf(rings: Pt[][]): Region {
  const paths: Paths64 = []
  for (const ring of rings) {
    const p = cleanPath(ringToPath(ring))
    if (!p) continue
    paths.push(clipperArea(p) >= 0 ? p : p.slice().reverse())
  }
  if (paths.length === 0) return EMPTY_REGION
  return finish(clipperUnion(paths, FillRule.NonZero))
}

export function unionAll(regions: Region[]): Region {
  const paths: Paths64 = []
  for (const r of regions) for (const p of prep(r)) paths.push(p)
  if (paths.length === 0) return EMPTY_REGION
  return finish(clipperUnion(paths, FillRule.NonZero))
}

export function intersect(a: Region, b: Region): Region {
  const pa = prep(a)
  const pb = prep(b)
  if (pa.length === 0 || pb.length === 0) return EMPTY_REGION
  return finish(clipperIntersect(pa, pb, FillRule.NonZero))
}

export function subtract(a: Region, b: Region): Region {
  const pa = prep(a)
  if (pa.length === 0) return EMPTY_REGION
  const pb = prep(b)
  if (pb.length === 0) return pa
  return finish(clipperDifference(pa, pb, FillRule.NonZero))
}

/** dCm만큼 넓히거나(+) 좁힌다(−). 둥근 이음(JoinType.Round), 닫힌 다각형(EndType.Polygon). */
export function inflate(a: Region, dCm: number): Region {
  const pa = prep(a)
  if (pa.length === 0) return EMPTY_REGION
  const delta = Math.round(dCm * SCALE)
  if (delta === 0) return pa
  return finish(inflatePaths(pa, delta, JoinType.Round, EndType.Polygon))
}

/** cm². 경로들의 부호 넓이 합(구멍은 음수)이며 0 이상. */
export function area(r: Region): number {
  let s = 0
  for (const p of r) s += clipperArea(p)
  return nz(Math.max(0, s / AREA_DIV))
}

// ── 조각(§6.3) ───────────────────────────────────────────────

function centroidOf(paths: Paths64): Pt {
  let a2 = 0
  let cx = 0
  let cy = 0
  for (const p of paths) {
    const n = p.length
    for (let i = 0; i < n; i++) {
      const p0 = p[i] as Point64
      const p1 = p[(i + 1) % n] as Point64
      const cr = p0.x * p1.y - p1.x * p0.y
      a2 += cr
      cx += (p0.x + p1.x) * cr
      cy += (p0.y + p1.y) * cr
    }
  }
  if (a2 === 0) {
    const f = paths[0]?.[0]
    return f ? [nz(f.x / SCALE), nz(f.y / SCALE)] : [0, 0]
  }
  // 정수 단위로 반올림(= 0.01cm)해서 동률 비교가 부동소수 잡음에 흔들리지 않게 한다.
  return [nz(Math.round(cx / (3 * a2)) / SCALE), nz(Math.round(cy / (3 * a2)) / SCALE)]
}

function makePiece(paths: Paths64): Piece {
  let units = 0
  paths.forEach((p, i) => {
    const a = Math.abs(clipperArea(p))
    units += i === 0 ? a : -a
  })
  return { region: paths, area: nz(Math.max(0, units / AREA_DIV)), centroid: centroidOf(paths) }
}

function collectPieces(node: PolyPath64, out: Paths64[], orphans: Path64[]): void {
  for (let i = 0; i < node.count; i++) {
    const child = node.child(i)
    if (!child.isHole && child.polygon) {
      // clipper2-ts는 외곽 경계에 거의 붙은 구멍을 가끔 구멍이 아닌 노드(음수 넓이)로 돌려준다.
      // 그런 노드는 조각이 아니라 "품은 조각의 구멍"이므로 따로 모았다가 붙인다(리뷰 Critical 1).
      if (clipperArea(child.polygon) < 0) {
        orphans.push(child.polygon)
      } else {
        const paths: Paths64 = [child.polygon]
        for (let j = 0; j < child.count; j++) {
          const hole = child.child(j).polygon
          if (hole) paths.push(hole)
        }
        out.push(paths)
      }
    }
    collectPieces(child, out, orphans)
  }
}

/** 정수 좌표 경로 안에 점(정수 단위)이 있는지(짝홀 규칙). */
function pathContains(path: Path64, x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    const a = path[i] as Point64
    const b = path[j] as Point64
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** 고아 구멍을, 그 무게중심을 품은 가장 작은 조각의 구멍으로 붙인다. 품은 조각이 없으면 버린다. */
function attachOrphans(pieceList: Paths64[], orphans: Path64[]): void {
  for (const hole of orphans) {
    const [cx, cy] = centroidOf([hole])
    const x = Math.round(cx * SCALE)
    const y = Math.round(cy * SCALE)
    let best: Paths64 | null = null
    let bestArea = Infinity
    for (const p of pieceList) {
      const outerPath = p[0] as Path64
      if (!pathContains(outerPath, x, y)) continue
      const a = Math.abs(clipperArea(outerPath))
      if (a < bestArea) {
        bestArea = a
        best = p
      }
    }
    if (best) best.push(hole)
  }
}

/**
 * PolyTree의 모든 깊이에서 구멍이 아닌 노드 하나 = 조각 하나. 조각의 경로는 그 노드 + 직속 구멍들이고,
 * 넓이는 그 경로들로만 센다(PolyPath.area()의 재귀 합은 쓰지 않음 → 섬을 이중 계산하지 않음).
 * 정렬: 넓이 내림차순, 넓이 차가 EPS_AREA 이하면 centroid y → x 오름차순.
 */
export function pieces(r: Region): Piece[] {
  const pr = prep(r)
  if (pr.length === 0) return []
  const tree = new PolyTree64()
  booleanOpWithPolyTree(ClipType.Union, pr, null, tree, FillRule.NonZero)
  const pathsList: Paths64[] = []
  const orphans: Path64[] = []
  collectPieces(tree, pathsList, orphans)
  attachOrphans(pathsList, orphans)
  const out: Piece[] = pathsList.map(makePiece)
  out.sort((a, b) => {
    if (Math.abs(a.area - b.area) > EPS_AREA) return b.area - a.area
    if (a.centroid[1] !== b.centroid[1]) return a.centroid[1] - b.centroid[1]
    return a.centroid[0] - b.centroid[0]
  })
  return out
}

/** 가장 큰 조각의 polylabel(접근 불가능한 극점, cm). 빈 영역이면 [0, 0]. */
export function labelPoint(r: Region): Pt {
  const best = pieces(r)[0]
  if (!best) return [0, 0]
  const p = polylabel(regionRings(best.region), LABEL_PRECISION)
  return [nz(p[0]), nz(p[1])]
}

/** Region의 경로들을 cm 고리로(바깥과 구멍을 구분하지 않음, 닫는 점 없음). */
export function regionRings(r: Region): Pt[][] {
  return r.map((p) => p.map((q): Pt => [nz(q.x / SCALE), nz(q.y / SCALE)]))
}

// ── cm 고리 보조 함수 ─────────────────────────────────────────

/** 신발끈 공식의 절댓값, cm². */
export function ringArea(ring: Pt[]): number {
  const n = ring.length
  if (n < 3) return 0
  let s = 0
  for (let i = 0; i < n; i++) {
    const [x0, y0] = ring[i] as Pt
    const [x1, y1] = ring[(i + 1) % n] as Pt
    s += x0 * y1 - x1 * y0
  }
  return nz(Math.abs(s) / 2)
}

/** 빈 고리면 모두 0. */
export function ringBBox(ring: Pt[]): { minX: number; minY: number; maxX: number; maxY: number } {
  if (ring.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of ring) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
}

type IPt = { x: number; y: number }

function intRing(ring: Pt[]): IPt[] {
  const pts: IPt[] = []
  for (const [x, y] of ring) {
    const q = { x: toInt(x), y: toInt(y) }
    const last = pts[pts.length - 1]
    if (!last || last.x !== q.x || last.y !== q.y) pts.push(q)
  }
  for (;;) {
    const first = pts[0]
    const last = pts[pts.length - 1]
    if (pts.length > 1 && first && last && first.x === last.x && first.y === last.y) pts.pop()
    else break
  }
  return pts
}

function orient(a: IPt, b: IPt, c: IPt): number {
  const v = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  return v > 0 ? 1 : v < 0 ? -1 : 0
}

function onSegment(a: IPt, b: IPt, p: IPt): boolean {
  return (
    Math.min(a.x, b.x) <= p.x &&
    p.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= p.y &&
    p.y <= Math.max(a.y, b.y)
  )
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
 * 0.01cm 정수 격자에서 판정. 인접하지 않은 두 변이 닿거나 겹치면 true, 인접한 두 변은 되접힐 때(180° 꺾임)만 true.
 * 연속 중복점은 먼저 지운다. 꼭짓점이 3개 미만이면 false(꼭짓점 부족은 validate가 따로 본다).
 */
export function ringSelfIntersects(ring: Pt[]): boolean {
  const pts = intRing(ring)
  const n = pts.length
  if (n < 3) return false
  for (let i = 0; i < n; i++) {
    const a1 = pts[i] as IPt
    const a2 = pts[(i + 1) % n] as IPt
    for (let j = i + 1; j < n; j++) {
      const b1 = pts[j] as IPt
      const b2 = pts[(j + 1) % n] as IPt
      if (j === i + 1 || (i === 0 && j === n - 1)) {
        // 공유 꼭짓점을 가운데 둔 세 점 p → s → q
        const [p, s, q] = j === i + 1 ? [a1, a2, b2] : [b1, a1, a2]
        const dot = (s.x - p.x) * (q.x - s.x) + (s.y - p.y) * (q.y - s.y)
        if (orient(p, s, q) === 0 && dot < 0) return true
        continue
      }
      if (segmentsTouch(a1, a2, b1, b2)) return true
    }
  }
  return false
}

/** 짝홀 규칙. 경계 위(0.01cm 격자 기준)는 안으로 본다. */
export function pointInRing(p: Pt, ring: Pt[]): boolean {
  const pts = intRing(ring)
  const n = pts.length
  if (n < 3) return false
  const q = { x: toInt(p[0]), y: toInt(p[1]) }
  let inside = false
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = pts[i] as IPt
    const b = pts[j] as IPt
    if (orient(a, b, q) === 0 && onSegment(a, b, q)) return true
    if (a.y > q.y !== b.y > q.y) {
      const xCross = a.x + ((q.y - a.y) * (b.x - a.x)) / (b.y - a.y)
      if (q.x < xCross) inside = !inside
    }
  }
  return inside
}
