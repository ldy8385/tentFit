// 시험 전용 예시 텐트(일반 예시 5개: 돔 2인·터널 4인·리빙쉘·벨텐트 4m·티피 6각).
// 배포본·개발 화면에서는 일반 예시를 없앴고(소유자 결정 2026-10-15), 단위 시험과 e2e(--mode test)만 이 자료를 씁니다.
import { genericTentsFrom } from '../app/presets'
import type { TentPreset } from '../core/model'
import genericJson from './fixtures/tents/generic.json'

/** 시험이 기본으로 여는 텐트 */
export const DEFAULT_TENT_PRESET_ID = 'generic/tunnel-4p'

let cache: TentPreset[] | null = null

/** 예시 텐트 5개(처음 부를 때 한 번만 파싱) */
export function loadGenericTents(): TentPreset[] {
  cache ??= genericTentsFrom(genericJson)
  return cache
}

/** 예시 중 '터널 4인'(없으면 첫 번째) */
export function defaultTentPreset(): TentPreset {
  const tents = loadGenericTents()
  const found = tents.find((t) => t.id === DEFAULT_TENT_PRESET_ID) ?? tents[0]
  if (found === undefined) throw new Error('예시 텐트가 하나도 없어요')
  return found
}
