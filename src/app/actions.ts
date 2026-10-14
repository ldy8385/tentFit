// UI(라이브러리·새 도형 폼·속성 패널·시트·단축키)가 함께 쓰는 물건 문서 동작. 같은 동작은 여기 한 곳에만 둡니다
// (Plan 3 보류 Minor #23 — ui/panels/commands.ts는 이 파일을 다시 내보내기만 합니다). 텐트 동작은 tentActions.ts.
// 문서는 doc.commit(recipe)로만 바꾸고, recipe 안에서는 core ops만 부릅니다(스펙 §7 규칙 2).
import { normAngle, type Item, type ItemPreset, type Pt, type Shape } from '../core/model'
import { centerPolygon } from '../core/polygonEdit'
import { withRadii } from '../core/radii'
import { rotateAround } from '../core/ops/util'
import {
  addItem,
  deleteItems,
  duplicateItems,
  itemFromPreset,
  makeItem,
  moveItems,
  newItemPosition,
  nextColor,
  setItemShape,
  resizeItem,
  rotateItems,
  selectionPivot,
  setItemProps,
  type NewItemInput,
} from '../core/ops/items'
import { viewCenterWorld } from '../view/viewport'
import { getZones } from './derived'
import type { Stores } from './stores'

/**
 * 새 물건을 놓을 자리(§4.7-3): 보이는 영역 가운데, 외곽 밖이면 외곽 polylabel, 겹치면 (+20,+20)씩.
 * 아래 시트는 빼지 않습니다. 추가하면 라이브러리 시트는 닫히고, 선택 시트 위로 보이게 하는 일은 셸이 맡습니다.
 */
function placementPoint(stores: Stores): Pt {
  const layout = stores.doc.getState().layout
  const { view, size, insets } = stores.ui.getState()
  return newItemPosition(layout, getZones(layout), viewCenterWorld(view, size, { top: insets.top, bottom: 0 }))
}

/**
 * addItem이 같은 이름이면 uniqueItemName으로 번호를 붙여 저장합니다(D28). 새 물건만 선택합니다(D35).
 * 시트 높이가 그대로여도(낮은 화면에서 라이브러리·선택 시트가 같은 높이로 잘림) 새 물건이 시트 위에 보이게 요청합니다.
 */
function insertItem(stores: Stores, item: Item): string {
  stores.doc.getState().commit((d) => {
    addItem(d, item)
  })
  const ui = stores.ui.getState()
  ui.setSelection([item.id])
  ui.requestReveal()
  return item.id
}

export function addPresetItem(stores: Stores, preset: ItemPreset): string {
  return insertItem(stores, itemFromPreset(preset, placementPoint(stores)))
}

export function addCustomItem(stores: Stores, input: NewItemInput): string {
  return insertItem(stores, makeItem(input, placementPoint(stores)))
}

/** 도형을 로컬 원점이 bbox 가운데가 되게(다각형만 옮김, 반지름 유지). offset = 원래 원점 기준 새 원점 자리 */
function centeredShape(shape: Shape): { shape: Shape; offset: Pt } {
  if (shape.kind !== 'polygon') return { shape, offset: [0, 0] }
  const { center, points } = centerPolygon(shape.points)
  return { shape: withRadii({ kind: 'polygon', points }, shape.radii), offset: center }
}

/** 물건 그리기 화면의 결과로 새 물건(매트, 소유자 요청 2026-10-14). 이름이 비면 「새 매트」 */
export function addDrawnItem(stores: Stores, name: string, shape: Shape): string {
  const layout = stores.doc.getState().layout
  return addCustomItem(stores, {
    name: name.trim() === '' ? '새 매트' : name.trim(),
    shape: centeredShape(shape).shape,
    color: nextColor(layout),
    category: 'MAT',
    countsArea: true,
  })
}

/** 모양 편집 결과로 물건 도형을 바꿉니다(보이는 자리 그대로, 1칸). */
export function replaceItemShape(stores: Stores, id: string, shape: Shape): void {
  const { shape: next, offset } = centeredShape(shape)
  stores.doc.getState().commit((d) => {
    const it = d.items.find((x) => x.id === id)
    if (it === undefined) return
    setItemShape(d, id, next)
    const [ox, oy] = rotateAround(offset, [0, 0], it.rotation)
    if (ox !== 0 || oy !== 0) moveItems(d, [id], ox, oy)
  })
}

/** 이름·색·카테고리·점유 면적 포함(속성 패널) */
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

/** [90도]·KeyR(§4.6): 1개면 그 물건 원점, 여러 개면 선택 바운딩 박스 중심을 피벗으로 시계 방향 90°. */
export function rotateBy90(stores: Stores, ids: readonly string[]): void {
  if (ids.length === 0) return
  const list = [...ids]
  stores.doc.getState().commit((d) => {
    rotateItems(d, list, selectionPivot(d, list), 90)
  })
}

/** [삭제]·Delete: 지우고 선택을 비웁니다. */
export function deleteAndDeselect(stores: Stores, ids: readonly string[]): void {
  if (ids.length === 0) return
  const list = [...ids]
  stores.doc.getState().commit((d) => {
    deleteItems(d, list)
  })
  stores.ui.getState().clearSelection()
}

/** Delete·Backspace(배치 모드): 지금 선택을 지웁니다. */
export function deleteSelected(stores: Stores): void {
  deleteAndDeselect(stores, stores.ui.getState().selection)
}

/** 복제(§4.7-4·§4.9-4). 그룹 안 편집 중이면 그 그룹 안에서 복제합니다. 새 id(배열 순서)를 선택하고 돌려줍니다. */
export function duplicateSelected(stores: Stores): string[] {
  return duplicateAndSelect(stores, stores.ui.getState().selection)
}

/**
 * [복제](선택 시트·속성 패널)와 Ctrl/Cmd+D가 함께 씁니다. 복제본을 (+20,+20)에 놓고 새 물건들을 선택합니다.
 * 그룹 안 편집 중이면 그 그룹 안에서 복제합니다. 시트 높이가 그대로여도 복제본이 시트 위에 보이게 요청합니다.
 */
export function duplicateAndSelect(stores: Stores, ids: readonly string[]): string[] {
  if (ids.length === 0) return []
  const scope = stores.ui.getState().scopeGroupId ?? undefined
  let created: string[] = []
  stores.doc.getState().commit((d) => {
    created = duplicateItems(d, [...ids], scope)
  })
  if (created.length > 0) {
    const ui = stores.ui.getState()
    ui.setSelection(created)
    ui.requestReveal()
  }
  return created
}

/** KeyR: 지금 선택을 90° 돌립니다([90도] 버튼과 같은 구현). */
export function rotateSelected90(stores: Stores): void {
  rotateBy90(stores, stores.ui.getState().selection)
}
