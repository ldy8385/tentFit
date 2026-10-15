import { describe, expect, it } from 'vitest'
import type { Tent } from '../src/core/model'
import { parseTentPresetFile } from '../src/core/presets'
import { entryFromTent, formatTentFile, upsertTentEntry } from './tentPresetFile'

const TENT: Tent = {
  name: '랜드락',
  outer: { kind: 'rect', w: 620, h: 320, radii: [20, 20, 20, 20] },
  outerTemplate: { kind: 'rect', w: 620, h: 320 },
  inners: [
    { id: 'i1', name: '이너 1', shape: { kind: 'rect', w: 220, h: 300 }, template: { kind: 'rect', w: 220, h: 300 }, x: -200, y: 0, rotation: 0 },
    { id: 'i2', name: '이너 2', shape: { kind: 'polygon', points: [[0, 0], [100, 0], [50, 80]] }, x: 150, y: 0, rotation: 90 },
  ],
}

describe('presets/tents.json 쓰기', () => {
  it('템플릿 + 반지름 텐트를 써서 다시 읽으면 같은 텐트(반지름 유지), id = 제조사/모델(영문 조각)', () => {
    const entry = entryFromTent(TENT, { brand: 'Snow Peak', model: 'Land Lock' })
    expect(entry.id).toBe('snow-peak/land-lock')
    const text = formatTentFile([entry])
    expect(text.startsWith('{\n  "$schema": "./tents.schema.json",\n')).toBe(true)
    const { presets, issues } = parseTentPresetFile(JSON.parse(text), { file: 'tents.json', requireBrand: true })
    expect(issues).toEqual([])
    expect(presets[0]!.tent).toEqual(TENT)
    expect(text).toContain('      "tent": {\n        "name": "랜드락",')
  })

  it('한글 제조사·모델도 그대로 id에(서로 다른 한글 제조사가 겹치지 않게), 기호는 -로', () => {
    expect(entryFromTent(TENT, { brand: '코베아', model: '고스트 3' }).id).toBe('코베아/고스트-3')
    expect(entryFromTent(TENT, { brand: 'Snow Peak', model: 'Land Lock Pro.3' }).id).toBe('snow-peak/land-lock-pro-3')
  })

  it('같은 id는 바꾸고 새 id는 끝에', () => {
    const a = entryFromTent(TENT, { brand: 'S', model: 'A' })
    expect(upsertTentEntry([a], { ...a, model: 'B' })).toEqual([{ ...a, model: 'B' }])
    expect(upsertTentEntry([a], { ...a, id: 's/x' })).toHaveLength(2)
  })
})
