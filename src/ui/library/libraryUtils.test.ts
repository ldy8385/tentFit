import { describe, expect, it } from 'vitest'
import type { ItemPreset } from '../../core/model'
import { brandOptions, categoryFilters, emptyLibraryText, filterByBrand, filterByCategory, sortByName } from './libraryUtils'

const p = (id: string, category: ItemPreset['category']): ItemPreset => ({
  id,
  name: id,
  category,
  shape: { kind: 'rect', w: 10, h: 10 },
  color: 'gray',
  countsArea: true,
})

describe('filterByCategory', () => {
  const list = [p('a', 'MAT'), p('b', 'CHAIR'), p('c', 'MAT'), p('d', 'RUG')]

  it("'ALL'이면 그대로, 카테고리면 그것만 순서대로", () => {
    expect(filterByCategory(list, 'ALL')).toBe(list)
    expect(filterByCategory(list, 'MAT').map((x) => x.id)).toEqual(['a', 'c'])
    expect(filterByCategory(list, 'ETC')).toEqual([])
  })
})

describe('categoryFilters(라이브러리 칩)', () => {
  it("'전체' + 매트(늘) + 프리셋이 있는 카테고리만, ITEM_CATEGORIES 순서", () => {
    expect(categoryFilters([p('d', 'RUG'), p('b', 'CHAIR')]).map((c) => c.label)).toEqual(['전체', '매트', '의자', '깔개'])
  })

  it('프리셋이 하나도 없으면 전체·매트만', () => {
    expect(categoryFilters([]).map((c) => c.value)).toEqual(['ALL', 'MAT'])
  })

  it('빈 목록 안내', () => {
    expect(emptyLibraryText('ALL')).toBe('아직 등록된 물건이 없어요 · [새 도형]으로 직접 만들 수 있어요')
    expect(emptyLibraryText('MAT')).toBe('아직 등록된 매트가 없어요 · [새 도형]으로 직접 만들 수 있어요')
  })
})

describe('제조사 필터', () => {
  const b = (id: string, brand?: string): ItemPreset => ({ ...p(id, 'MAT'), ...(brand === undefined ? {} : { brand }) })
  const list = [b('a', '써머레스트'), b('b'), b('c', '니모'), b('d', '써머레스트')]

  it('제조사 목록은 겹치지 않게 가나다순, 제조사가 없으면 빈 배열', () => {
    expect(brandOptions(list)).toEqual(['니모', '써머레스트'])
    expect(brandOptions([b('x')])).toEqual([])
  })

  it('null이면 그대로, 제조사면 그 제조사만', () => {
    expect(filterByBrand(list, null)).toBe(list)
    expect(filterByBrand(list, '써머레스트').map((x) => x.id)).toEqual(['a', 'd'])
  })
})

describe('sortByName(라이브러리 이름순, 소유자 요청 2026-10-14)', () => {
  const named = (name: string): ItemPreset => ({ id: name, name, category: 'MAT', shape: { kind: 'rect', w: 1, h: 1 }, color: 'green', countsArea: true })
  it('한국어 순서(한글 가나다 → 영문 알파벳, 대소문자 무시), 숫자는 크기순, 원본은 그대로', () => {
    const src = [named('Tensor Regular'), named('매트 10'), named('Eclipse Long'), named('매트 2'), named('eclipse Regular'), named('가방')]
    expect(sortByName(src).map((p) => p.name)).toEqual(['가방', '매트 2', '매트 10', 'Eclipse Long', 'eclipse Regular', 'Tensor Regular'])
    expect(src[0]!.name).toBe('Tensor Regular')
  })
})
