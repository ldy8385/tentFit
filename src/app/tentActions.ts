// 텐트 문서 동작(스펙 §4.4·§4.7-8). 패널·시트·캔버스·툴바·단축키는 이 함수를 부르기만 합니다(같은 동작 두 벌 금지).
// 문서는 doc.commit(recipe)로만 바꾸고, recipe 안에서는 core/ops/tent만 부릅니다(스펙 §7 규칙 2).
// 잘못된 결과 막기(§4.4-8·§6.9): 미리 produce로 만들어 보고, 이번 조작으로 "새로 생긴" 이슈가 있으면 커밋하지 않습니다(R11).
import { produce } from 'immer'
import { ringBBox } from '../core/geom'
import { createLayout, LIMITS, newId, normAngle, round1, type Layout, type Pt, type Shape, type ShapeTemplate, type Tent } from '../core/model'
import {
  addInnerFromPolygon,
  addInnerFromTemplate,
  deleteInner,
  deleteVertex,
  insertVertex,
  moveInner,
  moveInnerTo,
  renameInner,
  rotateInner,
  setCircleDiameter,
  setInnerTemplate,
  setOuterTemplate,
  setTargetPolygon,
  setTargetShapeTemplate,
  setVertex,
  swapTent,
  targetLocalRing,
  targetWorldRing,
  type TentTarget,
} from '../core/ops/tent'
import {
  canClosePolygon,
  centerPolygon,
  drawGridOrigin,
  edgeLengths,
  interiorAngles,
  MIN_EDGE_CM,
  minEdgeLength,
  scaleToSize,
  segmentCrosses,
  setEdgeLength,
  setVertexAngle,
  snapDrawPoint,
  DRAW_RIGHT_ANGLE_DEG,
} from '../core/polygonEdit'
import {
  attachBBoxToWall,
  defaultInnerTemplate,
  defaultOuterTemplate,
  shapeFromTemplate,
  templateFromBBox,
  type AttachSide,
  type TemplateKind,
} from '../core/templates'
import { innersOverlap, newTentIssues, type IssueCode } from '../core/validate'
import { sameTentTarget, tentTargetBlocked, type DrawGoal, type UiState } from '../store/ui'
import { getZones } from './derived'
import type { Stores } from './stores'
import { fitToLayout } from './viewActions'

/** 동작 결과. error는 입력칸 아래에 그대로 보여 줄 사용자 문구(Issue.message 또는 범위 문구)입니다. */
export type EditResult = { ok: true } | { ok: false; error: string }

/** 새 이너를 놓을 자리가 없을 때의 토스트(§4.4-1·§4.4-4) */
export const NO_SPACE_MESSAGE = '빈 공간이 부족해요'
/** 꼭짓점이 3개 남았을 때 삭제를 막는 문구(§6.9) */
export const MIN_VERTEX_MESSAGE = '꼭짓점이 3개면 지울 수 없어요'
/** 그린 이너가 다른 이너와 겹칠 때(설계 2026-10-12 §2.2) */
export const OVERLAP_DRAW_MESSAGE = '다른 이너와 겹쳐요'
/** 그리는 선이 꼬이거나 점이 모자랄 때(설계 §2.2) */
export const CROSS_MESSAGE = '선이 겹쳐요'
/** 그린 도형 넓이가 1cm² 이하일 때(설계 §2.2) */
export const TINY_MESSAGE = '너무 작아요'
/** 변 길이·각도·크기 입력으로 길이 0인 변이 생길 때(Plan 4.1 판단 Q9) */
export const ZERO_EDGE_MESSAGE = '변 길이가 0이 돼요'
/** 육각형 윗·아랫변이 가로보다 길 때(업체 도면식 육각형) */
export const HEXAGON_EDGE_MESSAGE = '윗·아랫변은 가로보다 길 수 없어요'
/** 각도 입력 결과 다각형 방향이 뒤집혀 그 각이 되지 않을 때(최종 리뷰) */
export const ANGLE_FLIP_MESSAGE = '그 각도로는 만들 수 없어요'

const OK: EditResult = { ok: true }

