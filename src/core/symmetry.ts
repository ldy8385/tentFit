// 대칭 맞춤(소유자 요청 2026-10-15): 좌우(세로 기준선 x=c) 또는 상하(가로 기준선 y=c). 순수 함수, 좌표는 대상의 로컬 cm.
// 기준선 자리 c = 꼭짓점을 감싸는 상자의 가운데(소유자 2026-10-16: 원점은 꼭짓점을 옮기면 가운데에서 어긋나므로).
// 대칭인 도형이면 대칭축은 늘 그 상자의 가운데를 지나므로 판정도 이 자리 하나만 보면 됩니다.
import type { Pt } from './model'

/** 'x' = 좌우 대칭(x → −x), 'y' = 상하 대칭(y → −y) */
export type SymAxis = 'x' | 'y'

/** 같은 자리로 보는 차이(cm, 저장 단위 0.1cm + 반올림 여유) */
const SAME_CM = 0.11
const ON_AXIS_CM = 1e-6

/** 기준선(x=c 또는 y=c) 건너편 자리 */
export function reflect(p: Pt, axis: SymAxis, c = 0): Pt {
  return axis === 'x' ? [2 * c - p[0], p[1]] : [p[0], 2 * c - p[1]]
}

/** 기준선까지의 거리 좌표(좌우면 x, 상하면 y) */
function across(p: Pt, axis: SymAxis): number {
  return axis === 'x' ? p[0] : p[1]
}

/** 기준선 자리: 꼭짓점을 감싸는 상자의 가운데(좌우면 x, 상하면 y). 점이 없으면 0 */
export function symmetryCenter(points: readonly Pt[], axis: SymAxis): number {
  if (points.length === 0) return 0
  const vs = points.map((p) => across(p, axis))
  return (Math.min(...vs) + Math.max(...vs)) / 2
}

/**
 * 기준선(c, 기본 = 상자 가운데) 기준 대칭이면 꼭짓점마다 짝 번호(partners[i] = i의 반대편 꼭짓점, 기준선 위 점은 자기 자신), 아니면 null.
 * 반사는 고리 순서를 뒤집으므로 짝 = (k − i) mod n 꼴만 봅니다(위치만 우연히 겹치는 경우를 거름).
 */
export function symmetryPartners(points: readonly Pt[], axis: SymAxis, c = symmetryCenter(points, axis)): number[] | null {
  const n = points.length
  if (n < 3) return null
  for (let k = 0; k < n; k++) {
    const partners = points.map((_, i) => (((k - i) % n) + n) % n)
    const ok = points.every((p, i) => {
      const r = reflect(p, axis, c)
      const q = points[partners[i] as number] as Pt
      return Math.abs(r[0] - q[0]) <= SAME_CM && Math.abs(r[1] - q[1]) <= SAME_CM
    })
    if (ok) return partners
  }
  return null
}

/** 기준선(c, 기본 = 상자 가운데) 기준 대칭인지 */
export function isSymmetric(points: readonly Pt[], axis: SymAxis, c = symmetryCenter(points, axis)): boolean {
  return symmetryPartners(points, axis, c) !== null
}

/**
 * 끄는 점 p를 대칭 자리에 붙입니다: 다른 꼭짓점의 반대편 자리(짝 = 그 꼭짓점) 또는 기준선(c) 위(짝 없음) 중 tol 안에서 가장 가까운 곳.
 * 없으면 null.
 */
export function symmetrySnap(p: Pt, others: readonly Pt[], axis: SymAxis, tol: number, c = 0): { point: Pt; partner: Pt | null } | null {
  const lim = Math.max(tol, 0.05)
  let best: { point: Pt; partner: Pt | null } | null = null
  let bestD = lim
  for (const o of others) {
    const m = reflect(o, axis, c)
    const d = Math.hypot(m[0] - p[0], m[1] - p[1])
    if (d <= bestD) {
      best = { point: m, partner: [o[0], o[1]] }
      bestD = d
    }
  }
  const da = Math.abs(across(p, axis) - c)
  if (da < bestD) best = { point: axis === 'x' ? [c, p[1]] : [p[0], c], partner: null }
  return best
}

