import { describe, expect, it } from 'vitest'
import { dimsText, itemDims } from './itemDims'

describe('itemDims', () => {
  it('사각형은 w·h, 원은 지름', () => {
    expect(itemDims({ kind: 'rect', w: 200, h: 60 })).toEqual({ kind: 'rect', w: 200, h: 60 })
    expect(itemDims({ kind: 'circle', d: 35 })).toEqual({ kind: 'circle', d: 35 })
  })

  it('다각형은 로컬 바운딩 박스 가로·세로(0.1cm 반올림)', () => {
    expect(
      itemDims({
        kind: 'polygon',
        points: [
          [-50, -30],
          [50.04, -30],
          [0, 30.1],
        ],
      }),
    ).toEqual({ kind: 'polygon', w: 100, h: 60.1 })
  })
})

describe('dimsText', () => {
  it("'200×60', 원은 '⌀35'", () => {
    expect(dimsText({ kind: 'rect', w: 200, h: 60 })).toBe('200×60')
    expect(dimsText({ kind: 'rect', w: 90.5, h: 60 })).toBe('90.5×60')
    expect(dimsText({ kind: 'circle', d: 35 })).toBe('⌀35')
  })
})