/** 텐트 컨트롤(모드 토글·[+이너]·[완료]·입력칸·[텐트 바꾸기])을 쓸 수 있는지. 측정 잠금 이음매 — Plan 5가 이 함수만 손봅니다. */
export function tentControlsEnabled(ui: Pick<UiState, 'measuring'>): boolean {
  return !ui.measuring
}

function formatBound(v: number): string {
  return v.toLocaleString('ko-KR', { maximumFractionDigits: 2 })
}

/** 입력칸의 범위 문구와 같은 모양(ui/fields/numberInput.checkNumber) */
function rangeError(min: number, max: number): EditResult {
  return { ok: false, error: `${formatBound(min)}~${formatBound(max)} 사이로 입력해 주세요` }
}

function inRange(v: number, [min, max]: readonly [number, number]): boolean {
  return Number.isFinite(v) && v >= min && v <= max
}

/** 템플릿 값이 §5.1 범위 안인지. 벗어나면 그 범위 문구 */
function templateRangeError(t: ShapeTemplate): EditResult | null {
  switch (t.kind) {
    case 'rect':
      return inRange(t.w, LIMITS.length) && inRange(t.h, LIMITS.length) ? null : rangeError(...LIMITS.length)
    case 'trapezoid':
      if (!inRange(t.front, LIMITS.length) || !inRange(t.back, LIMITS.length) || !inRange(t.depth, LIMITS.length)) {
        return rangeError(...LIMITS.length)
      }
      return inRange(t.offset, LIMITS.offset) ? null : rangeError(...LIMITS.offset)
    case 'ngon':
      if (!Number.isInteger(t.n) || !inRange(t.n, LIMITS.ngonN)) return rangeError(...LIMITS.ngonN)
      return inRange(t.size, LIMITS.length) ? null : rangeError(...LIMITS.length)
    case 'circle':
      return inRange(t.d, LIMITS.length) ? null : rangeError(...LIMITS.length)
    case 'hexagon':
      if (!inRange(t.w, LIMITS.length) || !inRange(t.h, LIMITS.length) || !inRange(t.edge, LIMITS.length)) {
        return rangeError(...LIMITS.length)
      }
      return t.edge > t.w ? { ok: false, error: HEXAGON_EDGE_MESSAGE } : null
  }
}

type Attempt = { kind: 'committed' } | { kind: 'unchanged' } | { kind: 'rejected'; error: string; code: IssueCode }

/**
 * 거부 판정 공통: produce로 미리 만들어 보고, 바뀐 게 없으면 커밋하지 않고(기록 없음),
 * 이번 조작으로 새로 생긴 이슈(newTentIssues)가 있으면 첫 이슈 문구로 거부, 아니면 같은 recipe로 커밋 1번.
 */
function attempt(stores: Stores, recipe: (d: Layout) => void): Attempt {
  const doc = stores.doc.getState()
  const before = doc.layout
  const next = produce(before, (d) => {
    recipe(d)
  })
  if (next === before) return { kind: 'unchanged' }
  const issue = newTentIssues(before.tent, next.tent)[0]
  if (issue !== undefined) return { kind: 'rejected', error: issue.message, code: issue.code }
  return doc.commit(recipe) ? { kind: 'committed' } : { kind: 'unchanged' }
}

function toResult(a: Attempt): EditResult {
  return a.kind === 'rejected' ? { ok: false, error: a.error } : OK
}

/** 텐트 문서 조작 하나를 거부 판정(새 이슈면 거부, 같으면 기록 없음) 뒤 커밋합니다. 다른 동작 모듈(dimActions)용. */
export function tryTentEdit(stores: Stores, recipe: (d: Layout) => void): EditResult {
  return toResult(attempt(stores, recipe))
}

/** 이 대상에 텐트 편집을 쓸 수 있는지(측정 잠금 + 만들기 단계 잠금). 다른 동작 모듈(dimActions)용. */
export function canEditTentTarget(stores: Stores, target: TentTarget): boolean {
  return canEdit(stores, target)
}

/** 대상이 지금 배치에 있는지(외곽은 늘 있음) */
function targetExists(layout: Layout, target: TentTarget): boolean {
  return target === 'outer' || layout.tent.inners.some((it) => it.id === target.innerId)
}

