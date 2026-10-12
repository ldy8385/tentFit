import { describe, expect, it } from 'vitest'
import { drawLayerModel } from './DrawLayer'

describe('drawLayerModel(그리는 선·점·고무줄)', () => {
  it('찍은 점을 잇는 열린 선, 점 3개 이상이면 첫 점이 닫기 자리', () => {
    const m = drawLayerModel({ goal: 'newInner', points: [[0, 0], [100, 0], [100, 50]] }, null)
    expect(m.line).toEqual([0, 0, 100, 0, 100, 50])
    expect(m.dots).toEqual([
      { at: [0, 0], closeTarget: true },
      { at: [100, 0], closeTarget: false },
      { at: [100, 50], closeTarget: false },
    ])
    expect(m.rubber).toBeNull()
    expect(m.preview).toBeNull()
  })

  it('점이 2개 이하면 닫기 자리가 없다', () => {
    const m = drawLayerModel({ goal: 'outer', points: [[0, 0], [100, 0]] }, null)
    expect(m.dots.every((d) => !d.closeTarget)).toBe(true)
  })

  it('고무줄: 마지막 점 → 끝점 대시, 점이 없으면 첫 점 미리보기만', () => {
    const m = drawLayerModel({ goal: 'outer', points: [[0, 0]] }, { from: [0, 0], to: [200, 0], lengthCm: 200, closes: false })
    expect(m.rubber).toEqual({ points: [0, 0, 200, 0], closes: false })
    expect(m.preview).toEqual([200, 0])
    const empty = drawLayerModel({ goal: 'outer', points: [] }, { from: null, to: [10, 10], lengthCm: null, closes: false })
    expect(empty.rubber).toBeNull()
    expect(empty.preview).toEqual([10, 10])
  })

  it('닫히는 고무줄이면 끝점 미리보기 없이 closes', () => {
    const m = drawLayerModel(
      { goal: 'outer', points: [[0, 0], [100, 0], [100, 100]] },
      { from: [100, 100], to: [0, 0], lengthCm: 141.4, closes: true },
    )
    expect(m.rubber).toEqual({ points: [100, 100, 0, 0], closes: true })
    expect(m.preview).toBeNull()
  })
})
