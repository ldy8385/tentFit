import type { z } from 'zod'
import { ExportFileSchema, LayoutSchema, MyItemsSchema, MyTentsSchema, SCHEMA_VERSION } from './model'
import type { ExportFile, ItemPreset, Layout, TentPreset } from './model'

/** 형식 변환·검사 실패. path는 'items.0.color'처럼 점으로 이은 필드 경로(루트면 '')입니다. */
export class MigrateError extends Error {
  readonly path: string

  constructor(message: string, path: string) {
    super(message)
    this.name = 'MigrateError'
    this.path = path
  }
}

type Doc = Record<string, unknown>
type DocKind = 'layout' | 'export' | 'myTents' | 'myItems'

/**
 * schemaVersion N → N+1 단계 함수 표. 키는 "변환 전" 버전입니다.
 * v1뿐이라 비어 있습니다. v2를 만들 때 STEPS[1]을 추가합니다.
 * 각 단계는 문서 종류(kind)를 보고 그 종류에 맞게 고칩니다. 내보내기 파일 단계는 안의 배치도 함께 올립니다.
 */
const STEPS: Record<number, (doc: Doc, kind: DocKind) => Doc> = {}

function isDoc(v: unknown): v is Doc {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function joinPath(prefix: string, rest: string): string {
  if (prefix === '') return rest
  return rest === '' ? prefix : `${prefix}.${rest}`
}

/** schemaVersion을 현재 버전까지 한 단계씩 올립니다. */
function upgrade(raw: unknown, kind: DocKind, pathPrefix = ''): Doc {
  if (!isDoc(raw)) throw new MigrateError('객체 형식이 아니에요', pathPrefix)
  let doc = raw
  const first = doc.schemaVersion
  const versionPath = joinPath(pathPrefix, 'schemaVersion')
  if (typeof first !== 'number' || !Number.isInteger(first) || first < 1) {
    throw new MigrateError('schemaVersion이 없거나 잘못됐어요', versionPath)
  }
  if (first > SCHEMA_VERSION) {
    throw new MigrateError(`더 새로운 버전(${first})의 데이터예요. 앱을 새로고침해 업데이트해 주세요`, versionPath)
  }
  let version: number = first
  while (version < SCHEMA_VERSION) {
    const step = STEPS[version]
    if (step === undefined) throw new MigrateError(`버전 ${version}을(를) 변환할 수 없어요`, versionPath)
    doc = step(doc, kind)
    const next: unknown = doc.schemaVersion
    if (typeof next !== 'number' || next <= version) {
      throw new MigrateError(`버전 ${version} 변환 결과가 잘못됐어요`, versionPath)
    }
    version = next
  }
  return doc
}

function parseOrThrow<T extends z.ZodType>(schema: T, value: unknown, pathPrefix = ''): z.output<T> {
  const r = schema.safeParse(value)
  if (r.success) return r.data
  const first = r.error.issues[0]
  const path = joinPath(pathPrefix, first ? first.path.map(String).join('.') : '')
  const message = first ? first.message : '형식이 맞지 않아요'
  throw new MigrateError(`형식이 맞지 않아요(${path === '' ? '루트' : path}): ${message}`, path)
}

export function migrateLayout(raw: unknown): Layout {
  return parseOrThrow(LayoutSchema, upgrade(raw, 'layout'))
}

export function migrateExportFile(raw: unknown): ExportFile {
  if (!isDoc(raw)) throw new MigrateError('객체 형식이 아니에요', '')
  if (raw.format !== 'tentfit') throw new MigrateError('tentFit 파일이 아니에요', 'format')
  const file = upgrade(raw, 'export')
  const layouts = Array.isArray(file.layouts)
    ? file.layouts.map((layout: unknown, i) => upgrade(layout, 'layout', `layouts.${i}`))
    : file.layouts
  return parseOrThrow(ExportFileSchema, { ...file, layouts })
}

/** IndexedDB 'myTents' 값. 키가 없으면(undefined) 빈 목록입니다. */
export function migrateMyTents(raw: unknown): TentPreset[] {
  if (raw === undefined) return []
  return parseOrThrow(MyTentsSchema, upgrade(raw, 'myTents')).items
}

/** IndexedDB 'myItems' 값. 키가 없으면(undefined) 빈 목록입니다. */
export function migrateMyItems(raw: unknown): ItemPreset[] {
  if (raw === undefined) return []
  return parseOrThrow(MyItemsSchema, upgrade(raw, 'myItems')).items
}