/** 대상의 꼭짓점 수. 원이거나 없는 대상이면 null(꼭짓점 없음) */
function vertexCount(layout: Layout, target: TentTarget): number | null {
  if (!targetExists(layout, target)) return null
  const shape = target === 'outer' ? layout.tent.outer : layout.tent.inners.find((it) => it.id === target.innerId)?.shape
  if (shape === undefined || shape.kind === 'circle') return null
  return targetWorldRing(layout, target).length
}

/** 텐트 편집 모드로(배치 모드 정리는 setMode가 함). 대상을 주면 그 대상을 고릅니다(없는 이너면 고르지 않음). */
/**
 * 캔버스에서 편집 대상을 고릅니다(§4.4-2). 대상을 고르면 PC 경고 패널 대신 텐트 편집 패널이 보이게 합니다
 * (§4.6 "캔버스에서 직접 고르면 경고 패널 대신 속성 패널" — 물건 선택과 같은 규칙, 최종 리뷰).
 */
export function selectTentTargetFromCanvas(stores: Stores, target: TentTarget | null, vertexIndex: number | null): void {
  const ui = stores.ui.getState()
  ui.selectTentTarget(target, vertexIndex)
  if (target !== null && ui.desktopPanel === 'warnings') ui.patch({ desktopPanel: 'auto' })
}

export function enterTentMode(stores: Stores, target?: TentTarget | null): void {
  const ui = stores.ui.getState()
  ui.setMode('tent')
  if (stores.ui.getState().mode !== 'tent') return // 측정 중이면 모드가 바뀌지 않음
  if (target === undefined || target === null) return
  if (targetExists(stores.doc.getState().layout, target)) stores.ui.getState().selectTentTarget(target)
}

/** 배치 모드로([완료]·모드 토글). 편집 대상과 텐트 시트는 setMode가 정리합니다. */
export function exitTentMode(stores: Stores): void {
  stores.ui.getState().setMode('place')
}

/** §4.4-4 새 이너(사각형 예시). 실패면 토스트 「빈 공간이 부족해요」와 null. 성공하면 새 이너를 대상으로 고르고 id를 돌려줍니다. */
export function addInnerAction(stores: Stores): string | null {
  return addInnerShape(stores, 'rect')
}

/**
 * 예시 모양 이너(설계 2026-10-12 §2.1): 기본 치수(s = newInnerSide)로 가장 큰 빈 바닥에 넣고 고릅니다(1칸).
 * 자리가 없으면 토스트 「빈 공간이 부족해요」와 null. 측정 중·이너 잠금·외곽 없음이면 아무것도 하지 않고 null.
 */
export function addInnerShape(stores: Stores, kind: TemplateKind): string | null {
  const ui = stores.ui.getState()
  if (!tentControlsEnabled(ui) || ui.tentLock === 'inners' || ui.outerPending) return null
  const doc = stores.doc.getState()
  const zones = getZones(doc.layout)
  const template = defaultInnerTemplate(kind, doc.layout.tent.outer)
  const id = newId()
  let added = false
  doc.commit((d) => {
    added = addInnerFromTemplate(d, zones, template, id).ok
  })
  if (!added) {
    stores.ui.getState().showToast(NO_SPACE_MESSAGE)
    return null
  }
  stores.ui.getState().selectTentTarget({ innerId: id })
  return id
}

/** 이너 삭제([삭제]). 그 이너가 편집 대상이면 대상을 풉니다. */
export function deleteInnerAction(stores: Stores, innerId: string): void {
  stores.doc.getState().commit((d) => {
    deleteInner(d, innerId)
  })
  const ui = stores.ui.getState()
  if (sameTentTarget(ui.tentTarget, { innerId })) ui.selectTentTarget(null)
}

/** [90도]: 이너 자신의 원점을 피벗으로 시계 방향 90°. 새로 겹치게 되면 거부합니다. */
export function rotateInner90(stores: Stores, innerId: string): EditResult {
  return toResult(
    attempt(stores, (d) => {
      rotateInner(d, innerId, 90)
    }),
  )
}

