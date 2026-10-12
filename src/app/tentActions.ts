// 텐트 문서 동작(스펙 §4.4·§4.7-8). 패널·시트·캔버스·툴바·단축키는 이 함수를 부르기만 합니다(같은 동작 두 벌 금지).
// 문서는 doc.commit(recipe)로만 바꾸고, recipe 안에서는 core/ops/tent만 부릅니다(스펙 §7 규칙 2).
// 잘못된 결과 막기(§4.4-8·§6.9): 미리 produce로 만들어 보고, 이번 조작으로 "새로 생긴" 이슈가 있으면 커밋하지 않습니다(R11).
import { produce } from 'immer'
import { LIMITS, normAngle, type Layout, type Pt, type ShapeTemplate, type Tent } from '../core/model'
import {
  addInner,
  deleteInner,
  deleteVertex,
  insertVertex,
  moveInner,
  renameInner,
  rotateInner,
  setCircleDiameter,
  setInnerTemplate,
  setOuterTemplate,
  setVertex,
  swapTent,
  targetWorldRing,
  type TentTarget,
} from '../core/ops/tent'
import { newTentIssues } from '../core/validate'
import { sameTentTarget, type UiState } from '../store/ui'
import { getZones } from './derived'
import type { Stores } from './stores'
import { fitToLayout } from './viewActions'

/** 동작 결과. error는 입력칸 아래에 그대로 보여 줄 사용자 문구(Issue.message 또는 범위 문구)입니다. */
export type EditResult = { ok: true } | { ok: false; error: string }

/** 새 이너를 놓을 자리가 없을 때의 토스트(§4.4-1·§4.4-4) */
export const NO_SPACE_MESSAGE = '빈 공간이 부족해요'
/** 꼭짓점이 3개 남았을 때 삭제를 막는 문구(§6.9) */
export const MIN_VERTEX_MESSAGE = '꼭짓점이 3개면 지울 수 없어요'

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
  }
}

type Attempt = { kind: 'committed' } | { kind: 'unchanged' } | { kind: 'rejected'; error: string }

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
  if (issue !== undefined) return { kind: 'rejected', error: issue.message }
  return doc.commit(recipe) ? { kind: 'committed' } : { kind: 'unchanged' }
}

function toResult(a: Attempt): EditResult {
  return a.kind === 'rejected' ? { ok: false, error: a.error } : OK
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

/** §4.4-4 새 이너. 실패면 토스트 「빈 공간이 부족해요」와 null. 성공하면 새 이너를 대상으로 고르고 id를 돌려줍니다. */
export function addInnerAction(stores: Stores): string | null {
  const doc = stores.doc.getState()
  const zones = getZones(doc.layout)
  let created = null as string | null
  doc.commit((d) => {
    const r = addInner(d, zones)
    if (r.ok) created = r.id
  })
  const ui = stores.ui.getState()
  if (created === null) {
    ui.showToast(NO_SPACE_MESSAGE)
    return null
  }
  ui.selectTentTarget({ innerId: created })
  return created
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
  stores.ui.getState().selectTentTarget(null)
  fitToLayout(stores)
}
