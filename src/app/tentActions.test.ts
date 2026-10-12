import { beforeEach, describe, expect, it } from 'vitest'
import { createLayout, type Inner, type Item, type Tent } from '../core/model'
import { addItem } from '../core/ops/items'
import { loadGenericTents } from './presets'
import { createStores, type Stores } from './stores'
import {
  addInnerAction,
  commitInnerMove,
  deleteInnerAction,
  deleteTargetVertex,
  enterTentMode,
  exitTentMode,
  insertTargetVertex,
  MIN_VERTEX_MESSAGE,
  NO_SPACE_MESSAGE,
  renameInnerAction,
  rotateInner90,
  setInnerRotation,
  setTargetDiameter,
  setTargetTemplate,
  setTargetVertex,
  swapTentAction,
  tentControlsEnabled,
} from './tentActions'

const NOW = '2026-10-08T00:00:00.000Z'
const OVERLAP_MESSAGE = '이너 1과(와) 이너 2이(가) 5mm 넘게 겹쳐요'

/** 이너 1: 220×300, x −310~−90 · y −150~150(터널 4인과 같음) */
const IN1: Inner = {
  id: 'in1',
  name: '이너 1',
  shape: { kind: 'rect', w: 220, h: 300 },
  template: { kind: 'rect', w: 220, h: 300 },
  x: -200,
  y: 0,
  rotation: 0,
}
/** 이너 2: 세로로 긴 40×300, x 30~70. 90° 돌리면 x −100~200이 되어 이너 1과 10cm 겹침 */
const IN2: Inner = {
  id: 'in2',
  name: '이너 2',
  shape: { kind: 'rect', w: 40, h: 300 },
  template: { kind: 'rect', w: 40, h: 300 },
  x: 50,
  y: 0,
  rotation: 0,
}

function tentOf(inners: Inner[]): Tent {
  return {
    name: '시험 텐트',
    outer: { kind: 'rect', w: 620, h: 320 },
    outerTemplate: { kind: 'rect', w: 620, h: 320 },
    inners,
  }
}

function storesWith(inners: Inner[]): Stores {
  const s = createStores(createLayout(tentOf(inners), { name: '시험 배치', id: 'L1', now: NOW }))
  const ui = s.ui.getState()
  ui.setSize({ width: 800, height: 600 })
  ui.setInsets({ top: 0, bottom: 0 })
  ui.setView({ zoom: 1, panX: 400, panY: 300 })
  return s
}

let stores: Stores
const layout = () => stores.doc.getState().layout
const tent = () => layout().tent
const canUndo = () => stores.doc.getState().canUndo
const ui = () => stores.ui.getState()

beforeEach(() => {
  stores = storesWith([IN1, IN2])
})

describe('tentControlsEnabled(측정 잠금 이음매)', () => {
  it('측정 중이 아니면 true, 측정 중이면 false', () => {
    expect(tentControlsEnabled({ measuring: false })).toBe(true)
    expect(tentControlsEnabled({ measuring: true })).toBe(false)
  })
})

describe('enterTentMode·exitTentMode', () => {
  it('텐트 모드로 들어가며 물건 선택을 비우고, 대상을 주면 그 대상을 고른다', () => {
    ui().setSelection(['m1'])
    enterTentMode(stores, { innerId: 'in2' })
    expect(ui().mode).toBe('tent')
    expect(ui().selection).toEqual([])
    expect(ui().tentTarget).toEqual({ innerId: 'in2' })
  })

  it('없는 이너를 주면 모드만 바꾸고 대상은 고르지 않는다', () => {
    enterTentMode(stores, { innerId: 'gone' })
    expect(ui().mode).toBe('tent')
    expect(ui().tentTarget).toBeNull()
  })

  it('측정 중이면 모드도 대상도 바꾸지 않는다', () => {
    ui().patch({ measuring: true })
    enterTentMode(stores, 'outer')
    expect(ui().mode).toBe('place')
    expect(ui().tentTarget).toBeNull()
  })

  it('exitTentMode는 배치 모드로 돌아가며 대상을 푼다', () => {
    enterTentMode(stores, 'outer')
    exitTentMode(stores)
    expect(ui().mode).toBe('place')
    expect(ui().tentTarget).toBeNull()
  })
})

