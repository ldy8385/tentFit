import { beforeEach, describe, expect, it } from 'vitest'
import { ringBBox } from '../core/geom'
import { createLayout, type Inner, type Item, type Pt, type Tent } from '../core/model'
import { addItem } from '../core/ops/items'
import { targetWorldRing } from '../core/ops/tent'
import { defaultInnerTemplate } from '../core/templates'
import { loadGenericTents } from './presets'
import { createStores, type Stores } from './stores'
import {
  addInnerAction,
  addInnerShape,
  appendDrawPoint,
  attachInnerToWall,
  cancelDrawing,
  changeTargetShape,
  commitInnerMove,
  CROSS_MESSAGE,
  defineFirstOuter,
  finishDrawing,
  OVERLAP_DRAW_MESSAGE,
  setMakerOuterShape,
  setTargetEdgeLength,
  setTargetSize,
  setTargetVertexAngle,
  startDrawingAction,
  TINY_MESSAGE,
  undoDrawPoint,
  ZERO_EDGE_MESSAGE,
  deleteInnerAction,
  deleteTargetVertex,
  enterTentMode,
  exitTentMode,
  insertTargetVertex,
  MIN_VERTEX_MESSAGE,
  NO_SPACE_MESSAGE,
  renameInnerAction,
  selectTentTargetFromCanvas,
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

describe('최종 리뷰: 캔버스에서 대상을 고르면 경고 패널 대신 텐트 편집 패널(§4.6)', () => {
  it('대상을 고르고, PC 경고 패널이 열려 있으면 기본 패널(auto)로 바꾼다', () => {
    enterTentMode(stores)
    ui().patch({ desktopPanel: 'warnings' })
    selectTentTargetFromCanvas(stores, { innerId: IN1.id }, null)
    expect(ui().tentTarget).toEqual({ innerId: IN1.id })
    expect(ui().desktopPanel).toBe('auto')
  })

  it('대상 해제(null)면 패널은 그대로', () => {
    enterTentMode(stores, { innerId: IN1.id })
    ui().patch({ desktopPanel: 'warnings' })
    selectTentTargetFromCanvas(stores, null, null)
    expect(ui().tentTarget).toBeNull()
    expect(ui().desktopPanel).toBe('warnings')
  })
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


function storesWithTent(t: Tent): Stores {
  const s = createStores(createLayout(t, { name: '시험 배치', id: 'L1', now: NOW }))
  s.ui.getState().setSize({ width: 800, height: 600 })
  return s
}

function polyTent(points: Pt[], inners: Inner[] = []): Tent {
  return { name: '그린 텐트', outer: { kind: 'polygon', points }, inners }
}

function polyInner(id: string, points: Pt[], x: number, y: number, rotation = 0): Inner {
  return { id, name: `이너 ${id}`, shape: { kind: 'polygon', points }, x, y, rotation }
}

function near(a: Pt[], b: Pt[], tol = 1e-9): void {
  expect(a).toHaveLength(b.length)
  a.forEach((p, i) => {
    expect(Math.abs(p[0] - b[i]![0])).toBeLessThanOrEqual(tol)
    expect(Math.abs(p[1] - b[i]![1])).toBeLessThanOrEqual(tol)
  })
}

const outerPoints = () => {
  const o = tent().outer
  if (o.kind !== 'polygon') throw new Error('외곽이 다각형이 아님')
  return o.points
}

describe('예시 이너 추가(Plan 4.1 §2.1)', () => {
  it('addInnerShape: 사다리꼴 기본 이너를 넣고 그 이너를 고른다(1칸)', () => {
    stores = storesWith([IN1])
    const id = addInnerShape(stores, 'trapezoid')
    expect(id).not.toBeNull()
    const added = tent().inners.find((it) => it.id === id)
    expect(added?.template).toEqual(defaultInnerTemplate('trapezoid', tent().outer))
    expect(ui().tentTarget).toEqual({ innerId: id })
    stores.doc.getState().undo()
    expect(tent().inners).toHaveLength(1)
    expect(canUndo()).toBe(false)
  })

  it('자리가 없으면 「빈 공간이 부족해요」 토스트와 null, 측정 중·이너 잠금이면 아무것도 하지 않음', () => {
    stores = storesWith([{ ...IN1, shape: { kind: 'rect', w: 620, h: 320 }, template: { kind: 'rect', w: 620, h: 320 }, x: 0 }])
    expect(addInnerShape(stores, 'circle')).toBeNull()
    expect(ui().toast?.text).toBe(NO_SPACE_MESSAGE)
    stores = storesWith([])
    ui().patch({ measuring: true })
    expect(addInnerShape(stores, 'rect')).toBeNull()
    ui().patch({ measuring: false })
    ui().setTentLock('inners')
    expect(addInnerShape(stores, 'rect')).toBeNull()
    expect(tent().inners).toHaveLength(0)
    expect(canUndo()).toBe(false)
  })
})

describe('모양 바꾸기(Plan 4.1 §3)', () => {
  it('사각 이너 220×300 → 원(지름 220, 자리·회전 그대로), 1칸, 꼭짓점 선택 해제', () => {
    ui().selectTentTarget({ innerId: 'in1' }, 2)
    expect(changeTargetShape(stores, { innerId: 'in1' }, 'circle')).toEqual({ ok: true })
    const in1 = tent().inners[0]!
    expect(in1).toMatchObject({ x: -200, y: 0, rotation: 0, shape: { kind: 'circle', d: 220 }, template: { kind: 'circle', d: 220 } })
    expect(ui().vertexIndex).toBeNull()
    stores.doc.getState().undo()
    expect(tent().inners[0]).toEqual(IN1)
  })

  it('같은 종류면 아무것도 하지 않는다(기록 없음)', () => {
    expect(changeTargetShape(stores, { innerId: 'in1' }, 'rect')).toEqual({ ok: true })
    expect(canUndo()).toBe(false)
  })

  it('자유 다각형 외곽 → 사각형: bbox w×h를 이어받는다', () => {
    stores = storesWithTent(polyTent([[0, 0], [600, 0], [600, 330], [10, 330]]))
    changeTargetShape(stores, 'outer', 'rect')
    expect(tent().outer).toEqual({ kind: 'rect', w: 600, h: 330 })
    expect(tent().outerTemplate).toEqual({ kind: 'rect', w: 600, h: 330 })
  })

  it('측정 중이면 아무것도 하지 않는다', () => {
    ui().patch({ measuring: true })
    changeTargetShape(stores, { innerId: 'in1' }, 'circle')
    expect(canUndo()).toBe(false)
  })
})

describe('벽에 붙이기(Plan 4.1 §2.4)', () => {
  it('이너 2를 뒤 벽에: bbox가 벽(y −160)에 닿고 벽 가운데(x 0), 1칸', () => {
    expect(attachInnerToWall(stores, 'in2', 'back')).toEqual({ ok: true })
    expect(tent().inners[1]).toMatchObject({ x: 0, y: -10 })
    stores.doc.getState().undo()
    expect(tent().inners[1]).toEqual(IN2)
  })

  it('붙인 결과가 다른 이너와 겹치면 거부하고 기록이 없다', () => {
    expect(attachInnerToWall(stores, 'in2', 'left')).toEqual({ ok: false, error: OVERLAP_MESSAGE })
    expect(canUndo()).toBe(false)
  })

  it('원 이너는 지름으로, 돌린 정6각형은 월드 bbox로 붙는다', () => {
    const circle: Inner = { id: 'c', name: '원', shape: { kind: 'circle', d: 100 }, template: { kind: 'circle', d: 100 }, x: 100, y: 50, rotation: 0 }
    stores = storesWith([circle])
    attachInnerToWall(stores, 'c', 'back')
    expect(tent().inners[0]).toMatchObject({ x: 0, y: -110 })
    const hexTpl = { kind: 'ngon', n: 6, sizeBy: 'diameter', size: 120 } as const
    stores = storesWith([{ id: 'h', name: '육각', shape: { kind: 'circle', d: 1 }, template: hexTpl, x: 50, y: 30, rotation: 30 }])
    // 템플릿에서 도형을 다시 만들도록 템플릿 입력으로 한 번 맞춤
    setTargetTemplate(stores, { innerId: 'h' }, hexTpl)
    attachInnerToWall(stores, 'h', 'front')
    const bb = ringBBox(targetWorldRing(layout(), { innerId: 'h' }))
    expect(Math.abs(bb.maxY - 160)).toBeLessThanOrEqual(0.1)
    expect(Math.abs((bb.minX + bb.maxX) / 2)).toBeLessThanOrEqual(0.1)
  })

  it('외곽 템플릿이 없거나 그 벽이 없으면 아무것도 하지 않는다', () => {
    stores = storesWithTent(polyTent([[-300, -150], [300, -150], [300, 150], [-300, 150]], [IN2]))
    expect(attachInnerToWall(stores, 'in2', 'back')).toEqual({ ok: true })
    expect(canUndo()).toBe(false)
  })
})

describe('변 길이·꼭짓점 각도·전체 크기(Plan 4.1 §2.3)', () => {
  it('맞춤으로 직각인 대충 그린 외곽에 변 1=620·변 2=320·변 3=620 → 정확한 620×320, 각 1칸', () => {
    stores = storesWithTent(polyTent([[0, 0], [600, 0], [600, 330], [10, 330]]))
    expect(setTargetEdgeLength(stores, 'outer', 0, 620)).toEqual({ ok: true })
    expect(setTargetEdgeLength(stores, 'outer', 1, 320)).toEqual({ ok: true })
    expect(setTargetEdgeLength(stores, 'outer', 2, 620)).toEqual({ ok: true })
    expect(outerPoints()).toEqual([[0, 0], [620, 0], [620, 320], [0, 320]])
    stores.doc.getState().undo()
    stores.doc.getState().undo()
    stores.doc.getState().undo()
    expect(outerPoints()).toEqual([[0, 0], [600, 0], [600, 330], [10, 330]])
    expect(canUndo()).toBe(false)
  })

  it('같은 값(±0.05cm)이면 기록이 없고, 범위 밖이면 범위 문구', () => {
    stores = storesWithTent(polyTent([[0, 0], [600, 0], [600, 330], [10, 330]]))
    expect(setTargetEdgeLength(stores, 'outer', 0, 600.04)).toEqual({ ok: true })
    expect(canUndo()).toBe(false)
    expect(setTargetEdgeLength(stores, 'outer', 0, 0)).toEqual({ ok: false, error: '1~5,000 사이로 입력해 주세요' })
    expect(setTargetEdgeLength(stores, 'outer', 3, 100)).toEqual({ ok: true })
    expect(canUndo()).toBe(false)
  })

  it('꼬이게 하는 변 길이는 거부하고 문서를 그대로 둔다', () => {
    const e: Pt[] = [[0, 0], [400, 0], [400, 100], [100, 100], [100, 200], [400, 200], [400, 300], [0, 300]]
    stores = storesWithTent(polyTent(e))
    expect(setTargetEdgeLength(stores, 'outer', 2, 500)).toEqual({ ok: false, error: '외곽: 변끼리 교차해요' })
    expect(outerPoints()).toEqual(e)
    expect(canUndo()).toBe(false)
  })

  it('닫는 변이 0이 되면 「변 길이가 0이 돼요」', () => {
    stores = storesWithTent(polyTent([[0, 0], [400, 0], [400, 300], [0, 300], [0, 100]]))
    expect(setTargetEdgeLength(stores, 'outer', 3, 300)).toEqual({ ok: false, error: ZERO_EDGE_MESSAGE })
    expect(canUndo()).toBe(false)
  })

  it('이너는 회전과 상관없이 로컬 길이로 맞춘다', () => {
    stores = storesWith([polyInner('p', [[-50, -50], [50, -50], [50, 50], [-50, 50]], 100, 0, 90)])
    setTargetEdgeLength(stores, { innerId: 'p' }, 0, 120)
    const p = tent().inners[0]!
    expect(p.shape).toEqual({ kind: 'polygon', points: [[-50, -50], [70, -50], [70, 50], [-30, 50]] })
    expect(p).toMatchObject({ x: 100, y: 0, rotation: 90 })
  })

  it('꼭짓점 2(0부터 1)의 내각을 120°로(1칸), 범위 1~359', () => {
    stores = storesWithTent(polyTent([[0, 0], [400, 0], [400, 300], [0, 300]]))
    expect(setTargetVertexAngle(stores, 'outer', 1, 120)).toEqual({ ok: true })
    expect(canUndo()).toBe(true)
    expect(setTargetVertexAngle(stores, 'outer', 1, 0)).toEqual({ ok: false, error: '1~359 사이로 입력해 주세요' })
    expect(setTargetVertexAngle(stores, 'outer', 0, 100)).toEqual({ ok: true })
  })

  it('전체 크기: 가로만 바꾸면 세로·가운데 그대로, 같은 값이면 기록 없음', () => {
    stores = storesWithTent(polyTent([[-100, -50], [100, -50], [100, 50], [0, 80], [-100, 50]]))
    expect(setTargetSize(stores, 'outer', 'w', 200.04)).toEqual({ ok: true })
    expect(canUndo()).toBe(false)
    setTargetSize(stores, 'outer', 'w', 400)
    near(outerPoints(), [[-200, -50], [200, -50], [200, 50], [0, 80], [-200, 50]])
    expect(setTargetSize(stores, 'outer', 'h', 6000)).toEqual({ ok: false, error: '1~5,000 사이로 입력해 주세요' })
  })
})

describe('자유 그리기 상태(Plan 4.1 §2.2)', () => {
  beforeEach(() => {
    stores = storesWith([IN1])
    ui().setMode('tent')
  })

  const draw = (pts: Pt[]) => pts.forEach((p) => appendDrawPoint(stores, p))

  it('시작은 텐트 모드·측정 아님일 때만, 다시 그리기는 있는 이너만', () => {
    ui().patch({ measuring: true })
    startDrawingAction(stores, 'newInner')
    expect(ui().drawing).toBeNull()
    ui().patch({ measuring: false })
    startDrawingAction(stores, { innerId: 'gone' })
    expect(ui().drawing).toBeNull()
    startDrawingAction(stores, { innerId: 'in1' })
    expect(ui().drawing?.goal).toEqual({ innerId: 'in1' })
    ui().setMode('place')
    startDrawingAction(stores, 'newInner')
    expect(ui().drawing).toBeNull()
  })

  it('잠금: 외곽 잠금이면 외곽 그리기 불가, 이너 잠금이면 이너 그리기 불가', () => {
    ui().setTentLock('outer')
    startDrawingAction(stores, 'outer')
    expect(ui().drawing).toBeNull()
    ui().setTentLock('inners')
    startDrawingAction(stores, 'newInner')
    expect(ui().drawing).toBeNull()
  })

  it('점 찍기: 첫 점은 외곽 왼쪽 위(−310,−160) 기준 10cm 격자, 다음 점은 15°·10cm 맞춤, 기록 밖', () => {
    startDrawingAction(stores, 'newInner')
    draw([[13, 7], [196, 12]])
    expect(ui().drawing?.points).toEqual([[10, 10], [200, 10]])
    expect(canUndo()).toBe(false)
  })

  it('교차하는 점은 찍지 않고 「선이 겹쳐요」', () => {
    startDrawingAction(stores, 'newInner')
    draw([[0, 0], [200, 0], [200, 100]])
    expect(appendDrawPoint(stores, [100, -50])).toBe(false)
    expect(ui().drawing?.points).toHaveLength(3)
    expect(ui().toast?.text).toBe(CROSS_MESSAGE)
  })

  it('점 되돌리기·그리기 취소', () => {
    startDrawingAction(stores, 'newInner')
    draw([[0, 0], [200, 0]])
    undoDrawPoint(stores)
    expect(ui().drawing?.points).toEqual([[0, 0]])
    cancelDrawing(stores)
    expect(ui().drawing).toBeNull()
    expect(canUndo()).toBe(false)
  })

  it('새 이너 완료: 1칸, 새 이너(가운데 원점) 선택, 그리기 끝', () => {
    startDrawingAction(stores, 'newInner')
    draw([[0, -100], [200, -100], [200, 100], [0, 100]])
    expect(finishDrawing(stores)).toEqual({ ok: true })
    const added = tent().inners[1]!
    expect(added).toMatchObject({ x: 100, y: 0, rotation: 0, shape: { kind: 'polygon', points: [[-100, -100], [100, -100], [100, 100], [-100, 100]] } })
    expect(ui().tentTarget).toEqual({ innerId: added.id })
    expect(ui().drawing).toBeNull()
    stores.doc.getState().undo()
    expect(tent().inners).toHaveLength(1)
  })

  it('점이 첫 점에 다시 맞춰지면 닫는다', () => {
    startDrawingAction(stores, 'newInner')
    draw([[0, -100], [200, -100], [200, 100], [0, 100], [2, -98]])
    expect(ui().drawing).toBeNull()
    expect(tent().inners).toHaveLength(2)
  })

  it('점 3개 미만이면 「선이 겹쳐요」, 넓이 1cm² 이하면 「너무 작아요」, 그리기는 그대로', () => {
    startDrawingAction(stores, 'newInner')
    draw([[0, 0], [200, 0]])
    expect(finishDrawing(stores)).toEqual({ ok: false, error: CROSS_MESSAGE })
    ui().setDrawPoints([[0, 0], [1, 0], [1, 1]])
    expect(finishDrawing(stores)).toEqual({ ok: false, error: TINY_MESSAGE })
    expect(ui().toast?.text).toBe(TINY_MESSAGE)
    expect(ui().drawing).not.toBeNull()
    expect(canUndo()).toBe(false)
  })

  it('다른 이너와 겹치면 「다른 이너와 겹쳐요」, 그리기 유지·기록 없음', () => {
    startDrawingAction(stores, 'newInner')
    draw([[-200, -100], [0, -100], [0, 100], [-200, 100]])
    expect(finishDrawing(stores)).toEqual({ ok: false, error: OVERLAP_DRAW_MESSAGE })
    expect(ui().drawing?.points).toHaveLength(4)
    expect(tent().inners).toHaveLength(1)
    expect(canUndo()).toBe(false)
  })

  it('이너 다시 그리기: x·y·회전 그대로, 도형만 새 점(로컬), 템플릿 버림, 1칸', () => {
    startDrawingAction(stores, { innerId: 'in1' })
    draw([[-300, -100], [-100, -100], [-100, 100], [-300, 100]])
    expect(finishDrawing(stores)).toEqual({ ok: true })
    const in1 = tent().inners[0]!
    expect(in1).toMatchObject({ x: -200, y: 0, rotation: 0, shape: { kind: 'polygon', points: [[-100, -100], [100, -100], [100, 100], [-100, 100]] } })
    expect(in1.template).toBeUndefined()
    expect(ui().tentTarget).toEqual({ innerId: 'in1' })
  })

  it('외곽 다시 그리기: 월드 좌표 그대로, outerTemplate 버림', () => {
    startDrawingAction(stores, 'outer')
    draw([[-310, -160], [310, -160], [310, 160], [-310, 160]])
    finishDrawing(stores)
    expect(tent().outer).toEqual({ kind: 'polygon', points: [[-310, -160], [310, -160], [310, 160], [-310, 160]] })
    expect(tent().outerTemplate).toBeUndefined()
  })

  it('다시 그리는 이너가 실행 취소로 사라지면 그리기도 끝난다', () => {
    const id = addInnerShape(stores, 'rect')
    if (id === null) throw new Error('이너 추가 실패')
    startDrawingAction(stores, { innerId: id })
    expect(ui().drawing).not.toBeNull()
    stores.doc.getState().undo()
    expect(ui().drawing).toBeNull()
  })
})

describe('만들기 화면 첫 외곽(Plan 4.1 판단 Q1·Q2)', () => {
  function makerStores(): Stores {
    const s = createStores(createLayout({ name: '내 텐트', outer: { kind: 'rect', w: 400, h: 200 }, inners: [] }, { name: '임시', id: 'M1', now: NOW }), { mode: 'tent' })
    s.ui.getState().setSize({ width: 800, height: 600 })
    s.ui.getState().setOuterPending(true)
    s.ui.getState().setTentLock('inners')
    return s
  }

  it('외곽 없음에서 예시를 고르면 그 외곽의 새 배치(기록 빈), 외곽 선택, 외곽 있음', () => {
    stores = makerStores()
    setMakerOuterShape(stores, 'trapezoid')
    expect(tent().outerTemplate).toEqual({ kind: 'trapezoid', front: 400, back: 300, depth: 300, offset: 0 })
    expect(canUndo()).toBe(false)
    expect(layout()).toMatchObject({ id: 'M1', name: '임시' })
    expect(ui()).toMatchObject({ outerPending: false, tentTarget: 'outer' })
  })

  it('외곽이 있으면 예시는 외곽만 바꾼다(1칸)', () => {
    stores = makerStores()
    setMakerOuterShape(stores, 'rect')
    setMakerOuterShape(stores, 'circle')
    expect(tent().outer).toEqual({ kind: 'circle', d: 400 })
    stores.doc.getState().undo()
    expect(tent().outer).toEqual({ kind: 'rect', w: 400, h: 300 })
  })

  it('외곽 없음에서 그린 외곽: bbox 가운데가 원점, 기록 빈 새 배치', () => {
    stores = makerStores()
    startDrawingAction(stores, 'outer')
    ui().setDrawPoints([[100, 100], [500, 100], [500, 400], [100, 400]])
    expect(finishDrawing(stores)).toEqual({ ok: true })
    expect(tent().outer).toEqual({ kind: 'polygon', points: [[-200, -150], [200, -150], [200, 150], [-200, 150]] })
    expect(tent().outerTemplate).toBeUndefined()
    expect(canUndo()).toBe(false)
    expect(ui()).toMatchObject({ outerPending: false, tentTarget: 'outer', drawing: null })
  })

  it('외곽 없음에서는 첫 점 격자 원점이 월드 원점', () => {
    stores = makerStores()
    startDrawingAction(stores, 'outer')
    appendDrawPoint(stores, [14, -16])
    expect(ui().drawing?.points).toEqual([[10, -20]])
  })

  it('defineFirstOuter는 이름을 지키고 이너 없이 시작한다', () => {
    stores = makerStores()
    defineFirstOuter(stores, { kind: 'rect', w: 300, h: 300 })
    expect(tent()).toEqual({ name: '내 텐트', outer: { kind: 'rect', w: 300, h: 300 }, inners: [] })
  })
})
