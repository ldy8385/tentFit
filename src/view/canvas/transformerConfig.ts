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
 * 마우스·펜에서 변 중간 핸들을 두는 최소 화면 길이(잡는 영역 24px의 2배). 축별로 봅니다:
 * 위·아래 가운데 핸들은 화면 높이, 왼쪽·오른쪽 가운데 핸들은 화면 너비. 잡는 영역이 핸들 중심에서 안쪽 12px까지
 * 들어오므로, 이보다 얇은 축에서는 마주 보는 두 핸들이 몸통 가운데를 덮어 끌 수 없게 됩니다.
 */
export const POINTER_MIN_EDGE_ANCHOR_PX = 48
/** 마우스·펜에서 화면 짧은 변이 이보다 작으면 모서리 핸들도 숨기고 회전만(모서리 잡는 영역이 몸통 대부분을 덮음) */
export const POINTER_MIN_RESIZE_PX = 36
/** 회전 핸들의 잡는 영역이 모서리 핸들의 잡는 영역과 겹치지 않는 거리(잡는 영역 + 4px) */
export const ROTATE_ANCHOR_OFFSET_PX: Readonly<Record<PointerKind, number>> = { mouse: 28, pen: 28, touch: 32 }

const CORNER_ANCHORS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const
/** 위·아래 가운데(높이를 바꿈), 왼쪽·오른쪽 가운데(너비를 바꿈) */
const HEIGHT_ANCHORS: ReadonlySet<string> = new Set(['top-center', 'bottom-center'])
const WIDTH_ANCHORS: ReadonlySet<string> = new Set(['middle-left', 'middle-right'])
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
 * - 마우스·펜이고 화면 짧은 변이 36px 미만이면 크기 조절 없음, 변 중간 핸들은 그 축의 화면 길이가 48px 이상일 때만
 *   (작은 물건의 몸통을 끌 수 있게. 낮고 긴 매트는 왼쪽·오른쪽 핸들이 남아 길이만 바꿀 수 있음)
 * screenPx는 물건 로컬 축의 너비·높이(cm)에 배율을 곱한 값입니다(회전과 무관).
 */
export function transformerConfig(
  sel: { count: number; singleIsCircle: boolean },
  pointer: PointerKind,
  screenPx: { w: number; h: number },
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
  // NaN·음수도 "작다"로 봅니다(비교가 false).
  const shortSide = Math.min(screenPx.w, screenPx.h)
  const minResize = pointer === 'touch' ? TOUCH_MIN_RESIZE_PX : POINTER_MIN_RESIZE_PX
  if (!(shortSide >= minResize)) {
    return { ...common, resizeEnabled: false, rotateEnabled, keepRatio: circle, enabledAnchors: [] }
  }
  if (circle || pointer === 'touch') {
    return { ...common, resizeEnabled: true, rotateEnabled, keepRatio: circle, enabledAnchors: [...CORNER_ANCHORS] }
  }
  const tallEnough = screenPx.h >= POINTER_MIN_EDGE_ANCHOR_PX
  const wideEnough = screenPx.w >= POINTER_MIN_EDGE_ANCHOR_PX
  const anchors = ALL_ANCHORS.filter(
    (a) => (!HEIGHT_ANCHORS.has(a) || tallEnough) && (!WIDTH_ANCHORS.has(a) || wideEnough),
  )
  return { ...common, resizeEnabled: true, rotateEnabled, keepRatio: false, enabledAnchors: anchors }
}
