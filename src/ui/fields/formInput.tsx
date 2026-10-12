// 폼 입력칸 공용(스펙 §4.2, Plan 3 교훈 6). 문서가 아니라 폼 상태를 바꾸는 화면(새 도형 폼, 텐트 만들기 화면)이 씁니다.
// - formEnterKeyDown: 폼 안 Enter 규칙 한 곳. 입력칸 Enter = 다음 칸(마지막 칸이면 blur), 한글 조합 Enter는 이동 없음,
//   select·체크박스 Enter는 제출하지 않음. 버튼의 Enter는 그대로(명시적 확정).
// - FormInput: 입력할 때마다 검사 결과를 보여 주는 칸(새 도형 폼).
// - useFormDraft·FormNumberInput·FormTextInput: blur·Enter 때만 검사하는 칸(텐트 만들기 화면, 보류 Minor #17 교훈).
//   범위 밖이면 마지막 유효값으로 되돌리고 칸 아래 오류를 ERROR_MS 동안 보여 줍니다.
import { useEffect, useId, useRef, useState, type ChangeEvent, type JSX, type KeyboardEvent } from 'react'
import './fields.css'
import { ERROR_MS, INPUT_FONT_PX, checkNumber, checkText, flipSignText, formatNumber, type Checked } from './numberInput'

/** 한글 조합을 끝내는 Enter. Safari는 key 'Process'나 keyCode 229로만 알려 주기도 합니다. */
export function isComposingKey(e: KeyboardEvent<Element>): boolean {
  return e.nativeEvent.isComposing || e.key === 'Process' || e.keyCode === 229
}

/** 컨테이너 안에서 Enter로 오가는 입력칸(글자 입력칸, 비활성 제외) — 문서 순서 */
export function textFieldsIn(container: ParentNode): HTMLInputElement[] {
  return [...container.querySelectorAll<HTMLInputElement>('input[type="text"]:not(:disabled)')]
}

/**
 * 폼 Enter 규칙. 폼(또는 폼 역할의 컨테이너)의 onKeyDown에 그대로 넘깁니다.
 * 입력칸이면 기본 동작(암시적 제출)을 막고 다음 입력칸으로, 마지막 칸이면 포커스를 풀어 키보드를 내립니다.
 * 한글 조합을 끝내는 Enter는 칸을 옮기지 않습니다. select·체크박스의 Enter도 제출하지 않습니다.
 */
export function formEnterKeyDown(e: KeyboardEvent<HTMLElement>): void {
  if (e.key !== 'Enter') return
  const target = e.target
  if (target instanceof HTMLSelectElement) {
    e.preventDefault()
    return
  }
  if (!(target instanceof HTMLInputElement)) return
  e.preventDefault()
  if (target.type !== 'text') return
  if (isComposingKey(e)) return
  const fields = textFieldsIn(e.currentTarget)
  const next = fields[fields.indexOf(target) + 1]
  if (next === undefined) target.blur()
  else next.focus()
}

/**
 * 휴대폰 키보드의 Enter 표시: 컨테이너의 마지막 입력칸은 'done', 나머지는 'next'.
 * 칸 구성이 바뀌는 폼(모양·이너 수에 따라 칸이 달라짐)에서 그릴 때마다 부릅니다.
 */
export function syncEnterKeyHints(container: ParentNode): void {
  const fields = textFieldsIn(container)
  fields.forEach((el, i) => {
    const hint = i === fields.length - 1 ? 'done' : 'next'
    if (el.getAttribute('enterkeyhint') !== hint) el.setAttribute('enterkeyhint', hint)
  })
}

/**
 * 폼 안의 입력칸(새 도형 폼). 모양과 문구는 NumberField·TextField(`tf-field`, checkNumber·checkText 문구)와 같고,
 * 문서가 아니라 폼 값을 바꾸므로 입력할 때마다 검사해 오류를 바로 보여 줍니다.
 */
