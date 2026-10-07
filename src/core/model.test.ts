import { describe, expect, it } from 'vitest'
import {
  CATEGORY_LABELS,
  COLOR_KEYS,
  createLayout,
  ExportFileSchema,
  ITEM_CATEGORIES,
  ItemPresetFileSchema,
  LayoutSchema,
  LIMITS,
  newId,
  normAngle,
  round1,
  SCHEMA_VERSION,
  ShapeSchema,
  ShapeTemplateSchema,
  TentFileEntrySchema,
  TentPresetFileSchema,
  type Layout,
  type Tent,
} from './model'

const tent: Tent = {
  name: '테스트 텐트',
  outer: { kind: 'rect', w: 600, h: 300 },
  outerTemplate: { kind: 'rect', w: 600, h: 300 },
  inners: [
    {
      id: 'inner-1',
      name: '이너 1',
      shape: { kind: 'rect', w: 300, h: 300 },
      x: 150,
      y: 0,
      rotation: 0,
      template: { kind: 'rect', w: 300, h: 300 },
    },
  ],
}

function fullLayout(): Layout {
  return {
    schemaVersion: 1,
    id: 'layout-1',
    name: '테스트 배치',
    createdAt: '2026-10-07T03:00:00.000Z',
    updatedAt: '2026-10-07T03:00:00.000Z',
    tent,
    sourcePresetId: 'generic/tunnel-4',
    items: [
      {
        id: 'item-1',
        name: '매트',
        shape: { kind: 'rect', w: 200, h: 60 },
        x: 0,
        y: -30,
        rotation: 0,
        color: 'green',
        category: 'MAT',
        countsArea: true,
        groupId: 'group-1',
      },
      {
        id: 'item-2',
        name: '매트',
        shape: { kind: 'rect', w: 200, h: 60 },
        x: 0,
        y: 30,
        rotation: 0,
        color: 'sky',
        category: 'MAT',
        countsArea: true,
        groupId: 'group-1',
      },
      {
        id: 'item-3',
        name: '스툴',
        shape: { kind: 'circle', d: 40 },
        x: -200,
        y: 0,
        rotation: 0,
        color: 'blue',
        category: 'CHAIR',
        countsArea: true,
        presetId: 'stool-35',
      },
      {
        id: 'item-4',
        name: '삼각 선반',
        shape: { kind: 'polygon', points: [[0, -30], [30, 30], [-30, 30]] },
        x: -250,
        y: 100,
        rotation: 45,
        color: 'gray',
        category: 'FURNITURE',
        countsArea: true,
      },
    ],
    groups: [{ id: 'group-1' }],
  }
}

describe('상수', () => {
  it('색 8개, 카테고리 6개와 화면 표기', () => {
    expect(COLOR_KEYS).toHaveLength(8)
    expect(ITEM_CATEGORIES).toEqual(['MAT', 'CHAIR', 'TABLE', 'FURNITURE', 'RUG', 'ETC'])
    expect(CATEGORY_LABELS).toEqual({
      MAT: '매트',
      CHAIR: '의자',
      TABLE: '테이블',
      FURNITURE: '수납·가구',
      RUG: '깔개',
      ETC: '기타',
    })
    expect(SCHEMA_VERSION).toBe(1)
    expect(LIMITS.length).toEqual([1, 5000])
  })
})

