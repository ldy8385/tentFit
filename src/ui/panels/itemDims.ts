// 물건 치수 표시(스펙 §4.1 선택 속성: 사각형 가로·세로, 원 지름, 다각형 바운딩 박스 가로·세로).
import { outlineSize } from '../../core/dimEdit'
import { round1, type Shape } from '../../core/model'

export type ItemDims = { kind: 'rect' | 'polygon'; w: number; h: number } | { kind: 'circle'; d: number }

/** 입력칸에 보일 치수. 다각형은 보이는 윤곽(둥근 모서리 포함)의 로컬 바운딩 박스를 0.1cm로 반올림합니다(dimActions가 같은 기준으로 늘림). */
export function itemDims(shape: Shape): ItemDims {
  switch (shape.kind) {
    case 'rect':
      return { kind: 'rect', w: shape.w, h: shape.h }
    case 'circle':
      return { kind: 'circle', d: shape.d }
    case 'polygon': {
      const s = outlineSize(shape)
      return { kind: 'polygon', w: round1(s.w), h: round1(s.h) }
    }
  }
}

/** 목록·시트 요약용 치수 글자: '200×60', 원은 '⌀35'. 단위는 붙이지 않습니다. */
export function dimsText(shape: Shape): string {
  const d = itemDims(shape)
  return d.kind === 'circle' ? `⌀${d.d}` : `${d.w}×${d.h}`
}
