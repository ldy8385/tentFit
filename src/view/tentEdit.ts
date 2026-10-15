// 텐트 편집 순수 계산(스펙 §4.4-2·§4.4-3·§4.4-7·§4.4-8, Plan 4 R10·R11). Konva·React·DOM 없음.
// - 핸들(꼭짓점·변 중간 +)의 자리와 잡는 거리, 탭 대상 판정, 좌표 표 기준점, 끄는 중 미리보기를 계산합니다.
// - 외곽은 채움이 없어 Konva 히트로 잡을 수 없으므로(함정 R19) 탭 대상은 이 모듈이 월드 좌표로 판정합니다.
// - 미리보기는 문서를 바꾸지 않습니다. immer produce로 사본을 만들어 "이번 조작으로 새로 생긴 이슈"만 셉니다(R11).
import { produce } from 'immer'
import { outerRing, pointInRing, ringBBox, worldRing } from '../core/geom'
import type { Layout, Pt, Tent } from '../core/model'
import { moveInner, setVertex, targetWorldRing, type TentTarget } from '../core/ops/tent'
import { gridOriginOf } from '../core/snap'
import { newTentIssues, type Issue } from '../core/validate'
import type { PointerKind, TentLock } from '../store/ui'
import { worldToScreen, type BBox, type View } from './viewport'

/** 꼭짓점·+ 핸들과 외곽선을 잡는 거리(화면 px, §4.4-7). Transformer 핸들 규칙보다 우선합니다. */
export const VERTEX_GRAB_PX: Readonly<Record<PointerKind, number>> = Object.freeze({ touch: 22, pen: 8, mouse: 8 })
/** 화면에서 이보다 짧은 변에는 + 를 숨깁니다(px, §4.4-7). */
export const MIN_EDGE_FOR_PLUS_PX = 64
/**
 * 잘못된 편집 표시(§4.4-8): 빨간 점선 + 라벨. 이너 이탈 경고(빨간 실선·빗금·삼각 배지)와 모양이 다릅니다.
 * stroke는 CSS 변수 이름입니다. 캔버스(Konva)는 CSS 변수를 못 읽으므로 그리는 쪽이 THEME 값으로 바꿉니다.
 */
export const INVALID_EDIT_STYLE = { stroke: 'var(--danger)', dash: [6, 4], label: '놓으면 취소돼요' } as const

export type TentHandle = { kind: 'vertex'; index: number; world: Pt } | { kind: 'plus'; edgeIndex: number; world: Pt }

export type TentHit = { kind: 'inner'; innerId: string } | { kind: 'outer' } | { kind: 'none' }

/** -0을 0으로 */
function nz(v: number): number {
  return v === 0 ? 0 : v
}

function findInner(layout: Layout, innerId: string): Tent['inners'][number] | undefined {
  return layout.tent.inners.find((it) => it.id === innerId)
}

function targetIsCircle(layout: Layout, target: TentTarget): boolean {
  if (target === 'outer') return layout.tent.outer.kind === 'circle'
  return findInner(layout, target.innerId)?.shape.kind === 'circle'
}

/**
 * 선택한 대상 하나의 핸들(§4.4-7). 꼭짓점(번호 순) 다음에 변 중간 +(변 번호 순).
 * 변 k = 꼭짓점 k → k+1(마지막 변은 n-1 → 0). + 는 화면 길이가 MIN_EDGE_FOR_PLUS_PX 이상인 변에만 둡니다.
 * 원(§4.4-5)이나 없는 이너면 [].
 */
export function tentHandles(layout: Layout, target: TentTarget, view: View): TentHandle[] {
  if (targetIsCircle(layout, target)) return []
  const ring = targetWorldRing(layout, target)
  const n = ring.length
  if (n < 2) return []
  const out: TentHandle[] = ring.map((p, index): TentHandle => ({ kind: 'vertex', index, world: [p[0], p[1]] }))
  for (let i = 0; i < n; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % n]
    if (a === undefined || b === undefined) continue
    const sa = worldToScreen(view, a)
    const sb = worldToScreen(view, b)
    if (Math.hypot(sb[0] - sa[0], sb[1] - sa[1]) < MIN_EDGE_FOR_PLUS_PX) continue
    out.push({ kind: 'plus', edgeIndex: i, world: [nz((a[0] + b[0]) / 2), nz((a[1] + b[1]) / 2)] })
  }
  return out
}

/** 화면 점에서 잡는 거리(VERTEX_GRAB_PX[pointer]) 안의 가장 가까운 핸들. 거리가 같으면 꼭짓점이 이깁니다. */
export function handleAt(handles: readonly TentHandle[], screen: Pt, view: View, pointer: PointerKind): TentHandle | null {
  const grab = VERTEX_GRAB_PX[pointer]
  let best: TentHandle | null = null
  let bestD = Infinity
  for (const h of handles) {
    const s = worldToScreen(view, h.world)
    const d = Math.hypot(s[0] - screen[0], s[1] - screen[1])
    if (d > grab) continue
    const better = d < bestD || (d === bestD && h.kind === 'vertex' && best?.kind === 'plus')
    if (better) {
      best = h
      bestD = d
    }
  }
  return best
}