export function FormInput(p: {
  label: string
  value: string
  onChange(v: string): void
  check: Checked<unknown>
  unit?: string
  numeric?: boolean
  maxLength?: number
  /** 마지막 입력칸이면 'done', 아니면 'next'(휴대폰 키보드의 Enter 표시) */
  last?: boolean
}): JSX.Element {
  const id = useId()
  const errorId = useId()
  const invalid = !p.check.ok
  return (
    <div className="tf-field">
      <label className="tf-field__label" htmlFor={id}>
        {p.label}
      </label>
      <div className="tf-field__box" data-invalid={invalid}>
        <input
          id={id}
          className={p.numeric === true ? 'tf-field__input tf-num' : 'tf-field__input'}
          type="text"
          inputMode={p.numeric === true ? 'decimal' : undefined}
          enterKeyHint={p.last === true ? 'done' : 'next'}
          autoComplete="off"
          spellCheck={false}
          maxLength={p.maxLength}
          style={{ fontSize: INPUT_FONT_PX }}
          value={p.value}
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
          onChange={(e) => p.onChange(e.target.value)}
        />
        {p.unit !== undefined && <span className="tf-field__unit">{p.unit}</span>}
      </div>
      {!p.check.ok && (
        <span id={errorId} className="tf-field__error" role="alert">
          {p.check.error}
        </span>
      )}
    </div>
  )
}

export type FormDraftOptions<T> = {
  /** 지금 폼 값(마지막 유효값) */
  value: T
  format(v: T): string
  check(text: string): Checked<T>
  /** 검사를 통과한 값을 반영. 문자열을 돌려주면 그 문구를 오류로 보여 주고 칸은 폼 값으로 되돌립니다(반영 안 됨). */
  onCommit(v: T): string | void
  disabled?: boolean
}

export type FormDraft = {
  /** 칸에 보일 글자: 고치는 중이면 그 글자, 아니면 폼 값 */
  text: string
  error: string | null
  /** 글자를 검사해 바로 반영([±] 버튼용) */
  commitText(text: string): void
  onChange(e: ChangeEvent<HTMLInputElement>): void
  onBlur(): void
  onKeyDown(e: KeyboardEvent<HTMLInputElement>): void
}

/**
 * blur·Enter 때만 검사하는 폼 칸 상태. 입력하는 동안에는 글자만 바꾸고 오류를 읽어 주지 않습니다.
 * Enter는 여기서 한 번 반영하고, 칸 이동은 컨테이너의 formEnterKeyDown이 합니다(이동으로 생기는 blur는 다시 반영하지 않음).
 * Esc는 고치던 글자를 버리고 포커스를 놓습니다.
 */
export function useFormDraft<T>(o: FormDraftOptions<T>): FormDraft {
  const [draft, setDraftState] = useState<string | null>(null)
  const draftRef = useRef<string | null>(null)
  const skipBlur = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const t = timer
    return () => {
      if (t.current !== null) clearTimeout(t.current)
    }
  }, [])

  const setDraft = (v: string | null) => {
    draftRef.current = v
    setDraftState(v)
  }

  const showError = (message: string | null) => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
    setError(message)
    if (message !== null) {
      timer.current = setTimeout(() => {
        timer.current = null
        setError(null)
      }, ERROR_MS)
    }
  }

  const commitText = (text: string) => {
    setDraft(null)
    if (o.disabled === true) return
    const r = o.check(text)
    if (!r.ok) {
      showError(r.error)
      return
    }
    const rejected = o.onCommit(r.value)
    showError(typeof rejected === 'string' ? rejected : null)
  }

  return {
    text: draft ?? o.format(o.value),
    error,
    commitText,
    onChange: (e) => setDraft(e.target.value),
    onBlur: () => {
      const skip = skipBlur.current
      skipBlur.current = false
      const pending = draftRef.current
      if (!skip && pending !== null) commitText(pending)
      else setDraft(null)
    },
    onKeyDown: (e) => {
      if (e.key === 'Enter' && !isComposingKey(e)) {
        e.preventDefault()
        const pending = draftRef.current
        if (pending !== null) commitText(pending)
      } else if (e.key === 'Escape') {
        skipBlur.current = true
        setDraft(null)
        e.currentTarget.blur()
      }
    },
  }
}

