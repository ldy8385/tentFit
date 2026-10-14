import { describe, expect, it } from 'vitest'
import { createLayout, type Inner, type Layout, type Tent } from '../../core/model'
import type { View } from '../viewport'
import {
  TENT_MOVE_EPS_CM,
  classifyTentPress,
  pressGrabs,
  pressSelection,
  sameTentTarget,
  tentDragFor,
  tentDragStarted,
  tentDragStep,
  tentTapEffect,
  type TentDrag,
  type TentPressHit,
} from './tentGesture'

const NOW = '2026-10-08T00:00:00.000Z'
const VIEW1: View = { zoom: 1, panX: 0, panY: 0 }

function rectInner(id: string, w: number, h: number, x: number, y: number): Inner {
  return { id, name: `이너 ${id}`, shape: { kind: 'rect', w, h }, template: { kind: 'rect', w, h }, x, y, rotation: 0 }
}

function tentOf(inners: Inner[]): Tent {
  return { name: '테스트', outer: { kind: 'rect', w: 1000, h: 400 }, outerTemplate: { kind: 'rect', w: 1000, h: 400 }, inners }
}

function layoutOf(tent: Tent): Layout {
  return createLayout(tent, { name: '배치', id: 'L1', now: NOW })
}

// 이너 a(-300,0 200×200), c(300,0 100×100)
const LAYOUT = layoutOf(tentOf([rectInner('a', 200, 200, -300, 0), rectInner('c', 100, 100, 300, 0)]))

describe('sameTentTarget', () => {
  it('외곽끼리·같은 이너 id면 같고, null·다른 id는 다르다', () => {
    expect(sameTentTarget('outer', 'outer')).toBe(true)
    expect(sameTentTarget({ innerId: 'a' }, { innerId: 'a' })).toBe(true)
    expect(sameTentTarget({ innerId: 'a' }, { innerId: 'c' })).toBe(false)
    expect(sameTentTarget('outer', { innerId: 'a' })).toBe(false)
    expect(sameTentTarget(null, null)).toBe(true)
    expect(sameTentTarget(null, 'outer')).toBe(false)
  })
})

describe('classifyTentPress(R10 우선순위)', () => {
  it('선택한 대상의 꼭짓점 핸들이 이너 면보다 먼저', () => {
    // 이너 a 선택. 꼭짓점 0 = (-400,-100), 그 점은 이너 a 위이기도 함
    const hit = classifyTentPress(LAYOUT, { innerId: 'a' }, VIEW1, [-398, -98], 'mouse')
    expect(hit).toEqual({ kind: 'vertex', target: { innerId: 'a' }, index: 0, world: [-400, -100] })
  })

  it('+ 핸들', () => {
    // 외곽 선택. 윗변 + = (0,-200)
    expect(classifyTentPress(LAYOUT, 'outer', VIEW1, [3, -200], 'mouse')).toEqual({
      kind: 'plus',
      target: 'outer',
      edgeIndex: 0,
    })
  })

  it('대상이 없으면 핸들이 없다 — 꼭짓점 자리라도 면 판정', () => {
    expect(classifyTentPress(LAYOUT, null, VIEW1, [-398, -98], 'mouse')).toEqual({ kind: 'inner', innerId: 'a' })
  })

  it('다른 대상의 핸들은 보지 않는다(이너 c를 골랐을 때 외곽 꼭짓점 자리는 외곽)', () => {
    expect(classifyTentPress(LAYOUT, { innerId: 'c' }, VIEW1, [-499, -199], 'mouse')).toEqual({ kind: 'outer' })
  })

  it('바닥 = 외곽, 외곽선 바깥 잡는 거리(터치 22px) 안 = 외곽, 그 밖 = none', () => {
    expect(classifyTentPress(LAYOUT, null, VIEW1, [0, 150], 'touch')).toEqual({ kind: 'outer' })
    expect(classifyTentPress(LAYOUT, null, VIEW1, [520, 0], 'touch')).toEqual({ kind: 'outer' })
    expect(classifyTentPress(LAYOUT, null, VIEW1, [523, 0], 'touch')).toEqual({ kind: 'none' })
    // zoom 2면 22px = 11cm
    const zoomed: View = { zoom: 2, panX: 0, panY: 0 }
    expect(classifyTentPress(LAYOUT, null, zoomed, [1000 + 21, 0], 'touch')).toEqual({ kind: 'outer' })
    expect(classifyTentPress(LAYOUT, null, zoomed, [1000 + 24, 0], 'touch')).toEqual({ kind: 'none' })
  })
})

