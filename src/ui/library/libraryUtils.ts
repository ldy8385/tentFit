import { CATEGORY_LABELS, ITEM_CATEGORIES, type ItemCategory, type ItemPreset } from '../../core/model'
import { withSubject } from '../area/warningRows'
import { dimsText } from '../panels/itemDims'

/** 'MINE' = 내 도형(이 브라우저에 저장한 물건, id가 my/로 시작, 2026-10-15) */
export type CategoryFilter = ItemCategory | 'ALL' | 'MINE'

/** 내 도형인지 */
export function isMine(p: { id: string }): boolean {
  return p.id.startsWith('my/')
}

/** 라이브러리에 늘 보이는 카테고리(실제 매트 프리셋을 담을 곳, 소유자 요청 2026-10-14 — 에어매트·자충매트도 「매트」 하나로) */
export const PINNED_CATEGORIES: readonly ItemCategory[] = ['MAT']

/** 라이브러리 카테고리 칩: '전체' + 매트(늘) + 프리셋이 있는 다른 카테고리(ITEM_CATEGORIES 순서) */
export function categoryFilters(presets: readonly ItemPreset[]): Array<{ value: CategoryFilter; label: string }> {
  const used = new Set(presets.map((p) => p.category))
  return [
    { value: 'ALL', label: '전체' },
    ...(presets.some(isMine) ? [{ value: 'MINE' as const, label: '내 도형' }] : []),
    ...ITEM_CATEGORIES.filter((c) => PINNED_CATEGORIES.includes(c) || used.has(c)).map((c) => ({ value: c, label: CATEGORY_LABELS[c] })),
  ]
}

export function filterByCategory(presets: ItemPreset[], filter: CategoryFilter): ItemPreset[] {
  if (filter === 'ALL') return presets
  if (filter === 'MINE') return presets.filter(isMine)
  return presets.filter((p) => p.category === filter)
}

/** 목록이 비었을 때 안내(카테고리를 고르면 그 이름으로) */
export function emptyLibraryText(filter: CategoryFilter): string {
  const what = filter === 'ALL' ? '물건' : filter === 'MINE' ? '내 도형' : CATEGORY_LABELS[filter]
  return `아직 등록된 ${withSubject(what)} 없어요 · [새 도형]으로 직접 만들 수 있어요`
}

/** 목록 행 아래 줄: 「내 도형 · 190×60」, 「NEMO · 183×51」, 「200×60」 */
export function rowMeta(p: ItemPreset): string {
  const dims = dimsText(p.shape)
  if (isMine(p)) return `내 도형 · ${dims}`
  return p.brand === undefined ? dims : `${p.brand} · ${dims}`
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

const NAME_COLLATOR = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' })

/** 라이브러리 목록 이름순(소유자 요청 2026-10-14): 한국어 순서(한글 가나다 → 영문 알파벳, 대소문자 무시), 숫자는 크기순. 새 배열 */
export function sortByName(presets: readonly ItemPreset[]): ItemPreset[] {
  return [...presets].sort((a, b) => NAME_COLLATOR.compare(a.name, b.name))
}
