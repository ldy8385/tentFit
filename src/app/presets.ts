// 저장소에 든 기본 프리셋(스펙 §5.4)을 앱에서 읽습니다. 빌드 전에 validate-presets가 이미 검사했으므로
// 여기서 문제가 나오면 데이터가 깨진 것이라 조용히 넘기지 않고 throw합니다.
import itemsJson from '../../presets/items.json'
import genericJson from '../../presets/tents/generic.json'
import type { ItemPreset, TentPreset } from '../core/model'
import { parseItemPresetFile, parseTentPresetFile } from '../core/presets'

/** Plan 4(텐트 고르기) 전까지 새 배치를 만들 때 쓰는 임시 시작 텐트 */
export const DEFAULT_TENT_PRESET_ID = 'generic/tunnel-4p'

export function itemPresetsFrom(json: unknown): ItemPreset[] {
  const { items, issues } = parseItemPresetFile(json)
  if (issues.length > 0) throw new Error(`기본 물건 프리셋을 읽지 못했어요\n${issues.join('\n')}`)
  return items
}

export function genericTentsFrom(json: unknown): TentPreset[] {
  const { presets, issues } = parseTentPresetFile(json, 'generic')
  if (issues.length > 0) throw new Error(`기본 텐트 프리셋을 읽지 못했어요\n${issues.join('\n')}`)
  return presets
}

let itemCache: ItemPreset[] | null = null
let tentCache: TentPreset[] | null = null

/** presets/items.json. 처음 부를 때 한 번만 파싱하고 같은 배열을 돌려줍니다(읽기 전용으로 쓰세요). */
export function loadItemPresets(): ItemPreset[] {
  itemCache ??= itemPresetsFrom(itemsJson)
  return itemCache
}

/** presets/tents/generic.json. 처음 부를 때 한 번만 파싱합니다. */
export function loadGenericTents(): TentPreset[] {
  tentCache ??= genericTentsFrom(genericJson)
  return tentCache
}

/** 일반 예시 중 '터널 4인'(id generic/tunnel-4p). 없으면 첫 번째. */
export function defaultTentPreset(): TentPreset {
  const tents = loadGenericTents()
  const found = tents.find((t) => t.id === DEFAULT_TENT_PRESET_ID) ?? tents[0]
  if (found === undefined) throw new Error('기본 텐트 프리셋이 하나도 없어요')
  return found
}
