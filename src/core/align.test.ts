import { describe, expect, it } from 'vitest'
import { alignAxes, alignGuides } from './align'

const OTHERS: [number, number][] = [
  [0, 0],
  [100, 0],
  [100, 50],
]

describe('꼭짓점 정렬(소유자 요청 2026-10-15: 다른 점과 90°로 맞으면 반투명 점선)', () => {
  it('허용 거리 안의 가장 가까운 점 줄(세로 = x, 가로 = y)에 붙음', () => {
    expect(alignAxes([97, 48], OTHERS, 5)).toEqual({ x: 100, y: 50 })
    expect(alignAxes([93, 40], OTHERS, 5)).toEqual({ x: null, y: null })
    // 움직이지 않는 축은 맞추지 않음(상하좌우로만)
    expect(alignAxes([97, 48], OTHERS, 5, { x: true, y: false })).toEqual({ x: 100, y: null })
    // 허용 거리 0 = 정확히 같을 때만
    expect(alignAxes([100, 48], OTHERS, 0)).toEqual({ x: 100, y: null })
  })

  it('안내선: 같은 x(세로)·같은 y(가로)인 점들과 끄는 점을 잇는 선분', () => {
    expect(alignGuides([100, 120], OTHERS)).toEqual([{ a: [100, 0], b: [100, 120] }])
    expect(alignGuides([-30, 50], OTHERS)).toEqual([{ a: [-30, 50], b: [100, 50] }])
    expect(alignGuides([0, 50.04], OTHERS)).toHaveLength(2) // 0.05cm 안은 같은 줄
    expect(alignGuides([5, 0], [[5, 0]])).toEqual([]) // 같은 점(길이 0)은 선 없음
    expect(alignGuides([33, 33], OTHERS)).toEqual([])
  })
})