/** 점과 선분 사이 거리(cm) */
function segmentDistance(p: Pt, a: Pt, b: Pt): number {
  const vx = b[0] - a[0]
  const vy = b[1] - a[1]
  const len2 = vx * vx + vy * vy
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2)) : 0
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy))
}

/** 닫힌 고리의 변까지 가장 짧은 거리(cm). 점이 없으면 Infinity. */
function ringDistance(p: Pt, ring: readonly Pt[]): number {
  const n = ring.length
  if (n === 0) return Infinity
  let best = Infinity
  for (let i = 0; i < n; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % n]
    if (a === undefined || b === undefined) continue
    best = Math.min(best, segmentDistance(p, a, b))
  }
  return best
}

/**
 * 탭·누름 대상(R10, §4.4-2): 이너 면(배열 뒤쪽이 위) > 외곽 안 또는 외곽선에서 grabWorld(cm) 안 = 외곽 > none.
 * 핸들은 이 함수가 보지 않습니다(handleAt을 먼저 부르세요). grabWorld = VERTEX_GRAB_PX[pointer] / zoom.
 * 만들기 화면 단계 잠금(Plan 4.1): 'inners'면 이너를 건너뛰고(그 자리는 외곽), 'outer'면 외곽을 잡지 않습니다.
 */
export function tentHitAt(layout: Layout, world: Pt, grabWorld: number, lock: TentLock = 'none'): TentHit {
  const inners = layout.tent.inners
  for (let i = inners.length - 1; i >= 0 && lock !== 'inners'; i--) {
    const inner = inners[i]
    if (inner !== undefined && pointInRing(world, worldRing(inner))) return { kind: 'inner', innerId: inner.id }
  }
  if (lock === 'outer') return { kind: 'none' }
  const ring = outerRing(layout.tent)
  if (pointInRing(world, ring)) return { kind: 'outer' }
  if (ringDistance(world, ring) <= grabWorld) return { kind: 'outer' }
  return { kind: 'none' }
}

/** 좌표 표 기준점(D32) = 외곽 바운딩 박스 왼쪽 위 = 격자 원점(snap.gridOriginOf). */
export function tableOrigin(tent: Tent): Pt {
  return gridOriginOf(tent)
}

/** 월드 → 표 좌표(기준점을 0으로 한 cm) */
export function worldToTable(p: Pt, origin: Pt): Pt {
  return [nz(p[0] - origin[0]), nz(p[1] - origin[1])]
}

/** 표 좌표 → 월드 */
export function tableToWorld(p: Pt, origin: Pt): Pt {
  return [nz(p[0] + origin[0]), nz(p[1] + origin[1])]
}

/** 끌기 이동량(월드 cm) → 실제 이동량. 지금은 그대로입니다(Plan 5가 변·격자 스냅을 여기에 넣음). */
export function tentDragDelta(input: { dx: number; dy: number; layout: Layout; target: TentTarget }): {
  dx: number
  dy: number
} {
  return { dx: input.dx, dy: input.dy }
}

/** 꼭짓점 하나(대칭 맞춤이면 짝 mirror도)를 world로 옮긴 미리보기 텐트와, 그 때문에 새로 생긴 이슈(R11). 문서는 바꾸지 않습니다. */
export function previewVertexDrag(
  layout: Layout,
  target: TentTarget,
  index: number,
  world: Pt,
  mirror?: { index: number; world: Pt },
): { tent: Tent; issues: Issue[] } {
  const next = produce(layout, (d) => {
    setVertex(d, target, index, world)
    if (mirror !== undefined) setVertex(d, target, mirror.index, mirror.world)
  })
  return { tent: next.tent, issues: newTentIssues(layout.tent, next.tent) }
}

/** 이너를 (dx, dy)만큼 옮긴 미리보기 텐트와, 그 때문에 새로 생긴 이슈(R11). 이너 이탈은 이슈가 아닙니다. */
export function previewInnerMove(
  layout: Layout,
  innerId: string,
  dx: number,
  dy: number,
): { tent: Tent; issues: Issue[] } {
  const next = produce(layout, (d) => {
    moveInner(d, innerId, dx, dy)
  })
  return { tent: next.tent, issues: newTentIssues(layout.tent, next.tent) }
}

/** 대상의 월드 bbox(reveal·맞춤용). 원은 근사 다각형이 아니라 정확한 지름 상자. 없는 이너면 null. */
export function tentTargetBBox(layout: Layout, target: TentTarget): BBox | null {
  if (target === 'outer') {
    const outer = layout.tent.outer
    if (outer.kind === 'circle') {
      const r = outer.d / 2
      return { minX: nz(-r), minY: nz(-r), maxX: r, maxY: r }
    }
    return { ...ringBBox(outerRing(layout.tent)) }
  }
  const inner = findInner(layout, target.innerId)
  if (inner === undefined) return null
  if (inner.shape.kind === 'circle') {
    const r = inner.shape.d / 2
    return { minX: nz(inner.x - r), minY: nz(inner.y - r), maxX: nz(inner.x + r), maxY: nz(inner.y + r) }
  }
  const ring = targetWorldRing(layout, target)
  return ring.length > 0 ? { ...ringBBox(ring) } : null
}
