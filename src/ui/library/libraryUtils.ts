import { CATEGORY_LABELS, ITEM_CATEGORIES, type ItemCategory, type ItemPreset } from '../../core/model'
import { withSubject } from '../area/warningRows'

export type CategoryFilter = ItemCategory | 'ALL'

/** 라이브러리에 늘 보이는 카테고리(실제 매트 프리셋을 담을 곳, 소유자 요청 2026-10-14 — 에어매트·자충매트도 「매트」 하나로) */
export const PINNED_CATEGORIES: readonly ItemCategory[] = ['MAT']

/** 라이브러리 카테고리 칩: '전체' + 매트(늘) + 프리셋이 있는 다른 카테고리(ITEM_CATEGORIES 순서) */
export function categoryFilters(presets: readonly ItemPreset[]): Array<{ value: CategoryFilter; label: string }> {
  const used = new Set(presets.map((p) => p.category))
  return [
    { value: 'ALL', label: '전체' },
    ...ITEM_CATEGORIES.filter((c) => PINNED_CATEGORIES.includes(c) || used.has(c)).map((c) => ({ value: c, label: CATEGORY_LABELS[c] })),
  ]
}

export function filterByCategory(presets: ItemPreset[], filter: CategoryFilter): ItemPreset[] {
  return filter === 'ALL' ? presets : presets.filter((p) => p.category === filter)
}

/** 목록이 비었을 때 안내(카테고리를 고르면 그 이름으로) */
export function emptyLibraryText(filter: CategoryFilter): string {
  const what = filter === 'ALL' ? '물건' : CATEGORY_LABELS[filter]
  return `아직 등록된 ${withSubject(what)} 없어요 · [새 도형]으로 직접 만들 수 있어요`
}

/** 프리셋에 적힌 제조사(겹치지 않게, 가나다순). 하나도 없으면 [](제조사 칸을 숨김) */
export function brandOptions(presets: readonly ItemPreset[]): string[] {
  const set = new Set<string>()
  for (const p of presets) if (p.brand !== undefined) set.add(p.brand)
  return [...set].sort((a, b) => a.localeCompare(b, 'ko'))
}

/** brand가 null이면 그대로, 아니면 그 제조사 프리셋만 */
export function filterByBrand(presets: ItemPreset[], brand: string | null): ItemPreset[] {
  return brand === null ? presets : presets.filter((p) => p.brand === brand)
}
