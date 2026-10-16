// 도형 위 치수 편집 동작(소유자 요청 2026-10-14): 캔버스 숫자·패널 가로세로·모서리 반지름 칸이 함께 부릅니다.
// 대상은 텐트 편집 대상(외곽·이너) 또는 물건 하나. 계산은 core/dimEdit, 반영은 core ops만(스펙 §7 규칙 2).
// 텐트 대상은 tentActions의 거부 판정(새 이슈면 거부, 같으면 기록 없음), 물건은 그대로 커밋(물건은 겹쳐도 됨, 경고로 보임).
import { dimValue, editDim, setAllRadii, type DimKey, type DimReason, type DimResult, type ShapeSpec } from '../core/dimEdit'
import { LIMITS, type Layout } from '../core/model'
import { setItemShape } from '../core/ops/items'
import { setTargetSpec, type TentTarget } from '../core/ops/tent'
import type { Stores } from './stores'
import { canEditTentTarget, HEXAGON_EDGE_MESSAGE, mirrorAxis, PENTAGON_TIP_MESSAGE, tryTentEdit, ZERO_EDGE_MESSAGE, type EditResult } from './tentActions'

export type DimSubject = { kind: 'tent'; target: TentTarget } | { kind: 'item'; id: string }

/** 그 길이로 만들 수 없을 때(꼬임·원의 변) */
export const DIM_INVALID_MESSAGE = '그 길이로는 만들 수 없어요'

const OK: EditResult = { ok: true }

/** 같은 값으로 보는 차이(cm, 저장 단위 0.1cm의 절반) */
const SAME_CM = 0.05

function formatBound(v: number): string {
  return v.toLocaleString('ko-KR', { maximumFractionDigits: 2 })
}

function reasonMessage(reason: DimReason, radius: boolean): string {
  switch (reason) {
    case 'range':
      return `${formatBound(radius ? 0 : LIMITS.length[0])}~${formatBound(LIMITS.length[1])} 사이로 입력해 주세요`
    case 'hexagon-edge':
      return HEXAGON_EDGE_MESSAGE
    case 'pentagon-tip':
      return PENTAGON_TIP_MESSAGE
    case 'zero-edge':
      return ZERO_EDGE_MESSAGE
    case 'invalid':
      return DIM_INVALID_MESSAGE
  }
}

/** 대상의 도형·템플릿. 없는 물건·이너면 null */
export function subjectSpec(layout: Layout, subject: DimSubject): ShapeSpec | null {
  if (subject.kind === 'item') {
    const it = layout.items.find((x) => x.id === subject.id)
    return it === undefined ? null : { shape: it.shape }
  }
  if (subject.target === 'outer') {
    const t = layout.tent.outerTemplate
    return t === undefined ? { shape: layout.tent.outer } : { shape: layout.tent.outer, template: t }
  }
  const { innerId } = subject.target
  const inner = layout.tent.inners.find((x) => x.id === innerId)
  if (inner === undefined) return null
  return inner.template === undefined ? { shape: inner.shape } : { shape: inner.shape, template: inner.template }
}

function commit(stores: Stores, subject: DimSubject, r: DimResult, radius: boolean): EditResult {
  if (!r.ok) return { ok: false, error: reasonMessage(r.reason, radius) }
  const spec = r.spec
  if (subject.kind === 'tent') {
    const target = subject.target
    return tryTentEdit(stores, (d) => setTargetSpec(d, target, spec))
  }
  const id = subject.id
  stores.doc.getState().commit((d) => setItemShape(d, id, spec.shape))
  return OK
}

/** 텐트 대상이면 측정 잠금·만들기 단계 잠금을 봅니다(물건은 늘 됨). */
function editable(stores: Stores, subject: DimSubject): boolean {
  return subject.kind === 'item' || canEditTentTarget(stores, subject.target)
}

/**
 * 치수 하나를 value로(변·가로·세로·구간 1~5000, 반지름 0~5000). keepRatio = 「비율 유지」(변·가로·세로만).
 * 구간은 텐트 대상이고 대칭 「자동 맞춤」이면 반대편 짝 구간도 같이(대상이 대칭일 때, core가 판단).
 * 같은 값(±0.05cm)이면 기록 없음. 실패면 입력칸 아래에 보일 문구.
 */
export function applyDim(stores: Stores, subject: DimSubject, key: DimKey, value: number, keepRatio: boolean): EditResult {
  if (!editable(stores, subject)) return OK
  const spec = subjectSpec(stores.doc.getState().layout, subject)
  if (spec === null) return OK
  const current = dimValue(spec.shape, key)
  if (current !== null && Number.isFinite(value) && Math.abs(current - value) < SAME_CM) return OK
  const mirror = subject.kind === 'tent' ? mirrorAxis(stores) : null
  return commit(stores, subject, editDim(spec, key, value, keepRatio, mirror), key.kind === 'radius')
}

/** 모든 모서리를 같은 반지름으로(0 = 모두 뾰족). */
export function applyAllRadii(stores: Stores, subject: DimSubject, r: number): EditResult {
  if (!editable(stores, subject)) return OK
  const spec = subjectSpec(stores.doc.getState().layout, subject)
  if (spec === null) return OK
  return commit(stores, subject, setAllRadii(spec, r), true)
}
