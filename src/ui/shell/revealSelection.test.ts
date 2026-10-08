import { describe, expect, it } from 'vitest'
import { createLayout, type Layout, type Tent } from '../../core/model'
import { makeItem } from '../../core/ops/items'
import { revealView, selectionBBox, REVEAL_MARGIN_PX } from './revealSelection'

const TENT: Tent = { name: '시험 텐트', outer: { kind: 'rect', w: 400, h: 300 }, inners: [] }

function layoutWith(): { layout: Layout; a: string; b: string } {
  const a = makeItem({ name: '매트', shape: { kind: 'rect', w: 200, h: 60 }, color: 'blue', category: 'MAT', countsArea: true }, [0, 0])
  const b = makeItem({ name: '스툴', shape: { kind: 'circle', d: 40 }, color: 'teal', category: 'CHAIR', countsArea: true }, [300, 100])
  return { layout: { ...createLayout(TENT, { name: '배치' }), items: [a, b] }, a: a.id, b: b.id }
}

describe('selectionBBox', () => {
  it('선택한 물건들의 월드 bbox(회전·원 포함)', () => {
    const { layout, a, b } = layoutWith()
    expect(selectionBBox(layout, [a])).toEqual({ minX: -100, minY: -30, maxX: 100, maxY: 30 })
    const both = selectionBBox(layout, [a, b])!
    expect(both.minX).toBe(-100)
    expect(both.maxX).toBeCloseTo(320, 0)
    expect(both.maxY).toBeCloseTo(120, 0)
  })

  it('비었거나 없는 id뿐이면 null', () => {
    const { layout } = layoutWith()
    expect(selectionBBox(layout, [])).toBeNull()
    expect(selectionBBox(layout, ['없음'])).toBeNull()
  })
})

describe('revealView', () => {
  const size = { width: 390, height: 600 }
  const box = { minX: -100, minY: -30, maxX: 100, maxY: 30 }

  it('이미 보이면 null', () => {
    expect(revealView({ zoom: 1, panX: 195, panY: 200 }, size, { top: 0, bottom: 300 }, box)).toBeNull()
  })

  it('시트에 가린 물건을 시트 위로 올린다(배율은 그대로)', () => {
    const view = { zoom: 1, panX: 195, panY: 500 }
    const next = revealView(view, size, { top: 0, bottom: 300 }, box)!
    expect(next.zoom).toBe(1)
    expect(next.panX).toBe(195)
    expect(next.panY + box.maxY).toBe(size.height - 300 - REVEAL_MARGIN_PX)
  })

  it('위로 나간 물건은 배너 아래로 내린다', () => {
    const next = revealView({ zoom: 2, panX: 195, panY: 0 }, size, { top: 40, bottom: 0 }, box)!
    expect(next.panY + box.minY * 2).toBe(40 + REVEAL_MARGIN_PX)
  })

  it('보이는 영역보다 크면 가운데를 맞춘다', () => {
    const big = { minX: -1000, minY: -30, maxX: 1000, maxY: 30 }
    const next = revealView({ zoom: 1, panX: 0, panY: 100 }, size, { top: 0, bottom: 0 }, big)!
    expect(next.panX).toBe(195)
  })

  it('보이는 영역이 없으면(시트가 캔버스를 다 덮음) null', () => {
    expect(revealView({ zoom: 1, panX: 0, panY: 900 }, size, { top: 0, bottom: 600 }, box)).toBeNull()
    expect(revealView({ zoom: 1, panX: 0, panY: 0 }, { width: 0, height: 0 }, { top: 0, bottom: 0 }, box)).toBeNull()
  })
})
