// 저장소에 든 기본 프리셋(스펙 §5.4)을 앱에서 읽습니다. 빌드 전에 validate-presets가 이미 검사했으므로
// 여기서 문제가 나오면 데이터가 깨진 것이라 조용히 넘기지 않고 throw합니다.
import { useSyncExternalStore } from 'react'
import itemsJson from '../../presets/items.json'
import type { ItemPreset, TentPreset } from '../core/model'
import { parseItemPresetFile, parseTentPresetFile } from '../core/presets'

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

/** presets/items.json. 처음 부를 때 한 번만 파싱하고 같은 배열을 돌려줍니다(읽기 전용으로 쓰세요). */
export function loadItemPresets(): ItemPreset[] {
  itemCache ??= itemPresetsFrom(itemsJson)
  return itemCache
}

const itemListeners = new Set<() => void>()

/**
 * 로컬 개발 서버에서 [프리셋으로 저장]한 프리셋을 지금 목록에 바로 반영합니다(같은 id면 바꿈). 파일은 서버가 썼고,
 * 화면을 새로 고치지 않으므로(메모리 배치 보존) 목록은 여기서 고칩니다. 새 배열이라 구독자가 다시 그립니다.
 */
export function registerItemPreset(preset: ItemPreset): void {
  const cur = loadItemPresets()
  const i = cur.findIndex((p) => p.id === preset.id)
  itemCache = i < 0 ? [...cur, preset] : cur.map((p, j) => (j === i ? preset : p))
  for (const l of itemListeners) l()
}

/** 물건 프리셋 목록(저장하면 다시 그림) */
export function useItemPresets(): ItemPreset[] {
  return useSyncExternalStore(
    (cb) => {
      itemListeners.add(cb)
      return () => itemListeners.delete(cb)
    },
    loadItemPresets,
    loadItemPresets,
  )
}