describe('pressGrabs — 노드처럼 잡는 누름(화면 이동 아님)', () => {
  it('꼭짓점·+·이너 = true, 외곽·none = false(바닥·외곽선 끌기는 화면 이동)', () => {
    expect(pressGrabs({ kind: 'vertex', target: 'outer', index: 0, world: [0, 0] })).toBe(true)
    expect(pressGrabs({ kind: 'plus', target: 'outer', edgeIndex: 0 })).toBe(true)
    expect(pressGrabs({ kind: 'inner', innerId: 'a' })).toBe(true)
    expect(pressGrabs({ kind: 'outer' })).toBe(false)
    expect(pressGrabs({ kind: 'none' })).toBe(false)
  })
})

describe('pressSelection — 누르는 순간 바꿀 선택(null = 그대로)', () => {
  it('꼭짓점: 그 꼭짓점 선택(이미 그 꼭짓점이면 null)', () => {
    const hit: TentPressHit = { kind: 'vertex', target: 'outer', index: 2, world: [0, 0] }
    expect(pressSelection(hit, { target: 'outer', vertexIndex: null })).toEqual({ target: 'outer', vertexIndex: 2 })
    expect(pressSelection(hit, { target: 'outer', vertexIndex: 2 })).toBeNull()
  })

  it('선택 안 된 이너: 그 이너(꼭짓점 없음), 이미 대상인 이너면 null(끌기 중 꼭짓점 선택 유지)', () => {
    const hit: TentPressHit = { kind: 'inner', innerId: 'a' }
    expect(pressSelection(hit, { target: 'outer', vertexIndex: 1 })).toEqual({ target: { innerId: 'a' }, vertexIndex: null })
    expect(pressSelection(hit, { target: null, vertexIndex: null })).toEqual({ target: { innerId: 'a' }, vertexIndex: null })
    expect(pressSelection(hit, { target: { innerId: 'a' }, vertexIndex: 3 })).toBeNull()
  })

  it('+·외곽·none은 누를 때 바꾸지 않는다(탭에서 정함)', () => {
    const cur = { target: { innerId: 'a' }, vertexIndex: null }
    expect(pressSelection({ kind: 'plus', target: 'outer', edgeIndex: 0 }, cur)).toBeNull()
    expect(pressSelection({ kind: 'outer' }, cur)).toBeNull()
    expect(pressSelection({ kind: 'none' }, cur)).toBeNull()
  })
})

describe('tentTapEffect — 탭으로 끝났을 때', () => {
  it('+ = 꼭짓점 추가, 이너 = 그 이너(꼭짓점 해제), 외곽 = 외곽, none = 대상 해제, 꼭짓점 = 그대로', () => {
    expect(tentTapEffect({ kind: 'plus', target: { innerId: 'a' }, edgeIndex: 3 })).toEqual({
      kind: 'insert',
      target: { innerId: 'a' },
      edgeIndex: 3,
    })
    expect(tentTapEffect({ kind: 'inner', innerId: 'a' })).toEqual({
      kind: 'select',
      target: { innerId: 'a' },
      vertexIndex: null,
    })
    expect(tentTapEffect({ kind: 'outer' })).toEqual({ kind: 'select', target: 'outer', vertexIndex: null })
    expect(tentTapEffect({ kind: 'none' })).toEqual({ kind: 'select', target: null, vertexIndex: null })
    expect(tentTapEffect({ kind: 'vertex', target: 'outer', index: 1, world: [0, 0] })).toEqual({ kind: 'none' })
  })
})

