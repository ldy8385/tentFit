import { describe, expect, it } from 'vitest'
import type { Drawing } from '../../store/ui'
import type { View } from '../viewport'
import { drawGuides, drawTapEffect, pressMoved, rubberBand, rubberVisible, tentDim } from './drawGesture'

/** 화면 = 월드 × 2 + (100, 50) */
const V: View = { zoom: 2, panX: 100, panY: 50 }
const TRI: Drawing = { goal: 'newInner', points: [[0, 0], [100, 0], [100, 100]] }

describe('drawTapEffect(설계 §2.2 탭 = 점, 첫 점 다시 누르기 = 닫기)', () => {
  it('점이 3개 이상이고 첫 점과 화면 거리가 잡는 거리(터치 22·마우스 8px) 안이면 닫기', () => {
    expect(drawTapEffect(TRI, [120, 50], 'touch', V)).toEqual({ kind: 'close' })
    expect(drawTapEffect(TRI, [120, 50], 'mouse', V)).toEqual({ kind: 'point', raw: [10, 0] })
    expect(drawTapEffect(TRI, [106, 50], 'mouse', V)).toEqual({ kind: 'close' })
  })

  it('점이 2개 이하면 첫 점 근처라도 점', () => {
    expect(drawTapEffect({ goal: 'outer', points: [[0, 0], [100, 0]] }, [100, 50], 'touch', V)).toEqual({ kind: 'point', raw: [0, 0] })
  })

  it('raw는 탭 시점 보기로 바꾼 월드 점(맞춤 전)', () => {
    expect(drawTapEffect({ goal: 'newInner', points: [] }, [301, 251], 'mouse', V)).toEqual({ kind: 'point', raw: [100.5, 100.5] })
  })
})

describe('rubberBand(고무줄 = 탭으로 찍힐 점과 같은 맞춤)', () => {
  it('점이 없으면 첫 점 격자 맞춤 자리만', () => {
    expect(rubberBand({ goal: 'outer', points: [] }, [123, 77], 'mouse', V, [0, 0])).toEqual({ from: null, to: [10, 10], closes: false })
  })

  it('끝점 = 격자 교차점(간격·상하좌우로만을 탭과 같이)', () => {
    expect(rubberBand({ goal: 'outer', points: [[0, 0]] }, [492, 74], 'mouse', V, [0, 0])).toEqual({ from: [0, 0], to: [200, 10], closes: false })
    expect(rubberBand({ goal: 'outer', points: [[0, 0]] }, [492, 74], 'mouse', V, [0, 0], 50).to).toEqual([200, 0])
    expect(rubberBand({ goal: 'outer', points: [[0, 0]] }, [492, 74], 'mouse', V, [0, 0], 1, true).to).toEqual([196, 0])
  })

  it('점이 3개 이상이고 첫 점 근처면 끝점 = 첫 점, closes', () => {
    const r = rubberBand(TRI, [110, 52], 'touch', V, [0, 0])
    expect(r.closes).toBe(true)
    expect(r.to).toEqual([0, 0])
    expect(r.from).toEqual([100, 100])
  })
})

describe('pressMoved·rubberVisible', () => {
  it('탭/끌기 경계(TAP_SLOP: 터치 8·마우스 3px)', () => {
    expect(pressMoved([0, 0], [7, 0], 'touch')).toBe(false)
    expect(pressMoved([0, 0], [0, 8], 'touch')).toBe(true)
    expect(pressMoved([0, 0], [2, 2], 'mouse')).toBe(false)
    expect(pressMoved([0, 0], [3, 0], 'mouse')).toBe(true)
  })

  it('마우스·펜은 hover 중(누르지 않음)이거나 경계 안 누름, 터치는 경계 안 누름만', () => {
    expect(rubberVisible({ pointer: 'mouse', hovering: true, pressing: false, moved: false })).toBe(true)
    expect(rubberVisible({ pointer: 'mouse', hovering: false, pressing: false, moved: false })).toBe(false)
    expect(rubberVisible({ pointer: 'pen', hovering: true, pressing: true, moved: true })).toBe(false)
    expect(rubberVisible({ pointer: 'touch', hovering: true, pressing: false, moved: false })).toBe(false)
    expect(rubberVisible({ pointer: 'touch', hovering: false, pressing: true, moved: false })).toBe(true)
    expect(rubberVisible({ pointer: 'touch', hovering: false, pressing: true, moved: true })).toBe(false)
  })
})

