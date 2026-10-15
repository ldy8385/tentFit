import { describe, expect, it } from 'vitest'
import { createLayout, type Item, type Layout } from '../core/model'
import { endMeasuring, measureTap, measurementRows, removeMeasurement, clearMeasurements, startMeasuring, targetName } from './measureActions'
import { createStores, type Stores } from './stores'

const MAT: Item = { id: 'm', name: '매트', shape: { kind: 'rect', w: 200, h: 60 }, x: 0, y: 0, rotation: 0, color: 'green', category: 'MAT', countsArea: true }

function setup(): Stores {
  const layout: Layout = { ...createLayout({ name: 't', outer: { kind: 'rect', w: 600, h: 300 }, inners: [] }, { name: 'l', id: 'L', now: '2026-10-15T00:00:00.000Z' }), items: [MAT] }
  const s = createStores(layout)
  s.ui.getState().setView({ zoom: 1, panX: 0, panY: 0 })
  s.ui.getState().setSelection(['m'])
  return s
}

describe('거리 재기(Plan 5)', () => {
  it('켜면 선택을 비우고, 대상 두 개를 누르면 하나 잼(매트 → 오른쪽 벽 = 200cm), 끄면 지움', () => {
    const s = setup()
    startMeasuring(s)
    expect(s.ui.getState()).toMatchObject({ measuring: true, selection: [] })
    measureTap(s, [0, 0], 'mouse')
    expect(s.ui.getState().measureFirst?.target).toEqual({ kind: 'item', id: 'm' })
    measureTap(s, [299, 0], 'mouse')
    expect(s.ui.getState().measureFirst).toBeNull()
    const rows = measurementRows(s.doc.getState().layout, s.ui.getState().measurements)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ label: '200.0cm', aName: '매트', bName: '외곽 변 2' })
    endMeasuring(s)
    expect(s.ui.getState()).toMatchObject({ measuring: false, measurements: [], measureFirst: null })
    expect(s.doc.getState().canUndo).toBe(false)
  })

  it('하나씩 지우기·모두 지우기, 빈 곳 이름', () => {
    const s = setup()
    startMeasuring(s)
    measureTap(s, [0, 0], 'mouse')
    measureTap(s, [0, -140], 'mouse')
    measureTap(s, [0, 0], 'mouse')
    measureTap(s, [-200, 100], 'mouse')
    const ids = s.ui.getState().measurements.map((m) => m.id)
    expect(ids).toHaveLength(2)
    removeMeasurement(s, ids[0]!)
    expect(s.ui.getState().measurements.map((m) => m.id)).toEqual([ids[1]])
    clearMeasurements(s)
    expect(s.ui.getState().measurements).toEqual([])
    expect(targetName(s.doc.getState().layout, { kind: 'point', p: [1, 2] })).toBe('빈 곳')
  })
})