describe('addInnerAction', () => {
  it('빈 곳에 새 이너를 넣고 그 이너를 대상으로 고른다(실행 취소 1칸)', () => {
    stores = storesWith([IN1])
    enterTentMode(stores)
    const id = addInnerAction(stores)
    if (id === null) throw new Error('이너를 넣지 못함')
    expect(tent().inners.map((it) => it.name)).toEqual(['이너 1', '이너 2'])
    expect(ui().tentTarget).toEqual({ innerId: id })
    expect(canUndo()).toBe(true)
    stores.doc.getState().undo()
    expect(tent().inners).toHaveLength(1)
    expect(ui().tentTarget).toBeNull()
  })

  it('자리가 없으면 「빈 공간이 부족해요」 토스트와 null, 기록 없음', () => {
    const full: Inner = { ...IN1, shape: { kind: 'rect', w: 620, h: 320 }, template: { kind: 'rect', w: 620, h: 320 }, x: 0 }
    stores = storesWith([full])
    enterTentMode(stores)
    expect(addInnerAction(stores)).toBeNull()
    expect(ui().toast?.text).toBe(NO_SPACE_MESSAGE)
    expect(tent().inners).toHaveLength(1)
    expect(canUndo()).toBe(false)
    expect(ui().tentTarget).toBeNull()
  })
})

describe('deleteInnerAction', () => {
  it('대상인 이너를 지우면 대상이 풀리고, 실행 취소하면 이너만 돌아온다', () => {
    enterTentMode(stores, { innerId: 'in2' })
    deleteInnerAction(stores, 'in2')
    expect(tent().inners.map((it) => it.id)).toEqual(['in1'])
    expect(ui().tentTarget).toBeNull()
    stores.doc.getState().undo()
    expect(tent().inners.map((it) => it.id)).toEqual(['in1', 'in2'])
    expect(ui().tentTarget).toBeNull()
  })

  it('대상이 아닌 이너를 지우면 대상은 그대로', () => {
    enterTentMode(stores, 'outer')
    deleteInnerAction(stores, 'in2')
    expect(ui().tentTarget).toBe('outer')
  })
})

describe('거부 판정 — 새로 생긴 이슈만(Review Focus 2, R11)', () => {
  it('새로 겹치게 하는 [90도]는 거부하고 기록을 남기지 않는다', () => {
    const before = layout()
    expect(rotateInner90(stores, 'in2')).toEqual({ ok: false, error: OVERLAP_MESSAGE })
    expect(layout()).toBe(before)
    expect(canUndo()).toBe(false)
  })

  it('겹치지 않는 [90도]는 반영한다', () => {
    expect(rotateInner90(stores, 'in1')).toEqual({ ok: true })
    expect(tent().inners[0]?.rotation).toBe(90)
    expect(canUndo()).toBe(true)
  })

  it('회전 입력: normAngle 후 차이만큼 돌리고, 같은 각이면 기록 없음, 겹치면 거부', () => {
    expect(setInnerRotation(stores, 'in2', 0)).toEqual({ ok: true })
    expect(canUndo()).toBe(false)
    expect(setInnerRotation(stores, 'in2', 450)).toEqual({ ok: false, error: OVERLAP_MESSAGE })
    expect(tent().inners[1]?.rotation).toBe(0)
    expect(setInnerRotation(stores, 'in2', -180)).toEqual({ ok: true })
    expect(tent().inners[1]?.rotation).toBe(180)
    expect(canUndo()).toBe(true)
  })

  it('새로 겹치게 하는 이동(끌기 커밋)은 거부, 겹치지 않는 이동은 1칸', () => {
    const before = layout()
    expect(commitInnerMove(stores, 'in2', -140, 0)).toEqual({ ok: false, error: OVERLAP_MESSAGE })
    expect(layout()).toBe(before)
    expect(commitInnerMove(stores, 'in2', 100, 0)).toEqual({ ok: true })
    expect(tent().inners[1]?.x).toBe(150)
    expect(canUndo()).toBe(true)
  })

  it('원래 겹친 텐트에서 다른 이너를 옮기는 것은 막지 않는다', () => {
    const overlapping: Inner = { ...IN2, x: -100 } // 이미 이너 1과 겹침(x −120~−80)
    const third: Inner = { ...IN2, id: 'in3', name: '이너 3', shape: { kind: 'rect', w: 40, h: 40 }, template: { kind: 'rect', w: 40, h: 40 }, x: 200 }
    stores = storesWith([IN1, overlapping, third])
    expect(commitInnerMove(stores, 'in3', 30, 20)).toEqual({ ok: true })
    expect(tent().inners[2]).toMatchObject({ x: 230, y: 20 })
    expect(canUndo()).toBe(true)
  })

  it('자기교차가 생기는 꼭짓점 입력은 거부하고 외곽을 그대로 둔다', () => {
    const before = layout()
    expect(setTargetVertex(stores, 'outer', 0, [400, 0])).toEqual({ ok: false, error: '외곽: 변끼리 교차해요' })
    expect(layout()).toBe(before)
    expect(canUndo()).toBe(false)
  })

  it('정상 꼭짓점 입력은 자유 다각형이 되고 템플릿을 버린다(1칸)', () => {
    expect(setTargetVertex(stores, 'outer', 0, [-350, -160])).toEqual({ ok: true })
    expect(tent().outer).toEqual({
      kind: 'polygon',
      points: [
        [-350, -160],
        [310, -160],
        [310, 160],
        [-310, 160],
      ],
    })
    expect(tent().outerTemplate).toBeUndefined()
    expect(canUndo()).toBe(true)
  })

  it('좌표 범위(−10000~10000) 밖이면 범위 문구', () => {
    expect(setTargetVertex(stores, 'outer', 0, [10001, 0])).toEqual({ ok: false, error: '-10,000~10,000 사이로 입력해 주세요' })
    expect(canUndo()).toBe(false)
  })
})

