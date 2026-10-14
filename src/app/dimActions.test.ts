import { describe, expect, it } from 'vitest'
import { createLayout, type Inner, type Item, type Layout } from '../core/model'
import { applyAllRadii, applyDim, DIM_INVALID_MESSAGE, subjectSpec, type DimSubject } from './dimActions'
import { createStores, type Stores } from './stores'
import { HEXAGON_EDGE_MESSAGE } from './tentActions'

const NOW = '2026-10-14T00:00:00.000Z'

const IN1: Inner = { id: 'in1', name: '이너 1', shape: { kind: 'rect', w: 200, h: 200 }, template: { kind: 'rect', w: 200, h: 200 }, x: -150, y: 0, rotation: 0 }
const IN2: Inner = { id: 'in2', name: '이너 2', shape: { kind: 'rect', w: 200, h: 200 }, template: { kind: 'rect', w: 200, h: 200 }, x: 150, y: 0, rotation: 0 }
const MAT: Item = { id: 'm', name: '매트', shape: { kind: 'rect', w: 200, h: 60 }, x: 0, y: 0, rotation: 0, color: 'green', category: 'MAT', countsArea: true }

function setup(mode: 'tent' | 'place' = 'tent'): Stores {
  const layout: Layout = {
    ...createLayout(
      { name: 't', outer: { kind: 'rect', w: 600, h: 300 }, outerTemplate: { kind: 'rect', w: 600, h: 300 }, inners: [IN1, IN2] },
      { name: 'l', id: 'l1', now: NOW },
    ),
    items: [MAT],
  }
  return createStores(layout, { mode })
}

const outer: DimSubject = { kind: 'tent', target: 'outer' }
const in1: DimSubject = { kind: 'tent', target: { innerId: 'in1' } }
const mat: DimSubject = { kind: 'item', id: 'm' }

describe('applyDim(텐트 대상)', () => {
  it('외곽 가로를 비율 유지로 → 템플릿째 같은 배율, 실행 취소 1칸', () => {
    const s = setup()
    expect(applyDim(s, outer, { kind: 'w' }, 900, true)).toEqual({ ok: true })
    expect(s.doc.getState().layout.tent.outerTemplate).toEqual({ kind: 'rect', w: 900, h: 450 })
    s.doc.getState().undo()
    expect(s.doc.getState().layout.tent.outerTemplate).toEqual({ kind: 'rect', w: 600, h: 300 })
  })

  it('같은 값이면 기록 없음', () => {
    const s = setup()
    applyDim(s, outer, { kind: 'w' }, 600, true)
    expect(s.doc.getState().canUndo).toBe(false)
  })

  it('이너끼리 새로 겹치면 거부(문구), 문서 그대로', () => {
    const s = setup()
    const r = applyDim(s, in1, { kind: 'w' }, 420, false)
    expect(r.ok).toBe(false)
    expect(s.doc.getState().layout.tent.inners[0]?.shape).toEqual(IN1.shape)
  })

  it('범위 밖·육각형 문구', () => {
    const s = setup()
    expect(applyDim(s, outer, { kind: 'h' }, 0, false)).toEqual({ ok: false, error: '1~5,000 사이로 입력해 주세요' })
    s.doc.getState().commit((d) => {
      d.tent.outerTemplate = { kind: 'hexagon', w: 600, h: 300, edge: 300 }
      d.tent.outer = { kind: 'polygon', points: [[-150, -150], [150, -150], [300, 0], [150, 150], [-150, 150], [-300, 0]] }
    })
    expect(applyDim(s, outer, { kind: 'edge', index: 0 }, 700, false)).toEqual({ ok: false, error: HEXAGON_EDGE_MESSAGE })
  })

  it('측정 중이면 아무것도 하지 않음', () => {
    const s = setup()
    s.ui.getState().patch({ measuring: true })
    expect(applyDim(s, outer, { kind: 'w' }, 900, true)).toEqual({ ok: true })
    expect(s.doc.getState().canUndo).toBe(false)
  })

  it('모든 모서리 반지름', () => {
    const s = setup()
    expect(applyAllRadii(s, outer, 20)).toEqual({ ok: true })
    expect(s.doc.getState().layout.tent.outer).toEqual({ kind: 'rect', w: 600, h: 300, radii: [20, 20, 20, 20] })
    expect(applyAllRadii(s, { kind: 'tent', target: 'outer' }, -1)).toEqual({ ok: false, error: '0~5,000 사이로 입력해 주세요' })
  })
})

describe('applyDim(물건)', () => {
  it('매트 세로를 비율 유지로', () => {
    const s = setup('place')
    expect(applyDim(s, mat, { kind: 'h' }, 30, true)).toEqual({ ok: true })
    expect(s.doc.getState().layout.items[0]?.shape).toEqual({ kind: 'rect', w: 100, h: 30 })
  })

  it('모서리 하나만 둥글게, 원은 반지름 없음 문구', () => {
    const s = setup('place')
    applyDim(s, mat, { kind: 'radius', index: 2 }, 12, true)
    expect(s.doc.getState().layout.items[0]?.shape).toEqual({ kind: 'rect', w: 200, h: 60, radii: [0, 0, 12, 0] })
    s.doc.getState().commit((d) => {
      d.items[0]!.shape = { kind: 'circle', d: 50 }
    })
    expect(applyDim(s, mat, { kind: 'radius', index: 0 }, 5, true)).toEqual({ ok: false, error: DIM_INVALID_MESSAGE })
  })

  it('subjectSpec: 없는 물건·이너는 null', () => {
    const s = setup()
    const layout = s.doc.getState().layout
    expect(subjectSpec(layout, { kind: 'item', id: 'x' })).toBeNull()
    expect(subjectSpec(layout, { kind: 'tent', target: { innerId: 'x' } })).toBeNull()
    expect(subjectSpec(layout, in1)?.template).toEqual(IN1.template)
  })
})
