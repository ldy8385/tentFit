// 자유 그리기 캔버스 판정(설계 2026-10-12 §2.2·§3, Plan 4.1). 순수 함수만 둡니다.
// 점 찍기 여부는 판정기(gestures.ts)의 tap 출력으로만 정하고, 여기서는 그 탭을 닫기·점으로 해석합니다.
// 점 추가 검증(맞춤·교차·길이 0)과 문구는 app/tentActions(appendDrawPoint·finishDrawing)가 합니다(같은 동작 두 벌 금지).
// 고무줄은 탭과 같은 core.snapDrawPoint를 써서 "보인 곳 = 찍힌 곳"이 됩니다.
import { alignGuides, type AlignGuide } from '../../core/align'
import type { Pt } from '../../core/model'
import { snapDrawPoint } from '../../core/polygonEdit'
import { GRID_STEP } from '../../core/snap'
import type { Drawing, PointerKind, TentLock } from '../../store/ui'
import { TAP_SLOP } from '../gestures'
import { VERTEX_GRAB_PX } from '../tentEdit'
import { screenToWorld, worldToScreen, type View } from '../viewport'

/** 첫 점을 다시 눌렀는지(점 3개 이상, 화면 px, 맞춤 전 탭 점 기준) */
function nearFirst(drawing: Drawing, screen: Pt, pointer: PointerKind, view: View): boolean {
  const first = drawing.points[0]
  if (drawing.points.length < 3 || first === undefined) return false
  const s = worldToScreen(view, first)
  return Math.hypot(s[0] - screen[0], s[1] - screen[1]) <= VERTEX_GRAB_PX[pointer]
}

/** 탭 한 번의 해석: 첫 점 근처면 닫기, 아니면 점(raw = 탭 시점 보기로 바꾼 월드 점, 맞춤 전). */
export function drawTapEffect(drawing: Drawing, tap: Pt, pointer: PointerKind, view: View): { kind: 'close' } | { kind: 'point'; raw: Pt } {
  if (nearFirst(drawing, tap, pointer, view)) return { kind: 'close' }
  return { kind: 'point', raw: screenToWorld(view, tap) }
}

export type RubberBand = { from: Pt | null; to: Pt; closes: boolean }

/**
 * 고무줄: 마지막 점(없으면 null) → 포인터에서 찍힐 점(첫 점 근처면 첫 점). origin = 격자 원점.
 * step = 격자 간격, right = 상하좌우로만 — 탭과 같은 값을 넘겨야 "보인 곳 = 찍힌 곳".
 * 길이 숫자는 DrawLayer가 그립니다(소유자 요청 2026-10-16. 10-15에는 그리는 동안 숨겼음 — 치수 입력은 닫은 뒤 그대로).
 */
export function rubberBand(
  drawing: Drawing,
  pointerScreen: Pt,
  pointer: PointerKind,
  view: View,
  origin: Pt,
  step: number = GRID_STEP,
  right = false,
): RubberBand {
  const pts = drawing.points
  const last = pts[pts.length - 1] ?? null
  const closes = nearFirst(drawing, pointerScreen, pointer, view)
  const first = pts[0]
  const to: Pt = closes && first !== undefined ? [first[0], first[1]] : snapDrawPoint(last, screenToWorld(view, pointerScreen), origin, step, right)
  return { from: last, to, closes }
}

/** 직각으로 보는 각도 차이(°) */
const RIGHT_TOL_DEG = 0.5

/** 직각 표시: 꼭짓점 at에서 두 변 쪽 단위 방향 u·v */
export type RightMark = { at: Pt; u: Pt; v: Pt }

function unitTo(from: Pt, to: Pt): Pt | null {
  const l = Math.hypot(to[0] - from[0], to[1] - from[1])
  return l > 0 ? [(to[0] - from[0]) / l, (to[1] - from[1]) / l] : null
}

/** b에서 a·c 쪽이 직각이면 표시, 아니면 null */
function rightAt(a: Pt, b: Pt, c: Pt): RightMark | null {
  const u = unitTo(b, a)
  const v = unitTo(b, c)
  if (u === null || v === null) return null
  return Math.abs(u[0] * v[0] + u[1] * v[1]) <= Math.sin((RIGHT_TOL_DEG * Math.PI) / 180) ? { at: [b[0], b[1]], u, v } : null
}

/**
 * 그리는 중 안내(소유자 요청 2026-10-16, 붙이지 않고 보이기만): 고무줄 끝(찍힐 자리)이 찍은 점·다른 꼭짓점(others, 월드)과
 * 가로·세로 줄이 맞으면 안내선, 직전 변과 지금 긋는 선이 90°면 그 꼭짓점에 직각 표시. 닫히는 고무줄이면 마지막 점·첫 점의 직각만.
 */
export function drawGuides(drawing: Drawing, rubber: RubberBand | null, others: readonly Pt[]): { lines: AlignGuide[]; right: RightMark[] } {
  const pts = drawing.points
  if (rubber === null) return { lines: [], right: [] }
  const right: RightMark[] = []
  const n = pts.length
  const prev = pts[n - 2]
  const last = pts[n - 1]
  if (prev !== undefined && last !== undefined) {
    const r = rightAt(prev, last, rubber.to)
    if (r !== null) right.push(r)
  }
  if (rubber.closes) {
    const first = pts[0]
    const second = pts[1]
    const r = first !== undefined && second !== undefined && last !== undefined ? rightAt(last, first, second) : null
    if (r !== null) right.push(r)
    return { lines: [], right }
  }
  return { lines: alignGuides(rubber.to, [...pts, ...others]), right }
}

/** 누름이 탭/끌기 경계를 넘었는지(TAP_SLOP, max(|dx|,|dy|) — 판정기와 같은 식). 고무줄 표시에만 씁니다. */
export function pressMoved(pressStart: Pt, at: Pt, pointer: PointerKind): boolean {
  return Math.max(Math.abs(at[0] - pressStart[0]), Math.abs(at[1] - pressStart[1])) >= TAP_SLOP[pointer]
}

/** 고무줄을 보일지: 마우스·펜 = 누르지 않고 캔버스 위(hover)이거나 경계 안 누름, 터치 = 경계 안 누름만. */
export function rubberVisible(s: { pointer: PointerKind; hovering: boolean; pressing: boolean; moved: boolean }): boolean {
  if (s.pressing) return !s.moved
  return s.pointer !== 'touch' && s.hovering
}

export type TentDim = { outer: boolean; innerIds: ReadonlySet<string> }

/** 흐리게 그릴 텐트 부분: 잠긴 쪽(만들기 단계, 설계 §1.1) + 다시 그리는 원본(설계 §3). */
export function tentDim(lock: TentLock, drawing: Drawing | null, innerIds: readonly string[]): TentDim {
  const goal = drawing?.goal
  const inners = new Set<string>(lock === 'inners' ? innerIds : [])
  if (goal !== undefined && typeof goal === 'object') inners.add(goal.innerId)
  return { outer: lock === 'outer' || goal === 'outer', innerIds: inners }
}