/** 반평면(기준선의 keep 쪽, 기준선 포함)으로 자르기(Sutherland–Hodgman). on = 기준선 위 점인지 */
function clipHalf(points: readonly Pt[], radii: readonly number[], axis: SymAxis, keep: 'neg' | 'pos'): { p: Pt; r: number; on: boolean }[] {
  const sign = keep === 'neg' ? 1 : -1
  const side = (q: Pt) => sign * across(q, axis) // ≤ 0 이면 남기는 쪽
  const out: { p: Pt; r: number; on: boolean }[] = []
  const n = points.length
  for (let i = 0; i < n; i++) {
    const s = points[(i - 1 + n) % n] as Pt
    const e = points[i] as Pt
    const ss = side(s)
    const se = side(e)
    const cut = (): Pt => {
      const t = ss / (ss - se)
      const q: Pt = [s[0] + (e[0] - s[0]) * t, s[1] + (e[1] - s[1]) * t]
      return axis === 'x' ? [0, q[1]] : [q[0], 0]
    }
    if (se <= ON_AXIS_CM) {
      if (ss > ON_AXIS_CM) out.push({ p: cut(), r: 0, on: true })
      out.push({ p: [e[0], e[1]], r: radii[i] ?? 0, on: Math.abs(se) <= ON_AXIS_CM })
    } else if (ss <= ON_AXIS_CM && !(Math.abs(ss) <= ON_AXIS_CM)) {
      out.push({ p: cut(), r: 0, on: true })
    }
  }
  return out
}

function collinear(a: Pt, b: Pt, c: Pt): boolean {
  return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) <= 1e-6 * (1 + Math.hypot(c[0] - a[0], c[1] - a[1]))
}

/**
 * 한쪽 기준으로 대칭 맞추기: keep 쪽 절반(neg = 왼쪽·위쪽, pos = 오른쪽·아래쪽)을 기준선(c, 기본 = 상자 가운데)에서 잘라
 * 반대편으로 뒤집어 붙입니다.
 * 반지름은 남긴 꼭짓점과 그 짝에 같이, 기준선 위에서 일직선이 된 점은 뺍니다.
 * 기준선이 도형을 지나지 않거나(한쪽에만 있음) 여러 번 지나면(오목하게 휘어 남는 쪽이 둘로 갈림) null.
 */
export function symmetrize(
  points: readonly Pt[],
  radii: readonly number[] | undefined,
  axis: SymAxis,
  keep: 'neg' | 'pos',
  c = symmetryCenter(points, axis),
): { points: Pt[]; radii: number[] } | null {
  // 기준선이 원점에 오게 옮겨 자르고 뒤집은 뒤 되돌립니다.
  const shift = (p: Pt, d: number): Pt => (axis === 'x' ? [p[0] + d, p[1]] : [p[0], p[1] + d])
  const r = symmetrizeAtOrigin(points.map((p) => shift(p, -c)), radii, axis, keep)
  return r === null ? null : { points: r.points.map((p) => shift(p, c)), radii: r.radii }
}

function symmetrizeAtOrigin(
  points: readonly Pt[],
  radii: readonly number[] | undefined,
  axis: SymAxis,
  keep: 'neg' | 'pos',
): { points: Pt[]; radii: number[] } | null {
  const cut = clipHalf(points, radii ?? [], axis, keep)
  const off = cut.map((v) => !v.on)
  const n = cut.length
  if (n < 3 || !off.some(Boolean) || off.every(Boolean)) return null
  // 기준선 밖(남기는 쪽) 점들이 고리에서 한 덩어리여야 합니다.
  let starts = 0
  for (let i = 0; i < n; i++) if (off[i] && !off[(i - 1 + n) % n]) starts++
  if (starts !== 1) return null
  let s = 0
  while (!(off[s] && !off[(s - 1 + n) % n])) s++
  const run: { p: Pt; r: number }[] = []
  for (let i = s; off[i % n]; i++) run.push(cut[i % n] as { p: Pt; r: number })
  const head = cut[(s - 1 + n) % n] as { p: Pt; r: number }
  const tail = cut[(s + run.length) % n] as { p: Pt; r: number }
  const mirrored = [...run].reverse().map((v) => ({ p: reflect(v.p, axis), r: v.r }))
  let ring = [head, ...run, tail, ...mirrored]
  // 기준선 위 점(head·tail)이 양옆 짝과 일직선이면 뺍니다.
  ring = ring.filter((v, i) => {
    if (v !== head && v !== tail) return true
    const prev = ring[(i - 1 + ring.length) % ring.length] as { p: Pt }
    const next = ring[(i + 1) % ring.length] as { p: Pt }
    return !collinear(prev.p, v.p, next.p)
  })
  if (ring.length < 3) return null
  return { points: ring.map((v) => [v.p[0], v.p[1]]), radii: ring.map((v) => v.r) }
}
