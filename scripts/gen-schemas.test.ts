import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PRESETS_DIR, renderSchemas } from './gen-schemas'

type JsonSchemaTop = {
  $schema?: string
  title?: string
  type?: string
  properties?: Record<string, { type?: string }>
}

function parse(text: string): JsonSchemaTop {
  return JSON.parse(text) as JsonSchemaTop
}

describe('gen-schemas', () => {
  it('텐트·물건 파일 스키마 2개를 만든다', () => {
    const out = renderSchemas()
    expect(Object.keys(out).sort()).toEqual(['items.schema.json', 'tents.schema.json'])

    const tents = parse(out['tents.schema.json'])
    expect(tents.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(tents.title).toBe('tentFit 텐트 프리셋 파일')
    expect(tents.type).toBe('object')
    expect(tents.properties?.['$schema']?.type).toBe('string')
    expect(tents.properties?.['presets']?.type).toBe('array')

    const items = parse(out['items.schema.json'])
    expect(items.title).toBe('tentFit 물건 프리셋 파일')
    expect(items.type).toBe('object')
    expect(items.properties?.['$schema']?.type).toBe('string')
    expect(items.properties?.['items']?.type).toBe('array')
  })

  it('같은 스키마면 같은 문자열이고, 끝에 줄바꿈이 하나 있다', () => {
    const a = renderSchemas()
    const b = renderSchemas()
    expect(a).toEqual(b)
    for (const text of Object.values(a)) {
      expect(text.endsWith('}\n')).toBe(true)
      expect(text.endsWith('\n\n')).toBe(false)
    }
  })

  it('커밋된 presets/*.schema.json이 지금 스키마와 같다(다르면 pnpm gen:schemas)', () => {
    for (const [name, text] of Object.entries(renderSchemas())) {
      expect(readFileSync(join(DEFAULT_PRESETS_DIR, name), 'utf8'), `${name}: pnpm gen:schemas를 실행하세요`).toBe(text)
    }
  })

  it('데이터 파일의 $schema가 생성된 스키마 파일을 가리킨다', () => {
    const generic = JSON.parse(readFileSync(join(DEFAULT_PRESETS_DIR, 'tents', 'generic.json'), 'utf8')) as { $schema?: string }
    const items = JSON.parse(readFileSync(join(DEFAULT_PRESETS_DIR, 'items.json'), 'utf8')) as { $schema?: string }
    expect(generic.$schema).toBe('../tents.schema.json')
    expect(items.$schema).toBe('./items.schema.json')
  })
})
