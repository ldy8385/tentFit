// 「비율 유지」 스위치(소유자 요청 2026-10-14, 기본 켬). 캔버스 숫자 입력·패널 가로세로가 함께 따르는 ui.keepRatio를 바꿉니다.
import type { JSX } from 'react'
import { useStores, useUi } from '../../app/stores'

export const KEEP_RATIO_LABEL = '비율 유지'
/** 켰을 때·껐을 때 무엇이 바뀌는지(접근 설명) */
export const KEEP_RATIO_HINT = '켜면 숫자 하나를 바꿔도 모양 그대로 전체 크기가, 끄면 그 변·그 방향만 바뀌어요'

export function KeepRatioToggle(p: { className?: string }): JSX.Element {
  const stores = useStores()
  const on = useUi((s) => s.keepRatio)
  return (
    <label className={`tf-toggle tf-keep-ratio ${p.className ?? ''}`.trim()} title={KEEP_RATIO_HINT}>
      <input type="checkbox" role="switch" checked={on} onChange={(e) => stores.ui.getState().patch({ keepRatio: e.target.checked })} />
      <span>{KEEP_RATIO_LABEL}</span>
    </label>
  )
}
