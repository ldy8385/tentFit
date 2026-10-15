// 대칭 맞춤(소유자 요청 2026-10-15): 좌우(세로 기준선 x=0) 또는 상하(가로 기준선 y=0). 기준선은 도형의 로컬 원점입니다
// (예시 모양은 원점 가운데로 만들어지고, 그린 외곽도 처음 닫을 때 가운데가 원점). 순수 함수, 좌표는 대상의 로컬 cm.
import type { Pt } from './model'

/** 'x' = 좌우 대칭(x → −x), 'y' = 상하 대칭(y → −y) */
export type SymAxis = 'x' | 'y'

/** 같은 자리로 보는 차이(cm, 저장 단위 0.1cm + 반올림 여유) */
const SAME_CM = 0.11
const ON_AXIS_CM = 1e-6

export function reflect(p: Pt, axis: SymAxis): Pt {
  return axis === 'x' ? [-p[0], p[1]] : [p[0], -p[1]]
}

/** 기준선까지의 거리 좌표(좌우면 x, 상하면 y) */
function across(p: Pt, axis: SymAxis): number {
  return axis === 'x' ? p[0] : p[1]
}

/** 원점 기준 대칭인지: 반사는 고리 순서를 뒤집으므로 짝 = (k − i) mod n 꼴만 봅니다(위치만 우연히 겹치는 경우를 거름). */
export function isSymmetric(points: readonly Pt[], axis: SymAxis): boolean {
  const n = points.length
  if (n < 3) return false
  for (let k = 0; k < n; k++) {
    let ok = true
    for (let i = 0; i < n && ok; i++) {
      const r = reflect(points[i] as Pt, axis)
      const q = points[(((k - i) % n) + n) % n] as Pt
      ok = Math.abs(r[0] - q[0]) <= SAME_CM && Math.abs(r[1] - q[1]) <= SAME_CM
    }
    if (ok) return true
  }
  return false
}

/**
 * 끄는 점 p를 대칭 자리에 붙입니다: 다른 꼭짓점의 반대편 자리(짝 = 그 꼭짓점) 또는 기준선 위(짝 없음) 중 tol 안에서 가장 가까운 곳.
 * 없으면 null.
 */
export function symmetrySnap(p: Pt, others: readonly Pt[], axis: SymAxis, tol: number): { point: Pt; partner: Pt | null } | null {
  const lim = Math.max(tol, 0.05)
  let best: { point: Pt; partner: Pt | null } | null = null
  let bestD = lim
  for (const o of others) {
    const m = reflect(o, axis)
    const d = Math.hypot(m[0] - p[0], m[1] - p[1])
    if (d <= bestD) {
      best = { point: m, partner: [o[0], o[1]] }
      bestD = d
    }
  }
  const da = Math.abs(across(p, axis))
  if (da < bestD) best = { point: axis === 'x' ? [0, p[1]] : [p[0], 0], partner: null }
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
 * 한쪽 기준으로 대칭 맞추기: keep 쪽 절반(neg = 왼쪽·위쪽, pos = 오른쪽·아래쪽)을 기준선에서 잘라 반대편으로 뒤집어 붙입니다.
 * 반지름은 남긴 꼭짓점과 그 짝에 같이, 기준선 위에서 일직선이 된 점은 뺍니다.
 * 기준선이 도형을 지나지 않거나(한쪽에만 있음) 여러 번 지나면(오목하게 휘어 남는 쪽이 둘로 갈림) null.
 */
export function symmetrize(
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
