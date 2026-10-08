// 이름 입력칸. NumberField와 같은 반영 규칙(blur·Enter, 포커스 시점 대상 id)이고, 빈 이름이면 되돌립니다.
// 사용자가 직접 바꾼 이름에는 번호를 붙이지 않습니다(스펙 §4.7-7).
import { useId, type JSX } from 'react'
import './fields.css'
import { INPUT_FONT_PX, checkText } from './numberInput'
import { useDraftField } from './useDraftField'

const asIs = (v: string) => v

export function TextField(p: {
  label: string
  value: string
  targetId: string
  maxLength?: number
  onCommit(targetId: string, value: string): void
}): JSX.Element {
  const inputId = useId()
  const errorId = useId()
  const field = useDraftField<string>({
    value: p.value,
    targetId: p.targetId,
    format: asIs,
    check: checkText,
    onCommit: p.onCommit,
  })

  return (
    <div className="tf-field">
      <label className="tf-field__label" htmlFor={inputId}>
        {p.label}
      </label>
      <div className="tf-field__box" data-invalid={field.error !== null}>
        <input
          id={inputId}
          className="tf-field__input"
          type="text"
          enterKeyHint="done"
          autoComplete="off"
          maxLength={p.maxLength}
          style={{ fontSize: INPUT_FONT_PX }}
          value={field.text}
          aria-invalid={field.error !== null}
          aria-describedby={field.error !== null ? errorId : undefined}
          onChange={field.onChange}
          onFocus={field.onFocus}
          onBlur={field.onBlur}
          onKeyDown={field.onKeyDown}
        />
      </div>
      {field.error !== null && (
        <span id={errorId} className="tf-field__error" role="alert">
          {field.error}
        </span>
      )}
    </div>
  )
}
