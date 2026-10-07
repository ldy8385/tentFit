import { describe, expect, it } from 'vitest'
import {
  panView,
  pinchView,
  screenToWorld,
  TouchGesture,
  zoomAt,
  type CancelReason,
  type DownTarget,
  type GestureHost,
  type Pt,
  type View,
} from './gesture'

describe('화면 변환 계산', () => {
  it('panView는 화면 px만큼 옮긴다', () => {
    expect(panView({ scale: 0.65, x: 195, y: 422 }, 30, -10)).toEqual({ scale: 0.65, x: 225, y: 412 })
  })

  it('pinchView: 두 손가락 거리 2배 → 2배 확대, 중심 아래의 월드 점 유지', () => {
    const v = pinchView({ scale: 1, x: 0, y: 0 }, [[100, 100], [200, 100]], [[50, 100], [250, 100]])
    expect(v).toEqual({ scale: 2, x: -150, y: -100 })
    expect(screenToWorld(v, [150, 100])).toEqual([150, 100])
  })

  it('pinchView: 거리가 같으면 중심 이동만큼 화면 이동', () => {
    expect(pinchView({ scale: 1, x: 0, y: 0 }, [[100, 100], [200, 100]], [[110, 120], [210, 120]])).toEqual({
      scale: 1,
      x: 10,
      y: 20,
    })
  })

  it('배율은 0.1~20px/cm로 묶인다', () => {
    expect(pinchView({ scale: 10, x: 0, y: 0 }, [[0, 0], [100, 0]], [[0, 0], [300, 0]]).scale).toBe(20)
    expect(zoomAt({ scale: 0.2, x: 0, y: 0 }, [0, 0], 0.1).scale).toBe(0.1)
  })

  it('zoomAt은 포인터 아래 월드 점을 유지한다', () => {
    const v = zoomAt({ scale: 0.65, x: 195, y: 422 }, [295, 422], 2)
    expect(v.scale).toBe(1.3)
    expect(screenToWorld(v, [295, 422])[0]).toBeCloseTo(153.846, 3)
    expect(screenToWorld(v, [295, 422])[1]).toBeCloseTo(0, 9)
  })
})

type Call =
  | { t: 'cancel'; reason: CancelReason }
  | { t: 'lock' }
  | { t: 'unlock' }
  | { t: 'tap'; p: Pt }
  | { t: 'allUp'; hadMulti: boolean }

function fakeHost(targets: Record<string, DownTarget>, view: View = { scale: 1, x: 0, y: 0 }) {
  const calls: Call[] = []
  const state = { view }
  const host: GestureHost = {
    hitTest: (p) => targets[`${p[0]},${p[1]}`] ?? 'empty',
    cancelActive: (reason) => calls.push({ t: 'cancel', reason }),
    lockShapes: () => calls.push({ t: 'lock' }),
    unlockShapes: () => calls.push({ t: 'unlock' }),
    getView: () => state.view,
    setView: (v) => {
      state.view = v
    },
    tap: (p) => calls.push({ t: 'tap', p }),
    allUp: (hadMulti) => calls.push({ t: 'allUp', hadMulti }),
  }
  return { host, calls, state }
}

