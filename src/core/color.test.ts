import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { colorHex, isHexColor } from './color'
import { createLayout, ItemSchema, TentSchema, type Layout } from './model'
import { rotateTent, setTargetColor, setTargetSpec } from './ops/tent'
import { resolveTentEntry } from './presets'
import { validateLayout } from './validate'

const NOW = '2026-10-15T00:00:00.000Z'

function layout(): Layout {
  return createLayout(
    {
      name: 't',
      outer: { kind: 'rect', w: 600, h: 300 },
      outerTemplate: { kind: 'rect', w: 600, h: 300 },
      inners: [{ id: 'i1', name: '이너 1', shape: { kind: 'rect', w: 200, h: 200 }, template: { kind: 'rect', w: 200, h: 200 }, x: -150, y: 0, rotation: 0 }],
    },
    { name: 'l', id: 'L', now: NOW },
  )
}

describe('색 값(소유자 요청 2026-10-15: 색상 선택기로 직접 고른 색)', () => {
  it('8색 키 또는 #RRGGBB(소문자로)', () => {
    expect(colorHex('green')).toBe('#6f9636')
    expect(colorHex('#A1B2C3')).toBe('#a1b2c3')
    expect(isHexColor('#a1b2c3')).toBe(true)
    expect(isHexColor('#abc')).toBe(false)
    expect(isHexColor('green')).toBe(false)
  })

  it('물건 색은 키나 #RRGGBB, 그 밖은 거부', () => {
    const base = { id: 'm', name: '매트', shape: { kind: 'rect', w: 200, h: 60 }, x: 0, y: 0, rotation: 0, category: 'MAT', countsArea: true }
    expect(ItemSchema.safeParse({ ...base, color: '#12ab9f' }).success).toBe(true)
    expect(ItemSchema.safeParse({ ...base, color: 'blue' }).success).toBe(true)
    expect(ItemSchema.safeParse({ ...base, color: '#12ab9' }).success).toBe(false)
    expect(ItemSchema.safeParse({ ...base, color: 'red' }).success).toBe(false)
  })

  it('텐트 외곽·이너 색은 없어도 되고(기본 색), 있으면 키나 #RRGGBB', () => {
    const t = layout().tent
    expect(TentSchema.safeParse(t).success).toBe(true)
    expect(TentSchema.safeParse({ ...t, color: '#d0c090', inners: [{ ...t.inners[0], color: 'teal' }] }).success).toBe(true)
    expect(TentSchema.safeParse({ ...t, color: 'beige' }).success).toBe(false)
  })
})

describe('setTargetColor(외곽 = 전실 바닥 색, 이너 = 이너 색)', () => {
  it('넣고 null이면 지움(기본 색)', () => {
    const a = produce(layout(), (d) => {
      setTargetColor(d, 'outer', '#d0c090')
      setTargetColor(d, { innerId: 'i1' }, 'teal')
    })
    expect(a.tent.color).toBe('#d0c090')
    expect(a.tent.inners[0]!.color).toBe('teal')
    const b = produce(a, (d) => {
      setTargetColor(d, 'outer', null)
      setTargetColor(d, { innerId: 'i1' }, null)
    })
    expect('color' in b.tent).toBe(false)
    expect('color' in b.tent.inners[0]!).toBe(false)
  })

  it('치수 바꾸기·돌리기·검사를 거쳐도 색이 남음', () => {
    const colored = produce(layout(), (d) => {
      setTargetColor(d, 'outer', '#d0c090')
      setTargetColor(d, { innerId: 'i1' }, '#336699')
    })
    const edited = produce(colored, (d) => {
      setTargetSpec(d, 'outer', { shape: { kind: 'rect', w: 620, h: 300 }, template: { kind: 'rect', w: 620, h: 300 } })
      setTargetSpec(d, { innerId: 'i1' }, { shape: { kind: 'rect', w: 220, h: 200 }, template: { kind: 'rect', w: 220, h: 200 } })
      rotateTent(d, 90)
    })
    const v = validateLayout(edited).layout
    expect(v.tent.color).toBe('#d0c090')
    expect(v.tent.inners[0]!.color).toBe('#336699')
  })

  it('프리셋 항목의 색도 읽음', () => {
    const t = layout().tent
    const { preset, issues } = resolveTentEntry({
      id: 'a/b',
      model: 'b',
      tent: { name: 'b', outerTemplate: { kind: 'rect', w: 600, h: 300 }, color: '#d0c090', inners: [{ ...t.inners[0]!, color: 'teal' }] },
    } as never)
    expect(issues).toEqual([])
    expect(preset.tent.color).toBe('#d0c090')
    expect(preset.tent.inners[0]!.color).toBe('teal')
  })
})
