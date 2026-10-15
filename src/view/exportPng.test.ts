import { describe, expect, it } from 'vitest'
import { createLayout, type Item, type Layout } from '../core/model'
import { computeStats } from '../core/stats'
import { exportFrame, footerLines } from './exportPng'

const MAT: Item = { id: 'm', name: '매트', shape: { kind: 'rect', w: 200, h: 60 }, x: 500, y: 0, rotation: 0, color: 'green', category: 'MAT', countsArea: true }

function layout(items: Item[] = []): Layout {
  return { ...createLayout({ name: '터널', outer: { kind: 'rect', w: 600, h: 300 }, inners: [] }, { name: '캠핑', id: 'L', now: '2026-10-15T00:00:00.000Z' }), items }
}

describe('PNG 범위·크기(스펙 §11)', () => {
  it('외곽 + 여백 5%(최소 20cm), 긴 변 2048px + 요약 띠', () => {
    const f = exportFrame(layout())
    expect(f.minX).toBeCloseTo(-330, 6) // 600의 5% = 30
    expect(f.w).toBeCloseTo(660, 6)
    expect(f.widthPx).toBe(2048)
    expect(f.heightPx).toBe(Math.round(360 * (2048 / 660)) + f.footerPx)
    expect(f.footerPx).toBeGreaterThan(0)
  })

  it('밖으로 나간 물건·측정선 끝도 범위에 넣음', () => {
    const f = exportFrame(layout([MAT]), [[0, 400]])
    expect(f.minX + f.w).toBeGreaterThan(600)
    expect(f.minY + f.h).toBeGreaterThan(400)
  })

  it('전체 16.7MP를 넘지 않음', () => {
    const f = exportFrame(layout(), [], 4096)
    expect(f.widthPx * f.heightPx).toBeLessThanOrEqual(16_700_000 + 4096 * 2)
  })

  it('요약 띠: 배치 · 텐트, 점유율 · 날짜', () => {
    const l = layout([MAT])
    const [top, bottom] = footerLines(l, computeStats(l), new Date(2026, 9, 15))
    expect(top).toBe('캠핑 · 터널')
    expect(bottom).toMatch(/2026\.10\.15$/)
  })
})