describe('tentDragFor·tentDragStarted', () => {
  it('꼭짓점·이너 누름만 끌기 후보, 시작점은 누른 화면 점과 그 월드 점', () => {
    const view: View = { zoom: 2, panX: 100, panY: 0 }
    const v = tentDragFor({ kind: 'vertex', target: 'outer', index: 1, world: [500, -200] }, 7, 'touch', [1100, -400], view)
    expect(v).toEqual({
      kind: 'vertex',
      target: 'outer',
      index: 1,
      from: [500, -200],
      pointerId: 7,
      pointer: 'touch',
      start: [1100, -400],
      startWorld: [500, -200],
    })
    const i = tentDragFor({ kind: 'inner', innerId: 'c' }, 1, 'mouse', [700, 0], view)
    expect(i).toEqual({ kind: 'inner', innerId: 'c', pointerId: 1, pointer: 'mouse', start: [700, 0], startWorld: [300, 0] })
    expect(tentDragFor({ kind: 'plus', target: 'outer', edgeIndex: 0 }, 1, 'mouse', [0, 0], view)).toBeNull()
    expect(tentDragFor({ kind: 'outer' }, 1, 'mouse', [0, 0], view)).toBeNull()
    expect(tentDragFor({ kind: 'none' }, 1, 'mouse', [0, 0], view)).toBeNull()
  })

  it('탭/끌기 경계는 TAP_SLOP(터치 8px·마우스 3px), max(|dx|,|dy|)', () => {
    const touchDrag = tentDragFor({ kind: 'inner', innerId: 'c' }, 1, 'touch', [100, 100], VIEW1) as TentDrag
    expect(tentDragStarted(touchDrag, [107, 93])).toBe(false)
    expect(tentDragStarted(touchDrag, [100, 108])).toBe(true)
    const mouseDrag = tentDragFor({ kind: 'inner', innerId: 'c' }, 1, 'mouse', [100, 100], VIEW1) as TentDrag
    expect(tentDragStarted(mouseDrag, [102, 102])).toBe(false)
    expect(tentDragStarted(mouseDrag, [103, 100])).toBe(true)
  })
})

describe('tentDragStep — 미리보기와 커밋할 값', () => {
  it('이너 끌기: 화면 이동량 / zoom = 월드 이동량, 정상이면 커밋 값', () => {
    const view: View = { zoom: 2, panX: 0, panY: 0 }
    const drag = tentDragFor({ kind: 'inner', innerId: 'c' }, 1, 'mouse', [600, 0], view) as TentDrag
    const r = tentDragStep(LAYOUT, drag, [640, -20], view)
    expect(r.commit).toEqual({ kind: 'inner', innerId: 'c', dx: 20, dy: -10 })
    expect(r.preview.target).toEqual({ innerId: 'c' })
    expect(r.preview.invalid).toBe(false)
    expect(r.preview.tent.inners.find((i) => i.id === 'c')?.x).toBe(320)
    expect(LAYOUT.tent.inners.find((i) => i.id === 'c')?.x).toBe(300) // 문서는 그대로
  })

  it('이너를 다른 이너 위로 끌면 미리보기 invalid, 커밋 없음(놓으면 취소)', () => {
    const drag = tentDragFor({ kind: 'inner', innerId: 'c' }, 1, 'mouse', [300, 0], VIEW1) as TentDrag
    const r = tentDragStep(LAYOUT, drag, [-280, 0], VIEW1)
    expect(r.preview.invalid).toBe(true)
    expect(r.commit).toBeNull()
  })

  it('꼭짓점 끌기: 손가락이 핸들 중심에서 떨어져 눌렀어도 꼭짓점은 이동량만큼만(튀지 않음)', () => {
    // 꼭짓점 1 = (500,-200)을 (510,-190)에서 누름(터치 22px 안)
    const drag = tentDragFor({ kind: 'vertex', target: 'outer', index: 1, world: [500, -200] }, 3, 'touch', [510, -190], VIEW1) as TentDrag
    const r = tentDragStep(LAYOUT, drag, [560, -240], VIEW1)
    expect(r.commit).toEqual({ kind: 'vertex', target: 'outer', index: 1, world: [550, -250] })
    expect(r.preview.invalid).toBe(false)
    expect(r.preview.tent.outer.kind).toBe('polygon')
  })

  it('꼭짓점을 자기교차로 끌면 invalid·커밋 없음', () => {
    const drag = tentDragFor({ kind: 'vertex', target: 'outer', index: 0, world: [-500, -200] }, 3, 'mouse', [-500, -200], VIEW1) as TentDrag
    const r = tentDragStep(LAYOUT, drag, [0, 400], VIEW1)
    expect(r.preview.invalid).toBe(true)
    expect(r.commit).toBeNull()
  })

  it('보기가 끄는 중에 바뀌어도(휠 확대) 누른 월드 점 기준으로 따라간다', () => {
    const drag = tentDragFor({ kind: 'inner', innerId: 'c' }, 1, 'mouse', [300, 0], VIEW1) as TentDrag
    const zoomed: View = { zoom: 2, panX: -300, panY: 0 } // 월드 (300,0) = 화면 (300,0) 그대로
    const r = tentDragStep(LAYOUT, drag, [340, 0], zoomed)
    expect(r.commit).toEqual({ kind: 'inner', innerId: 'c', dx: 20, dy: 0 })
  })

  it(`이동량이 ${TENT_MOVE_EPS_CM}cm 미만이면 커밋하지 않는다(기록 0)`, () => {
    const view: View = { zoom: 20, panX: 0, panY: 0 }
    const drag = tentDragFor({ kind: 'inner', innerId: 'c' }, 1, 'mouse', [6000, 0], view) as TentDrag
    const r = tentDragStep(LAYOUT, drag, [6000.5, 0.5], view) // 0.025cm
    expect(r.commit).toBeNull()
    expect(r.preview.invalid).toBe(false)
  })

  it('없는 이너를 끌면(동시 삭제 등) 커밋 없음', () => {
    const drag = tentDragFor({ kind: 'inner', innerId: 'gone' }, 1, 'mouse', [0, 0], VIEW1) as TentDrag
    expect(tentDragStep(LAYOUT, drag, [50, 0], VIEW1).commit).toBeNull()
  })
})