/** 회전 입력: normAngle(deg)가 되도록 차이만큼 돌립니다. 같은 각이면 기록 없음, 새로 겹치면 거부. */
export function setInnerRotation(stores: Stores, innerId: string, deg: number): EditResult {
  if (!Number.isFinite(deg)) return { ok: false, error: '숫자를 입력해 주세요' }
  const inner = stores.doc.getState().layout.tent.inners.find((it) => it.id === innerId)
  if (inner === undefined) return OK
  const delta = normAngle(deg) - inner.rotation
  if (delta === 0) return OK
  return toResult(
    attempt(stores, (d) => {
      rotateInner(d, innerId, delta)
    }),
  )
}

/** 이름 입력: 앞뒤 공백을 떼고, 비면 무시합니다. 같은 이름이면 기록 없음. */
export function renameInnerAction(stores: Stores, innerId: string, name: string): void {
  const trimmed = name.trim()
  if (trimmed === '') return
  stores.doc.getState().commit((d) => {
    renameInner(d, innerId, trimmed)
  })
}

/** 템플릿 치수 입력(외곽·이너). 범위 밖이면 범위 문구, 새 이슈면 거부, 같은 값이면 기록 없음. */
export function setTargetTemplate(stores: Stores, target: TentTarget, t: ShapeTemplate): EditResult {
  const range = templateRangeError(t)
  if (range !== null) return range
  return toResult(
    attempt(stores, (d) => {
      if (target === 'outer') setOuterTemplate(d, t)
      else setInnerTemplate(d, target.innerId, t)
    }),
  )
}

/** 원 외곽·원 이너 지름(§4.4-5). 원이 아니면 아무것도 하지 않습니다. */
export function setTargetDiameter(stores: Stores, target: TentTarget, d: number): EditResult {
  if (!inRange(d, LIMITS.length)) return rangeError(...LIMITS.length)
  return toResult(
    attempt(stores, (draft) => {
      setCircleDiameter(draft, target, d)
    }),
  )
}

/** 꼭짓점 하나를 월드 좌표로(좌표 표 입력·꼭짓점 끌기 커밋). 템플릿 도형은 자유 다각형이 됩니다(§4.4-6). */
export function setTargetVertex(stores: Stores, target: TentTarget, index: number, world: Pt): EditResult {
  if (!inRange(world[0], LIMITS.coord) || !inRange(world[1], LIMITS.coord)) return rangeError(...LIMITS.coord)
  return toResult(
    attempt(stores, (d) => {
      setVertex(d, target, index, world)
    }),
  )
}

/**
 * edgeIndex번 변의 중점에 꼭짓점을 넣고(`+` 핸들·`+ 꼭짓점 추가`) 그 꼭짓점을 고릅니다.
 * 새 점 번호(= edgeIndex+1)를 돌려주고, 넣지 못하면(원·범위 밖·거부) null.
 */
export function insertTargetVertex(stores: Stores, target: TentTarget, edgeIndex: number): number | null {
  const a = attempt(stores, (d) => {
    insertVertex(d, target, edgeIndex)
  })
  if (a.kind !== 'committed') return null
  const index = edgeIndex + 1
  stores.ui.getState().selectTentTarget(target, index)
  return index
}

/** 꼭짓점 삭제([꼭짓점 삭제]·표의 ×·Delete). 3개면 거부(§6.9), 새 이슈면 거부, 지우면 꼭짓점 선택을 풉니다. */
export function deleteTargetVertex(stores: Stores, target: TentTarget, index: number): EditResult {
  const count = vertexCount(stores.doc.getState().layout, target)
  if (count === null) return OK
  if (count <= 3) return { ok: false, error: MIN_VERTEX_MESSAGE }
  const a = attempt(stores, (d) => {
    deleteVertex(d, target, index)
  })
  if (a.kind === 'committed') {
    const ui = stores.ui.getState()
    if (sameTentTarget(ui.tentTarget, target)) ui.selectTentTarget(target, null)
  }
  return toResult(a)
}

/** 이너 끌기 커밋(캔버스 Task 10). 새로 겹치게 되면 거부하고 아무것도 쓰지 않습니다. */
export function commitInnerMove(stores: Stores, innerId: string, dx: number, dy: number): EditResult {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return OK
  return toResult(
    attempt(stores, (d) => {
      moveInner(d, innerId, dx, dy)
    }),
  )
}

