import { CATEGORY_LABELS, ITEM_CATEGORIES, type ItemCategory, type ItemPreset } from '../../core/model'

export type CategoryFilter = ItemCategory | 'ALL'

/** 라이브러리 카테고리 칩: '전체' + ITEM_CATEGORIES 순서 */
export const CATEGORY_FILTERS: ReadonlyArray<{ value: CategoryFilter; label: string }> = [
  { value: 'ALL', label: '전체' },
  ...ITEM_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] })),
]

export function filterByCategory(presets: ItemPreset[], filter: CategoryFilter): ItemPreset[] {
  return filter === 'ALL' ? presets : presets.filter((p) => p.category === filter)
}
