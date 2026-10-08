// NumberField·TextField 공용 반영 규칙(스펙 §4.2 "값 반영").
// - 반영 시점은 blur, Enter, change(입력 중에는 글자만 바꾸고 문서는 그대로).
// - 포커스를 받을 때 대상 id를 기억하고, 반영할 때 그 id에 씁니다. 그래서 다른 물건을 탭해 선택이 바뀐 뒤 blur돼도
//   값이 엉뚱한 물건에 들어가지 않습니다(Review Focus 2).
// - 검사에 실패하면 마지막 유효값(= 지금 문서 값)으로 되돌리고 오류를 ERROR_MS 동안 보여 줍니다.
// - 반영한 뒤 글자는 문서 값(반올림된 값)을 따릅니다.
import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { ERROR_MS, type Checked } from './numberInput'

export type DraftFieldOptions<T> = {
  value: T
  targetId: string
  disabled?: boolean
  format(v: T): string
  check(text: string): Checked<T>
  onCommit(targetId: string, value: T): void
}

export type DraftField = {
  /** 입력칸에 보일 글자: 고치는 중이면 그 글자, 아니면 문서 값 */
  text: string
  error: string | null
  /** 글자를 검사해 반영합니다(±·화살표처럼 바로 반영하는 버튼용). 대상은 포커스 때 기억한 id, 없으면 지금 targetId */
  commitText(text: string): void
  onChange(e: ChangeEvent<HTMLInputElement>): void
  onFocus(): void
  onBlur(): void
  onKeyDown(e: KeyboardEvent<HTMLInputElement>): void
}

/** 한글 조합 중 Enter(조합 확정)는 반영 키로 보지 않습니다. Safari는 keyCode 229로만 알려 주기도 합니다. */
function isComposingKey(e: KeyboardEvent<HTMLInputElement>): boolean {
  return e.nativeEvent.isComposing || e.key === 'Process' || e.keyCode === 229
}

export function useDraftField<T>(opts: DraftFieldOptions<T>): DraftField {
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
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
    if (opts.disabled) return
    const r = opts.check(text)
    if (!r.ok) {
      showError(r.error)
      return
    }
    showError(null)
    opts.onCommit(focusTarget.current ?? opts.targetId, r.value)
  }

  return {
    text: draft ?? opts.format(opts.value),
    error,
    commitText,
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