/**
 * 텐트 바꾸기(§4.7-8): layout.tent만 바꾸고 물건 좌표는 그대로, 실행 취소 1칸.
 * 모드는 그대로 두고 편집 대상·꼭짓점 선택을 풀고 맞춤 보기를 한 번 합니다(R9, 보기는 기록 밖).
 * sourcePresetId가 없으면(직접 만든 텐트) 배치의 sourcePresetId를 지웁니다.
 */
export function swapTentAction(stores: Stores, tent: Tent, sourcePresetId?: string): void {
  stores.doc.getState().commit((d) => {
    swapTent(d, tent, sourcePresetId)
  })
  // 그리던 점은 바뀐 텐트와 맞지 않으므로 버립니다(최종 리뷰).
  stores.ui.getState().endDrawing()
  stores.ui.getState().selectTentTarget(null)
  fitToLayout(stores)
}

// ── Plan 4.1: 모양 바꾸기·cm 맞추기·벽에 붙이기·자유 그리기·만들기 첫 외곽 ─────────────

function targetShapeOf(layout: Layout, target: TentTarget): Shape | undefined {
  return target === 'outer' ? layout.tent.outer : layout.tent.inners.find((it) => it.id === target.innerId)?.shape
}

function targetTemplateOf(layout: Layout, target: TentTarget): ShapeTemplate | undefined {
  return target === 'outer' ? layout.tent.outerTemplate : layout.tent.inners.find((it) => it.id === target.innerId)?.template
}

/** 텐트 편집 버튼을 이 대상에 쓸 수 있는지(측정 잠금 이음매 + 단계 잠금) */
function canEdit(stores: Stores, target: TentTarget): boolean {
  const ui = stores.ui.getState()
  return tentControlsEnabled(ui) && !tentTargetBlocked(ui, target)
}

/** 지금 모양 종류(패널 메뉴 비활성·같은 종류 무시용). 템플릿이 없으면 사각형·원은 그 종류, 다각형은 'free' */
export function currentShapeKind(layout: Layout, target: TentTarget): TemplateKind | 'free' | null {
  const shape = targetShapeOf(layout, target)
  if (shape === undefined) return null
  const tpl = targetTemplateOf(layout, target)
  if (tpl !== undefined) return tpl.kind
  return shape.kind === 'polygon' ? 'free' : shape.kind
}

/**
 * 모양 바꾸기(설계 §3): 지금 로컬 bbox w×h(원은 지름)를 이어받은 다른 예시로. 이너는 보이는 가운데·회전 그대로(판단 Q8).
 * 같은 종류면 아무것도 하지 않음. 새 이슈면 거부(문구), 성공하면 꼭짓점 선택을 풉니다(1칸).
 */
export function changeTargetShape(stores: Stores, target: TentTarget, kind: TemplateKind): EditResult {
  if (!canEdit(stores, target)) return OK
  const layout = stores.doc.getState().layout
  const shape = targetShapeOf(layout, target)
  if (shape === undefined || currentShapeKind(layout, target) === kind) return OK
  let w: number
  let h: number
  if (shape.kind === 'circle') {
    w = shape.d
    h = shape.d
  } else if (shape.kind === 'rect') {
    w = shape.w
    h = shape.h
  } else {
    const bb = ringBBox(shape.points)
    w = bb.maxX - bb.minX
    h = bb.maxY - bb.minY
  }
  const t = templateFromBBox(kind, w, h)
  const a = attempt(stores, (d) => {
    setTargetShapeTemplate(d, target, t)
  })
  if (a.kind === 'committed') stores.ui.getState().selectTentTarget(target, null)
  return toResult(a)
}

/** 로컬 점(반올림 전)을 대상 도형으로. 0.05cm 미만 변이 생기면 거부, 새 이슈면 거부, 같은 점이면 기록 없음. */
function applyLocalPolygon(stores: Stores, target: TentTarget, points: Pt[]): EditResult {
  const rounded = points.map((p): Pt => [round1(p[0]), round1(p[1])])
  if (minEdgeLength(rounded) < MIN_EDGE_CM) return { ok: false, error: ZERO_EDGE_MESSAGE }
  return toResult(
    attempt(stores, (d) => {
      setTargetPolygon(d, target, points, 'local', { keepRadii: true })
    }),
  )
}

