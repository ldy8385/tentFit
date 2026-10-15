import { describe, expect, it } from 'vitest'
import type { TentCatalog } from '../../app/tentCatalog'
import type { Tent, TentPreset } from '../../core/model'
import {
  BRAND_SECTION_NOTE,
  GENERIC_SECTION_NOTE,
  commonExtentCm,
  layoutMetaText,
  outerBBoxSize,
  outerSizeText,
  sectionsOf,
} from './pickSections'

function preset(id: string, tent: Tent, brand?: string): TentPreset {
  return brand === undefined ? { id, model: tent.name, tent } : { id, brand, model: tent.name, tent }
}

const RECT: Tent = { name: '터널', outer: { kind: 'rect', w: 620, h: 320 }, outerTemplate: { kind: 'rect', w: 620, h: 320 }, inners: [] }
const CIRCLE: Tent = { name: '벨', outer: { kind: 'circle', d: 400 }, inners: [] }
const TRAPEZOID: Tent = {
  name: '사다리꼴',
  outer: { kind: 'polygon', points: [[-100, -125], [100, -125], [150, 125], [-150, 125]] },
  inners: [],
}

describe('sectionsOf', () => {
  it('일반 예시 → 브랜드마다 구역(제목 = 브랜드 이름, catalog 순서), 공개 자료 안내는 첫 브랜드 구역에만', () => {
    const catalog: TentCatalog = {
      generic: [preset('generic/a', RECT)],
      brands: [
        { brand: '가나', presets: [preset('gana/x', CIRCLE, '가나')] },
        { brand: '다라', presets: [preset('dara/y', TRAPEZOID, '다라'), preset('dara/z', RECT, '다라')] },
      ],
    }
    const sections = sectionsOf(catalog)
    expect(sections.map((s) => [s.key, s.title, s.note])).toEqual([
      ['generic', '일반 예시', '흔한 크기로 만든 예시예요'],
      ['brand', '가나', '치수는 제조사 공개 자료 기준이며 실제와 다를 수 있어요'],
      ['brand', '다라', ''],
    ])
    expect(GENERIC_SECTION_NOTE).toBe('흔한 크기로 만든 예시예요')
    expect(BRAND_SECTION_NOTE).toBe('치수는 제조사 공개 자료 기준이며 실제와 다를 수 있어요')
    expect(sections.map((s) => s.presets.map((p) => p.id))).toEqual([['generic/a'], ['gana/x'], ['dara/y', 'dara/z']])
    expect(sections.map((s) => s.brand)).toEqual([undefined, '가나', '다라'])
  })

  it('브랜드 필터: 그 브랜드 구역만(내 텐트·일반 예시도 숨김, 안내 문구는 그 구역에)', () => {
    const catalog: TentCatalog = {
      generic: [preset('generic/a', RECT)],
      brands: [
        { brand: '가나', presets: [preset('gana/x', CIRCLE, '가나')] },
        { brand: '다라', presets: [preset('dara/y', TRAPEZOID, '다라')] },
      ],
    }
    const sections = sectionsOf(catalog, [preset('mine/1', RECT)], '다라')
    expect(sections.map((s) => [s.key, s.title, s.note])).toEqual([['brand', '다라', '치수는 제조사 공개 자료 기준이며 실제와 다를 수 있어요']])
    expect(sectionsOf(catalog, [], null).map((s) => s.title)).toEqual(['일반 예시', '가나', '다라'])
  })

  it('브랜드 프리셋이 없으면 브랜드 구역이 없고, 일반 예시가 없으면 일반 구역이 없다', () => {
    expect(sectionsOf({ generic: [preset('generic/a', RECT)], brands: [] }).map((s) => s.key)).toEqual(['generic'])
    expect(sectionsOf({ generic: [], brands: [{ brand: '가나', presets: [preset('gana/x', RECT, '가나')] }] }).map((s) => s.key)).toEqual(['brand'])
    expect(sectionsOf({ generic: [], brands: [{ brand: '빈', presets: [] }] })).toEqual([])
  })
})

describe('outerSizeText', () => {
  it("사각형 '가로 × 세로 cm', 원 '지름 d cm'", () => {
    expect(outerSizeText(RECT)).toBe('620 × 320 cm')
    expect(outerSizeText(CIRCLE)).toBe('지름 400 cm')
  })

  it('다각형은 바운딩 박스(0.1cm 반올림)', () => {
    expect(outerSizeText(TRAPEZOID)).toBe('300 × 250 cm')
    const hex: Tent = {
      name: '육각',
      outer: { kind: 'polygon', points: [[-100, 173.2], [100, 173.2], [200, 0], [100, -173.2], [-100, -173.2], [-200, 0]] },
      inners: [],
    }
    expect(outerSizeText(hex)).toBe('400 × 346.4 cm')
  })

  it('꼭짓점이 3개 미만인 손상 데이터는 —', () => {
    const broken: Tent = { name: '깨짐', outer: { kind: 'polygon', points: [[0, 0], [1, 1]] }, inners: [] }
    expect(outerSizeText(broken)).toBe('—')
    expect(outerBBoxSize(broken)).toBeNull()
  })
})

describe('commonExtentCm', () => {
  it('목록 외곽 바운딩 박스의 가장 긴 변, 빈 목록은 0', () => {
    expect(commonExtentCm([preset('a', RECT), preset('b', CIRCLE), preset('c', TRAPEZOID)])).toBe(620)
    expect(commonExtentCm([preset('b', CIRCLE)])).toBe(400)
    expect(commonExtentCm([])).toBe(0)
  })
})

describe('layoutMetaText', () => {
  it("'수정 HH:MM · 물건 N개'(현지 시각, 두 자리)", () => {
    const at = new Date(2026, 9, 8, 9, 5, 30).toISOString()
    expect(layoutMetaText({ updatedAt: at, itemCount: 3 })).toBe('수정 09:05 · 물건 3개')
    expect(layoutMetaText({ updatedAt: new Date(2026, 9, 8, 23, 40).toISOString(), itemCount: 0 })).toBe('수정 23:40 · 물건 0개')
  })

  it('읽을 수 없는 시각은 --:--', () => {
    expect(layoutMetaText({ updatedAt: 'x', itemCount: 1 })).toBe('수정 --:-- · 물건 1개')
  })
})
