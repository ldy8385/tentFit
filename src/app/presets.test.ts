import { describe, expect, it } from 'vitest'
import { ITEM_CATEGORIES } from '../core/model'
import {
  DEFAULT_TENT_PRESET_ID,
  defaultTentPreset,
  genericTentsFrom,
  itemPresetsFrom,
  loadGenericTents,
  loadItemPresets,
} from './presets'

describe('loadItemPresets', () => {
  it('기본 물건 20개를 읽고 카테고리 6개가 모두 있다', () => {
    const items = loadItemPresets()
    expect(items).toHaveLength(20)
    expect(new Set(items.map((p) => p.category))).toEqual(new Set(ITEM_CATEGORIES))
    expect(new Set(items.map((p) => p.id)).size).toBe(20)
  })

  it('원·다각형 물건도 그대로 읽는다', () => {
    const items = loadItemPresets()
    expect(items.find((p) => p.id === 'items/stool-round-d35')?.shape).toEqual({ kind: 'circle', d: 35 })
    expect(items.find((p) => p.id === 'items/table-hex-80')?.shape.kind).toBe('polygon')
  })

  it('두 번 불러도 같은 배열을 돌려준다(한 번만 파싱)', () => {
    expect(loadItemPresets()).toBe(loadItemPresets())
  })
})

describe('loadGenericTents·defaultTentPreset', () => {
  it('일반 예시 텐트 5개를 읽는다', () => {
    const tents = loadGenericTents()
    expect(tents.map((t) => t.id)).toEqual([
      'generic/dome-2p',
      'generic/tunnel-4p',
      'generic/living-shell',
      'generic/bell-4m',
      'generic/tipi-hex',
    ])
    expect(loadGenericTents()).toBe(tents)
  })

  it('시작 텐트는 터널 4인 예시다', () => {
    const t = defaultTentPreset()
    expect(t.id).toBe(DEFAULT_TENT_PRESET_ID)
    expect(t.model).toBe('터널 4인')
    expect(t.tent.name).toBe('터널 4인 예시')
    expect(t.tent.outer).toEqual({ kind: 'rect', w: 620, h: 320 })
    expect(t.tent.inners).toHaveLength(1)
  })
})

describe('파싱 실패', () => {
  it('물건 파일에 문제가 있으면 이유를 담아 throw한다', () => {
    const bad = { items: [{ id: 'items/x', name: '', category: 'MAT', shape: { kind: 'rect', w: 0, h: 60 }, color: 'green', countsArea: true }] }
    expect(() => itemPresetsFrom(bad)).toThrow(/items\.json items\[0\]/)
  })

  it('텐트 파일에 문제가 있으면 이유를 담아 throw한다', () => {
    const bad = { presets: [{ id: 'wrong/x', model: '잘못', tent: { name: 'x', outer: { kind: 'circle', d: 300 }, inners: [] } }] }
    expect(() => genericTentsFrom(bad)).toThrow(/generic\.json presets\[0\]\.id/)
  })
})
