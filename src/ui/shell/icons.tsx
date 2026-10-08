// 셸에서 쓰는 선 아이콘(24×24, currentColor). 장식이므로 aria-hidden이고, 이름은 버튼의 aria-label이 맡습니다.
import type { ReactNode } from 'react'

export type IconProps = { size?: number }

function Svg(p: IconProps & { children: ReactNode }) {
  const size = p.size ?? 20
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {p.children}
    </svg>
  )
}

export function LogoIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M2.5 20h19M12 4 3.5 20M12 4l8.5 16M9.5 20 12 15l2.5 5" />
    </Svg>
  )
}

export function UndoIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </Svg>
  )
}

export function RedoIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
    </Svg>
  )
}

export function MenuIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Svg>
  )
}

export function PlusIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  )
}

export function MinusIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 12h14" />
    </Svg>
  )
}

export function FitIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </Svg>
  )
}

export function PlusSquareIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </Svg>
  )
}

export function PointerIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 3.5 19 10l-6.2 2.1L10.5 18.5z" />
    </Svg>
  )
}

export function CheckIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Svg>
  )
}
