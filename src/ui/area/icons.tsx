// 경고 아이콘(색만으로 구분하지 않도록 모양이 다름, 스펙 §4.6). 이모지 ⚠는 iOS에서 컬러 그림으로 바뀌어 쓰지 않습니다.
export function DangerIcon(p: { size?: number }) {
  const s = p.size ?? 16
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}

export function WarnIcon(p: { size?: number }) {
  const s = p.size ?? 16
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true" focusable="false">
      <rect x="4" y="4" width="16" height="16" rx="2" strokeDasharray="3 3" />
    </svg>
  )
}
