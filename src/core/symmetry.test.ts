import { describe, expect, it } from 'vitest'
import { isSymmetric, symmetrize, symmetryCenter, symmetryPartners, symmetrySnap } from './symmetry'
import type { Pt } from './model'

// 기준선 = 꼭짓점을 감싸는 상자의 가운데(symmetryCenter). 아래 RECT·PENT_RIGHT는 원점이 가운데라 좌우 x=0, 상하 y=0
const RECT: Pt[] = [[-100, -50], [100, -50], [100, 50], [-100, 50]]
const PENT_RIGHT: Pt[] = [[-80, -100], [40, -100], [80, 0], [40, 100], [-80, 100]] // 오른쪽이 뾰족 → 상하 대칭만

describe('isSymmetric(소유자 요청 2026-10-15: 좌우·상하 고르기)', () => {
  it('원점 기준 좌우·상하 대칭 판정(0.1cm 오차)', () => {
    expect(isSymmetric(RECT, 'x')).toBe(true)
    expect(isSymmetric(RECT, 'y')).toBe(true)
    expect(isSymmetric(PENT_RIGHT, 'x')).toBe(false)
    expect(isSymmetric(PENT_RIGHT, 'y')).toBe(true)
    expect(isSymmetric([[-100, -50], [100.1, -50], [100, 50], [-100, 50]], 'x')).toBe(true)
    expect(isSymmetric([[-100, -50], [103, -50], [100, 50], [-100, 50]], 'x')).toBe(false)
  })
})

describe('symmetryPartners(같이 움직일 짝)', () => {
  it('짝 번호: 사각형 좌우는 0↔1·2↔3, 상하는 0↔3·1↔2, 기준선 위 점은 자기 자신', () => {
    expect(symmetryPartners(RECT, 'x')).toEqual([1, 0, 3, 2])
    expect(symmetryPartners(RECT, 'y')).toEqual([3, 2, 1, 0])
    expect(symmetryPartners(PENT_RIGHT, 'y')).toEqual([4, 3, 2, 1, 0])
    expect(symmetryPartners(PENT_RIGHT, 'x')).toBeNull()
  })
})

describe('symmetrySnap(끄는 점 → 반대편 짝 자리·기준선에 붙음)', () => {
  const others: Pt[] = [[-100, -50], [100, 50], [-100, 50]] // 오른쪽 위(100,−50)를 끄는 중
  it('다른 점의 대칭 자리 가까우면 그 자리(짝 = 그 점)', () => {
    expect(symmetrySnap([97, -48], others, 'x', 5)).toEqual({ point: [100, -50], partner: [-100, -50] })
  })

  it('기준선 가까우면 기준선 위로(짝 없음), 멀면 null', () => {
    expect(symmetrySnap([2, -80], others, 'x', 5)).toEqual({ point: [0, -80], partner: null })
    expect(symmetrySnap([60, -80], others, 'x', 5)).toBeNull()
  })

  it('상하: 가로 기준선(y=0) 기준', () => {
    expect(symmetrySnap([-98, 47], [[-100, -50]], 'y', 5)).toEqual({ point: [-100, 50], partner: [-100, -50] })
  })
})

