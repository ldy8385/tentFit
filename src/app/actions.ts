// UI(라이브러리·새 도형 폼·속성 패널·시트·단축키)가 함께 쓰는 문서 동작.
// 문서는 doc.commit(recipe)로만 바꾸고, recipe 안에서는 core ops만 부릅니다(스펙 §7 규칙 2).
import type { Item, ItemPreset, Pt } from '../core/model'
import {
  addItem,
  deleteItems,
  duplicateItems,
  itemFromPreset,
  makeItem,
  newItemPosition,
  rotateItems,
  selectionPivot,
  type NewItemInput,
} from '../core/ops/items'
import { viewCenterWorld } from '../view/viewport'
import { getZones } from './derived'
import type { Stores } from './stores'

/** 새 물건을 놓을 자리(§4.7-3): 보이는 영역 가운데, 외곽 밖이면 외곽 polylabel, 겹치면 (+20,+20)씩. */
function placementPoint(stores: Stores): Pt {
  const layout = stores.doc.getState().layout
  const { view, size, insets } = stores.ui.getState()
  return newItemPosition(layout, getZones(layout), viewCenterWorld(view, size, insets))
}

/** addItem이 같은 이름이면 uniqueItemName으로 번호를 붙여 저장합니다(D28). 새 물건만 선택합니다(D35). */
function insertItem(stores: Stores, item: Item): string {
  stores.doc.getState().commit((d) => {
    addItem(d, item)
  })
  stores.ui.getState().setSelection([item.id])
  return item.id
}

export function addPresetItem(stores: Stores, preset: ItemPreset): string {
  return insertItem(stores, itemFromPreset(preset, placementPoint(stores)))
}

export function addCustomItem(stores: Stores, input: NewItemInput): string {
  return insertItem(stores, makeItem(input, placementPoint(stores)))
}

export function deleteSelected(stores: Stores): void {
  const ids = stores.ui.getState().selection
  if (ids.length === 0) return
  stores.doc.getState().commit((d) => {
    deleteItems(d, ids)
  })
  stores.ui.getState().clearSelection()
}

/** 복제(§4.7-4·§4.9-4). 그룹 안 편집 중이면 그 그룹 안에서 복제합니다. 새 id(배열 순서)를 선택하고 돌려줍니다. */
export function duplicateSelected(stores: Stores): string[] {
  const { selection, scopeGroupId } = stores.ui.getState()
  if (selection.length === 0) return []
  let created: string[] = []
  stores.doc.getState().commit((d) => {
    created = duplicateItems(d, selection, scopeGroupId ?? undefined)
  })
  if (created.length > 0) stores.ui.getState().setSelection(created)
  return created
}

/** [90도]·KeyR(§4.6): 1개면 그 물건 원점, 여러 개면 선택 바운딩 박스 중심을 피벗으로 시계 방향 90°. */
export function rotateSelected90(stores: Stores): void {
  const ids = stores.ui.getState().selection
  if (ids.length === 0) return
  const pivot = selectionPivot(stores.doc.getState().layout, ids)
  stores.doc.getState().commit((d) => {
    rotateItems(d, ids, pivot, 90)
  })
}
