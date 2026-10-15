// 꼭짓점 정렬(소유자 요청 2026-10-15): 끄는 점이 다른 꼭짓점과 가로·세로 줄(90°)이 맞으면 붙이고, 반투명 점선 안내선을 그립니다.
// 순수 함수입니다. 좌표는 월드 cm, 허용 거리 tol도 cm(화면 px / zoom).
import type { Pt } from './model'

/** 같은 줄로 보는 차이(cm, 저장 단위 0.1cm의 절반) */
const SAME_CM = 0.05

export type AlignGuide = { a: Pt; b: Pt }

/**
 * 축마다 허용 거리 tol 안에서 가장 가까운 다른 점의 좌표(세로 줄 = x, 가로 줄 = y). 없으면 null.
 * axes로 움직이는 축만 맞춥니다(상하좌우로만 끌 때).
 */
export function alignAxes(
  p: Pt,
  others: readonly Pt[],
  tol: number,
  axes: { x: boolean; y: boolean } = { x: true, y: true },
): { x: number | null; y: number | null } {
  const pick = (k: 0 | 1): number | null => {
    let best: number | null = null
    let bestD = Math.max(tol, SAME_CM)
    for (const o of others) {
      const d = Math.abs(o[k] - p[k])
      if (d <= bestD) {
        best = o[k]
        bestD = d
      }
    }
    return best
  }
  return { x: axes.x ? pick(0) : null, y: axes.y ? pick(1) : null }
}

/** p와 같은 x(세로선)·같은 y(가로선)인 다른 점들을 잇는 안내선(p 포함 양 끝까지). 길이 0이면 없음 */
export function alignGuides(p: Pt, others: readonly Pt[]): AlignGuide[] {
  const out: AlignGuide[] = []
  const sameX = others.filter((o) => Math.abs(o[0] - p[0]) <= SAME_CM)
  if (sameX.length > 0) {
    const ys = [p[1], ...sameX.map((o) => o[1])]
    const lo = Math.min(...ys)
    const hi = Math.max(...ys)
    if (hi - lo > SAME_CM) out.push({ a: [p[0], lo], b: [p[0], hi] })
  }
  const sameY = others.filter((o) => Math.abs(o[1] - p[1]) <= SAME_CM)
  if (sameY.length > 0) {
    const xs = [p[0], ...sameY.map((o) => o[0])]
    const lo = Math.min(...xs)
    const hi = Math.max(...xs)
    if (hi - lo > SAME_CM) out.push({ a: [lo, p[1]], b: [hi, p[1]] })
  }
  return out
}
