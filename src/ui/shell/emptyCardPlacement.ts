// 휴대폰 빈 안내 카드의 자리(스펙 §4.7-10, 보류 Minor #15). 카드가 텐트를 가리지 않게 캔버스 아래쪽(축척 막대 위)에
// 붙이고, 그 자리가 텐트와 겹치면 위쪽(요약 칩·모드 칩 아래)을 봅니다. 둘 다 겹치면 덜 겹치는 쪽(같으면 아래).
// 순수 함수만 둡니다(React·DOM 없음). 좌표는 캔버스 컨테이너 기준 화면 px입니다.
import { outerRing, ringBBox } from '../../core/geom'
import type { Tent } from '../../core/model'
import { worldToScreen, type Insets, type View } from '../../view/viewport'

export type ScreenBox = { left: number; top: number; right: number; bottom: number }
export type CanvasBox = { width: number; height: number; insets: Insets }
export type EmptyCardPlacement = {
  /** 'bottom'이면 offsetPx = 캔버스 아래 끝에서 카드 아래 끝까지, 'top'이면 캔버스 위 끝에서 카드 위 끝까지 */
  anchor: 'bottom' | 'top'
  offsetPx: number
  widthPx: number
  /** 카드 사각형(화면 px) — 테스트·디버깅용 */
  box: ScreenBox
  /** 텐트 화면 사각형과 겹치는 넓이(px²). 0이면 가리지 않음 */
  overlapPx2: number
}

/** 모바일 카드 최대 폭(px). 데스크톱 카드(340px)보다 좁게 */
export const EMPTY_CARD_MAX_WIDTH_PX = 320
/** 카드 좌우 최소 여백(px) */
export const EMPTY_CARD_SIDE_GAP_PX = 16
/**
 * 모바일 카드 높이 어림값(px): 위아래 안쪽 여백 24 + 제목 24 + 본문 두 줄 42 + 버튼 줄 위 여백 12 + 버튼 48.
 * modeShell.css의 .shell-empty--docked 규칙과 맞춥니다.
 */
export const EMPTY_CARD_DOCKED_HEIGHT_PX = 150
/** 아래 붙임: 축척 막대(아래 16px + 높이 24px) 위로 8px 띄움 */
export const EMPTY_CARD_BOTTOM_GAP_PX = 48
/** 위 붙임: 요약 칩 자리(56px)와 모드 칩(62~94px) 아래로 */
export const EMPTY_CARD_TOP_GAP_PX = 104

function overlapArea(a: ScreenBox, b: ScreenBox): number {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left)
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
  return w > 0 && h > 0 ? w * h : 0
}

function nonNegative(v: number): number {
  return Number.isFinite(v) && v > 0 ? v : 0
}

/**
 * 카드 자리. tentScreenBox가 null이면(텐트를 그릴 수 없음) 아래 붙임.
 * cardHeight는 테스트용 덮어쓰기(기본 EMPTY_CARD_DOCKED_HEIGHT_PX).
 */
export function emptyCardPlacement(
  canvas: CanvasBox,
  tentScreenBox: ScreenBox | null,
  cardHeight: number = EMPTY_CARD_DOCKED_HEIGHT_PX,
): EmptyCardPlacement {
  const width = nonNegative(canvas.width)
  const height = nonNegative(canvas.height)
  const insetTop = nonNegative(canvas.insets.top)
  const insetBottom = nonNegative(canvas.insets.bottom)
  const widthPx = Math.max(0, Math.min(EMPTY_CARD_MAX_WIDTH_PX, width - 2 * EMPTY_CARD_SIDE_GAP_PX))
  const left = (width - widthPx) / 2
  const h = nonNegative(cardHeight)

  const bottomOffset = insetBottom + EMPTY_CARD_BOTTOM_GAP_PX
  const bottomBox: ScreenBox = { left, right: left + widthPx, bottom: height - bottomOffset, top: height - bottomOffset - h }
  const topOffset = insetTop + EMPTY_CARD_TOP_GAP_PX
  const topBox: ScreenBox = { left, right: left + widthPx, top: topOffset, bottom: topOffset + h }

  const bottomOverlap = tentScreenBox === null ? 0 : overlapArea(bottomBox, tentScreenBox)
  const bottom: EmptyCardPlacement = { anchor: 'bottom', offsetPx: bottomOffset, widthPx, box: bottomBox, overlapPx2: bottomOverlap }
  if (bottomOverlap === 0 || tentScreenBox === null) return bottom
  const topOverlap = overlapArea(topBox, tentScreenBox)
  // 위 자리가 아래 시트·툴바 쪽으로 넘치면(낮은 화면) 쓰지 않습니다.
  if (topBox.bottom > height - insetBottom) return bottom
  if (topOverlap < bottomOverlap) return { anchor: 'top', offsetPx: topOffset, widthPx, box: topBox, overlapPx2: topOverlap }
  return bottom
}

/** 텐트 외곽 bbox의 화면 사각형(px) */
export function tentScreenBox(tent: Tent, view: View): ScreenBox {
  const b = ringBBox(outerRing(tent))
  const [left, top] = worldToScreen(view, [b.minX, b.minY])
  const [right, bottom] = worldToScreen(view, [b.maxX, b.maxY])
  return { left, top, right, bottom }
}
