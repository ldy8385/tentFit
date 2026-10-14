// 자유 그리기 캔버스 판정(설계 2026-10-12 §2.2·§3, Plan 4.1). 순수 함수만 둡니다.
// 점 찍기 여부는 판정기(gestures.ts)의 tap 출력으로만 정하고, 여기서는 그 탭을 닫기·점으로 해석합니다.
// 점 추가 검증(맞춤·교차·길이 0)과 문구는 app/tentActions(appendDrawPoint·finishDrawing)가 합니다(같은 동작 두 벌 금지).
// 고무줄은 탭과 같은 core.snapDrawPoint를 써서 "보인 곳 = 찍힌 곳"이 됩니다.
import { round1, type Pt } from '../../core/model'
import { DRAW_ANGLE_STEP_DEG, snapDrawPoint } from '../../core/polygonEdit'
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

export type RubberBand = { from: Pt | null; to: Pt; lengthCm: number | null; closes: boolean }

/**
 * 고무줄: 마지막 점(없으면 null) → 포인터에서 찍힐 점(첫 점 근처면 첫 점)과 길이(cm). origin = 첫 점 격자 원점.
 * stepDeg = 방향 단위(기본 15°, 상하좌우로만이면 90°) — 탭과 같은 값을 넘겨야 "보인 곳 = 찍힌 곳".
 */
export function rubberBand(
  drawing: Drawing,
  pointerScreen: Pt,
  pointer: PointerKind,
  view: View,
  origin: Pt,
  stepDeg: number = DRAW_ANGLE_STEP_DEG,
): RubberBand {
  const pts = drawing.points
  const last = pts[pts.length - 1] ?? null
  const closes = nearFirst(drawing, pointerScreen, pointer, view)
  const first = pts[0]
  const to: Pt = closes && first !== undefined ? [first[0], first[1]] : snapDrawPoint(last, screenToWorld(view, pointerScreen), origin, stepDeg)
  return { from: last, to, lengthCm: last === null ? null : Math.hypot(to[0] - last[0], to[1] - last[1]), closes }
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

/** 길이 배지 문구 '123 cm'(0.1cm, '.0' 없음) */
export function lengthLabel(cm: number): string {
  return `${String(round1(cm))} cm`
}

export type TentDim = { outer: boolean; innerIds: ReadonlySet<string> }

/** 흐리게 그릴 텐트 부분: 잠긴 쪽(만들기 단계, 설계 §1.1) + 다시 그리는 원본(설계 §3). */
export function tentDim(lock: TentLock, drawing: Drawing | null, innerIds: readonly string[]): TentDim {
  const goal = drawing?.goal
  const inners = new Set<string>(lock === 'inners' ? innerIds : [])
  if (goal !== undefined && typeof goal === 'object') inners.add(goal.innerId)
  return { outer: lock === 'outer' || goal === 'outer', innerIds: inners }
}