/** 정수 검사(정N각형 변 수). 범위 문구는 checkNumber와 같고, 소수면 '정수로 입력해 주세요'. */
export function checkInteger(text: string, min: number, max: number): Checked<number> {
  const r = checkNumber(text, min, max)
  if (!r.ok) return r
  if (!Number.isInteger(r.value)) return { ok: false, error: '정수로 입력해 주세요' }
  return r
}

/** 폼 숫자 칸: blur·Enter 때 검사, 범위 밖이면 되돌림 + 오류. allowNegative면 [±](iOS 숫자 키패드에 − 없음). */
export function FormNumberInput(p: {
  label: string
  value: number
  min: number
  max: number
  onCommit(v: number): string | void
  unit?: string
  allowNegative?: boolean
  /** 정수만(정N각형 변 수) */
  integer?: boolean
  disabled?: boolean
  /** 보이는 라벨과 다른 접근 이름(여러 카드에 같은 라벨이 있을 때, 예: '이너 1 폭') */
  ariaLabel?: string
}): JSX.Element {
  const id = useId()
  const errorId = useId()
  const field = useFormDraft<number>({
    value: p.value,
    format: formatNumber,
    check: (text) => (p.integer === true ? checkInteger(text, p.min, p.max) : checkNumber(text, p.min, p.max)),
    onCommit: p.onCommit,
    disabled: p.disabled,
  })
  const invalid = field.error !== null
  return (
    <div className="tf-field">
      {p.ariaLabel === undefined ? (
        <label className="tf-field__label" htmlFor={id}>
          {p.label}
        </label>
      ) : (
        // 접근 이름은 ariaLabel 하나만(같은 라벨 '폭'이 여러 카드에 있어도 이름이 겹치지 않게)
        <span className="tf-field__label" aria-hidden="true">
          {p.label}
        </span>
      )}
      <div className="tf-field__box" data-invalid={invalid} data-disabled={p.disabled === true}>
        <input
          id={id}
          className="tf-field__input tf-num"
          type="text"
          inputMode={p.integer === true ? 'numeric' : 'decimal'}
          autoComplete="off"
          spellCheck={false}
          style={{ fontSize: INPUT_FONT_PX }}
          value={field.text}
          disabled={p.disabled}
          aria-label={p.ariaLabel}
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
          onChange={field.onChange}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={field.onBlur}
          onKeyDown={field.onKeyDown}
        />
        {p.unit !== undefined && <span className="tf-field__unit">{p.unit}</span>}
        {p.allowNegative === true && (
          <button
            type="button"
            className="tf-field__sign"
            aria-label={`${p.ariaLabel ?? p.label} 부호 바꾸기`}
            disabled={p.disabled}
            // 입력칸의 포커스(키보드)를 빼앗지 않습니다.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const next = flipSignText(field.text)
              if (next !== null) field.commitText(next)
            }}
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

const asIs = (v: string) => v

/** 폼 이름 칸: blur·Enter 때 앞뒤 공백을 떼고 반영, 비면 되돌림 + '비워 둘 수 없어요'. */
export function FormTextInput(p: {
  label: string
  value: string
  onCommit(v: string): void
  maxLength?: number
  disabled?: boolean
}): JSX.Element {
  const id = useId()
  const errorId = useId()
  const field = useFormDraft<string>({ value: p.value, format: asIs, check: checkText, onCommit: p.onCommit, disabled: p.disabled })
  const invalid = field.error !== null
  return (
    <div className="tf-field">
      <label className="tf-field__label" htmlFor={id}>
        {p.label}
      </label>
      <div className="tf-field__box" data-invalid={invalid} data-disabled={p.disabled === true}>
        <input
          id={id}
          className="tf-field__input"
          type="text"
          autoComplete="off"
          spellCheck={false}
          maxLength={p.maxLength}
          style={{ fontSize: INPUT_FONT_PX }}
          value={field.text}
          disabled={p.disabled}
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
          onChange={field.onChange}
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
