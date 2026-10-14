// 텐트 편집 캔버스의 누름·탭·끌기 판정(스펙 §4.4-2·§4.4-7·§4.4-8·§4.5, Plan 4 R10·R11). 순수 함수만 둡니다.
// Board(BoardController)가 pointerdown에서 classifyTentPress로 대상을 정하고, 탭이면 tentTapEffect,
// 끌기면 tentDragStep으로 미리보기와 커밋 값을 얻습니다. 문서는 Board가 손을 뗄 때 tentActions로 한 번만 바꿉니다.
import type { Layout, Pt, Tent } from '../../core/model'
import type { TentTarget } from '../../core/ops/tent'
import { tentTargetBlocked, type PointerKind, type TentLock } from '../../store/ui'
import { TAP_SLOP } from '../gestures'
import {
  VERTEX_GRAB_PX,
  handleAt,
  previewInnerMove,
  previewVertexDrag,
  tentDragDelta,
  tentHandles,
  tentHitAt,
} from '../tentEdit'
import { lockToAxis } from '../axisLock'
import { screenToWorld, type View } from '../viewport'

/** 이보다 작게 움직였으면(cm, 저장 단위 0.1cm의 절반) 끌기를 커밋하지 않습니다(Board의 MOVE_EPS_CM과 같은 값). */
export const TENT_MOVE_EPS_CM = 0.05

/** 텐트 모드 누름 대상(R10): 선택한 대상의 꼭짓점·+ > 이너 면(위가 먼저) > 외곽(바닥·외곽선 근처) > 없음 */
export type TentPressHit =
  | { kind: 'vertex'; target: TentTarget; index: number; world: Pt }
  | { kind: 'plus'; target: TentTarget; edgeIndex: number }
  | { kind: 'inner'; innerId: string }
  | { kind: 'outer' }
  | { kind: 'none' }

/** 편집 대상과 선택 꼭짓점(ui.tentTarget·ui.vertexIndex) */
export type TentSelection = { target: TentTarget | null; vertexIndex: number | null }

export type TentTapEffect =
  | { kind: 'select'; target: TentTarget | null; vertexIndex: number | null }
  | { kind: 'insert'; target: TentTarget; edgeIndex: number }
  | { kind: 'none' }

/** 끌기 후보. start = 누른 화면 점(px), startWorld = 그때 보기로 바꾼 월드 점, from = 끌 꼭짓점의 처음 월드 좌표 */
export type TentDrag =
  | {
      kind: 'vertex'
      target: TentTarget
      index: number
      from: Pt
      pointerId: number
      pointer: PointerKind
      start: Pt
      startWorld: Pt
    }
  | { kind: 'inner'; innerId: string; pointerId: number; pointer: PointerKind; start: Pt; startWorld: Pt }

/** 끄는 중 화면에만 그리는 미리보기(문서 밖). invalid면 빨간 점선 + 「놓으면 취소돼요」 */
export type TentPreview = { target: TentTarget; tent: Tent; invalid: boolean }

export type TentDragCommit =
  | { kind: 'vertex'; target: TentTarget; index: number; world: Pt }
  | { kind: 'inner'; innerId: string; dx: number; dy: number }

export function sameTentTarget(a: TentTarget | null, b: TentTarget | null): boolean {
  if (a === null || b === null) return a === b
  if (a === 'outer' || b === 'outer') return a === b
  return a.innerId === b.innerId
}

/**
 * pointerdown 한 점의 대상. 핸들은 지금 선택한 대상(target)에만 있습니다(§4.4-7).
 * 만들기 화면(Plan 4.1): 잠긴 쪽은 핸들·면 모두 잡지 않고, 외곽 없음(outerPending)이면 아무것도 잡지 않습니다.
 */
export function classifyTentPress(
  layout: Layout,
  target: TentTarget | null,
  view: View,
  screen: Pt,
  pointer: PointerKind,
  lock: TentLock = 'none',
  outerPending = false,
): TentPressHit {
  if (outerPending) return { kind: 'none' }
  if (target !== null && !tentTargetBlocked({ tentLock: lock, outerPending }, target)) {
    const h = handleAt(tentHandles(layout, target, view), screen, view, pointer)
    if (h?.kind === 'vertex') return { kind: 'vertex', target, index: h.index, world: h.world }
    if (h?.kind === 'plus') return { kind: 'plus', target, edgeIndex: h.edgeIndex }
  }
  const grabWorld = view.zoom > 0 ? VERTEX_GRAB_PX[pointer] / view.zoom : 0
  return tentHitAt(layout, screenToWorld(view, screen), grabWorld, lock)
}

/** 노드처럼 잡는 누름인지(true면 판정기에 onNode = true). 바닥·외곽선·바깥은 끌면 화면 이동입니다(§4.4-2). */
export function pressGrabs(hit: TentPressHit): boolean {
  return hit.kind === 'vertex' || hit.kind === 'plus' || hit.kind === 'inner'
}

/**
 * 누르는 순간 바꿀 선택. null이면 그대로 둡니다.
 * 꼭짓점은 누르면 바로 선택하고, 선택 안 된 이너는 누르는 순간 대상으로 정해 바로 끌 수 있게 합니다.
 * 핀치·취소로 누름이 무효가 되면 Board가 누르기 전 선택으로 되돌립니다(Review Focus 1).
 */
