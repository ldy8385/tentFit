// 색·간격·글꼴 토큰의 TS 사본(스펙 §4 시각 토큰). Konva는 CSS 변수를 못 읽으므로 캔버스 색은 여기서 가져갑니다.
// 값은 src/ui/tokens.css의 :root와 같아야 합니다(theme.test.ts가 파일을 읽어 비교). 키는 CSS 변수 이름에서 '--'를 뺀 것입니다.
import type { ColorKey } from '../core/model'

const FONT_STACK = '"Pretendard", -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif'

export const THEME: Readonly<Record<string, string>> = Object.freeze({
  'bg-app': '#F6F5F1',
  'bg-surface': '#FFFFFF',
  'bg-subtle': '#EFEEE8',
  'bg-sunken': '#E8E7E0',
  border: '#E3E1D9',
  'border-strong': '#C6C3B8',
  'text-primary': '#1B1E1A',
  'text-secondary': '#5C6159',
  'text-tertiary': '#8E9389',
  'text-inverse': '#FFFFFF',
  accent: '#36704A',
  'accent-hover': '#2B5C3C',
  'accent-soft': '#E7F0E8',
  'accent-border': '#B7D2BD',
  sand: '#B99A57',
  'sand-soft': '#F6F0E2',
  danger: '#C62F23',
  'danger-soft': '#FBEAE8',
  warn: '#D4790F',
  'warn-soft': '#FBF0E2',
  info: '#2E6E8E',
  'canvas-bg': '#FBFAF6',
  'grid-fine': '#E8E6DC',
  'grid-mid': '#D4D1C3',
  'grid-strong': '#BBB7A6',
  'tent-outline': '#23261F',
  'inner-stroke': '#2E6E8E',
  'inner-fill': '#2E6E8E1F',
  'vest-fill': '#B99A5726',
  'vest-stroke': '#B99A5799',
  select: '#1F6FEB',
  'obj-blue': '#4A7FD0',
  'obj-teal': '#159C92',
  'obj-green': '#6F9636',
  'obj-purple': '#8A6AD4',
  'obj-pink': '#C2559E',
  'obj-gray': '#5B7386',
  'obj-sky': '#2BA3C7',
  'obj-brown': '#9A8449',
  'font-sans': FONT_STACK,
  'font-num': FONT_STACK,
  'sp-1': '4px',
  'sp-2': '8px',
  'sp-3': '12px',
  'sp-4': '16px',
  'sp-5': '24px',
  'sp-6': '32px',
  'sp-7': '48px',
  'r-sm': '6px',
  'r-md': '10px',
  'r-lg': '16px',
  'r-full': '999px',
  'obj-blue-fill': '#4A7FD03D',
  'obj-teal-fill': '#159C923D',
  'obj-green-fill': '#6F96363D',
  'obj-purple-fill': '#8A6AD43D',
  'obj-pink-fill': '#C2559E3D',
  'obj-gray-fill': '#5B73863D',
  'obj-sky-fill': '#2BA3C73D',
  'obj-brown-fill': '#9A84493D',
})

/** 물건 색(테두리 = obj-<키>, 채움 = obj-<키>-fill, 24% 불투명). */
export function objColor(key: ColorKey): { stroke: string; fill: string } {
  return { stroke: THEME[`obj-${key}`] ?? '', fill: THEME[`obj-${key}-fill`] ?? '' }
}

/**
 * 토큰 값 하나. 이름은 'bg-app'처럼 '--' 없이 씁니다('--bg-app'도 받음).
 * 브라우저에서는 문서에 적용된 값(getComputedStyle)을, 그 밖(node 테스트)이나 값이 비어 있으면 THEME 값을 돌려줍니다.
 * 없는 이름은 ''입니다.
 */
export function cssVar(name: string): string {
  const key = name.startsWith('--') ? name.slice(2) : name
  if (typeof document !== 'undefined' && typeof getComputedStyle === 'function') {
    const live = getComputedStyle(document.documentElement).getPropertyValue(`--${key}`).trim()
    if (live !== '') return live
  }
  return THEME[key] ?? ''
}