describe('tentDim(잠긴 쪽·다시 그리는 원본 흐리게)', () => {
  const ids = ['a', 'b']
  it('잠금·그리기 없으면 흐림 없음', () => {
    const d = tentDim('none', null, ids)
    expect(d.outer).toBe(false)
    expect([...d.innerIds]).toEqual([])
  })

  it('외곽 잠금 = 외곽, 이너 잠금 = 모든 이너', () => {
    expect(tentDim('outer', null, ids).outer).toBe(true)
    expect([...tentDim('inners', null, ids).innerIds]).toEqual(['a', 'b'])
  })

  it('다시 그리기 중이면 그 원본, 새 이너 그리기는 흐림 없음', () => {
    expect(tentDim('none', { goal: 'outer', points: [] }, ids).outer).toBe(true)
    expect([...tentDim('none', { goal: { innerId: 'b' }, points: [] }, ids).innerIds]).toEqual(['b'])
    const n = tentDim('none', { goal: 'newInner', points: [] }, ids)
    expect(n.outer).toBe(false)
    expect(n.innerIds.size).toBe(0)
  })
})

describe('rubberBand — 상하좌우로만', () => {
  it('right면 고무줄 끝도 가로·세로로만', () => {
    const r = rubberBand({ goal: 'outer', points: [[0, 0]] }, [300, 110], 'mouse', V, [0, 0], 10, true)
    expect(r.to).toEqual([100, 0])
  })
})

// 그리는 중 안내(소유자 요청 2026-10-16: "다른 포인트들과 90도 각도나 수평·수직을 이루면 안내선, 안내선만 나와도 충분")
describe('drawGuides', () => {
  const D = (points: [number, number][]): Drawing => ({ goal: 'newInner', points })

  it('찍힐 자리가 찍은 점·다른 꼭짓점과 가로·세로 줄이 맞으면 안내선(붙이지는 않음)', () => {
    const g = drawGuides(D([[0, 0], [100, 0], [100, 80]]), { from: [100, 80], to: [0, 80], closes: false }, [[-50, 80]])
    expect(g.lines).toEqual([
      { a: [0, 0], b: [0, 80] },
      { a: [-50, 80], b: [100, 80] },
    ])
    expect(drawGuides(D([[0, 0]]), { from: [0, 0], to: [37, 52], closes: false }, []).lines).toEqual([])
  })

  it('직전 변과 지금 긋는 선이 90°면 그 꼭짓점에 직각 표시(비스듬해도), 아니면 없음', () => {
    const g = drawGuides(D([[0, 0], [30, 10]]), { from: [30, 10], to: [20, 40], closes: false }, [])
    expect(g.right).toHaveLength(1)
    const r = g.right[0]!
    expect(r.at).toEqual([30, 10])
    expect(r.u[0]).toBeCloseTo(-30 / Math.hypot(30, 10), 9)
    expect(r.v[1]).toBeCloseTo(30 / Math.hypot(10, 30), 9)
    expect(drawGuides(D([[0, 0], [30, 10]]), { from: [30, 10], to: [25, 40], closes: false }, []).right).toEqual([])
    // 점이 하나뿐이면 각이 없음
    expect(drawGuides(D([[0, 0]]), { from: [0, 0], to: [0, 50], closes: false }, []).right).toEqual([])
  })

  it('닫을 때는 마지막 점과 첫 점의 직각만(줄 안내선 없음), 고무줄이 없으면 아무것도 없음', () => {
    const sq = D([[0, 0], [100, 0], [100, 100], [0, 100]])
    const g = drawGuides(sq, { from: [0, 100], to: [0, 0], closes: true }, [])
    expect(g.right.map((r) => r.at)).toEqual([[0, 100], [0, 0]])
    expect(g.lines).toEqual([])
    expect(drawGuides(sq, null, [])).toEqual({ lines: [], right: [] })
  })
})
