// 그리는 중 버튼(설계 2026-10-12 §3, Plan 4.1): [점 되돌리기] [그리기 완료] [그리기 취소].
// 휴대폰은 하단 툴바(variant 'toolbar'), PC는 캔버스 위 그리기 막대(variant 'bar', 안내 글자 포함)가 같은 컴포넌트를 씁니다.
// 완료 버튼 글자는 「완료」지만 이름은 「그리기 완료」(텐트 모드 [완료] = 편집 끝내기와 구분, 판단 Q14).
import type { JSX } from 'react'
import { useStores, useUi } from '../../app/stores'
import { cancelDrawing, finishDrawing, tentControlsEnabled, undoDrawPoint } from '../../app/tentActions'
import { BackIcon, CheckIcon, TrashIcon } from '../shell/icons'
import { DRAWING_HINT } from './shapeMenu'
import './tentEditor.css'

export function DrawTools(p: { variant: 'toolbar' | 'bar' }): JSX.Element {
  const stores = useStores()
  const count = useUi((s) => s.drawing?.points.length ?? 0)
  const enabled = useUi((s) => tentControlsEnabled(s))
  const toolbar = p.variant === 'toolbar'
  const cls = toolbar ? 'shell-tool' : 'shell-btn'
  const buttons = (
    <>
      <button type="button" className={cls} aria-label="점 되돌리기" disabled={!enabled || count === 0} onClick={() => undoDrawPoint(stores)}>
        {toolbar && <BackIcon size={22} />}
        <span>점 되돌리기</span>
      </button>
      <button type="button" className={cls} aria-label="그리기 완료" disabled={!enabled || count < 3} onClick={() => finishDrawing(stores)}>
        {toolbar && <CheckIcon size={22} />}
        <span>완료</span>
      </button>
      <button type="button" className={cls} aria-label="그리기 취소" onClick={() => cancelDrawing(stores)}>
        {toolbar && <TrashIcon size={22} />}
        <span>그리기 취소</span>
      </button>
    </>
  )
  if (toolbar) return buttons
  return (
    <div className="tf-drawbar" role="toolbar" aria-label="그리기" data-testid="draw-bar">
      <span className="tf-drawbar__hint">{DRAWING_HINT}</span>
      {buttons}
    </div>
  )
}