describe('템플릿·지름 입력', () => {
  it('같은 값 템플릿이면 기록을 남기지 않는다(Review Focus 3)', () => {
    expect(setTargetTemplate(stores, 'outer', { kind: 'rect', w: 620, h: 320 })).toEqual({ ok: true })
    expect(canUndo()).toBe(false)
  })

  it('다른 값이면 1칸, 범위 밖이면 범위 문구', () => {
    expect(setTargetTemplate(stores, 'outer', { kind: 'rect', w: 700, h: 320 })).toEqual({ ok: true })
    expect(tent().outer).toEqual({ kind: 'rect', w: 700, h: 320 })
    expect(canUndo()).toBe(true)
    expect(setTargetTemplate(stores, 'outer', { kind: 'rect', w: 0, h: 320 })).toEqual({
      ok: false,
      error: '1~5,000 사이로 입력해 주세요',
    })
    expect(tent().outer).toEqual({ kind: 'rect', w: 700, h: 320 })
  })

  it('이너 템플릿을 키워 새로 겹치면 거부', () => {
    expect(setTargetTemplate(stores, { innerId: 'in2' }, { kind: 'rect', w: 300, h: 300 })).toEqual({
      ok: false,
      error: OVERLAP_MESSAGE,
    })
    expect(tent().inners[1]?.shape).toEqual({ kind: 'rect', w: 40, h: 300 })
  })

  it('원 이너 지름을 바꾸고, 범위 밖이면 범위 문구, 원이 아니면 아무것도 하지 않는다', () => {
    const round: Inner = { id: 'c1', name: '이너 1', shape: { kind: 'circle', d: 100 }, template: { kind: 'circle', d: 100 }, x: 150, y: 0, rotation: 0 }
    stores = storesWith([round])
    expect(setTargetDiameter(stores, { innerId: 'c1' }, 120)).toEqual({ ok: true })
    expect(tent().inners[0]?.shape).toEqual({ kind: 'circle', d: 120 })
    expect(tent().inners[0]?.template).toEqual({ kind: 'circle', d: 120 })
    expect(setTargetDiameter(stores, { innerId: 'c1' }, 6000)).toEqual({ ok: false, error: '1~5,000 사이로 입력해 주세요' })
    const before = layout()
    expect(setTargetDiameter(stores, 'outer', 300)).toEqual({ ok: true })
    expect(layout()).toBe(before)
  })
})

