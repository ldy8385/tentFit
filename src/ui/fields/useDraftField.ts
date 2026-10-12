// NumberField·TextField 공용 반영 규칙(스펙 §4.2 "값 반영", §4.4-8·§6.9).
// - 반영 시점은 blur, Enter, change(입력 중에는 글자만 바꾸고 문서는 그대로).
//   화살표 ↑↓도 글자만 바꾸고 blur·Enter 때 한 번 반영합니다(누를 때마다 기록이 쌓이지 않게, 보류 Minor #11).
// - 포커스를 받을 때 대상 id를 기억하고, 반영할 때 그 id에 씁니다. 그래서 다른 물건을 탭해 선택이 바뀐 뒤 blur돼도
//   값이 엉뚱한 물건에 들어가지 않습니다(Review Focus 2).
// - 검사에 실패하거나 onCommit이 오류 문구를 돌려주면(결과 도형이 규칙을 깸) 마지막 유효값(= 지금 문서 값)으로
//   되돌리고 오류를 ERROR_MS 동안 보여 줍니다.
// - 오류는 그 오류가 난 대상의 칸에만 보입니다. 대상이 바뀌면(다른 물건·이너를 고름) 새 대상의 칸에는 뜨지 않습니다(보류 Minor #12).
// - 반영한 뒤 글자는 문서 값(반올림된 값)을 따릅니다.
import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { ERROR_MS, type Checked } from './numberInput'

export type DraftFieldOptions<T> = {
  value: T
  targetId: string
  disabled?: boolean
  format(v: T): string
  check(text: string): Checked<T>
  /** 반영. 오류 문구(문자열)를 돌려주면 반영되지 않은 것으로 보고 칸을 되돌린 뒤 그 문구를 보여 줍니다. */
  onCommit(targetId: string, value: T): string | void
}

export type DraftField = {
  /** 입력칸에 보일 글자: 고치는 중이면 그 글자, 아니면 문서 값 */
  text: string
  /** 지금 대상의 오류 문구(다른 대상에서 난 오류는 null) */
  error: string | null
  /** 글자를 검사해 반영합니다(±처럼 바로 반영하는 버튼용). 대상은 포커스 때 기억한 id, 없으면 지금 targetId */
  commitText(text: string): void
  /** 글자만 바꿉니다(반영은 blur·Enter 때). 화살표 ↑↓용 */
  setText(text: string): void
  onChange(e: ChangeEvent<HTMLInputElement>): void
  onFocus(): void
  onBlur(): void
  onKeyDown(e: KeyboardEvent<HTMLInputElement>): void
}

/** 한글 조합 중 Enter(조합 확정)는 반영 키로 보지 않습니다. Safari는 keyCode 229로만 알려 주기도 합니다. */
function isComposingKey(e: KeyboardEvent<HTMLInputElement>): boolean {
  return e.nativeEvent.isComposing || e.key === 'Process' || e.keyCode === 229
}

type FieldError = { targetId: string; message: string }

export function useDraftField<T>(opts: DraftFieldOptions<T>): DraftField {
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<FieldError | null>(null)
  /** 포커스 시점의 대상 id. 포커스가 없으면 null */
  const focusTarget = useRef<string | null>(null)
  /** Esc로 취소한 직후의 blur는 반영하지 않습니다. */
  const skipBlurCommit = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const t = timer
    return () => {
      if (t.current !== null) clearTimeout(t.current)
    }
  }, [])

  const showError = (next: FieldError | null) => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
    setError(next)
    if (next !== null) {
      timer.current = setTimeout(() => {
        timer.current = null
        setError(null)
      }, ERROR_MS)
    }
  }

  const commitText = (text: string) => {
    setDraft(null)
    if (opts.disabled) return
    const targetId = focusTarget.current ?? opts.targetId
    const r = opts.check(text)
    if (!r.ok) {
      showError({ targetId, message: r.error })
      return
    }
    const rejected = opts.onCommit(targetId, r.value)
    showError(typeof rejected === 'string' ? { targetId, message: rejected } : null)
  }

  return {
    text: draft ?? opts.format(opts.value),
    error: error !== null && error.targetId === opts.targetId ? error.message : null,
    commitText,
    setText: (text) => setDraft(text),
    onChange: (e) => setDraft(e.target.value),
    onFocus: () => {
      focusTarget.current = opts.targetId
      skipBlurCommit.current = false
    },
    onBlur: () => {
      const skip = skipBlurCommit.current
      skipBlurCommit.current = false
      if (!skip && draft !== null) commitText(draft)
      else setDraft(null)
      focusTarget.current = null
    },
    onKeyDown: (e) => {
      if (e.key === 'Enter' && !isComposingKey(e)) {
        e.preventDefault()
        if (draft !== null) commitText(draft)
      } else if (e.key === 'Escape') {
        // 고치던 글자를 버리고 포커스를 놓습니다. 이벤트는 막지 않아 Esc 단축키(선택 해제)도 그대로 동작합니다(§4.5).
        skipBlurCommit.current = true
        setDraft(null)
        e.currentTarget.blur()
      }
    },
  }
}
