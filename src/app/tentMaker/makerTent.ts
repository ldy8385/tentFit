// 만들기 화면의 텐트 이름 규칙·자리표시 배치·확정 텐트(Plan 4.1). 순수 함수입니다.
// 만들기 화면은 임시 스토어 위에서 편집기 캔버스·텐트 패널을 그대로 쓰고(설계 2026-10-12 §4),
// 외곽이 아직 없을 때는 자리표시 외곽 + ui.outerPending으로 "외곽 없음"을 나타냅니다(판단 Q1).
import { createLayout, type Layout, type Shape, type Tent } from '../../core/model'
import { uniqueName } from '../../core/ops/items'

export const DEFAULT_TENT_NAME = '내 텐트'

/** 자리표시 외곽(그리지도 고르지도 않음). 실제 외곽이 정해지면 doc.load로 바뀝니다. */
export const PLACEHOLDER_OUTER: Shape = { kind: 'rect', w: 400, h: 200 }

/** 처음 이름: 「내 텐트」(내 텐트 이름과 겹치면 번호) */
export function initialTentName(myTentNames: readonly string[]): string {
  return uniqueName(myTentNames, DEFAULT_TENT_NAME)
}

/** 확정 이름: 앞뒤 공백을 떼고, 비면 「내 텐트」 */
export function finalTentName(text: string): string {
  const t = text.trim()
  return t === '' ? DEFAULT_TENT_NAME : t
}

/** 만들기 화면 임시 배치(외곽 없음 상태로 시작). 보관소에 쓰지 않습니다. */
export function makerLayout(name: string): Layout {
  return createLayout({ name, outer: PLACEHOLDER_OUTER, inners: [] }, { name: '텐트 만들기' })
}

/** 확정할 텐트: 임시 문서 텐트의 복사본에 확정 이름 */
export function makerConfirmTent(layout: Layout, name: string): Tent {
  return { ...structuredClone(layout.tent), name: finalTentName(name) }
}
