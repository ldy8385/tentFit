// 물건 색 견본 8개(COLOR_KEYS 순서 = 시안 obj-1~8, D20). 보이는 견본은 시안 크기, 누름 영역은 44px입니다.
import type { JSX } from 'react'
import { COLOR_KEYS, type ColorKey } from '../../core/model'

export const COLOR_LABELS: Record<ColorKey, string> = {
  blue: '파랑',
  teal: '청록',
  green: '초록',
  purple: '보라',
  pink: '분홍',
  gray: '회색',
  sky: '하늘',
  brown: '갈색',
}

export function ColorSwatches(p: { value: ColorKey; onChange(color: ColorKey): void; label?: string }): JSX.Element {
  return (
    <div className="tf-swatches" role="group" aria-label={p.label ?? '색'}>
      {COLOR_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          className="tf-swatch"
          aria-label={COLOR_LABELS[key]}
          aria-pressed={p.value === key}
          onClick={() => p.onChange(key)}
        >
          <span
            className="tf-swatch__chip"
            style={{ background: `var(--obj-${key}-fill)`, borderColor: `var(--obj-${key})` }}
          />
        </button>
      ))}
    </div>
  )
}
