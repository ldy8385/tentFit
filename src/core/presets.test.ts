import { describe, expect, it } from 'vitest'
import type { TentFileEntry } from './model'
import { parseItemPresetFile, parseTentPresetFile, resolveTentEntry } from './presets'

const domeEntry = {
  id: 'generic/dome-2',
  model: '돔 2인 예시',
  note: '흔한 크기로 만든 예시예요',
  tent: {
    name: '돔 2인 예시',
    outerTemplate: { kind: 'rect', w: 210, h: 210 },
    inners: [
      { id: 'inner-1', name: '이너 1', x: 0, y: -40, rotation: 0, template: { kind: 'rect', w: 210, h: 130 } },
    ],
  },
} as const

const tipiEntry = {
  id: 'generic/tipi-6',
  model: '티피 6각 예시',
  tent: {
    name: '티피 6각 예시',
    outerTemplate: { kind: 'ngon', n: 6, sizeBy: 'diameter', size: 400 },
    inners: [],
  },
} as const

function entry(): TentFileEntry {
  return structuredClone(domeEntry) as unknown as TentFileEntry
}

describe('resolveTentEntry', () => {
  it('템플릿만 있으면 outer와 이너 shape를 만들어 채운다', () => {
    const { preset, issues } = resolveTentEntry(entry())
    expect(issues).toEqual([])
    expect(preset).toEqual({
      id: 'generic/dome-2',
      model: '돔 2인 예시',
      note: '흔한 크기로 만든 예시예요',
      tent: {
        name: '돔 2인 예시',
        outer: { kind: 'rect', w: 210, h: 210 },
        outerTemplate: { kind: 'rect', w: 210, h: 210 },
        inners: [
          {
            id: 'inner-1',
            name: '이너 1',
            shape: { kind: 'rect', w: 210, h: 130 },
            x: 0,
            y: -40,
            rotation: 0,
            template: { kind: 'rect', w: 210, h: 130 },
          },
        ],
      },
    })
  })

  it('정N각형 템플릿은 polygon outer가 된다(이너 0개)', () => {
    const { preset, issues } = resolveTentEntry(structuredClone(tipiEntry) as unknown as TentFileEntry)
    expect(issues).toEqual([])
    expect(preset.tent.outer.kind).toBe('polygon')
    expect(preset.tent.outer.kind === 'polygon' && preset.tent.outer.points).toHaveLength(6)
    expect(preset.tent.inners).toEqual([])
  })

  it('outer가 템플릿과 0.1cm 안이면 issue 없이 템플릿 값을 쓴다', () => {
    const e = entry()
    e.tent.outer = { kind: 'rect', w: 210.05, h: 210 }
    const { preset, issues } = resolveTentEntry(e)
    expect(issues).toEqual([])
    expect(preset.tent.outer).toEqual({ kind: 'rect', w: 210, h: 210 })
  })

  it('어긋난 outer는 issue를 남기고 템플릿 값으로 바꾼다', () => {
    const e = entry()
    e.tent.outer = { kind: 'rect', w: 220, h: 210 }
    const { preset, issues } = resolveTentEntry(e)
    expect(issues).toEqual(['tent.outer: 템플릿으로 만든 도형과 0.1cm 넘게 달라요'])
    expect(preset.tent.outer).toEqual({ kind: 'rect', w: 210, h: 210 })
  })

  it('어긋난 이너 shape도 경로와 함께 issue를 남긴다', () => {
    const e = entry()
    const inner = e.tent.inners[0]!
    inner.shape = { kind: 'rect', w: 210, h: 100 }
    const { issues } = resolveTentEntry(e)
    expect(issues).toEqual(['tent.inners[0].shape: 템플릿으로 만든 도형과 0.1cm 넘게 달라요'])
  })

  it('템플릿 없이 도형만 있으면 그대로 쓴다', () => {
    const e = entry()
    delete e.tent.outerTemplate
    e.tent.outer = { kind: 'polygon', points: [[-100, -100], [100, -100], [0, 100]] }
    const { preset, issues } = resolveTentEntry(e)
    expect(issues).toEqual([])
    expect(preset.tent.outer).toEqual({ kind: 'polygon', points: [[-100, -100], [100, -100], [0, 100]] })
    expect('outerTemplate' in preset.tent).toBe(false)
  })

  it('도형도 템플릿도 없으면 issue와 빈 다각형', () => {
    const e = entry()
    delete e.tent.outerTemplate
    const { preset, issues } = resolveTentEntry(e)
    expect(issues).toEqual(['tent.outer: 도형이나 템플릿 중 하나는 있어야 해요'])
    expect(preset.tent.outer).toEqual({ kind: 'polygon', points: [] })
  })
})

