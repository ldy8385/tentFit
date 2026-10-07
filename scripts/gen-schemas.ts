// 프리셋 파일용 JSON 스키마를 zod 스키마(src/core/model.ts)에서 만들어 presets/에 씁니다.
// 실행: pnpm gen:schemas  (CI는 생성 결과가 커밋된 파일과 같은지 git diff로 확인합니다)
import { realpathSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { ItemPresetFileSchema, TentPresetFileSchema } from '../src/core/model'

export type SchemaFileName = 'tents.schema.json' | 'items.schema.json'

const SOURCES: Record<SchemaFileName, { schema: z.ZodType; title: string }> = {
  'tents.schema.json': { schema: TentPresetFileSchema, title: 'tentFit 텐트 프리셋 파일' },
  'items.schema.json': { schema: ItemPresetFileSchema, title: 'tentFit 물건 프리셋 파일' },
}

export const DEFAULT_PRESETS_DIR = fileURLToPath(new URL('../presets/', import.meta.url))

function render(schema: z.ZodType, title: string): string {
  // io: 'input' — 파일에 사람이 적는 쪽(기본값이 있는 필드는 생략 가능)을 기술합니다.
  // 이 모드에서는 transform이 있어도 입력 쪽 스키마로 바뀌어 예외가 나지 않습니다.
  const json: Record<string, unknown> = { ...z.toJSONSchema(schema, { io: 'input', target: 'draft-2020-12' }) }
  const { $schema, ...rest } = json
  return `${JSON.stringify({ $schema, title, ...rest }, null, 2)}\n`
}

/** 파일 이름 → 파일 내용(끝 줄바꿈 포함). 스키마가 같으면 항상 같은 문자열입니다. */
export function renderSchemas(): Record<SchemaFileName, string> {
  return {
    'tents.schema.json': render(SOURCES['tents.schema.json'].schema, SOURCES['tents.schema.json'].title),
    'items.schema.json': render(SOURCES['items.schema.json'].schema, SOURCES['items.schema.json'].title),
  }
}

/** presetsDir에 스키마 파일 2개를 쓰고, 쓴 경로를 돌려줍니다. */
export function writeSchemas(presetsDir: string): string[] {
  const written: string[] = []
  for (const [name, text] of Object.entries(renderSchemas())) {
    const path = join(presetsDir, name)
    writeFileSync(path, text, 'utf8')
    written.push(path)
  }
  return written
}

function isMain(metaUrl: string): boolean {
  const entry = process.argv[1]
  if (entry === undefined) return false
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(metaUrl))
  } catch {
    return false
  }
}

if (isMain(import.meta.url)) {
  const dir = process.argv[2] !== undefined ? resolve(process.argv[2]) : DEFAULT_PRESETS_DIR
  for (const path of writeSchemas(dir)) console.log(`생성: ${path}`)
}
