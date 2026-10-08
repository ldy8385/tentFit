import { describe, expect, it } from 'vitest'
import type { ItemPreset } from '../../core/model'
import { CATEGORY_FILTERS, filterByCategory } from './libraryUtils'

describe('filterByCategory', () => {
  const p = (id: string, category: ItemPreset['category']): ItemPreset => ({
    id,
    name: id,
    category,
    shape: { kind: 'rect', w: 10, h: 10 },
    color: 'gray',
    countsArea: true,
  })
  const list = [p('a', 'MAT'), p('b', 'CHAIR'), p('c', 'MAT'), p('d', 'RUG')]

  it("'ALL'이면 그대로, 카테고리면 그것만 순서대로", () => {
    expect(filterByCategory(list, 'ALL')).toBe(list)
    expect(filterByCategory(list, 'MAT').map((x) => x.id)).toEqual(['a', 'c'])
    expect(filterByCategory(list, 'ETC')).toEqual([])
  })

  it("칩은 '전체' 다음에 카테고리 6개 순서", () => {
    expect(CATEGORY_FILTERS.map((c) => c.value)).toEqual(['ALL', 'MAT', 'CHAIR', 'TABLE', 'FURNITURE', 'RUG', 'ETC'])
    expect(CATEGORY_FILTERS.map((c) => c.label)).toEqual(['전체', '매트', '의자', '테이블', '수납·가구', '깔개', '기타'])
  })
})
