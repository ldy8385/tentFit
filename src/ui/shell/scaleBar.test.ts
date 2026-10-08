import { describe, expect, it } from 'vitest'
import { scaleBar } from './scaleBar'

describe('scaleBar', () => {
  it('보통 배율에서는 0·50·100cm 막대이고 끝 눈금에만 단위를 붙인다', () => {
    const bar = scaleBar(1.2)
    expect(bar.lengthCm).toBe(100)
    expect(bar.widthPx).toBeCloseTo(120, 10)
    expect(bar.ticks.map((t) => t.label)).toEqual(['0', '50', '100cm'])
    expect(bar.ticks.map((t) => t.px)).toEqual([0, 60, 120])
  })

  it('100cm가 64~200px 안이면 100cm를 유지하고, 그보다 짧으면(눈금 글자가 겹침) 긴 단계로 바꾼다', () => {
    expect(scaleBar(0.64).lengthCm).toBe(100)
    expect(scaleBar(2).lengthCm).toBe(100)
    expect(scaleBar(0.6)).toMatchObject({ lengthCm: 200, widthPx: 120 })
  })

  it('아주 작거나 큰 배율에서는 막대가 대략 100px이 되는 단계를 고른다', () => {
    expect(scaleBar(0.1)).toMatchObject({ lengthCm: 1000, widthPx: 100 })
    expect(scaleBar(20)).toMatchObject({ lengthCm: 5, widthPx: 100 })
    expect(scaleBar(20).ticks.map((t) => t.label)).toEqual(['0', '2.5', '5cm'])
    expect(scaleBar(0.4).lengthCm).toBe(200)
    expect(scaleBar(5).lengthCm).toBe(20)
  })

  it('배율이 NaN·범위 밖이어도 0.1~20으로 잘라 계산한다', () => {
    expect(scaleBar(Number.NaN).lengthCm).toBe(100)
    expect(scaleBar(1000)).toMatchObject({ lengthCm: 5, widthPx: 100 })
    expect(scaleBar(0)).toMatchObject({ lengthCm: 1000, widthPx: 100 })
  })
})