/** 대상의 로컬 고리(꼭짓점 3개 이상일 때만, 아니면 null) */
function editableRing(stores: Stores, target: TentTarget): Pt[] | null {
  if (!canEdit(stores, target)) return null
  const ring = targetLocalRing(stores.doc.getState().layout, target)
  return ring.length >= 3 ? ring : null
}

/**
 * 변 길이(설계 §2.3-2). edgeIndex는 0부터(UI 「변 i」 = i−1), 0 ≤ edgeIndex ≤ n−2.
 * 다른 변(닫는 변 제외) 길이·각도는 그대로, 닫는 변이 흡수. 범위 1~5000, 같은 값(±0.05cm)이면 기록 없음.
 */
export function setTargetEdgeLength(stores: Stores, target: TentTarget, edgeIndex: number, length: number): EditResult {
  if (!inRange(length, LIMITS.length)) return rangeError(...LIMITS.length)
  const ring = editableRing(stores, target)
  if (ring === null || !Number.isInteger(edgeIndex) || edgeIndex < 0 || edgeIndex > ring.length - 2) return OK
  const current = edgeLengths(ring)[edgeIndex] ?? 0
  if (Math.abs(length - current) < 0.05) return OK
  return applyLocalPolygon(stores, target, setEdgeLength(ring, edgeIndex, length))
}

/** 꼭짓점 각도 범위(설계 §2.3-3) */
const ANGLE_RANGE = [1, 359] as const

/**
 * 꼭짓점 내각(설계 §2.3-3). vertexIndex는 0부터(UI 「꼭짓점 i」 = i−1), 1 ≤ vertexIndex ≤ n−2.
 * 범위 1~359°, 같은 값(±0.005°)이면 기록 없음.
 */
export function setTargetVertexAngle(stores: Stores, target: TentTarget, vertexIndex: number, deg: number): EditResult {
  if (!inRange(deg, ANGLE_RANGE)) return rangeError(...ANGLE_RANGE)
  const ring = editableRing(stores, target)
  if (ring === null || !Number.isInteger(vertexIndex) || vertexIndex < 1 || vertexIndex > ring.length - 2) return OK
  const current = interiorAngles(ring)[vertexIndex] ?? 0
  if (Math.abs(deg - current) < 0.005) return OK
  const next = setVertexAngle(ring, vertexIndex, deg)
  // 돌린 결과 다각형 방향이 뒤집히면 그 꼭짓점 내각이 입력값이 아니게 됩니다(예: 사각형에 340° → 20°). 조용히 다른 모양을 반영하지 않습니다.
  if (Math.abs((interiorAngles(next)[vertexIndex] ?? 0) - deg) > 0.01) return { ok: false, error: ANGLE_FLIP_MESSAGE }
  return applyLocalPolygon(stores, target, next)
}

/** 전체 크기(설계 §2.3-1): 그 축만 bbox 가운데 기준 비율로. 범위 1~5000, 같은 값(±0.05cm)이면 기록 없음. */
export function setTargetSize(stores: Stores, target: TentTarget, axis: 'w' | 'h', value: number): EditResult {
  if (!inRange(value, LIMITS.length)) return rangeError(...LIMITS.length)
  const ring = editableRing(stores, target)
  if (ring === null) return OK
  const bb = ringBBox(ring)
  const w = bb.maxX - bb.minX
  const h = bb.maxY - bb.minY
  if (Math.abs(value - (axis === 'w' ? w : h)) < 0.05) return OK
  return applyLocalPolygon(stores, target, scaleToSize(ring, axis === 'w' ? value : w, axis === 'h' ? value : h))
}

/**
 * 벽에 붙이기(설계 §2.4): 이너의 월드 bbox(원은 지름)를 외곽 템플릿의 그 벽에 맞닿게, 벽 가운데로 한 번 옮깁니다(1칸).
 * 외곽 템플릿이 없거나 그 벽이 없으면 아무것도 하지 않고, 새로 겹치면 거부합니다.
 */
