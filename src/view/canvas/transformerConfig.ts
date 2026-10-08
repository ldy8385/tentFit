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
/** 터치에서 화면 짧은 변이 이보다 작으면 크기 핸들을 숨기고 회전만(§4.6) */
export const TOUCH_MIN_RESIZE_PX = 72
/**
 * 마우스·펜에서 화면 짧은 변이 이보다 작으면 변 중간 핸들을 숨깁니다(잡는 영역 24px의 3배).
 * 잡는 영역이 핸들 중심 기준으로 안쪽 12px까지 들어와, 작은 물건은 몸통이 핸들에 덮여 끌 수 없게 되기 때문입니다.
 */
export const POINTER_MIN_EDGE_ANCHORS_PX = 72
/** 마우스·펜에서 화면 짧은 변이 이보다 작으면 모서리 핸들도 숨기고 회전만(모서리 잡는 영역이 몸통을 다 덮음) */
export const POINTER_MIN_RESIZE_PX = 36
/** 회전 핸들의 잡는 영역이 모서리 핸들의 잡는 영역과 겹치지 않는 거리(잡는 영역 + 4px) */
export const ROTATE_ANCHOR_OFFSET_PX: Readonly<Record<PointerKind, number>> = { mouse: 28, pen: 28, touch: 32 }

const CORNER_ANCHORS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const
const ALL_ANCHORS = [
  'top-left',
  'top-center',
  'top-right',
  'middle-right',
  'middle-left',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const

/**
 * - 0개: 아무 핸들도 없음
 * - 2개 이상(그룹 포함): 크기 조절 없음, 회전만(D17)
 * - 1개·원: 모서리 4개 + 비율 고정. 원은 돌려도 같아서 회전 핸들을 두지 않습니다.
 * - 1개·사각형·다각형: 마우스·펜이면 변 중간 포함 8개(D31), 터치면 모서리 4개
 * - 터치이고 화면 짧은 변이 72px 미만이면 크기 조절 없음(회전만, 원이면 핸들 없음)
 * - 마우스·펜이고 화면 짧은 변이 72px 미만이면 모서리 4개, 36px 미만이면 크기 조절 없음(작은 물건의 몸통을 끌 수 있게)
 */
export function transformerConfig(
  sel: { count: number; singleIsCircle: boolean },
  pointer: PointerKind,
  shortSideScreenPx: number,
): TransformerConfig {
  const common = {
    anchorSize: ANCHOR_SIZE_PX,
    anchorHitPx: ANCHOR_HIT_PX[pointer],
    rotateAnchorOffset: ROTATE_ANCHOR_OFFSET_PX[pointer],
  }
  if (sel.count <= 0) {
    return { ...common, resizeEnabled: false, rotateEnabled: false, keepRatio: false, enabledAnchors: [] }
  }
  if (sel.count >= 2) {
    return { ...common, resizeEnabled: false, rotateEnabled: true, keepRatio: false, enabledAnchors: [] }
  }
  const circle = sel.singleIsCircle
  const rotateEnabled = !circle
  // NaN·음수도 "작다"로 봅니다.
  const minResize = pointer === 'touch' ? TOUCH_MIN_RESIZE_PX : POINTER_MIN_RESIZE_PX
  if (!(shortSideScreenPx >= minResize)) {
    return { ...common, resizeEnabled: false, rotateEnabled, keepRatio: circle, enabledAnchors: [] }
  }
  const cornersOnly = circle || pointer === 'touch' || !(shortSideScreenPx >= POINTER_MIN_EDGE_ANCHORS_PX)
  const anchors = cornersOnly ? CORNER_ANCHORS : ALL_ANCHORS
  return { ...common, resizeEnabled: true, rotateEnabled, keepRatio: circle, enabledAnchors: [...anchors] }
}
