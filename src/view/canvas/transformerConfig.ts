// 선택에 따른 Konva Transformer 설정(스펙 §4.6 "선택과 변형 핸들", D17·D31). 순수 함수입니다.
import type { PointerKind } from '../../store/ui'

export type TransformerConfig = {
  resizeEnabled: boolean
  rotateEnabled: boolean
  keepRatio: boolean
  enabledAnchors: string[]
  /** 보이는 핸들 크기(px) */
  anchorSize: number
  /** 핸들을 잡는 영역 한 변(px). Board가 anchorStyleFunc의 hitFunc로 넓힙니다. */
  anchorHitPx: number
  /** 회전 핸들이 선택 상자 위로 떨어진 거리(px) */
  rotateAnchorOffset: number
}

/** 보이는 핸들 점 11~12px(§4.6) */
export const ANCHOR_SIZE_PX = 12
/** 잡는 영역 24~28px, 터치는 28px(§4.6) */
export const ANCHOR_HIT_PX: Readonly<Record<PointerKind, number>> = { mouse: 24, pen: 24, touch: 28 }
/** 회전 핸들의 잡는 영역이 모서리 핸들의 잡는 영역과 겹치지 않는 거리(잡는 영역 + 4px) */
export const ROTATE_ANCHOR_OFFSET_PX: Readonly<Record<PointerKind, number>> = { mouse: 28, pen: 28, touch: 32 }

/**
 * 배치 모드는 이동·회전만(소유자 결정 2026-10-15): 크기 핸들은 없고 회전 핸들만. 크기·모양은 [모양 편집] 화면에서 바꿉니다.
 * - 0개: 아무 핸들도 없음
 * - 1개: 회전 핸들(원은 돌려도 같아서 없음)
 * - 2개 이상(그룹 포함): 회전 핸들
 */
export function transformerConfig(sel: { count: number; singleIsCircle: boolean }, pointer: PointerKind): TransformerConfig {
  const common = {
    anchorSize: ANCHOR_SIZE_PX,
    anchorHitPx: ANCHOR_HIT_PX[pointer],
    rotateAnchorOffset: ROTATE_ANCHOR_OFFSET_PX[pointer],
  }
  const rotateEnabled = sel.count >= 2 || (sel.count === 1 && !sel.singleIsCircle)
  return { ...common, resizeEnabled: false, rotateEnabled, keepRatio: false, enabledAnchors: [] }
}
