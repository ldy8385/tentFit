import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { ItemPreset } from '../src/core/model'
import { formatItemsFile, upsertItemPreset } from './itemPresetFile'

const MAT: ItemPreset = { id: 'items/a', name: '매트', brand: '써머레스트', category: 'MAT', shape: { kind: 'rect', w: 183, h: 51, radii: [8, 8, 8, 8] }, color: 'green', countsArea: true }

describe('presets/items.json 쓰기', () => {
  it('비면 지금 파일과 같은 글자', () => {
    expect(formatItemsFile([])).toBe(readFileSync('presets/items.json', 'utf8'))
  })

  it('짧으면 한 줄, 길면 키마다 한 줄, 다시 읽으면 같은 값', () => {
    const long: ItemPreset = { ...MAT, id: 'items/b', shape: { kind: 'polygon', points: Array.from({ length: 12 }, (_, i): [number, number] => [i * 10, i % 2]) } }
    const short: ItemPreset = { ...MAT, shape: { kind: 'rect', w: 183, h: 51 } }
    const text = formatItemsFile([short, long])
    expect(text).toContain('    { "id": "items/a", "name": "매트", "brand": "써머레스트", "category": "MAT", "shape": { "kind": "rect", "w": 183, "h": 51 }, "color": "green", "countsArea": true },')
    expect(text).toContain('      "shape": { "kind": "polygon", "points": [[0, 0], [10, 1]')
    expect(JSON.parse(text).items).toEqual([short, long])
  })

  it('같은 id는 바꾸고 새 id는 끝에', () => {
    expect(upsertItemPreset([MAT], { ...MAT, name: '바뀜' })).toEqual([{ ...MAT, name: '바뀜' }])
    expect(upsertItemPreset([MAT], { ...MAT, id: 'items/c' })).toHaveLength(2)
  })
})
