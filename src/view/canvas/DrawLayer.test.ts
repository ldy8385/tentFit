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
    const m = drawLayerModel({ goal: 'outer', points: [[0, 0]] }, { from: [0, 0], to: [200, 0], closes: false })
    expect(m.rubber).toEqual({ points: [0, 0, 200, 0], closes: false })
    expect(m.preview).toEqual([200, 0])
    const empty = drawLayerModel({ goal: 'outer', points: [] }, { from: null, to: [10, 10], closes: false })
    expect(empty.rubber).toBeNull()
    expect(empty.preview).toEqual([10, 10])
  })

  it('닫히는 고무줄이면 끝점 미리보기 없이 closes', () => {
    const m = drawLayerModel(
      { goal: 'outer', points: [[0, 0], [100, 0], [100, 100]] },
      { from: [100, 100], to: [0, 0], closes: true },
    )
    expect(m.rubber).toEqual({ points: [100, 100, 0, 0], closes: true })
    expect(m.preview).toBeNull()
  })
})

// 그리는 선 길이(소유자 요청 2026-10-16): 찍은 변마다 길이, 지금 긋는 고무줄은 강조
describe('drawLayerModel 길이', () => {
  it('찍은 변마다·고무줄에 길이(cm, 0.1 반올림)를 선 가운데에, 고무줄이 지금 선', () => {
    const m = drawLayerModel({ goal: 'outer', points: [[0, 0], [300, 0], [300, 40.04]] }, { from: [300, 40.04], to: [0, 40.04], closes: false }, 1)
    expect(m.lengths).toEqual([
      { at: [150, 0], text: '300', current: false },
      { at: [300, 20.02], text: '40', current: false },
      { at: [150, 40.04], text: '300', current: true },
    ])
  })

  it('닫히는 고무줄은 닫는 변 길이, 고무줄이 없으면 찍은 변만', () => {
    const pts: [number, number][] = [[0, 0], [100, 0], [100, 100]]
    const closing = drawLayerModel({ goal: 'outer', points: pts }, { from: [100, 100], to: [0, 0], closes: true }, 1)
    expect(closing.lengths.at(-1)).toEqual({ at: [50, 50], text: '141.4', current: true })
    expect(drawLayerModel({ goal: 'outer', points: pts }, null, 1).lengths.map((l) => l.text)).toEqual(['100', '100'])
  })

  it('화면에서 짧은 선(40px 미만)은 숫자를 숨기고, 점이 없으면 없음', () => {
    const d = { goal: 'outer' as const, points: [[0, 0], [30, 0]] as [number, number][] }
    const rubber = { from: [30, 0] as [number, number], to: [30, 100] as [number, number], closes: false }
    expect(drawLayerModel(d, rubber, 1).lengths.map((l) => l.text)).toEqual(['100'])
    expect(drawLayerModel(d, rubber, 2).lengths.map((l) => l.text)).toEqual(['30', '100'])
    expect(drawLayerModel({ goal: 'outer', points: [] }, { from: null, to: [10, 10], closes: false }, 1).lengths).toEqual([])
  })
})
