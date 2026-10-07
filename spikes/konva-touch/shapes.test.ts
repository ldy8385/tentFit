import { describe, expect, it } from 'vitest'
import { bakeScale, itemLabel, makeSpikeItems, octagonPoints, STOOL_ID } from './shapes'

describe('makeSpikeItems', () => {
  const items = makeSpikeItems()

  it('rect 20 · circle 15 · octagon 15, 모두 50개이고 id가 겹치지 않는다', () => {
    expect(items).toHaveLength(50)
    expect(items.filter((i) => i.kind === 'rect')).toHaveLength(20)
    expect(items.filter((i) => i.kind === 'circle')).toHaveLength(15)
    expect(items.filter((i) => i.kind === 'octagon')).toHaveLength(15)
    expect(new Set(items.map((i) => i.id)).size).toBe(50)
  })

  it('40cm 스툴(원 d=40)이 화면 가운데 열(0, -60)에 하나 있다', () => {
    const stools = items.filter((i) => i.name === '스툴')
    expect(stools).toHaveLength(1)
    expect(stools[0]).toMatchObject({ id: STOOL_ID, kind: 'circle', w: 40, h: 40, x: 0, y: -60, rotation: 0 })
  })

  it('격자 배치와 크기 공식이 고정돼 있다', () => {
    expect(items[0]).toMatchObject({ id: 'r0', kind: 'rect', w: 60, h: 30, x: -240, y: -540 })
    expect(items[19]).toMatchObject({ id: 'r19', kind: 'rect', w: 96, h: 40, x: 240, y: -180 })
    expect(items[49]).toMatchObject({ id: 'o14', kind: 'octagon', w: 61, h: 61, x: 240, y: 540 })
  })

  it('모든 도형이 600×1200cm(휴대폰 390px 폭 × 0.65px/cm) 안에 든다', () => {
    for (const i of items) {
      expect(Math.abs(i.x) + i.w / 2).toBeLessThanOrEqual(300)
      expect(Math.abs(i.y) + i.h / 2).toBeLessThanOrEqual(600)
    }
  })
})

describe('octagonPoints', () => {
  it('지름 100의 꼭짓점 8개, 아래 변(y+)이 수평', () => {
    const p = octagonPoints(100)
    expect(p).toEqual([
      46.2, 19.1, 19.1, 46.2, -19.1, 46.2, -46.2, 19.1,
      -46.2, -19.1, -19.1, -46.2, 19.1, -46.2, 46.2, -19.1,
    ])
    expect(p[3]).toBe(p[5])
  })
})

describe('itemLabel', () => {
  it('사각형은 가로×세로, 원·8각형은 ⌀지름', () => {
    const items = makeSpikeItems()
    expect(itemLabel(items[0]!)).toBe('사각 1\n60×30')
    expect(itemLabel(items.find((i) => i.id === STOOL_ID)!)).toBe('스툴\n⌀40')
    expect(itemLabel(items[49]!)).toBe('8각 15\n⌀61')
  })
})

describe('bakeScale', () => {
  it('사각형은 축마다, 원·8각형은 scaleX 하나로 치수에 반영(0.1cm 반올림)', () => {
    const items = makeSpikeItems()
    expect(bakeScale(items[0]!, 1.5, 2)).toEqual({ w: 90, h: 60 })
    expect(bakeScale(items.find((i) => i.id === STOOL_ID)!, 1.25, 1.25)).toEqual({ w: 50, h: 50 })
    expect(bakeScale(items[49]!, 0.5, 0.7)).toEqual({ w: 30.5, h: 30.5 })
    expect(bakeScale(items[0]!, -1, 1)).toEqual({ w: 60, h: 30 })
  })
})
