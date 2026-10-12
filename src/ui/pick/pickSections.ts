// 텐트 고르기 목록의 순수 계산(스펙 §4.7-1). 고르기 화면과 텐트 바꾸기 대화상자(Task 11)가 같이 씁니다.
// 브랜드 필터·검색은 만들지 않습니다(브랜드 프리셋이 생긴 뒤, §4.7-1). 내 텐트 구역은 Plan 7(R1).
import type { LayoutSummary } from '../../app/layoutRepo'
import type { TentCatalog } from '../../app/tentCatalog'
import { outerRing, ringBBox } from '../../core/geom'
import { round1, type Tent, type TentPreset } from '../../core/model'

export type PickSection = { key: 'generic' | 'brand'; title: string; note: string; presets: TentPreset[] }

export const GENERIC_SECTION_TITLE = '일반 예시'
export const GENERIC_SECTION_NOTE = '흔한 크기로 만든 예시예요'
export const BRAND_SECTION_TITLE = '브랜드'
export const BRAND_SECTION_NOTE = '치수는 제조사 공개 자료 기준이며 실제와 다를 수 있어요'

/** 일반 예시 → 브랜드 순. 프리셋이 없는 구역은 뺍니다. 브랜드 구역은 catalog.brands 순서(브랜드 이름순) 그대로 이어 붙입니다. */
export function sectionsOf(catalog: TentCatalog): PickSection[] {
  const out: PickSection[] = []
  if (catalog.generic.length > 0) {
    out.push({ key: 'generic', title: GENERIC_SECTION_TITLE, note: GENERIC_SECTION_NOTE, presets: catalog.generic })
  }
  const branded = catalog.brands.flatMap((b) => b.presets)
  if (branded.length > 0) {
    out.push({ key: 'brand', title: BRAND_SECTION_TITLE, note: BRAND_SECTION_NOTE, presets: branded })
  }
  return out
}

/** 외곽 바운딩 박스의 가로·세로(cm). 원은 지름 × 지름. 계산할 수 없으면 null */
export function outerBBoxSize(tent: Tent): { w: number; h: number } | null {
  const o = tent.outer
  if (o.kind === 'circle') return Number.isFinite(o.d) && o.d > 0 ? { w: o.d, h: o.d } : null
  if (o.kind === 'polygon' && o.points.length < 3) return null
  const b = ringBBox(outerRing(tent))
  const w = b.maxX - b.minX
  const h = b.maxY - b.minY
  return Number.isFinite(w) && Number.isFinite(h) ? { w, h } : null
}

function cm(v: number): string {
  return String(round1(v))
}

/** 카드의 외곽 크기 글자: 사각형 '620 × 320 cm', 원 '지름 400 cm', 그 밖은 바운딩 박스 '가로 × 세로 cm' */
export function outerSizeText(tent: Tent): string {
  const o = tent.outer
  if (o.kind === 'rect') return `${cm(o.w)} × ${cm(o.h)} cm`
  if (o.kind === 'circle') return `지름 ${cm(o.d)} cm`
  const size = outerBBoxSize(tent)
  return size === null ? '—' : `${cm(size.w)} × ${cm(size.h)} cm`
}

/** 목록 공통 축척: 목록 안 외곽 바운딩 박스의 가장 긴 변(cm). 목록이 비면 0(공통 축척 없음) */
export function commonExtentCm(presets: readonly TentPreset[]): number {
  let max = 0
  for (const p of presets) {
    const size = outerBBoxSize(p.tent)
    if (size !== null) max = Math.max(max, size.w, size.h)
  }
  return max
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** 내 배치 목록 행의 보조 글자(R2): '수정 HH:MM · 물건 N개'(이 기기의 현지 시각) */
export function layoutMetaText(summary: Pick<LayoutSummary, 'updatedAt' | 'itemCount'>): string {
  const t = new Date(summary.updatedAt)
  const time = Number.isNaN(t.getTime()) ? '--:--' : `${pad2(t.getHours())}:${pad2(t.getMinutes())}`
  return `수정 ${time} · 물건 ${summary.itemCount}개`
}
