// 배치 이름 칸(상단 바). 이름 변경은 실행 취소 기록 밖입니다(스펙 §8). 목록 드롭다운은 Plan 7.
// 반영: blur·Enter. 빈 이름은 되돌리고, Esc는 고치던 값을 버립니다. 한글 조합 중 Enter는 조합 확정이라 무시합니다.
import { useRef, useState } from 'react'
import { useDoc, useStores } from '../../app/stores'
import './shell.css'

export function LayoutNameField(p: { className?: string }) {
  const stores = useStores()
  const name = useDoc((s) => s.layout.name)
  const [draft, setDraft] = useState<string | null>(null)
  const discard = useRef(false)

  return (
    <input
      className={p.className === undefined ? 'shell-name' : `shell-name ${p.className}`}
      aria-label="배치 이름"
      value={draft ?? name}
      spellCheck={false}
      autoComplete="off"
      enterKeyHint="done"
      onFocus={(e) => {
        discard.current = false
        setDraft(e.currentTarget.value)
      }}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Enter') {
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          discard.current = true
          e.currentTarget.blur()
        }
      }}
      onBlur={(e) => {
        const next = e.currentTarget.value.trim()
        setDraft(null)
        if (discard.current) {
          discard.current = false
          return
        }
        const doc = stores.doc.getState()
        if (next !== '' && next !== doc.layout.name) doc.rename(next)
      }}
    />
  )
}
