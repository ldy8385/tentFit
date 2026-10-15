// 색 견본 8개(COLOR_KEYS 순서 = 시안 obj-1~8, D20) + 「직접 고르기」 색상 선택기(소유자 요청 2026-10-15).
// 텐트 색처럼 고르지 않은 상태(기본 색)가 있으면 맨 앞에 「기본」 견본을 둡니다(onDefault).
// 보이는 견본은 시안 크기, 누름 영역은 44px입니다. 색상 선택기는 손을 뗄 때(change) 한 번만 알려 실행 취소 기록이 한 칸입니다.
import { useEffect, useRef, type JSX } from 'react'
import { colorHex, isHexColor } from '../../core/color'
import { COLOR_KEYS, type Color, type ColorKey } from '../../core/model'

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

export const CUSTOM_COLOR_LABEL = '직접 고르기'
export const DEFAULT_COLOR_LABEL = '기본'

export function ColorSwatches(p: {
  value: Color | undefined
  onChange(color: Color): void
  label?: string
  /** 「기본」 견본을 누르면(고르지 않음 = 기본 색). 있을 때만 「기본」을 그립니다 */
  onDefault?(): void
  /** 「기본」 견본의 모양과 색상 선택기 시작 색 */
  defaultSwatch?: { fill: string; stroke: string; hex: string }
  disabled?: boolean
}): JSX.Element {
  const custom = p.value !== undefined && isHexColor(p.value)
  const startHex = p.value !== undefined ? colorHex(p.value) : (p.defaultSwatch?.hex ?? '#888888')
  const pickerRef = useRef<HTMLInputElement>(null)
  const onChangeRef = useRef(p.onChange)
  useEffect(() => {
    onChangeRef.current = p.onChange
  })

  // React의 onChange는 끄는 동안 계속(input) 오므로, 손을 뗄 때 오는 진짜 change만 받습니다.
  useEffect(() => {
    const el = pickerRef.current
    if (el === null) return
    const onCommit = () => {
      if (isHexColor(el.value)) onChangeRef.current(el.value.toLowerCase())
    }
    el.addEventListener('change', onCommit)
    return () => el.removeEventListener('change', onCommit)
  }, [startHex]) // 시작 색이 바뀌면 입력칸을 새로 만들므로(key) 다시 붙입니다

  return (
    <div className="tf-swatches" role="group" aria-label={p.label ?? '색'}>
      {p.onDefault !== undefined && (
        <button
          type="button"
          className="tf-swatch"
          aria-label={DEFAULT_COLOR_LABEL}
          aria-pressed={p.value === undefined}
          disabled={p.disabled}
          onClick={() => p.onDefault?.()}
        >
          <span
            className="tf-swatch__chip tf-swatch__chip--default"
            style={{ background: p.defaultSwatch?.fill, borderColor: p.defaultSwatch?.stroke }}
          />
        </button>
      )}
      {COLOR_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          className="tf-swatch"
          aria-label={COLOR_LABELS[key]}
          aria-pressed={p.value === key}
          disabled={p.disabled}
          onClick={() => p.onChange(key)}
        >
          <span
            className="tf-swatch__chip"
            style={{ background: `var(--obj-${key}-fill)`, borderColor: `var(--obj-${key})` }}
          />
        </button>
      ))}
      <span className="tf-swatch tf-swatch--custom" data-selected={custom} title={CUSTOM_COLOR_LABEL}>
        <span
          className="tf-swatch__chip tf-swatch__chip--custom"
          style={custom ? { background: `${startHex}3d`, borderColor: startHex } : undefined}
          aria-hidden="true"
        />
        <input
          key={startHex}
          ref={pickerRef}
          type="color"
          className="tf-swatch__picker"
          aria-label={CUSTOM_COLOR_LABEL}
          disabled={p.disabled}
          defaultValue={startHex}
        />
      </span>
    </div>
  )
}
