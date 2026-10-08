import { describe, expect, it, vi } from 'vitest'
import { createLayout, type Item, type Layout } from '../core/model'
import { fitView, ZOOM_MAX } from '../view/viewport'
import { createUiStore } from './ui'

const NOW = '2026-10-08T00:00:00.000Z'

function item(id: string, groupId?: string): Item {
  const it: Item = {
    id,
    name: id,
    shape: { kind: 'rect', w: 100, h: 50 },
    x: 0,
    y: 0,
    rotation: 0,
    color: 'blue',
    category: 'MAT',
    countsArea: true,
  }
  if (groupId !== undefined) it.groupId = groupId
  return it
}

function layoutWith(items: Item[], groupIds: string[] = []): Layout {
  const layout = createLayout(
    { name: '시험 텐트', outer: { kind: 'rect', w: 600, h: 300 }, inners: [] },
    { name: '시험 배치', id: 'L1', now: NOW },
  )
  layout.items = items
  layout.groups = groupIds.map((id) => ({ id }))
  return layout
}

describe('createUiStore 기본값', () => {
  it('배치 모드, 선택 없음, 보기 1배, 스냅·격자 켬', () => {
    const s = createUiStore().getState()
    expect(s.mode).toBe('place')
    expect(s.measuring).toBe(false)
    expect(s.selection).toEqual([])
    expect(s.scopeGroupId).toBeNull()
    expect(s.selectToggle).toBe(false)
    expect(s.view).toEqual({ zoom: 1, panX: 0, panY: 0 })
    expect(s.size).toEqual({ width: 0, height: 0 })
    expect(s.insets).toEqual({ top: 0, bottom: 0 })
    expect(s.snapEnabled).toBe(true)
    expect(s.gridVisible).toBe(true)
    expect(s.pointer).toBe('mouse')
    expect(s.mobileSheet).toBe('none')
    expect(s.desktopPanel).toBe('auto')
    expect(s.areaExpanded).toBe(false)
  })

  it('init 값을 쓰고, 보기 배율은 0.1~20으로 자른다', () => {
    const s = createUiStore({
      mode: 'tent',
      snapEnabled: false,
      gridVisible: false,
      view: { zoom: 99, panX: 5, panY: 6 },
      size: { width: 390, height: 844 },
    }).getState()
    expect(s.mode).toBe('tent')
    expect(s.snapEnabled).toBe(false)
    expect(s.gridVisible).toBe(false)
    expect(s.view).toEqual({ zoom: ZOOM_MAX, panX: 5, panY: 6 })
    expect(s.size).toEqual({ width: 390, height: 844 })
  })
})

