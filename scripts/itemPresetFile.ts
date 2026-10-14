// presets/items.json 쓰기(로컬 개발 서버의 [프리셋으로 저장], 소유자 요청 2026-10-14). 손으로 맞춘 기존 모양을 따릅니다:
// 물건 하나가 160자 안이면 한 줄, 넘으면 키마다 한 줄(값은 한 줄). 객체는 `{ "k": v }`, 배열은 `[a, b]`.
import type { ItemPreset } from '../src/core/model'

const LINE_MAX = 160

/** 공백을 넣은 한 줄 JSON */
export function inlineJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(inlineJson).join(', ')}]`
  if (v !== null && typeof v === 'object') {
    const entries = Object.entries(v).filter(([, x]) => x !== undefined)
    return entries.length === 0 ? '{}' : `{ ${entries.map(([k, x]) => `${JSON.stringify(k)}: ${inlineJson(x)}`).join(', ')} }`
  }
  return JSON.stringify(v)
}

function itemBlock(item: ItemPreset): string {
  const one = `    ${inlineJson(item)}`
  if (one.length <= LINE_MAX) return one
  const lines = Object.entries(item)
    .filter(([, x]) => x !== undefined)
    .map(([k, x]) => `      ${JSON.stringify(k)}: ${inlineJson(x)}`)
  return `    {\n${lines.join(',\n')}\n    }`
}

/** 파일 전체 글자(끝 줄바꿈 포함) */
export function formatItemsFile(items: readonly ItemPreset[]): string {
  const body = items.length === 0 ? '  "items": []' : `  "items": [\n${items.map(itemBlock).join(',\n')}\n  ]`
  return `{\n  "$schema": "./items.schema.json",\n${body}\n}\n`
}

/** 같은 id면 그 자리를 바꾸고, 없으면 끝에 더합니다. */
export function upsertItemPreset(items: readonly ItemPreset[], preset: ItemPreset): ItemPreset[] {
  const i = items.findIndex((p) => p.id === preset.id)
  if (i < 0) return [...items, preset]
  const next = [...items]
  next[i] = preset
  return next
}
