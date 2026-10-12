// 짧은 알림(「빈 공간이 부족해요」 §4.4-1·§4.4-4). 2.5초 뒤 onDismiss(id). 놓는 자리(툴바·시트 위)는 부모가 정합니다.
// 알림 영역(aria-live="polite")은 늘 그려 두고 글자만 바꿉니다(새로 끼운 영역은 화면 읽기 프로그램이 놓칠 수 있음).
// 같은 문구라도 id가 새로우면 타이머를 다시 셉니다.
import { useEffect, useEffectEvent, type JSX } from 'react'
import './common.css'

/** 토스트가 떠 있는 시간(ms) */
export const TOAST_MS = 2500

export function ToastView(p: { toast: { id: number; text: string } | null; onDismiss(id: number): void }): JSX.Element | null {
  const dismiss = useEffectEvent((id: number) => p.onDismiss(id))
  const id = p.toast?.id

  useEffect(() => {
    if (id === undefined) return
    const timer = window.setTimeout(() => dismiss(id), TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [id])

  return (
    <div className="tf-toast-region" aria-live="polite" aria-atomic="true">
      {p.toast !== null && (
        <div className="tf-toast" data-testid="toast">
          {p.toast.text}
        </div>
      )}
    </div>
  )
}
