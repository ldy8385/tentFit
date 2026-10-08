// 물건 치수 표시(스펙 §4.1 선택 속성: 사각형 가로·세로, 원 지름, 다각형 바운딩 박스 가로·세로).
import { ringBBox } from '../../core/geom'
import { round1, type Shape } from '../../core/model'

export type ItemDims = { kind: 'rect' | 'polygon'; w: number; h: number } | { kind: 'circle'; d: number }

/** 입력칸에 보일 치수. 다각형은 로컬 좌표 바운딩 박스(resizeItem이 같은 기준으로 늘림)를 0.1cm로 반올림합니다. */
export function itemDims(shape: Shape): ItemDims {
  switch (shape.kind) {
    case 'rect':
      return { kind: 'rect', w: shape.w, h: shape.h }
    case 'circle':
      return { kind: 'circle', d: shape.d }
    case 'polygon': {
      const b = ringBBox(shape.points)
      return { kind: 'polygon', w: round1(b.maxX - b.minX), h: round1(b.maxY - b.minY) }
    }
  }
}

/** 목록·시트 요약용 치수 글자: '200×60', 원은 '⌀35'. 단위는 붙이지 않습니다. */
export function dimsText(shape: Shape): string {
  const d = itemDims(shape)
  return d.kind === 'circle' ? `⌀${d.d}` : `${d.w}×${d.h}`
}