export function pressSelection(hit: TentPressHit, cur: TentSelection): TentSelection | null {
  if (hit.kind === 'vertex') {
    if (sameTentTarget(cur.target, hit.target) && cur.vertexIndex === hit.index) return null
    return { target: hit.target, vertexIndex: hit.index }
  }
  if (hit.kind === 'inner') {
    const t: TentTarget = { innerId: hit.innerId }
    return sameTentTarget(cur.target, t) ? null : { target: t, vertexIndex: null }
  }
  return null
}

/** 탭으로 끝난 누름의 효과(§4.4-2·§4.4-7) */
export function tentTapEffect(hit: TentPressHit): TentTapEffect {
  switch (hit.kind) {
    case 'plus':
      return { kind: 'insert', target: hit.target, edgeIndex: hit.edgeIndex }
    case 'inner':
      return { kind: 'select', target: { innerId: hit.innerId }, vertexIndex: null }
    case 'outer':
      return { kind: 'select', target: 'outer', vertexIndex: null }
    case 'none':
      return { kind: 'select', target: null, vertexIndex: null }
    case 'vertex':
      return { kind: 'none' } // 누를 때 이미 선택함
  }
}

/** 끌기 후보(꼭짓점·이너 누름만). +·외곽·없음은 null */
export function tentDragFor(
  hit: TentPressHit,
  pointerId: number,
  pointer: PointerKind,
  screen: Pt,
  view: View,
): TentDrag | null {
  const start: Pt = [screen[0], screen[1]]
  const startWorld = screenToWorld(view, screen)
  if (hit.kind === 'vertex') {
    return {
      kind: 'vertex',
      target: hit.target,
      index: hit.index,
      from: [hit.world[0], hit.world[1]],
      pointerId,
      pointer,
      start,
      startWorld,
    }
  }
  if (hit.kind === 'inner') return { kind: 'inner', innerId: hit.innerId, pointerId, pointer, start, startWorld }
  return null
}

/** 탭/끌기 경계를 넘었는지(TAP_SLOP, max(|dx|,|dy|) — 판정기·Konva와 같은 식) */
export function tentDragStarted(drag: TentDrag, screen: Pt): boolean {
  const slop = TAP_SLOP[drag.pointer]
  return Math.max(Math.abs(screen[0] - drag.start[0]), Math.abs(screen[1] - drag.start[1])) >= slop
}

function innerExists(layout: Layout, innerId: string): boolean {
  return layout.tent.inners.some((it) => it.id === innerId)
}

/**
 * 끄는 중 한 점의 미리보기와 커밋할 값.
 * 이동량 = 지금 보기로 바꾼 포인터 월드 점 − 누를 때 월드 점(끄는 중 휠로 확대해도 손가락 아래를 따라감) → tentDragDelta.
 * 꼭짓점은 처음 꼭짓점 좌표 + 이동량(핸들 중심에서 떨어져 눌러도 튀지 않음).
 * 새 이슈가 있으면(R11) invalid이고 commit은 null. 이동량이 TENT_MOVE_EPS_CM 미만이거나 대상이 없어도 null.
 */
export function tentDragStep(
  layout: Layout,
  drag: TentDrag,
  screen: Pt,
  view: View,
  opts?: { axisLock?: boolean },
): { preview: TentPreview; commit: TentDragCommit | null } {
  const w = screenToWorld(view, screen)
  // 상하좌우로만(Shift·[상하좌우] 토글): 누른 점 기준 이동량이 큰 축만 남깁니다.
  const [rx, ry] = opts?.axisLock === true ? lockToAxis(w[0] - drag.startWorld[0], w[1] - drag.startWorld[1]) : [w[0] - drag.startWorld[0], w[1] - drag.startWorld[1]]
  if (drag.kind === 'inner') {
    const target: TentTarget = { innerId: drag.innerId }
    const d = tentDragDelta({ dx: rx, dy: ry, layout, target })
    const r = previewInnerMove(layout, drag.innerId, d.dx, d.dy)
    const invalid = r.issues.length > 0
    const moved = Math.abs(d.dx) >= TENT_MOVE_EPS_CM || Math.abs(d.dy) >= TENT_MOVE_EPS_CM
    const commit: TentDragCommit | null =
      !invalid && moved && innerExists(layout, drag.innerId) ? { kind: 'inner', innerId: drag.innerId, dx: d.dx, dy: d.dy } : null
    return { preview: { target, tent: r.tent, invalid }, commit }
  }
  const d = tentDragDelta({ dx: rx, dy: ry, layout, target: drag.target })
  const world: Pt = [drag.from[0] + d.dx, drag.from[1] + d.dy]
  const r = previewVertexDrag(layout, drag.target, drag.index, world)
  const invalid = r.issues.length > 0
  const moved = Math.abs(d.dx) >= TENT_MOVE_EPS_CM || Math.abs(d.dy) >= TENT_MOVE_EPS_CM
  const exists = drag.target === 'outer' || innerExists(layout, drag.target.innerId)
  const commit: TentDragCommit | null =
    !invalid && moved && exists ? { kind: 'vertex', target: drag.target, index: drag.index, world } : null
  return { preview: { target: drag.target, tent: r.tent, invalid }, commit }
}