describe('parseTentPresetFile', () => {
  it('$schema 키를 허용하고 generic은 brand 없이 통과한다', () => {
    const { presets, issues } = parseTentPresetFile(
      { $schema: '../tents.schema.json', presets: [domeEntry, tipiEntry] },
      'generic',
    )
    expect(issues).toEqual([])
    expect(presets.map((p) => p.id)).toEqual(['generic/dome-2', 'generic/tipi-6'])
    expect(presets[0]!.tent.outer).toEqual({ kind: 'rect', w: 210, h: 210 })
  })

  it('generic이 아닌 파일의 brand 누락', () => {
    const { presets, issues } = parseTentPresetFile({ presets: [{ ...domeEntry, id: 'acme/dome-2' }] }, 'acme')
    expect(presets).toEqual([])
    expect(issues).toEqual(['acme.json presets[0].brand: generic이 아닌 파일은 brand가 필요해요'])
  })

  it('brand가 있으면 통과한다', () => {
    const { presets, issues } = parseTentPresetFile(
      { presets: [{ ...domeEntry, id: 'acme/dome-2', brand: 'ACME', checkedAt: '2026-10-07', source: 'https://example.com/dome' }] },
      'acme',
    )
    expect(issues).toEqual([])
    expect(presets[0]!.brand).toBe('ACME')
    expect(presets[0]!.checkedAt).toBe('2026-10-07')
  })

  it('id 접두사 불일치', () => {
    const { presets, issues } = parseTentPresetFile(
      { presets: [{ ...domeEntry, id: 'other/dome-2', brand: 'ACME' }, { ...domeEntry, id: 'acme/', brand: 'ACME' }] },
      'acme',
    )
    expect(presets).toEqual([])
    expect(issues).toEqual([
      'acme.json presets[0].id: id는 "acme/"로 시작해야 해요 (지금: "other/dome-2")',
      'acme.json presets[1].id: id는 "acme/"로 시작해야 해요 (지금: "acme/")',
    ])
  })

  it('어긋난 outer는 파일 경로가 붙은 issue가 되고, 그 항목만 빠진다', () => {
    const broken = { ...domeEntry, tent: { ...domeEntry.tent, outer: { kind: 'rect', w: 220, h: 210 } } }
    const { presets, issues } = parseTentPresetFile({ presets: [tipiEntry, broken] }, 'generic')
    expect(presets.map((p) => p.id)).toEqual(['generic/tipi-6'])
    expect(issues).toEqual(['generic.json presets[1].tent.outer: 템플릿으로 만든 도형과 0.1cm 넘게 달라요'])
  })

  it('스키마 위반은 zod 경로를 사람이 읽는 형태로 남긴다', () => {
    const badN = { ...tipiEntry, tent: { ...tipiEntry.tent, outerTemplate: { kind: 'ngon', n: 13, sizeBy: 'diameter', size: 400 } } }
    const { presets, issues } = parseTentPresetFile({ presets: [domeEntry, badN] }, 'generic')
    expect(presets.map((p) => p.id)).toEqual(['generic/dome-2'])
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatch(/^generic\.json presets\[1\]\.tent\.outerTemplate\.n: /)
  })

  it('outer와 outerTemplate이 둘 다 없으면 tent.outer 경로', () => {
    const none = { ...domeEntry, tent: { name: '빈 텐트', inners: [] } }
    const { issues } = parseTentPresetFile({ presets: [none] }, 'generic')
    expect(issues).toEqual(['generic.json presets[0].tent.outer: outer나 outerTemplate 중 하나는 있어야 해요'])
  })

  it('루트가 형식에 맞지 않으면 presets 경로로 알린다', () => {
    const { presets, issues } = parseTentPresetFile({}, 'generic')
    expect(presets).toEqual([])
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatch(/^generic\.json presets: /)
    expect(parseTentPresetFile(null, 'generic').issues[0]).toMatch(/^generic\.json: /)
  })
})

describe('parseItemPresetFile', () => {
  const mat = { id: 'mat-200x60', name: '매트 200×60', category: 'MAT', shape: { kind: 'rect', w: 200, h: 60 }, color: 'green', countsArea: true }
  const rug = { id: 'rug-300x200', name: '러그 300×200', category: 'RUG', shape: { kind: 'rect', w: 300, h: 200 }, color: 'sky', countsArea: false }
  const shelf = {
    id: 'corner-shelf',
    name: '코너 선반',
    category: 'FURNITURE',
    shape: { kind: 'polygon', points: [[-20, -20], [20, -20], [-20, 20]] },
    color: 'brown',
    countsArea: true,
  }

  it('$schema 키를 허용하고 다각형 물건 프리셋을 받는다', () => {
    const { items, issues } = parseItemPresetFile({ $schema: './items.schema.json', items: [mat, rug, shelf] })
    expect(issues).toEqual([])
    expect(items.map((i) => i.id)).toEqual(['mat-200x60', 'rug-300x200', 'corner-shelf'])
    expect(items[1]!.countsArea).toBe(false)
  })

  it('잘못된 항목은 빼고 경로를 남긴다', () => {
    const { items, issues } = parseItemPresetFile({ items: [mat, { ...rug, color: 'red' }] })
    expect(items.map((i) => i.id)).toEqual(['mat-200x60'])
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatch(/^items\.json items\[1\]\.color: /)
  })

  it('items가 없으면 루트 issue', () => {
    const { items, issues } = parseItemPresetFile({ presets: [] })
    expect(items).toEqual([])
    expect(issues[0]).toMatch(/^items\.json items: /)
  })
})