describe('TouchGesture — 두 번째 손가락 규칙(스펙 §4.5)', () => {
  it('빈 곳 한 손가락 끌기는 화면 이동이고, 8px 넘게 움직였으면 탭이 아니다', () => {
    const { host, calls, state } = fakeHost({}, { scale: 0.65, x: 195, y: 422 })
    const g = new TouchGesture(host)
    g.down(1, [100, 100], 'touch')
    expect(g.mode).toBe('pan')
    g.move(1, [130, 90])
    expect(state.view).toEqual({ scale: 0.65, x: 225, y: 412 })
    g.up(1, [130, 90])
    expect(g.mode).toBe('idle')
    expect(calls).toEqual([{ t: 'allUp', hadMulti: false }])
  })

  it('빈 곳을 8px 안에서 떼면 탭', () => {
    const { host, calls } = fakeHost({})
    const g = new TouchGesture(host)
    g.down(1, [100, 100], 'touch')
    g.move(1, [103, 104])
    g.up(1, [103, 104])
    expect(calls).toEqual([
      { t: 'tap', p: [103, 104] },
      { t: 'allUp', hadMulti: false },
    ])
  })

  it('마우스는 3px을 넘으면 탭이 아니다', () => {
    const { host, calls } = fakeHost({})
    const g = new TouchGesture(host)
    g.down(1, [100, 100], 'mouse')
    g.move(1, [103, 104])
    g.up(1, [103, 104])
    expect(calls).toEqual([{ t: 'allUp', hadMulti: false }])
  })

  it('물건 끌기 중 두 번째 손가락 → 1회 되돌림·잠금, 두 손가락 확대+이동, 하나 남으면 이동만', () => {
    const { host, calls, state } = fakeHost({ '100,100': 'item' })
    const g = new TouchGesture(host)
    g.down(1, [100, 100], 'touch')
    expect(g.mode).toBe('shape')
    g.move(1, [140, 100])
    expect(state.view).toEqual({ scale: 1, x: 0, y: 0 })

    g.down(2, [300, 100], 'touch')
    expect(g.mode).toBe('pinch')
    expect(calls).toEqual([{ t: 'cancel', reason: 'second-finger' }, { t: 'lock' }])

    g.move(2, [340, 100])
    expect(state.view).toEqual({ scale: 1.25, x: -35, y: -25 })

    g.up(2, [340, 100])
    expect(g.mode).toBe('pan')
    g.move(1, [150, 110])
    expect(state.view).toEqual({ scale: 1.25, x: -25, y: -15 })

    g.up(1, [150, 110])
    expect(g.mode).toBe('idle')
    expect(calls).toEqual([
      { t: 'cancel', reason: 'second-finger' },
      { t: 'lock' },
      { t: 'unlock' },
      { t: 'allUp', hadMulti: true },
    ])
  })

  it('핸들(anchor)을 잡은 상태도 같은 규칙', () => {
    const { host, calls } = fakeHost({ '10,10': 'anchor' })
    const g = new TouchGesture(host)
    g.down(1, [10, 10], 'touch')
    g.down(2, [200, 200], 'touch')
    expect(calls).toEqual([{ t: 'cancel', reason: 'second-finger' }, { t: 'lock' }])
  })

  it('touchstart(손가락 2개)가 pointerdown보다 먼저 와도 되돌림은 1번', () => {
    const { host, calls } = fakeHost({ '100,100': 'item' })
    const g = new TouchGesture(host)
    g.down(1, [100, 100], 'touch')
    g.multiTouchHint()
    g.down(2, [300, 100], 'touch')
    expect(g.mode).toBe('pinch')
    expect(calls).toEqual([{ t: 'cancel', reason: 'second-finger' }, { t: 'lock' }])
  })

  it('빈 곳에서 시작한 두 손가락은 되돌릴 것이 없다(잠금만)', () => {
    const { host, calls } = fakeHost({})
    const g = new TouchGesture(host)
    g.down(1, [100, 100], 'touch')
    g.down(2, [200, 100], 'touch')
    g.up(1, [100, 100])
    g.up(2, [200, 100])
    expect(calls).toEqual([{ t: 'lock' }, { t: 'unlock' }, { t: 'allUp', hadMulti: true }])
  })

  it('세 번째 손가락은 확대 계산에 쓰지 않는다', () => {
    const { host, state } = fakeHost({})
    const g = new TouchGesture(host)
    g.down(1, [100, 100], 'touch')
    g.down(2, [200, 100], 'touch')
    g.down(3, [500, 500], 'touch')
    g.move(3, [600, 600])
    expect(state.view).toEqual({ scale: 1, x: 0, y: 0 })
    expect(g.pointerCount).toBe(3)
  })

  it('pointercancel은 되돌리고 탭으로 치지 않는다', () => {
    const { host, calls } = fakeHost({ '100,100': 'item' })
    const g = new TouchGesture(host)
    g.down(1, [100, 100], 'touch')
    g.cancel(1)
    expect(g.mode).toBe('idle')
    expect(calls).toEqual([{ t: 'cancel', reason: 'cancel' }, { t: 'allUp', hadMulti: false }])
  })

  it('reset(visibilitychange hidden)은 되돌리고 손가락 기록을 비운다', () => {
    const { host, calls } = fakeHost({ '100,100': 'item' })
    const g = new TouchGesture(host)
    g.down(1, [100, 100], 'touch')
    g.reset()
    expect(g.mode).toBe('idle')
    expect(g.pointerCount).toBe(0)
    expect(calls).toEqual([{ t: 'cancel', reason: 'cancel' }, { t: 'allUp', hadMulti: false }])
    g.up(1, [100, 100])
    expect(calls).toHaveLength(2)
  })

  it('잡지 않은 포인터의 move·up은 무시한다(마우스 호버 등)', () => {
    const { host, calls, state } = fakeHost({})
    const g = new TouchGesture(host)
    g.move(7, [10, 10])
    g.up(7, [10, 10])
    g.reset()
    expect(calls).toEqual([])
    expect(state.view).toEqual({ scale: 1, x: 0, y: 0 })
  })
})
