// 셸·고르기·만들기 화면에서 쓰는 선 아이콘(24×24, currentColor). 장식이므로 aria-hidden이고, 이름은 버튼의 aria-label이나 글자가 맡습니다.
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

/** 뒤로(‹). 만들기 화면 상단 바 */
export function BackIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m15 5-7 7 7 7" />
    </Svg>
  )
}

/** 앞으로(›). 휴대폰 카드 오른쪽 끝 */
export function ChevronRightIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m9 5 7 7-7 7" />
    </Svg>
  )
}

/** 폴더. 고르기 화면 "내 배치" */
export function FolderIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3.5 7a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
    </Svg>
  )
}

/** 휴지통. 이너 삭제 */
export function TrashIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l.8 11.6a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9L17.5 7M10.5 11v5.5M13.5 11v5.5" />
    </Svg>
  )
}

/** 모양: 사각형 */
export function ShapeRectIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="6" width="17" height="12" rx="1" />
    </Svg>
  )
}

/** 모양: 사다리꼴(뒷변이 짧고 앞변이 아래, §4.8) */
export function ShapeTrapezoidIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7.5 6h9l4 12h-17z" />
    </Svg>
  )
}

/** 모양: 육각형(업체 도면식 가로·세로·윗·아랫변, 윗·아랫변 수평) */
export function ShapeHexagonIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7.5 6h9l5 6-5 6h-9l-5-6z" />
    </Svg>
  )
}

/** 모양: 오각형(전실형) — 사각형 몸통 + 오른쪽만 뾰족 */
export function ShapePentagonIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 6h12l6 6-6 6H3z" />
    </Svg>
  )
}

/** 모양: 정N각형(팔각으로 그려 육각형 예시와 구분, 한 변이 아래 수평, §4.8) */
export function ShapeNgonIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9.5 4h5l5 5v6l-5 5h-5l-5-5V9z" />
    </Svg>
  )
}

/** 모양: 원 */
export function ShapeCircleIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8" />
    </Svg>
  )
}

/** 모양: 자유 다각형(꼭짓점 점 포함) */
export function ShapeFreeIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 18.5 4 8l7.5-4L20 9.5l-3 9z" />
      <circle cx="4" cy="8" r="1.4" fill="currentColor" />
      <circle cx="20" cy="9.5" r="1.4" fill="currentColor" />
      <circle cx="17" cy="18.5" r="1.4" fill="currentColor" />
    </Svg>
  )
}