describe('선택', () => {
  it('setSelection은 순서를 지키며 중복을 뺀다', () => {
    const ui = createUiStore()
    ui.getState().setSelection(['b', 'a', 'b'])
    expect(ui.getState().selection).toEqual(['b', 'a'])
  })

  it('toggleSelected: 없으면 끝에 넣고, 있으면 뺀다', () => {
    const ui = createUiStore()
    ui.getState().toggleSelected('a')
    ui.getState().toggleSelected('b')
    expect(ui.getState().selection).toEqual(['a', 'b'])
    ui.getState().toggleSelected('a')
    expect(ui.getState().selection).toEqual(['b'])
  })

  it('clearSelection은 비운다', () => {
    const ui = createUiStore()
    ui.getState().setSelection(['a'])
    ui.getState().clearSelection()
    expect(ui.getState().selection).toEqual([])
  })

  it('같은 선택으로 바꾸면 구독자에게 알리지 않는다', () => {
    const ui = createUiStore()
    ui.getState().setSelection(['a', 'b'])
    const listener = vi.fn()
    ui.subscribe(listener)
    ui.getState().setSelection(['a', 'b'])
    ui.getState().clearSelection()
    ui.getState().clearSelection()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('pruneSelection은 배치에 없는 id를 빼고 순서를 지킨다', () => {
    const ui = createUiStore()
    ui.getState().setSelection(['c', 'gone', 'a'])
    ui.getState().pruneSelection(layoutWith([item('a'), item('b'), item('c')]))
    expect(ui.getState().selection).toEqual(['c', 'a'])
  })

  it('pruneSelection은 없어진 그룹의 그룹 안 편집도 끝낸다', () => {
    const ui = createUiStore()
    ui.getState().patch({ scopeGroupId: 'g1' })
    ui.getState().pruneSelection(layoutWith([item('a', 'g1'), item('b', 'g1')], ['g1']))
    expect(ui.getState().scopeGroupId).toBe('g1')
    ui.getState().pruneSelection(layoutWith([item('a'), item('b')]))
    expect(ui.getState().scopeGroupId).toBeNull()
  })

  it('바꿀 것이 없으면 pruneSelection은 상태를 그대로 둔다', () => {
    const ui = createUiStore()
    ui.getState().setSelection(['a'])
    const before = ui.getState()
    ui.getState().pruneSelection(layoutWith([item('a')]))
    expect(ui.getState()).toBe(before)
  })
})

describe('보기', () => {
  it('setView는 배율을 자르고 유한하지 않은 위치를 0으로', () => {
    const ui = createUiStore()
    ui.getState().setView({ zoom: 0.01, panX: Number.NaN, panY: 7 })
    expect(ui.getState().view).toEqual({ zoom: 0.1, panX: 0, panY: 7 })
  })

  it('zoomAt은 화면 점을 고정해 확대한다', () => {
    const ui = createUiStore()
    ui.getState().zoomAt(2, [100, 50])
    expect(ui.getState().view).toEqual({ zoom: 2, panX: -100, panY: -50 })
  })

  it('panBy는 화면 px만큼 옮긴다', () => {
    const ui = createUiStore({ view: { zoom: 0.65, panX: 195, panY: 422 } })
    ui.getState().panBy(30, -10)
    expect(ui.getState().view).toEqual({ zoom: 0.65, panX: 225, panY: 412 })
    ui.getState().panBy(Number.NaN, 5)
    expect(ui.getState().view).toEqual({ zoom: 0.65, panX: 225, panY: 417 })
  })

  it('fitTo는 지금 캔버스 크기와 insets로 fitView를 쓴다', () => {
    const ui = createUiStore({ size: { width: 390, height: 844 } })
    ui.getState().setInsets({ top: 0, bottom: 300 })
    const bbox = { minX: 0, minY: 0, maxX: 600, maxY: 300 }
    ui.getState().fitTo(bbox)
    expect(ui.getState().view).toEqual(fitView(bbox, { width: 390, height: 844 }, { top: 0, bottom: 300 }))
    expect(ui.getState().view.zoom).toBeCloseTo(0.55, 12)
  })

  it('캔버스 크기가 0이면 fitTo는 { zoom: 1, pan 0 }', () => {
    const ui = createUiStore({ view: { zoom: 3, panX: 10, panY: 10 } })
    ui.getState().fitTo({ minX: 0, minY: 0, maxX: 600, maxY: 300 })
    expect(ui.getState().view).toEqual({ zoom: 1, panX: 0, panY: 0 })
  })

  it('setSize·setInsets는 음수·NaN을 0으로 두고, 같은 값이면 알리지 않는다', () => {
    const ui = createUiStore()
    ui.getState().setSize({ width: -5, height: Number.NaN })
    expect(ui.getState().size).toEqual({ width: 0, height: 0 })
    ui.getState().setSize({ width: 800, height: 600 })
    ui.getState().setInsets({ top: 40, bottom: -1 })
    expect(ui.getState().insets).toEqual({ top: 40, bottom: 0 })
    const listener = vi.fn()
    ui.subscribe(listener)
    ui.getState().setSize({ width: 800, height: 600 })
    ui.getState().setInsets({ top: 40, bottom: 0 })
    ui.getState().setView({ ...ui.getState().view })
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('setPointer·patch', () => {
  it('setPointer는 마지막 포인터 종류를 기억한다', () => {
    const ui = createUiStore()
    ui.getState().setPointer('touch')
    expect(ui.getState().pointer).toBe('touch')
  })

  it('patch는 준 키만 바꾸고 undefined 값은 건너뛴다', () => {
    const ui = createUiStore()
    ui.getState().setSelection(['a'])
    ui.getState().patch({ mobileSheet: 'library', areaExpanded: true, scopeGroupId: undefined })
    const s = ui.getState()
    expect(s.mobileSheet).toBe('library')
    expect(s.areaExpanded).toBe(true)
    expect(s.scopeGroupId).toBeNull()
    expect(s.selection).toEqual(['a'])
    expect(s.mode).toBe('place')
  })

  it('patch로 같은 값을 주면 알리지 않는다', () => {
    const ui = createUiStore()
    const listener = vi.fn()
    ui.subscribe(listener)
    ui.getState().patch({ mode: 'place', gridVisible: true })
    expect(listener).not.toHaveBeenCalled()
    ui.getState().patch({ gridVisible: false })
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