export function attachInnerToWall(stores: Stores, innerId: string, side: AttachSide): EditResult {
  if (!canEdit(stores, { innerId })) return OK
  const layout = stores.doc.getState().layout
  const outer = layout.tent.outerTemplate
  const inner = layout.tent.inners.find((it) => it.id === innerId)
  if (outer === undefined || inner === undefined) return OK
  const bbox =
    inner.shape.kind === 'circle'
      ? { minX: inner.x - inner.shape.d / 2, maxX: inner.x + inner.shape.d / 2, minY: inner.y - inner.shape.d / 2, maxY: inner.y + inner.shape.d / 2 }
      : ringBBox(targetWorldRing(layout, { innerId }))
  const move = attachBBoxToWall(outer, bbox, side)
  if (move === null) return OK
  return toResult(
    attempt(stores, (d) => {
      moveInnerTo(d, innerId, inner.x + move.dx, inner.y + move.dy)
    }),
  )
}

/** 그리기를 시작합니다(설계 §2.2). 텐트 모드·측정 아님·잠금이 허락할 때만, 다시 그리기는 있는 이너만. */
export function startDrawingAction(stores: Stores, goal: DrawGoal): void {
  const ui = stores.ui.getState()
  if (ui.mode !== 'tent' || !tentControlsEnabled(ui)) return
  if (goal === 'outer') {
    if (ui.tentLock === 'outer') return
  } else {
    if (ui.tentLock === 'inners' || ui.outerPending) return
    if (typeof goal === 'object' && !stores.doc.getState().layout.tent.inners.some((it) => it.id === goal.innerId)) return
  }
  ui.startDrawing(goal)
}

function samePoint(a: Pt | undefined, b: Pt): boolean {
  return a !== undefined && Math.abs(a[0] - b[0]) < 0.05 && Math.abs(a[1] - b[1]) < 0.05
}

/**
 * 탭 한 번의 점(설계 §2.2): 맞춤(첫 점 10cm 격자, 다음 점 15°·10cm) 뒤, 첫 점에 다시 맞춰지면(점 3개 이상) 닫고,
 * 길이 0·교차면 찍지 않고 토스트 「선이 겹쳐요」와 false. 점은 문서 밖입니다.
 */
export function appendDrawPoint(stores: Stores, rawWorld: Pt, opts?: { right?: boolean }): boolean {
  const ui = stores.ui.getState()
  const drawing = ui.drawing
  if (drawing === null) return false
  const pts = drawing.points
  const origin = drawGridOrigin(stores.doc.getState().layout.tent, ui.outerPending)
  // 상하좌우로만(Shift·[상하좌우] 토글)이면 방향 단위 90°
  const p = snapDrawPoint(pts[pts.length - 1] ?? null, rawWorld, origin, opts?.right === true ? DRAW_RIGHT_ANGLE_DEG : undefined)
  if (!inRange(p[0], LIMITS.coord) || !inRange(p[1], LIMITS.coord)) return false
  if (pts.length >= 3 && samePoint(pts[0], p)) return finishDrawing(stores).ok
  if (segmentCrosses(pts, p)) {
    ui.showToast(CROSS_MESSAGE)
    return false
  }
  ui.setDrawPoints([...pts, p])
  return true
}

/** 마지막 점 하나를 지웁니다(Ctrl/Cmd+Z·[점 되돌리기]). */
export function undoDrawPoint(stores: Stores): void {
  const ui = stores.ui.getState()
  const pts = ui.drawing?.points
  if (pts !== undefined && pts.length > 0) ui.setDrawPoints(pts.slice(0, -1))
}

/** 그리던 것을 버립니다([그리기 취소]·Esc). 문서는 그대로. */
export function cancelDrawing(stores: Stores): void {
  stores.ui.getState().endDrawing()
}

function drawRejected(stores: Stores, error: string): EditResult {
  stores.ui.getState().showToast(error)
  return { ok: false, error }
}

/** 그리기 완료 뒤: 거부면 그리기를 그대로 두고 토스트, 아니면 그리기를 끝내고 결과 대상을 고릅니다. */
function afterDraw(stores: Stores, a: Attempt, target: TentTarget): EditResult {
  if (a.kind === 'rejected') return drawRejected(stores, a.code === 'inner-overlap' ? OVERLAP_DRAW_MESSAGE : a.error)
  const ui = stores.ui.getState()
  ui.endDrawing()
  ui.selectTentTarget(target)
  return OK
}

