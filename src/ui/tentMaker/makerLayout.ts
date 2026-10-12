// 텐트 만들기 화면의 휴대폰 배치 규칙(스펙 §4.2 끝·§4.4-1, Review Focus 5). React와 무관한 순수 함수입니다.
import type { VisualViewportInfo } from '../fields/useVisualViewport'

/** 입력칸에 포커스가 있는 동안의 미리보기 높이(약 140px, §4.2) */
export const PREVIEW_FOCUSED_PX = 140
/** 휴대폰 미리보기 최대 높이(시안 02 Mobile 320px) */
export const PREVIEW_MAX_PX = 320
/** 포커스가 없을 때 미리보기가 차지하는 화면 높이 비율 */
export const PREVIEW_SHARE = 0.38

/**
 * 휴대폰 미리보기 높이. 입력 중이면 140px, 아니면 보이는 높이의 38%를 140~320px로 자른 값.
 * 844px → 320, 667px → 253, 가로 휴대폰 390px → 148(폼과 확정 버튼이 화면 안에 남음).
 */
export function previewHeightFor(viewportHeight: number, inputFocused: boolean): number {
  if (inputFocused) return PREVIEW_FOCUSED_PX
  const h = Math.round(viewportHeight * PREVIEW_SHARE)
  return Math.min(PREVIEW_MAX_PX, Math.max(PREVIEW_FOCUSED_PX, h))
}

/**
 * 화면 키보드가 떠 있으면 오버레이를 보이는 영역(visualViewport)에 맞춥니다. 그래야 폼 스크롤 영역이 키보드 위에서 끝나고
 * scrollIntoView가 포커스 칸을 키보드에 가리지 않는 곳으로 가져옵니다. 키보드가 없으면 null(화면 전체 inset 0).
 */
export function overlayBoxFor(vv: VisualViewportInfo): { top: number; height: number } | null {
  if (vv.keyboardInset <= 0 || vv.height <= 0) return null
  return { top: vv.offsetTop, height: vv.height }
}