describe('symmetrize(한쪽 기준으로 대칭 맞추기)', () => {
  const sorted = (pts: Pt[]) => [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1])

  it('왼쪽 기준: 왼쪽 절반을 오른쪽으로 뒤집어 붙임(기준선 위 일직선 점은 뺌)', () => {
    const skew: Pt[] = [[-100, -50], [130, -50], [80, 50], [-100, 50]]
    const r = symmetrize(skew, undefined, 'x', 'neg', 0)
    expect(r).not.toBeNull()
    expect(isSymmetric(r!.points, 'x', 0)).toBe(true)
    expect(sorted(r!.points)).toEqual([[-100, -50], [-100, 50], [100, -50], [100, 50]])
  })

  it('기준선 위의 뾰족한 점(오각형 끝)은 남김', () => {
    const r = symmetrize([[-80, -100], [40, -100], [80, 0], [40, 120], [-80, 120]], undefined, 'y', 'neg', 0)
    expect(r!.points.some((p) => p[0] === 80 && p[1] === 0)).toBe(true)
  })

  it('오른쪽 기준·상하도 같은 방식, 오른쪽 오각형을 위쪽 기준으로', () => {
    const r = symmetrize([[-100, -50], [130, -50], [80, 50], [-100, 50]], undefined, 'x', 'pos', 0)
    expect(isSymmetric(r!.points, 'x', 0)).toBe(true)
    expect(Math.max(...r!.points.map((p) => p[0]))).toBe(130)
    const tall = symmetrize([[-80, -100], [40, -100], [80, 0], [40, 120], [-80, 120]], undefined, 'y', 'neg', 0)
    expect(tall!.points).toHaveLength(5)
    expect(isSymmetric(tall!.points, 'y', 0)).toBe(true)
    expect(Math.max(...tall!.points.map((p) => p[1]))).toBe(100)
  })

  it('모서리 반지름은 남긴 쪽 꼭짓점과 그 짝에 같이', () => {
    const r = symmetrize([[-100, -50], [130, -50], [80, 50], [-100, 50]], [5, 0, 0, 9], 'x', 'neg', 0)
    const at = (x: number, y: number) => r!.radii[r!.points.findIndex((p) => p[0] === x && p[1] === y)]
    expect(at(-100, -50)).toBe(5)
    expect(at(100, -50)).toBe(5)
    expect(at(-100, 50)).toBe(9)
    expect(at(100, 50)).toBe(9)
    expect(r!.radii).toHaveLength(r!.points.length)
  })

  it('기준선이 도형을 지나지 않거나 여러 번 지나면 null', () => {
    expect(symmetrize([[10, 0], [100, 0], [100, 50]], undefined, 'x', 'neg', 0)).toBeNull()
    // U자(오목): 기준선을 네 번 지남
    const u: Pt[] = [[-100, -100], [-60, -100], [-60, 50], [60, 50], [60, -100], [100, -100], [100, 100], [-100, 100]]
    expect(symmetrize(u.map(([x, y]): Pt => [y, x]), undefined, 'x', 'neg')).toBeNull() // 기준선 자리를 주지 않아도(가운데 x=0)
  })
})

describe('symmetryCenter(기준선 자리, 2026-10-16: 원점이 도형 가운데가 아니어도)', () => {
  // 원점보다 30cm 아래가 가운데인 팔각형(상하 기준선 y=30, 좌우 x=0)
  const OCT: Pt[] = [[-50, -70], [50, -70], [160, -10], [160, 70], [50, 130], [-50, 130], [-160, 70], [-160, -10]]

  it('대칭이면 그 기준선 자리, 판정·짝·붙임도 그 자리 기준', () => {
    expect(symmetryCenter(OCT, 'y')).toBe(30)
    expect(symmetryCenter(OCT, 'x')).toBe(0)
    expect(isSymmetric(OCT, 'y')).toBe(true)
    expect(symmetryPartners(OCT, 'y')).toEqual([5, 4, 3, 2, 1, 0, 7, 6])
    // y=30 기준: (50, −70)의 대칭 자리 (50, 130), 기준선 위는 y=30
    expect(symmetrySnap([52, 128], [[50, -70]], 'y', 5, 30)).toEqual({ point: [50, 130], partner: [50, -70] })
    expect(symmetrySnap([0, 32], [], 'y', 5, 30)).toEqual({ point: [0, 30], partner: null })
  })

  it('대칭이 아니어도 상자 가운데(가장 바깥 꼭짓점들 사이의 가운데)', () => {
    expect(symmetryCenter([[-310, -160], [360, -160], [310, 160], [-310, 160]], 'x')).toBe(25)
    expect(symmetryCenter([[0, 0], [100, 10], [40, 80]], 'x')).toBe(50)
    expect(symmetryCenter([[0, 0], [100, 10], [40, 80]], 'y')).toBe(40)
  })

  it('한쪽 기준으로 맞추기도 그 가운데 기준(자리를 주지 않으면)', () => {
    const r = symmetrize([[-100, -20], [130, -20], [100, 80], [-100, 80]], undefined, 'y', 'neg')
    expect(r).not.toBeNull()
    expect(symmetryCenter(r!.points, 'y')).toBe(30)
    expect(isSymmetric(r!.points, 'y')).toBe(true)
    expect(Math.min(...r!.points.map((p) => p[1]))).toBe(-20)
    expect(Math.max(...r!.points.map((p) => p[1]))).toBe(80)
  })
})
