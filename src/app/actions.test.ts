import { beforeEach, describe, expect, it } from 'vitest'
import { outerRing, pointInRing } from '../core/geom'
import { createLayout, type ItemPreset, type Layout } from '../core/model'
import { addCustomItem, addPresetItem, deleteSelected, duplicateSelected, rotateSelected90 } from './actions'
import { defaultTentPreset, loadItemPresets } from './presets'
import { createStores, type Stores } from './stores'

const MAT: ItemPreset = {
  id: 'items/mat-single-200x60',
  name: '캠핑 매트 1인',
  category: 'MAT',
  shape: { kind: 'rect', w: 200, h: 60 },
  color: 'green',
  countsArea: true,
}

function tunnelLayout(): Layout {
  return createLayout(defaultTentPreset().tent, { name: '테스트 배치', id: 'L1', now: '2026-10-08T00:00:00.000Z' })
}

let stores: Stores

/** 화면 800×600, 보기 가운데(400,300)가 월드 (0,0)이 되게 둡니다. */
beforeEach(() => {
  stores = createStores(tunnelLayout())
  const ui = stores.ui.getState()
  ui.setSize({ width: 800, height: 600 })
  ui.setInsets({ top: 0, bottom: 0 })
  ui.setView({ zoom: 1, panX: 400, panY: 300 })
})

const layout = () => stores.doc.getState().layout
const selection = () => stores.ui.getState().selection

describe('addPresetItem', () => {
  it('화면 가운데에 놓고 새 물건만 선택하고 id를 돌려준다', () => {
    const id = addPresetItem(stores, MAT)
    expect(layout().items).toHaveLength(1)
    const item = layout().items[0]
    expect(item).toMatchObject({ id, name: '캠핑 매트 1인', x: 0, y: 0, rotation: 0, presetId: MAT.id, countsArea: true })
    expect(item?.shape).toEqual({ kind: 'rect', w: 200, h: 60 })
    expect(selection()).toEqual([id])
  })

  it('같은 프리셋을 두 번 놓으면 이름에 번호가 붙고 (+20,+20) 비켜 놓는다', () => {
    addPresetItem(stores, MAT)
    const id2 = addPresetItem(stores, MAT)
    expect(layout().items.map((it) => it.name)).toEqual(['캠핑 매트 1인', '캠핑 매트 1인 2'])
    expect(layout().items[1]).toMatchObject({ id: id2, x: 20, y: 20 })
    expect(selection()).toEqual([id2])
  })

  it('화면 가운데가 외곽 밖이면 외곽 안에 놓는다', () => {
    stores.ui.getState().setView({ zoom: 1, panX: -5000, panY: -5000 })
    addPresetItem(stores, MAT)
    const it0 = layout().items[0]
    if (!it0) throw new Error('물건이 없음')
    expect(pointInRing([it0.x, it0.y], outerRing(layout().tent))).toBe(true)
  })

  it('실행 취소 1번이면 물건이 사라지고 선택에서도 빠진다', () => {
    addPresetItem(stores, MAT)
    expect(stores.doc.getState().undo()).toBe(true)
    expect(layout().items).toHaveLength(0)
    expect(selection()).toEqual([])
  })

  it('실제 기본 프리셋(원형 스툴)도 놓을 수 있다', () => {
    const stool = loadItemPresets().find((p) => p.id === 'items/stool-round-d35')
    if (!stool) throw new Error('원형 스툴 프리셋 없음')
    addPresetItem(stores, stool)
    expect(layout().items[0]?.shape).toEqual({ kind: 'circle', d: 35 })
  })
})

describe('addCustomItem', () => {
  it('입력값대로 만들고 선택한다(치수는 0.1cm로 반올림)', () => {
    const id = addCustomItem(stores, {
      name: '새 도형',
      shape: { kind: 'rect', w: 100.04, h: 50 },
      color: 'pink',
      category: 'RUG',
      countsArea: false,
    })
    expect(layout().items[0]).toMatchObject({ id, name: '새 도형', color: 'pink', category: 'RUG', countsArea: false, x: 0, y: 0 })
    expect(layout().items[0]?.shape).toEqual({ kind: 'rect', w: 100, h: 50 })
    expect(layout().items[0]?.presetId).toBeUndefined()
    expect(selection()).toEqual([id])
  })
})

describe('deleteSelected', () => {
  it('선택한 물건을 지우고 선택을 비운다. 실행 취소하면 돌아온다', () => {
    const a = addPresetItem(stores, MAT)
    const b = addPresetItem(stores, MAT)
    stores.ui.getState().setSelection([a])
    deleteSelected(stores)
    expect(layout().items.map((it) => it.id)).toEqual([b])
    expect(selection()).toEqual([])
    stores.doc.getState().undo()
    expect(layout().items.map((it) => it.id)).toEqual([a, b])
  })

  it('선택이 없으면 아무것도 커밋하지 않는다', () => {
    addPresetItem(stores, MAT)
    stores.ui.getState().clearSelection()
    const before = layout()
    deleteSelected(stores)
    expect(layout()).toBe(before)
  })
})

describe('duplicateSelected', () => {
  it('복제본을 (+20,+20)에 다음 번호 이름으로 만들고 복제본을 선택한다', () => {
    const a = addPresetItem(stores, MAT)
    const created = duplicateSelected(stores)
    expect(created).toHaveLength(1)
    expect(created[0]).not.toBe(a)
    expect(layout().items.map((it) => it.name)).toEqual(['캠핑 매트 1인', '캠핑 매트 1인 2'])
    expect(layout().items[1]).toMatchObject({ id: created[0], x: 20, y: 20 })
    expect(selection()).toEqual(created)
  })

  it('선택이 없으면 빈 배열이고 문서는 그대로다', () => {
    addPresetItem(stores, MAT)
    stores.ui.getState().clearSelection()
    const before = layout()
    expect(duplicateSelected(stores)).toEqual([])
    expect(layout()).toBe(before)
  })
})

describe('rotateSelected90', () => {
  it('1개면 제자리에서 90° 돈다', () => {
    addPresetItem(stores, MAT)
    rotateSelected90(stores)
    expect(layout().items[0]).toMatchObject({ x: 0, y: 0, rotation: 90 })
    rotateSelected90(stores)
    expect(layout().items[0]?.rotation).toBe(180)
  })

  it('여러 개면 선택 전체 바운딩 박스 중심을 기준으로 돈다', () => {
    const a = addPresetItem(stores, MAT) // (0,0) 200×60
    const b = addPresetItem(stores, MAT) // (20,20)
    stores.ui.getState().setSelection([a, b])
    rotateSelected90(stores)
    // 바운딩 박스 x −100~120, y −30~50 → 중심 (10, 10). (0,0) → (20,0), (20,20) → (0,20)
    expect(layout().items[0]).toMatchObject({ x: 20, y: 0, rotation: 90 })
    expect(layout().items[1]).toMatchObject({ x: 0, y: 20, rotation: 90 })
  })

  it('선택이 없으면 문서는 그대로다', () => {
    addPresetItem(stores, MAT)
    stores.ui.getState().clearSelection()
    const before = layout()
    rotateSelected90(stores)
    expect(layout()).toBe(before)
  })
})
