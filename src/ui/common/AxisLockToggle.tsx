// 휴대폰 「상하좌우로만 이동」 토글(소유자 요청). PC는 끄는 동안 Shift를 누르면 같은 동작이라 PC 패널에는 두지 않습니다.
// 켜 두면 물건·이너·꼭짓점 끌기는 가로·세로 한 축으로만, 자유 그리기 점은 0·90°로만 맞춥니다(ui.axisLock).
import type { JSX } from 'react'
import { useStores, useUi } from '../../app/stores'

export const AXIS_LOCK_LABEL = '상하좌우로만 이동'

export function AxisLockToggle(p: { className: string }): JSX.Element {
  const stores = useStores()
  const on = useUi((s) => s.axisLock)
  return (
    <button
      type="button"
      className={p.className}
      aria-label={AXIS_LOCK_LABEL}
      aria-pressed={on}
      onClick={() => stores.ui.getState().patch({ axisLock: !stores.ui.getState().axisLock })}
    >
      상하좌우
    </button>
  )
}
