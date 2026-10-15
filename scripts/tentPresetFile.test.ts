import { describe, expect, it } from 'vitest'
import type { Tent } from '../src/core/model'
import { parseTentPresetFile } from '../src/core/presets'
import { entryFromTent, formatTentFile, slugify, upsertTentEntry } from './tentPresetFile'

const TENT: Tent = {
  name: '랜드락',
  outer: { kind: 'rect', w: 620, h: 320, radii: [20, 20, 20, 20] },
  outerTemplate: { kind: 'rect', w: 620, h: 320 },
  inners: [
    { id: 'i1', name: '이너 1', shape: { kind: 'rect', w: 220, h: 300 }, template: { kind: 'rect', w: 220, h: 300 }, x: -200, y: 0, rotation: 0 },
    { id: 'i2', name: '이너 2', shape: { kind: 'polygon', points: [[0, 0], [100, 0], [50, 80]] }, x: 150, y: 0, rotation: 90 },
  ],
}

describe('presets/tents 파일 쓰기', () => {
  it('slugify: 영문·숫자만, 한글만이면 빈 글자', () => {
    expect(slugify('Snow Peak')).toBe('snow-peak')
    expect(slugify('Land Lock Pro.3')).toBe('land-lock-pro-3')
    expect(slugify('코베아')).toBe('')
  })

  it('템플릿 + 반지름 텐트를 써서 다시 읽으면 같은 텐트(반지름 유지), id는 slug/로 시작', () => {
    const entry = entryFromTent(TENT, { slug: 'snow-peak', brand: 'Snow Peak', model: 'Land Lock' })
    expect(entry.id).toBe('snow-peak/land-lock')
    const text = formatTentFile([entry])
    const { presets, issues } = parseTentPresetFile(JSON.parse(text), 'snow-peak')
    expect(issues).toEqual([])
    expect(presets[0]!.tent).toEqual(TENT)
    expect(text).toContain('      "tent": {\n        "name": "랜드락",')
  })

  it('같은 id는 바꾸고 새 id는 끝에', () => {
    const a = entryFromTent(TENT, { slug: 's', brand: 'S', model: 'A' })
    expect(upsertTentEntry([a], { ...a, model: 'B' })).toEqual([{ ...a, model: 'B' }])
    expect(upsertTentEntry([a], { ...a, id: 's/x' })).toHaveLength(2)
  })
})
