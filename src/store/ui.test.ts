import { describe, expect, it, vi } from 'vitest'
import { createLayout, type Inner, type Item, type Layout } from '../core/model'
import { fitView, ZOOM_MAX } from '../view/viewport'
import { createUiStore, sameTentTarget, toPointerKind } from './ui'

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
    expect(s.canvasPressed).toBe(false)
    expect(s.revealRequest).toBe(0)
    expect(s.mobileSheet).toBe('none')
    expect(s.desktopPanel).toBe('auto')
    expect(s.areaExpanded).toBe(false)
    expect(s.tentTarget).toBeNull()
    expect(s.vertexIndex).toBeNull()
    expect(s.toast).toBeNull()
    expect(s.editorDialog).toBeNull()
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

  it('리뷰 회귀: init으로 첫 포인터 종류를 정할 수 있다(터치 기기의 첫 조작)', () => {
    expect(createUiStore({ pointer: 'touch' }).getState().pointer).toBe('touch')
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

  it('toPointerKind는 pointerType을 PointerKind로 바꾸고 모르는 값은 마우스로 본다', () => {
    expect(toPointerKind('touch')).toBe('touch')
    expect(toPointerKind('pen')).toBe('pen')
    expect(toPointerKind('mouse')).toBe('mouse')
    expect(toPointerKind('')).toBe('mouse')
  })

  it('requestReveal은 부를 때마다 요청 번호를 올린다', () => {
    const ui = createUiStore()
    ui.getState().requestReveal()
    ui.getState().requestReveal()
    expect(ui.getState().revealRequest).toBe(2)
  })

  it('setCanvasPressed는 누름 상태를 바꾸고, 같은 값이면 알리지 않는다', () => {
    const ui = createUiStore()
    const listener = vi.fn()
    ui.subscribe(listener)
    ui.getState().setCanvasPressed(true)
    expect(ui.getState().canvasPressed).toBe(true)
    ui.getState().setCanvasPressed(true)
    expect(listener).toHaveBeenCalledTimes(1)
    ui.getState().setCanvasPressed(false)
    expect(ui.getState().canvasPressed).toBe(false)
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

function inner(id: string, shape: Inner['shape'], x = 0): Inner {
  return { id, name: id, shape, x, y: 0, rotation: 0 }
}

/** 외곽 600×300 사각형 + 이너들 */
function tentLayout(inners: Inner[], outer: Layout['tent']['outer'] = { kind: 'rect', w: 600, h: 300 }): Layout {
  return createLayout({ name: '시험 텐트', outer, inners }, { name: '시험 배치', id: 'L1', now: NOW })
}

describe('setMode — 모드 전환 정리 규칙(Review Focus 4·함정 R2)', () => {
  it('같은 모드면 아무것도 바꾸지 않고 알리지 않는다', () => {
    const ui = createUiStore()
    ui.getState().setSelection(['a'])
    const listener = vi.fn()
    ui.subscribe(listener)
    ui.getState().setMode('place')
    expect(listener).not.toHaveBeenCalled()
    expect(ui.getState().selection).toEqual(['a'])
  })

  it('배치 → 텐트: 물건 선택·그룹 안 편집·편집 대상을 비운다', () => {
    const ui = createUiStore()
    ui.getState().setSelection(['a', 'b'])
    ui.getState().patch({ scopeGroupId: 'g1' })
    ui.getState().selectTentTarget('outer', 2)
    ui.getState().setMode('tent')
    const s = ui.getState()
    expect(s.mode).toBe('tent')
    expect(s.selection).toEqual([])
    expect(s.scopeGroupId).toBeNull()
    expect(s.tentTarget).toBeNull()
    expect(s.vertexIndex).toBeNull()
  })

  it('배치 → 텐트: 선택·라이브러리·새 도형 시트는 닫고, 면적·경고 시트는 그대로 둔다', () => {
    for (const sheet of ['selection', 'library', 'newShape'] as const) {
      const ui = createUiStore()
      ui.getState().patch({ mobileSheet: sheet })
      ui.getState().setMode('tent')
      expect(ui.getState().mobileSheet).toBe('none')
    }
    for (const sheet of ['area', 'warnings', 'none'] as const) {
      const ui = createUiStore()
      ui.getState().patch({ mobileSheet: sheet })
      ui.getState().setMode('tent')
      expect(ui.getState().mobileSheet).toBe(sheet)
    }
  })

  it('배치 → 텐트: PC 새 도형 패널은 auto로, 경고 패널은 그대로', () => {
    const a = createUiStore()
    a.getState().patch({ desktopPanel: 'newShape' })
    a.getState().setMode('tent')
    expect(a.getState().desktopPanel).toBe('auto')
    const b = createUiStore()
    b.getState().patch({ desktopPanel: 'warnings' })
    b.getState().setMode('tent')
    expect(b.getState().desktopPanel).toBe('warnings')
  })

  it('텐트 → 배치: 편집 대상·꼭짓점 선택을 비우고 텐트 시트를 닫는다', () => {
    const ui = createUiStore({ mode: 'tent' })
    ui.getState().selectTentTarget({ innerId: 'in1' }, 1)
    ui.getState().patch({ mobileSheet: 'tent' })
    ui.getState().setMode('place')
    const s = ui.getState()
    expect(s.mode).toBe('place')
    expect(s.tentTarget).toBeNull()
    expect(s.vertexIndex).toBeNull()
    expect(s.mobileSheet).toBe('none')
  })

  it('텐트 → 배치: 텐트 시트가 아닌 시트(경고)는 그대로 둔다', () => {
    const ui = createUiStore({ mode: 'tent' })
    ui.getState().patch({ mobileSheet: 'warnings' })
    ui.getState().setMode('place')
    expect(ui.getState().mobileSheet).toBe('warnings')
  })

  it('측정 중에는 모드를 바꾸지 않는다(정리도 하지 않음)', () => {
    const ui = createUiStore()
    ui.getState().setSelection(['a'])
    ui.getState().patch({ measuring: true })
    ui.getState().setMode('tent')
    expect(ui.getState().mode).toBe('place')
    expect(ui.getState().selection).toEqual(['a'])
  })
})

describe('selectTentTarget', () => {
  it('대상과 꼭짓점을 고르고, 꼭짓점을 주지 않으면 null', () => {
    const ui = createUiStore()
    ui.getState().selectTentTarget('outer', 2)
    expect(ui.getState().tentTarget).toBe('outer')
    expect(ui.getState().vertexIndex).toBe(2)
    ui.getState().selectTentTarget({ innerId: 'in1' })
    expect(ui.getState().tentTarget).toEqual({ innerId: 'in1' })
    expect(ui.getState().vertexIndex).toBeNull()
  })

  it('target이 null이면 vertexIndex도 null', () => {
    const ui = createUiStore()
    ui.getState().selectTentTarget('outer', 1)
    ui.getState().selectTentTarget(null, 3)
    expect(ui.getState().tentTarget).toBeNull()
    expect(ui.getState().vertexIndex).toBeNull()
  })

  it('음수·정수가 아닌 꼭짓점 번호는 null로 둔다', () => {
    const ui = createUiStore()
    ui.getState().selectTentTarget('outer', -1)
    expect(ui.getState().vertexIndex).toBeNull()
    ui.getState().selectTentTarget('outer', 1.5)
    expect(ui.getState().vertexIndex).toBeNull()
  })

  it('같은 대상·같은 꼭짓점이면 알리지 않는다(새 객체로 같은 이너를 줘도)', () => {
    const ui = createUiStore()
    ui.getState().selectTentTarget({ innerId: 'in1' }, 0)
    const listener = vi.fn()
    ui.subscribe(listener)
    ui.getState().selectTentTarget({ innerId: 'in1' }, 0)
    ui.getState().selectTentTarget(null)
    ui.getState().selectTentTarget(null)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('sameTentTarget: outer끼리, 같은 innerId끼리만 같다', () => {
    expect(sameTentTarget('outer', 'outer')).toBe(true)
    expect(sameTentTarget({ innerId: 'a' }, { innerId: 'a' })).toBe(true)
    expect(sameTentTarget({ innerId: 'a' }, { innerId: 'b' })).toBe(false)
    expect(sameTentTarget('outer', { innerId: 'a' })).toBe(false)
    expect(sameTentTarget(null, null)).toBe(true)
    expect(sameTentTarget(null, 'outer')).toBe(false)
  })
})

describe('pruneTentTarget(Review Focus 3)', () => {
  it('지워진 이너가 대상이면 대상·꼭짓점을 해제한다', () => {
    const ui = createUiStore({ mode: 'tent' })
    ui.getState().selectTentTarget({ innerId: 'gone' }, 1)
    ui.getState().pruneTentTarget(tentLayout([inner('in1', { kind: 'rect', w: 100, h: 100 })]))
    expect(ui.getState().tentTarget).toBeNull()
    expect(ui.getState().vertexIndex).toBeNull()
  })

  it('꼭짓점이 줄어 번호가 고리 길이 이상이면 vertexIndex만 null', () => {
    const ui = createUiStore({ mode: 'tent' })
    ui.getState().selectTentTarget('outer', 3)
    const triangle = tentLayout([], {
      kind: 'polygon',
      points: [
        [-300, -150],
        [300, -150],
        [0, 150],
      ],
    })
    ui.getState().pruneTentTarget(triangle)
    expect(ui.getState().tentTarget).toBe('outer')
    expect(ui.getState().vertexIndex).toBeNull()
  })

  it('대상이 원으로 바뀌면 vertexIndex null(원에는 꼭짓점이 없음)', () => {
    const ui = createUiStore({ mode: 'tent' })
    ui.getState().selectTentTarget({ innerId: 'in1' }, 0)
    ui.getState().pruneTentTarget(tentLayout([inner('in1', { kind: 'circle', d: 100 })]))
    expect(ui.getState().tentTarget).toEqual({ innerId: 'in1' })
    expect(ui.getState().vertexIndex).toBeNull()
  })

  it('그대로 유효하면 상태를 바꾸지 않는다', () => {
    const ui = createUiStore({ mode: 'tent' })
    ui.getState().selectTentTarget({ innerId: 'in1' }, 3)
    const before = ui.getState()
    ui.getState().pruneTentTarget(tentLayout([inner('in1', { kind: 'rect', w: 100, h: 100 })]))
    expect(ui.getState()).toBe(before)
  })
})

describe('토스트', () => {
  it('showToast는 부를 때마다 id를 1씩 올린다(같은 문구도 새 토스트)', () => {
    const ui = createUiStore()
    ui.getState().showToast('빈 공간이 부족해요')
    expect(ui.getState().toast).toEqual({ id: 1, text: '빈 공간이 부족해요' })
    ui.getState().showToast('빈 공간이 부족해요')
    expect(ui.getState().toast).toEqual({ id: 2, text: '빈 공간이 부족해요' })
  })

  it('dismissToast는 지금 토스트 id가 같을 때만 지운다', () => {
    const ui = createUiStore()
    ui.getState().showToast('첫째')
    ui.getState().showToast('둘째')
    ui.getState().dismissToast(1)
    expect(ui.getState().toast?.text).toBe('둘째')
    ui.getState().dismissToast(2)
    expect(ui.getState().toast).toBeNull()
  })

  it('지운 뒤 다시 띄워도 id는 줄지 않는다', () => {
    const ui = createUiStore()
    ui.getState().showToast('a')
    ui.getState().dismissToast(1)
    ui.getState().showToast('a')
    expect(ui.getState().toast?.id).toBe(2)
  })
})

describe('editorDialog', () => {
  it('patch로 열고 닫는다', () => {
    const ui = createUiStore()
    ui.getState().patch({ editorDialog: 'swapTent' })
    expect(ui.getState().editorDialog).toBe('swapTent')
    ui.getState().patch({ editorDialog: null })
    expect(ui.getState().editorDialog).toBeNull()
  })
})

describe('그리기·잠금·외곽 없음(Plan 4.1)', () => {
  it('기본값: 그리기 없음, 잠금 없음, 외곽 있음', () => {
    const s = createUiStore().getState()
    expect(s.drawing).toBeNull()
    expect(s.tentLock).toBe('none')
    expect(s.outerPending).toBe(false)
  })

  it('startDrawing: 새 이너면 대상 해제, 외곽·이너 다시 그리기면 그 대상, 꼭짓점 해제를 한 번에 알린다', () => {
    const ui = createUiStore({ mode: 'tent' })
    ui.getState().selectTentTarget('outer', 2)
    const listener = vi.fn()
    ui.subscribe(listener)
    ui.getState().startDrawing('newInner')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(ui.getState()).toMatchObject({ drawing: { goal: 'newInner', points: [] }, tentTarget: null, vertexIndex: null })
    ui.getState().startDrawing({ innerId: 'in1' })
    expect(ui.getState()).toMatchObject({ drawing: { goal: { innerId: 'in1' } }, tentTarget: { innerId: 'in1' } })
    ui.getState().startDrawing('outer')
    expect(ui.getState().tentTarget).toBe('outer')
  })

  it('외곽 없음이면 외곽을 그려도 대상은 없음', () => {
    const ui = createUiStore({ mode: 'tent' })
    ui.getState().setOuterPending(true)
    ui.getState().startDrawing('outer')
    expect(ui.getState().tentTarget).toBeNull()
    expect(ui.getState().drawing?.goal).toBe('outer')
  })

  it('setDrawPoints는 그리는 중일 때만, endDrawing은 그리기를 끝낸다', () => {
    const ui = createUiStore({ mode: 'tent' })
    ui.getState().setDrawPoints([[1, 2]])
    expect(ui.getState().drawing).toBeNull()
    ui.getState().startDrawing('newInner')
    ui.getState().setDrawPoints([[1, 2]])
    expect(ui.getState().drawing).toEqual({ goal: 'newInner', points: [[1, 2]] })
    ui.getState().endDrawing()
    expect(ui.getState().drawing).toBeNull()
  })

  it('모드를 바꾸면 그리던 것을 버린다(두 갈래 모두)', () => {
    const ui = createUiStore({ mode: 'tent' })
    ui.getState().startDrawing('newInner')
    ui.getState().setMode('place')
    expect(ui.getState().drawing).toBeNull()
    ui.getState().startDrawing('newInner')
    ui.getState().setMode('tent')
    expect(ui.getState().drawing).toBeNull()
  })

  it('다른 대상을 고르면 그리던 것을 버리고, 같은 대상(꼭짓점만 다름)이면 유지한다', () => {
    const ui = createUiStore({ mode: 'tent' })
    ui.getState().startDrawing({ innerId: 'in1' })
    ui.getState().selectTentTarget({ innerId: 'in1' }, 0)
    expect(ui.getState().drawing).not.toBeNull()
    ui.getState().selectTentTarget('outer')
    expect(ui.getState().drawing).toBeNull()
    ui.getState().startDrawing('newInner')
    ui.getState().selectTentTarget(null)
    expect(ui.getState().drawing).not.toBeNull()
  })

  it('잠긴 대상은 고르지 않는다: 외곽 잠금의 외곽, 이너 잠금의 이너, 외곽 없음의 외곽', () => {
    const ui = createUiStore({ mode: 'tent' })
    ui.getState().setTentLock('outer')
    ui.getState().selectTentTarget('outer', 1)
    expect(ui.getState().tentTarget).toBeNull()
    ui.getState().selectTentTarget({ innerId: 'in1' })
    expect(ui.getState().tentTarget).toEqual({ innerId: 'in1' })
    ui.getState().setTentLock('inners')
    expect(ui.getState().tentTarget).toBeNull()
    ui.getState().selectTentTarget({ innerId: 'in1' })
    expect(ui.getState().tentTarget).toBeNull()
    ui.getState().selectTentTarget('outer')
    expect(ui.getState().tentTarget).toBe('outer')
    ui.getState().setOuterPending(true)
    ui.getState().selectTentTarget(null)
    ui.getState().selectTentTarget('outer')
    expect(ui.getState().tentTarget).toBeNull()
  })

  it('setTentLock: 잠긴 쪽이 아닌 대상은 그대로, 그리던 것은 버림, 같은 잠금이면 알리지 않음', () => {
    const ui = createUiStore({ mode: 'tent' })
    ui.getState().selectTentTarget({ innerId: 'in1' })
    ui.getState().setTentLock('outer')
    expect(ui.getState().tentTarget).toEqual({ innerId: 'in1' })
    ui.getState().startDrawing('newInner')
    ui.getState().setTentLock('none')
    expect(ui.getState().drawing).toBeNull()
    const listener = vi.fn()
    ui.subscribe(listener)
    ui.getState().setTentLock('none')
    expect(listener).not.toHaveBeenCalled()
  })

  it('pruneTentTarget: 다시 그리는 이너가 없어지면 그리기도 끝내고, 새 이너 그리기는 유지한다', () => {
    const ui = createUiStore({ mode: 'tent' })
    ui.getState().startDrawing({ innerId: 'gone' })
    ui.getState().pruneTentTarget(tentLayout([inner('in1', { kind: 'rect', w: 100, h: 100 })]))
    expect(ui.getState().drawing).toBeNull()
    expect(ui.getState().tentTarget).toBeNull()
    ui.getState().startDrawing('newInner')
    ui.getState().pruneTentTarget(tentLayout([]))
    expect(ui.getState().drawing).not.toBeNull()
  })
})

describe('polygonFocus(패널 변·각도 칸 포커스 → 캔버스 강조)', () => {
  it('기본 null, setPolygonFocus로 바꾸고, 대상이 바뀌거나 모드가 바뀌면 지운다', () => {
    const ui = createUiStore({ mode: 'tent' })
    expect(ui.getState().polygonFocus).toBeNull()
    ui.getState().selectTentTarget('outer')
    ui.getState().setPolygonFocus({ kind: 'edge', index: 1 })
    expect(ui.getState().polygonFocus).toEqual({ kind: 'edge', index: 1 })
    ui.getState().selectTentTarget('outer', 2)
    expect(ui.getState().polygonFocus).toEqual({ kind: 'edge', index: 1 })
    ui.getState().selectTentTarget({ innerId: 'a' })
    expect(ui.getState().polygonFocus).toBeNull()
    ui.getState().setPolygonFocus({ kind: 'vertex', index: 2 })
    ui.getState().setMode('place')
    expect(ui.getState().polygonFocus).toBeNull()
  })
})

describe('axisLock(휴대폰 「상하좌우로만 이동」 토글)', () => {
  it('기본 꺼짐, patch로 켜고 끈다', () => {
    const ui = createUiStore()
    expect(ui.getState().axisLock).toBe(false)
    ui.getState().patch({ axisLock: true })
    expect(ui.getState().axisLock).toBe(true)
  })
})