/** 그린 점으로 새 이너를 만들면 다른 이너와 겹치는지(이름이 같은 이너가 있어도 놓치지 않게 직접 봄, 판단 Q11) */
function drawnInnerOverlaps(layout: Layout, points: Pt[]): boolean {
  const probe = produce(layout, (d) => {
    addInnerFromPolygon(d, points, '__probe__')
  })
  const drawn = probe.tent.inners[probe.tent.inners.length - 1]
  return drawn !== undefined && layout.tent.inners.some((other) => innersOverlap(drawn, other))
}

/**
 * 그리기 완료([완료]·첫 점 다시 누르기, 설계 §2.2). 3점 미만·꼬임이면 「선이 겹쳐요」, 넓이 ≤1cm²면 「너무 작아요」(그리기 유지).
 * 목표별 결과는 커밋 1번: 외곽(만들기 화면 첫 외곽 = bbox 가운데를 원점으로 새 배치, 그 밖 = 월드 그대로),
 * 새 이너(겹치면 「다른 이너와 겹쳐요」), 이너 다시 그리기(x·y·회전 그대로).
 */
export function finishDrawing(stores: Stores): EditResult {
  const ui = stores.ui.getState()
  const drawing = ui.drawing
  if (drawing === null) return OK
  const pts = drawing.points
  const check = canClosePolygon(pts)
  if (!check.ok) return drawRejected(stores, check.reason === 'tiny' ? TINY_MESSAGE : CROSS_MESSAGE)
  const goal = drawing.goal
  if (goal === 'outer') {
    if (ui.outerPending) {
      defineFirstOuter(stores, { kind: 'polygon', points: centerPolygon(pts).points })
      return OK
    }
    return afterDraw(
      stores,
      attempt(stores, (d) => {
        setTargetPolygon(d, 'outer', pts, 'world')
      }),
      'outer',
    )
  }
  if (goal === 'newInner') {
    if (drawnInnerOverlaps(stores.doc.getState().layout, pts)) return drawRejected(stores, OVERLAP_DRAW_MESSAGE)
    const id = newId()
    return afterDraw(
      stores,
      attempt(stores, (d) => {
        addInnerFromPolygon(d, pts, id)
      }),
      { innerId: id },
    )
  }
  return afterDraw(
    stores,
    attempt(stores, (d) => {
      setTargetPolygon(d, goal, pts, 'world')
    }),
    goal,
  )
}

/**
 * 만들기 화면 첫 외곽(판단 Q1·Q2): 자리표시 문서를 그 외곽(이너 없음)의 새 배치로 바꿉니다(실행 취소 기록 비움).
 * 이름·id는 그대로, 외곽 없음 해제·그리기 끝·외곽 선택·맞춤 보기.
 */
export function defineFirstOuter(stores: Stores, outer: Shape, outerTemplate?: ShapeTemplate): void {
  const doc = stores.doc.getState()
  const cur = doc.layout
  const tent: Tent = { name: cur.tent.name, outer, inners: [] }
  if (outerTemplate !== undefined) tent.outerTemplate = outerTemplate
  const ui = stores.ui.getState()
  ui.endDrawing()
  doc.load(createLayout(tent, { name: cur.name, id: cur.id }))
  ui.setOuterPending(false)
  ui.selectTentTarget('outer')
  fitToLayout(stores)
}

/**
 * 만들기 화면 단계 ①의 예시 모양(설계 §1.1): 외곽 없음이면 그 예시로 첫 외곽, 아니면 외곽을 그 예시 기본값으로 바꿈(1칸).
 * 외곽을 고르고 맞춤 보기. 측정 중·외곽 잠금이면 아무것도 하지 않음.
 */
export function setMakerOuterShape(stores: Stores, kind: TemplateKind, tpl: ShapeTemplate = defaultOuterTemplate(kind)): void {
  const ui = stores.ui.getState()
  if (!tentControlsEnabled(ui) || ui.tentLock === 'outer') return
  if (ui.outerPending) {
    defineFirstOuter(stores, shapeFromTemplate(tpl), tpl)
    return
  }
  ui.endDrawing()
  attempt(stores, (d) => {
    setOuterTemplate(d, tpl)
  })
  stores.ui.getState().selectTentTarget('outer')
  fitToLayout(stores)
}
