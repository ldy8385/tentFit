// 기본 프리셋(presets/) 검사. 실행: pnpm validate-presets [프리셋 폴더]
// - zod 스키마 검사, 템플릿 ↔ 도형 비교, 브랜드·id 접두사 규칙(src/core/presets.ts)
// - validateLayout 수준의 기하 검사(자기교차, 이너 겹침 등). 기본 프리셋은 "고칠 수 있는" 이슈도 실패로 봅니다.
// - 이너가 외곽 밖으로 나가면 실패(앱에서는 경고지만, 기본 프리셋은 이탈 0이어야 함)
// - 물건 다각형의 유효성
// - id는 텐트·물건을 통틀어 겹치지 않아야 함
// 하나라도 실패하면 exit code 1.
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLayout } from '../src/core/model'
import type { ItemPreset, TentPreset } from '../src/core/model'
import { parseItemPresetFile, parseTentPresetFile } from '../src/core/presets'
import { ringIssue, validateLayout } from '../src/core/validate'
import { buildZones } from '../src/core/zones'

export type PresetCheckResult = {
  errors: string[]
  tentFiles: string[] // 검사한 텐트 파일 slug(이름순)
  tents: TentPreset[] // 해석에 성공한 텐트 프리셋(outer·shape가 채워진 상태)
  items: ItemPreset[] // 해석에 성공한 물건 프리셋
}

export const DEFAULT_PRESETS_DIR = fileURLToPath(new URL('../presets/', import.meta.url))

/** 검사용 배치에 넣는 고정값(검사 결과가 실행 시각에 따라 바뀌지 않도록). */
const CHECK_LAYOUT_ID = 'preset-check'
const CHECK_NOW = '2026-01-01T00:00:00.000Z'

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** 읽기·파싱에 실패하면 errors에 기록하고 undefined를 돌려줍니다. */
function readJson(path: string, label: string, errors: string[]): unknown {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (e) {
    errors.push(`${label}: 파일을 읽을 수 없어요 (${errorText(e)})`)
    return undefined
  }
  try {
    return JSON.parse(text) as unknown
  } catch (e) {
    errors.push(`${label}: JSON 문법 오류 (${errorText(e)})`)
    return undefined
  }
}

/** presets.ts의 이슈 문자열 앞에 프리셋 폴더 기준 파일 경로를 붙입니다. */
function withFile(label: string, fileName: string, issue: string): string {
  return issue.startsWith(fileName) ? `${label}${issue.slice(fileName.length)}` : `${label} ${issue}`
}

function checkTentGeometry(preset: TentPreset, where: string, errors: string[]): void {
  const layout = createLayout(preset.tent, {
    name: preset.model,
    sourcePresetId: preset.id,
    id: CHECK_LAYOUT_ID,
    now: CHECK_NOW,
  })
  const result = validateLayout(layout)
  for (const issue of result.issues) {
    errors.push(`${where} ${issue.path}: [${issue.code}] ${issue.message}`)
  }
  if (!result.ok) return // 기하가 깨진 텐트는 구역을 계산하지 않습니다.
  const zones = buildZones(preset.tent)
  for (const innerId of zones.innerEscapes) {
    const name = preset.tent.inners.find((inner) => inner.id === innerId)?.name ?? innerId
    errors.push(`${where} tent.inners: 이너 '${name}'이 외곽 밖으로 나가요`)
  }
}

export function checkPresets(presetsDir: string): PresetCheckResult {
  const errors: string[] = []
  const tentFiles: string[] = []
  const tents: TentPreset[] = []
  const items: ItemPreset[] = []

  const owners = new Map<string, string>()
  const claimId = (id: string, where: string): void => {
    const first = owners.get(id)
    if (first !== undefined) errors.push(`${where}: id 중복 '${id}' (먼저 나온 곳: ${first})`)
    else owners.set(id, where)
  }

  // 1) 텐트 파일: presets/tents/*.json (slug = 파일 이름)
  const tentsDir = join(presetsDir, 'tents')
  const files = existsSync(tentsDir)
    ? readdirSync(tentsDir)
        .filter((f) => f.endsWith('.json'))
        .sort()
    : []
  if (!files.includes('generic.json')) errors.push('tents/generic.json: 파일이 없어요(일반 예시용 예약 파일)')

  for (const file of files) {
    const slug = basename(file, '.json')
    const label = `tents/${file}`
    tentFiles.push(slug)
    const json = readJson(join(tentsDir, file), label, errors)
    if (json === undefined) continue
    const parsed = parseTentPresetFile(json, slug)
    for (const issue of parsed.issues) errors.push(withFile(label, file, issue))
    for (const preset of parsed.presets) {
      const where = `${label} '${preset.id}'`
      claimId(preset.id, where)
      tents.push(preset)
      checkTentGeometry(preset, where, errors)
    }
  }

  // 2) 물건 파일: presets/items.json
  const itemsPath = join(presetsDir, 'items.json')
  if (!existsSync(itemsPath)) {
    errors.push('items.json: 파일이 없어요')
  } else {
    const json = readJson(itemsPath, 'items.json', errors)
    if (json !== undefined) {
      const parsed = parseItemPresetFile(json)
      for (const issue of parsed.issues) errors.push(withFile('items.json', 'items.json', issue))
      for (const item of parsed.items) {
        const where = `items.json '${item.id}'`
        claimId(item.id, where)
        items.push(item)
        if (item.shape.kind === 'polygon') {
          const code = ringIssue(item.shape.points)
          if (code !== null) errors.push(`${where} shape: [${code}] 다각형이 올바르지 않아요`)
        }
      }
    }
  }

  return { errors, tentFiles, tents, items }
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
  const result = checkPresets(dir)
  if (result.errors.length > 0) {
    for (const e of result.errors) console.error(`- ${e}`)
    console.error(`프리셋 검사 실패: ${result.errors.length}건 (${dir})`)
    process.exitCode = 1
  } else {
    console.log(
      `프리셋 검사 통과: 텐트 파일 ${result.tentFiles.length}개, 텐트 ${result.tents.length}개, 물건 ${result.items.length}개`,
    )
  }
}