describe('classifyTentPress — 단계 잠금·외곽 없음(Plan 4.1)', () => {
  it("이너 잠금('inners'): 이너 위를 눌러도 외곽이 잡힌다", () => {
    expect(classifyTentPress(LAYOUT, null, VIEW1, [-300, 0], 'mouse', 'inners')).toEqual({ kind: 'outer' })
  })

  it("외곽 잠금('outer'): 외곽 안 빈 곳은 none, 이너는 그대로, 선택된 외곽의 꼭짓점도 잡히지 않음", () => {
    expect(classifyTentPress(LAYOUT, null, VIEW1, [0, 0], 'mouse', 'outer')).toEqual({ kind: 'none' })
    expect(classifyTentPress(LAYOUT, null, VIEW1, [-300, 0], 'mouse', 'outer')).toEqual({ kind: 'inner', innerId: 'a' })
    expect(classifyTentPress(LAYOUT, 'outer', VIEW1, [-500, -200], 'mouse', 'outer')).toEqual({ kind: 'none' })
  })

  it('외곽 없음이면 무엇도 잡지 않는다', () => {
    expect(classifyTentPress(LAYOUT, 'outer', VIEW1, [-500, -200], 'mouse', 'none', true)).toEqual({ kind: 'none' })
    expect(classifyTentPress(LAYOUT, null, VIEW1, [0, 0], 'touch', 'inners', true)).toEqual({ kind: 'none' })
  })
})

describe('tentDragStep — 상하좌우로만(axisLock)', () => {
  it('이너 끌기: 이동량이 큰 축만 커밋한다', () => {
    const drag = tentDragFor({ kind: 'inner', innerId: 'a' }, 1, 'mouse', [-300, 0], VIEW1)
    if (drag === null) throw new Error('끌기 후보 없음')
    const free = tentDragStep(LAYOUT, drag, [-260, 15], VIEW1)
    expect(free.commit).toEqual({ kind: 'inner', innerId: 'a', dx: 40, dy: 15 })
    const locked = tentDragStep(LAYOUT, drag, [-260, 15], VIEW1, { axisLock: true })
    expect(locked.commit).toEqual({ kind: 'inner', innerId: 'a', dx: 40, dy: 0 })
  })

  it('꼭짓점 끌기도 한 축만', () => {
    const hit = classifyTentPress(LAYOUT, 'outer', VIEW1, [500, -200], 'mouse')
    const drag = tentDragFor(hit, 1, 'mouse', [500, -200], VIEW1)
    if (drag === null || drag.kind !== 'vertex') throw new Error('꼭짓점 끌기 아님')
    const locked = tentDragStep(LAYOUT, drag, [510, -240], VIEW1, { axisLock: true })
    expect(locked.commit).toEqual({ kind: 'vertex', target: 'outer', index: drag.index, world: [500, -240] })
  })
})
