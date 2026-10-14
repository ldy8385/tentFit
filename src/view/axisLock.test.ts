import { describe, expect, it } from 'vitest'
import { axisBoundPosition, lockToAxis } from './axisLock'

describe('lockToAxis(상하좌우로만 이동)', () => {
  it('이동량이 큰 축만 남긴다(같으면 가로)', () => {
    expect(lockToAxis(30, -10)).toEqual([30, 0])
    expect(lockToAxis(5, -40)).toEqual([0, -40])
    expect(lockToAxis(-20, 20)).toEqual([-20, 0])
    expect(lockToAxis(0, 0)).toEqual([0, 0])
  })
})

describe('axisBoundPosition(Konva dragBoundFunc용: 시작점 기준 한 축만)', () => {
  it('시작점에서 많이 움직인 축만 따라가고 다른 축은 시작값', () => {
    expect(axisBoundPosition({ x: 100, y: 50 }, { x: 160, y: 70 })).toEqual({ x: 160, y: 50 })
    expect(axisBoundPosition({ x: 100, y: 50 }, { x: 90, y: 0 })).toEqual({ x: 100, y: 0 })
  })
})
