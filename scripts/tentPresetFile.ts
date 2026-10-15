// presets/tents/<slug>.json 쓰기(로컬 개발 서버의 [텐트 프리셋으로 저장], 소유자 요청 2026-10-15).
// 템플릿이 있으면 템플릿을 적고, 도형은 템플릿이 없거나 모서리 반지름이 있을 때만 적습니다(generic.json과 같은 모양).
import type { ShapeTemplate, Shape, Tent, TentFileEntry } from '../src/core/model'
import { inlineJson } from './itemPresetFile'

const LINE_MAX = 160

/** 제조사·모델 이름 → 파일 이름·id에 쓰는 영문 조각(소문자·숫자·-). 영문이 없으면 '' */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function hasRadii(shape: Shape): boolean {
  return shape.kind !== 'circle' && (shape.radii ?? []).some((r) => r > 0)
}

function shapePart(shape: Shape, template: ShapeTemplate | undefined): { shape?: Shape; template?: ShapeTemplate } {
  if (template === undefined) return { shape }
  return hasRadii(shape) ? { template, shape } : { template }
}

/** 지금 텐트 → 파일 항목(id = '<slug>/<모델 조각 또는 시각>') */
export function entryFromTent(tent: Tent, opts: { slug: string; brand: string; model: string; idTail?: string }): TentFileEntry {
  const tail = opts.idTail ?? (slugify(opts.model) || Date.now().toString(36))
  const outer = shapePart(tent.outer, tent.outerTemplate)
  return {
    id: `${opts.slug}/${tail}`,
    brand: opts.brand,
    model: opts.model,
    tent: {
      name: tent.name,
      ...(outer.template !== undefined ? { outerTemplate: outer.template } : {}),
      ...(outer.shape !== undefined ? { outer: outer.shape } : {}),
      inners: tent.inners.map((inner) => {
        const part = shapePart(inner.shape, inner.template)
        return {
          id: inner.id,
          name: inner.name,
          x: inner.x,
          y: inner.y,
          rotation: inner.rotation,
          ...(part.template !== undefined ? { template: part.template } : {}),
          ...(part.shape !== undefined ? { shape: part.shape } : {}),
        }
      }),
    },
  }
}

function block(obj: Record<string, unknown>, indent: string, render: (k: string, v: unknown, ind: string) => string): string {
  const inner = indent + '  '
  const lines = Object.entries(obj)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${inner}${JSON.stringify(k)}: ${render(k, v, inner)}`)
  return `{\n${lines.join(',\n')}\n${indent}}`
}

function inlineOrBlock(v: unknown, indent: string): string {
  const one = inlineJson(v)
  if (indent.length + one.length <= LINE_MAX || v === null || typeof v !== 'object' || Array.isArray(v)) return one
  return block(v as Record<string, unknown>, indent, (_k, x) => inlineJson(x))
}

/** 파일 전체 글자(끝 줄바꿈 포함) */
export function formatTentFile(presets: readonly TentFileEntry[]): string {
  const entries = presets.map((p) =>
    `    ${block(p as unknown as Record<string, unknown>, '    ', (k, v, ind) => {
      if (k !== 'tent') return inlineJson(v)
      return block(v as Record<string, unknown>, ind, (tk, tv, tind) => {
        if (tk !== 'inners') return inlineJson(tv)
        const list = tv as unknown[]
        if (list.length === 0) return '[]'
        return `[\n${list.map((x) => `${tind}  ${inlineOrBlock(x, `${tind}  `)}`).join(',\n')}\n${tind}]`
      })
    })}`,
  )
  const body = entries.length === 0 ? '  "presets": []' : `  "presets": [\n${entries.join(',\n')}\n  ]`
  return `{\n  "$schema": "../tents.schema.json",\n${body}\n}\n`
}

/** 같은 id면 그 자리를 바꾸고, 없으면 끝에 더합니다. */
export function upsertTentEntry(list: readonly TentFileEntry[], entry: TentFileEntry): TentFileEntry[] {
  const i = list.findIndex((p) => p.id === entry.id)
  if (i < 0) return [...list, entry]
  const next = [...list]
  next[i] = entry
  return next
}
