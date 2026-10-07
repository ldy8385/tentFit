import { z } from 'zod'
import { ItemPresetSchema, TentFileEntrySchema } from './model'
import type { Inner, ItemPreset, Shape, ShapeTemplate, TentFileEntry, TentPreset } from './model'
import { shapeFromTemplate, shapesEqual } from './templates'

/** 템플릿도 도형도 없을 때 쓰는 빈 도형. validate의 too-few-points에 걸리므로 그대로 쓰이지 않습니다. */
const EMPTY_SHAPE: Shape = { kind: 'polygon', points: [] }

const GENERIC_SLUG = 'generic'

/** ['presets', 2, 'tent', 'outer'] → 'presets[2].tent.outer' */
function joinPath(base: string, path: ReadonlyArray<PropertyKey>): string {
  let out = base
  for (const key of path) {
    if (typeof key === 'number') out += `[${key}]`
    else out += out === '' ? String(key) : `.${String(key)}`
  }
  return out
}

function issueLine(file: string, path: string, message: string): string {
  return path === '' ? `${file}: ${message}` : `${file} ${path}: ${message}`
}

function zodIssueLines(file: string, base: string, error: z.ZodError): string[] {
  return error.issues.map((i) => issueLine(file, joinPath(base, i.path), i.message))
}

/** 템플릿이 있으면 템플릿으로 도형을 만들고, 함께 적힌 도형이 0.1cm 넘게 다르면 issue를 남깁니다. */
function resolveShape(
  shape: Shape | undefined,
  template: ShapeTemplate | undefined,
  path: string,
  issues: string[],
): Shape {
  if (template !== undefined) {
    const made = shapeFromTemplate(template)
    if (shape !== undefined && !shapesEqual(shape, made)) {
      issues.push(`${path}: 템플릿으로 만든 도형과 0.1cm 넘게 달라요`)
    }
    return made
  }
  if (shape !== undefined) return shape
  issues.push(`${path}: 도형이나 템플릿 중 하나는 있어야 해요`)
  return EMPTY_SHAPE
}

/**
 * 파일 항목 → TentPreset. outer·이너 shape를 템플릿으로 채웁니다.
 * issues의 경로는 항목 기준('tent.outer', 'tent.inners[1].shape')입니다.
 */
export function resolveTentEntry(entry: TentFileEntry): { preset: TentPreset; issues: string[] } {
  const issues: string[] = []
  const src = entry.tent

  const outer = resolveShape(src.outer, src.outerTemplate, 'tent.outer', issues)
  const inners: Inner[] = src.inners.map((inner, k) => {
    const resolved: Inner = {
      id: inner.id,
      name: inner.name,
      shape: resolveShape(inner.shape, inner.template, `tent.inners[${k}].shape`, issues),
      x: inner.x,
      y: inner.y,
      rotation: inner.rotation,
    }
    if (inner.template !== undefined) resolved.template = inner.template
    return resolved
  })

  const preset: TentPreset = {
    id: entry.id,
    model: entry.model,
    tent: { name: src.name, outer, inners },
  }
  if (src.outerTemplate !== undefined) preset.tent.outerTemplate = src.outerTemplate
  if (entry.brand !== undefined) preset.brand = entry.brand
  if (entry.source !== undefined) preset.source = entry.source
  if (entry.checkedAt !== undefined) preset.checkedAt = entry.checkedAt
  if (entry.note !== undefined) preset.note = entry.note
  return { preset, issues }
}

const TentFileRootSchema = z.object({
  $schema: z.string().optional(),
  presets: z.array(z.unknown()),
})

const ItemFileRootSchema = z.object({
  $schema: z.string().optional(),
  items: z.array(z.unknown()),
})

/**
 * presets/tents/<slug>.json 파싱. 문제가 있는 항목은 presets에서 빼고 issues에 남깁니다.
 * - slug가 'generic'이 아니면 brand 필수
 * - id는 '<slug>/'로 시작
 */
export function parseTentPresetFile(json: unknown, slug: string): { presets: TentPreset[]; issues: string[] } {
  const file = `${slug}.json`
  const root = TentFileRootSchema.safeParse(json)
  if (!root.success) return { presets: [], issues: zodIssueLines(file, '', root.error) }

  const presets: TentPreset[] = []
  const issues: string[] = []
  root.data.presets.forEach((raw, i) => {
    const base = `presets[${i}]`
    const parsed = TentFileEntrySchema.safeParse(raw)
    if (!parsed.success) {
      issues.push(...zodIssueLines(file, base, parsed.error))
      return
    }
    const entry = parsed.data
    const entryIssues: string[] = []
    const { preset, issues: shapeIssues } = resolveTentEntry(entry)
    for (const line of shapeIssues) entryIssues.push(`${file} ${base}.${line}`)
    if (slug !== GENERIC_SLUG && entry.brand === undefined) {
      entryIssues.push(issueLine(file, `${base}.brand`, `generic이 아닌 파일은 brand가 필요해요`))
    }
    const prefix = `${slug}/`
    if (!entry.id.startsWith(prefix) || entry.id.length === prefix.length) {
      entryIssues.push(issueLine(file, `${base}.id`, `id는 "${prefix}"로 시작해야 해요 (지금: "${entry.id}")`))
    }
    if (entryIssues.length > 0) issues.push(...entryIssues)
    else presets.push(preset)
  })
  return { presets, issues }
}

/** presets/items.json 파싱. 문제가 있는 항목은 items에서 빼고 issues에 남깁니다. */
export function parseItemPresetFile(json: unknown): { items: ItemPreset[]; issues: string[] } {
  const file = 'items.json'
  const root = ItemFileRootSchema.safeParse(json)
  if (!root.success) return { items: [], issues: zodIssueLines(file, '', root.error) }

  const items: ItemPreset[] = []
  const issues: string[] = []
  root.data.items.forEach((raw, i) => {
    const parsed = ItemPresetSchema.safeParse(raw)
    if (parsed.success) items.push(parsed.data)
    else issues.push(...zodIssueLines(file, `items[${i}]`, parsed.error))
  })
  return { items, issues }
}