describe('꼭짓점 추가·삭제', () => {
  it('insertTargetVertex는 변 중점에 넣고 새 번호(edgeIndex+1)를 고른다', () => {
    enterTentMode(stores, 'outer')
    expect(insertTargetVertex(stores, 'outer', 1)).toBe(2)
    expect(ui().tentTarget).toBe('outer')
    expect(ui().vertexIndex).toBe(2)
    const outer = tent().outer
    if (outer.kind !== 'polygon') throw new Error('다각형이 아님')
    expect(outer.points).toHaveLength(5)
    expect(outer.points[2]).toEqual([310, 0])
    expect(canUndo()).toBe(true)
  })

  it('원에는 넣지 못하고 null', () => {
    const round: Inner = { id: 'c1', name: '이너 1', shape: { kind: 'circle', d: 100 }, x: 150, y: 0, rotation: 0 }
    stores = storesWith([round])
    expect(insertTargetVertex(stores, { innerId: 'c1' }, 0)).toBeNull()
    expect(canUndo()).toBe(false)
  })

  it('deleteTargetVertex는 지우고 꼭짓점 선택을 풀며, 3개 남으면 거부한다', () => {
    enterTentMode(stores, 'outer')
    ui().selectTentTarget('outer', 0)
    expect(deleteTargetVertex(stores, 'outer', 0)).toEqual({ ok: true })
    expect(ui().tentTarget).toBe('outer')
    expect(ui().vertexIndex).toBeNull()
    const outer = tent().outer
    expect(outer.kind === 'polygon' ? outer.points : []).toHaveLength(3)
    const triangle = layout()
    expect(deleteTargetVertex(stores, 'outer', 0)).toEqual({ ok: false, error: MIN_VERTEX_MESSAGE })
    expect(layout()).toBe(triangle)
  })

  it('원 대상이면 지울 꼭짓점이 없어 아무것도 하지 않는다', () => {
    const round: Inner = { id: 'c1', name: '이너 1', shape: { kind: 'circle', d: 100 }, x: 150, y: 0, rotation: 0 }
    stores = storesWith([round])
    const before = layout()
    expect(deleteTargetVertex(stores, { innerId: 'c1' }, 0)).toEqual({ ok: true })
    expect(layout()).toBe(before)
  })
})

describe('renameInnerAction', () => {
  it('앞뒤 공백을 떼고, 빈 이름·같은 이름이면 기록이 없다', () => {
    renameInnerAction(stores, 'in1', '   ')
    renameInnerAction(stores, 'in1', ' 이너 1 ')
    expect(canUndo()).toBe(false)
    renameInnerAction(stores, 'in1', '  침실  ')
    expect(tent().inners[0]?.name).toBe('침실')
    expect(canUndo()).toBe(true)
  })
})

describe('swapTentAction(§4.7-8, R9)', () => {
  function mat(): Item {
    return { id: 'm1', name: '매트', shape: { kind: 'rect', w: 200, h: 60 }, x: 100, y: 40, rotation: 0, color: 'blue', category: 'MAT', countsArea: true }
  }

  it('tent만 바꾸고 물건은 그대로, 실행 취소 1칸, 대상 해제, 모드 그대로, sourcePresetId 기록', () => {
    stores.doc.getState().commit((d) => addItem(d, mat()))
    stores.doc.getState().load(stores.doc.getState().layout) // 물건이 있는 빈 기록에서 시작
    enterTentMode(stores, { innerId: 'in1' })
    const dome = loadGenericTents().find((p) => p.id === 'generic/dome-2p')
    if (dome === undefined) throw new Error('돔 2인 프리셋 없음')
    swapTentAction(stores, dome.tent, dome.id)
    expect(tent().name).toBe('돔 2인 예시')
    expect(layout().items).toEqual([mat()])
    expect(layout().sourcePresetId).toBe('generic/dome-2p')
    expect(ui().mode).toBe('tent')
    expect(ui().tentTarget).toBeNull()
    expect(canUndo()).toBe(true)
    expect(stores.doc.getState().undo()).toBe(true)
    expect(tent().name).toBe('시험 텐트')
    expect(canUndo()).toBe(false)
  })

  it('바꾼 텐트는 복사본이다(원본을 고쳐도 배치는 그대로)', () => {
    const source = tentOf([])
    swapTentAction(stores, source)
    source.name = '바뀐 이름'
    expect(tent().name).toBe('시험 텐트')
  })

  it('sourcePresetId 없이 바꾸면(직접 만든 텐트) 지운다', () => {
    const dome = loadGenericTents()[0]
    if (dome === undefined) throw new Error('프리셋 없음')
    swapTentAction(stores, dome.tent, dome.id)
    swapTentAction(stores, tentOf([]))
    expect(layout().sourcePresetId).toBeUndefined()
  })

  it('맞춤 보기를 한 번 한다(작은 텐트로 바꾸면 확대됨)', () => {
    const before = ui().view
    const dome = loadGenericTents().find((p) => p.id === 'generic/dome-2p')
    if (dome === undefined) throw new Error('돔 2인 프리셋 없음')
    swapTentAction(stores, dome.tent, dome.id)
    expect(ui().view.zoom).toBeGreaterThan(before.zoom)
    expect(ui().view.panX).toBeCloseTo(400, 6)
  })
})