describe('LayoutSchema', () => {
  it('정상 배치를 통과시키고 값을 그대로 돌려준다', () => {
    const layout = fullLayout()
    const r = LayoutSchema.safeParse(layout)
    expect(r.success).toBe(true)
    expect(r.data).toEqual(layout)
  })

  it('길이 0을 거절한다(경로 포함)', () => {
    const layout = fullLayout()
    layout.items[0] = { ...layout.items[0]!, shape: { kind: 'rect', w: 0, h: 60 } }
    const r = LayoutSchema.safeParse(layout)
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.path).toEqual(['items', 0, 'shape', 'w'])
  })

  it('좌표 10,001을 거절하고 10,000은 받는다', () => {
    const bad = fullLayout()
    bad.items[2] = { ...bad.items[2]!, x: 10001 }
    expect(LayoutSchema.safeParse(bad).success).toBe(false)
    const edge = fullLayout()
    edge.items[2] = { ...edge.items[2]!, x: 10000 }
    expect(LayoutSchema.safeParse(edge).success).toBe(true)
  })

  it('다각형 꼭짓점 좌표도 범위를 검사한다', () => {
    expect(ShapeSchema.safeParse({ kind: 'polygon', points: [[0, 0], [10001, 0], [0, 10]] }).success).toBe(false)
    expect(ShapeSchema.safeParse({ kind: 'polygon', points: [[0, 0, 1], [10, 0], [0, 10]] }).success).toBe(false)
  })

  it('모르는 색 키와 schemaVersion 2를 거절한다', () => {
    const color = structuredClone(fullLayout()) as unknown as { items: Array<{ color: string }> }
    color.items[0]!.color = 'red'
    expect(LayoutSchema.safeParse(color).success).toBe(false)
    expect(LayoutSchema.safeParse({ ...fullLayout(), schemaVersion: 2 }).success).toBe(false)
  })

  it('회전은 아무 실수나 받는다(정규화는 반영 시점에)', () => {
    const layout = fullLayout()
    layout.items[0] = { ...layout.items[0]!, rotation: -725.5 }
    expect(LayoutSchema.safeParse(layout).success).toBe(true)
  })
})

describe('ShapeTemplateSchema', () => {
  it('n=13과 n=5.5를 거절하고 5·12는 받는다', () => {
    const ngon = (n: number) => ({ kind: 'ngon', n, sizeBy: 'diameter', size: 400 })
    expect(ShapeTemplateSchema.safeParse(ngon(13)).success).toBe(false)
    expect(ShapeTemplateSchema.safeParse(ngon(5.5)).success).toBe(false)
    expect(ShapeTemplateSchema.safeParse(ngon(4)).success).toBe(false)
    expect(ShapeTemplateSchema.safeParse(ngon(5)).success).toBe(true)
    expect(ShapeTemplateSchema.safeParse(ngon(12)).success).toBe(true)
  })

  it('offset은 -5,000~5,000, 길이는 1~5,000', () => {
    const trap = (offset: number, depth = 250) => ({ kind: 'trapezoid', front: 300, back: 200, depth, offset })
    expect(ShapeTemplateSchema.safeParse(trap(-5000)).success).toBe(true)
    expect(ShapeTemplateSchema.safeParse(trap(-5001)).success).toBe(false)
    expect(ShapeTemplateSchema.safeParse(trap(0, 5001)).success).toBe(false)
    expect(ShapeTemplateSchema.safeParse({ kind: 'circle', d: 0.5 }).success).toBe(false)
  })
})

describe('파일 스키마', () => {
  const entry = {
    id: 'generic/dome-2',
    model: '돔 2인 예시',
    note: '흔한 크기로 만든 예시예요',
    tent: {
      name: '돔 2인 예시',
      outerTemplate: { kind: 'rect', w: 210, h: 210 },
      inners: [{ id: 'inner-1', name: '이너 1', x: 0, y: -40, rotation: 0, template: { kind: 'rect', w: 210, h: 130 } }],
    },
  }

  it('$schema 키를 허용하고 템플릿만 있는 항목을 받는다', () => {
    const r = TentPresetFileSchema.safeParse({ $schema: '../tents.schema.json', presets: [entry] })
    expect(r.success).toBe(true)
    expect(r.data?.$schema).toBe('../tents.schema.json')
    expect(ItemPresetFileSchema.safeParse({ $schema: './items.schema.json', items: [] }).success).toBe(true)
  })

  it('outer와 outerTemplate이 둘 다 없으면 tent.outer 경로로 거절한다', () => {
    const r = TentFileEntrySchema.safeParse({ ...entry, tent: { ...entry.tent, outerTemplate: undefined } })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.path).toEqual(['tent', 'outer'])
  })

  it('이너의 shape와 template이 둘 다 없으면 거절한다', () => {
    const r = TentFileEntrySchema.safeParse({
      ...entry,
      tent: { ...entry.tent, inners: [{ id: 'inner-1', name: '이너 1', x: 0, y: 0, rotation: 0 }] },
    })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.path).toEqual(['tent', 'inners', 0, 'shape'])
  })

  it('내보내기 파일', () => {
    const file = {
      format: 'tentfit',
      schemaVersion: 1,
      exportedAt: '2026-10-07T12:00:00+09:00',
      layouts: [fullLayout()],
      myTents: [],
      myItems: [],
    }
    expect(ExportFileSchema.safeParse(file).success).toBe(true)
    expect(ExportFileSchema.safeParse({ ...file, format: 'other' }).success).toBe(false)
  })
})

