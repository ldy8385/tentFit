// 색 값(소유자 요청 2026-10-15: 텐트·물건 색을 색상 선택기로 직접). 8색 키(COLOR_KEYS) 또는 '#RRGGBB'.
// 키의 대표 색은 디자인 시안 tokens.css의 obj-<키> 라이트 값입니다(썸네일·PNG처럼 CSS 변수를 못 쓰는 곳이 씀).
import { HEX_COLOR_RE, type Color, type ColorKey } from './model'

export const KEY_HEX: Record<ColorKey, string> = {
  blue: '#4A7FD0',
  teal: '#159C92',
  green: '#6F9636',
  purple: '#8A6AD4',
  pink: '#C2559E',
  gray: '#5B7386',
  sky: '#2BA3C7',
  brown: '#9A8449',
}

/** '#RRGGBB'인지 */
export function isHexColor(c: string): boolean {
  return HEX_COLOR_RE.test(c)
}

/** 색 → '#rrggbb'(소문자). 키는 대표 색, 모르는 값(손상 데이터)은 gray */
export function colorHex(c: Color | string): string {
  if (isHexColor(c)) return c.toLowerCase()
  const hex = Object.prototype.hasOwnProperty.call(KEY_HEX, c) ? KEY_HEX[c as ColorKey] : KEY_HEX.gray
  return hex.toLowerCase()
}
