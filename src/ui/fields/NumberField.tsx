// 숫자 입력칸(스펙 §4.2 모바일 입력 규칙, §6.9). 문서는 바꾸지 않고 onCommit(대상 id, 값)만 부릅니다.
// onCommit이 오류 문구를 돌려주면(결과가 규칙을 깸, §4.4-8) 칸을 되돌리고 그 문구를 보여 줍니다.
import { useId, type JSX } from 'react'
import './fields.css'
import { INPUT_FONT_PX, checkNumber, flipSignText, formatNumber, stepText } from './numberInput'
import { useDraftField } from './useDraftField'

export type NumberFieldProps = {
  label: string
  unit?: string
  /** 표시값(문서 값) */
  value: number
  /** 포커스 시점에 기억해 커밋할 대상(스펙 §4.2) */
  targetId: string
  min: number
  max: number
  /** 화살표 위·아래로 바꾸는 양(기본 1, Shift면 10배). 글자만 바꾸고 blur·Enter 때 한 번 반영합니다. */
  step?: number
  /** true면 [±] 버튼(iOS 숫자 키패드에 − 없음) */
  allowNegative?: boolean
  /** 반영. 오류 문구를 돌려주면 반영되지 않은 것으로 보고 칸에 보여 줍니다. */
  onCommit(targetId: string, value: number): string | void
  disabled?: boolean
}

export function NumberField(p: NumberFieldProps): JSX.Element {
  const inputId = useId()
  const errorId = useId()
  const field = useDraftField<number>({
    value: p.value,
    targetId: p.targetId,
    disabled: p.disabled,
    format: formatNumber,
    check: (text) => checkNumber(text, p.min, p.max),
    onCommit: p.onCommit,
  })

  const flipSign = () => {
    const next = flipSignText(field.text)
    if (next !== null) field.commitText(next)
  }

  return (
    <div className="tf-field">
      <label className="tf-field__label" htmlFor={inputId}>
        {p.label}
      </label>
      <div className="tf-field__box" data-invalid={field.error !== null} data-disabled={p.disabled === true}>
        <input
          id={inputId}
          className="tf-field__input tf-num"
          type="text"
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          spellCheck={false}
          style={{ fontSize: INPUT_FONT_PX }}
          value={field.text}
          disabled={p.disabled}
          aria-invalid={field.error !== null}
          aria-describedby={field.error !== null ? errorId : undefined}
          onChange={field.onChange}
          onFocus={(e) => {
            field.onFocus()
            e.currentTarget.select()
          }}
          onBlur={field.onBlur}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault()
              const size = (p.step ?? 1) * (e.shiftKey ? 10 : 1)
              const next = stepText(field.text, e.key === 'ArrowUp' ? size : -size, p.min, p.max)
              if (next !== null) field.setText(next)
              return
            }
            field.onKeyDown(e)
          }}
        />
        {p.unit !== undefined && <span className="tf-field__unit">{p.unit}</span>}
        {p.allowNegative === true && (
          <button
            type="button"
            className="tf-field__sign"
            aria-label={`${p.label} 부호 바꾸기`}
            disabled={p.disabled}
            // 입력칸의 포커스(키보드)를 빼앗지 않습니다.
            onMouseDown={(e) => e.preventDefault()}
            onClick={flipSign}
          >
            ±
          </button>
        )}
      </div>
      {field.error !== null && (
        <span id={errorId} className="tf-field__error" role="alert">
          {field.error}
        </span>
      )}
    </div>
  )
}