describe('round1', () => {
  it('0.1 단위로 반올림하고 -0을 남기지 않는다', () => {
    expect(round1(12.34)).toBe(12.3)
    expect(round1(12.35)).toBe(12.4)
    expect(round1(-3.26)).toBe(-3.3)
    expect(round1(-0.04)).toBe(0)
    expect(Object.is(round1(-0.04), -0)).toBe(false)
    expect(Object.is(round1(-0.05), -0)).toBe(false)
    expect(round1(10000)).toBe(10000)
  })
})

describe('normAngle', () => {
  it('[0,360)과 0.01° 단위로 정규화한다', () => {
    expect(normAngle(359.996)).toBe(0)
    expect(normAngle(-90)).toBe(270)
    expect(normAngle(360)).toBe(0)
    expect(normAngle(720.5)).toBe(0.5)
    expect(normAngle(370.1)).toBe(10.1)
    expect(normAngle(-0.006)).toBe(359.99)
    expect(normAngle(33.333)).toBe(33.33)
    expect(normAngle(359.994)).toBe(359.99)
  })

  it('-0을 남기지 않는다', () => {
    expect(Object.is(normAngle(-0.004), -0)).toBe(false)
    expect(Object.is(normAngle(-360), -0)).toBe(false)
    expect(Object.is(normAngle(-0), -0)).toBe(false)
  })
})

describe('newId', () => {
  it('UUID 형식이고 매번 다르다', () => {
    const a = newId()
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(newId()).not.toBe(a)
  })
})

describe('createLayout', () => {
  it('기본값: schemaVersion 1, 빈 items·groups, 같은 생성·수정 시각', () => {
    const layout = createLayout(tent, { name: '테스트 텐트 배치', now: '2026-10-07T03:00:00.000Z', id: 'fixed' })
    expect(layout).toEqual({
      schemaVersion: 1,
      id: 'fixed',
      name: '테스트 텐트 배치',
      createdAt: '2026-10-07T03:00:00.000Z',
      updatedAt: '2026-10-07T03:00:00.000Z',
      tent,
      items: [],
      groups: [],
    })
    expect('sourcePresetId' in layout).toBe(false)
    expect(LayoutSchema.safeParse(layout).success).toBe(true)
  })

  it('텐트는 복사본이다(D10)', () => {
    const layout = createLayout(tent, { name: 'x', sourcePresetId: 'generic/tunnel-4' })
    expect(layout.sourcePresetId).toBe('generic/tunnel-4')
    expect(layout.tent).toEqual(tent)
    expect(layout.tent).not.toBe(tent)
    expect(layout.tent.inners[0]).not.toBe(tent.inners[0])
  })

  it('id와 시각을 주지 않으면 새로 만든다', () => {
    const layout = createLayout(tent, { name: 'x' })
    expect(layout.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(Number.isNaN(Date.parse(layout.createdAt))).toBe(false)
    expect(layout.updatedAt).toBe(layout.createdAt)
  })
})
