// 속성 패널·선택 시트의 버튼과 입력칸이 부르는 문서 변경. 모두 doc.commit 한 번이고 실제 계산은 core/ops가 합니다(§7).
// 대상 id는 호출한 쪽이 넘깁니다(입력칸은 포커스 시점의 id, 버튼은 누를 때의 선택).
import { normAngle, type Item } from '../../core/model'
import {
  deleteItems,
  duplicateItems,
  resizeItem,
  rotateItems,
  selectionPivot,
  setItemProps,
} from '../../core/ops/items'
import type { Stores } from '../../app/stores'

/** 이름·색·카테고리·점유 면적 포함 */
export function setProps(
  stores: Stores,
  id: string,
  patch: Partial<Pick<Item, 'name' | 'color' | 'category' | 'countsArea'>>,
): void {
  stores.doc.getState().commit((d) => setItemProps(d, id, patch))
}

/** 숫자 입력으로 치수 바꾸기(사각형 w·h, 원 d, 다각형 바운딩 박스 가로·세로) */
export function resize(stores: Stores, id: string, dims: { w?: number; h?: number; d?: number }): void {
  stores.doc.getState().commit((d) => resizeItem(d, id, dims))
}

/**
 * 회전 입력. ids[0](기준 물건)의 회전이 normAngle(deg)가 되도록 ids 전체를 selectionPivot 기준으로 함께 돌립니다.
 * 1개면 그 물건의 원점이 피벗이라 위치는 그대로이고 회전만 바뀝니다(400 → 40).
 */
export function setRotation(stores: Stores, ids: string[], deg: number): void {
  stores.doc.getState().commit((d) => {
    const ref = d.items.find((it) => it.id === ids[0])
    if (ref === undefined) return
    const delta = normAngle(deg) - ref.rotation
    if (delta === 0) return
    rotateItems(d, ids, selectionPivot(d, ids), delta)
  })
}

/** [90도]: 피벗은 1개면 그 물건의 원점, 여러 개면 월드 바운딩 박스 중심(§4.6) */
export function rotateBy90(stores: Stores, ids: string[]): void {
  if (ids.length === 0) return
  stores.doc.getState().commit((d) => rotateItems(d, ids, selectionPivot(d, ids), 90))
}

/** [복제]: 복제본을 (+20,+20)에 놓고 새 물건들을 선택합니다. 그룹 안 편집 중이면 그 그룹 안에서 복제합니다. */
export function duplicateAndSelect(stores: Stores, ids: string[]): string[] {
  if (ids.length === 0) return []
  const scope = stores.ui.getState().scopeGroupId ?? undefined
  let created: string[] = []
  stores.doc.getState().commit((d) => {
    created = duplicateItems(d, ids, scope)
  })
  if (created.length > 0) stores.ui.getState().setSelection(created)
  return created
}

/** [삭제]: 지우고 선택을 비웁니다. */
export function deleteAndDeselect(stores: Stores, ids: string[]): void {
  if (ids.length === 0) return
  stores.doc.getState().commit((d) => deleteItems(d, ids))
  stores.ui.getState().clearSelection()
}
