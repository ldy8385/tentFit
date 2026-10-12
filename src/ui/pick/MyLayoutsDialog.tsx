// 내 배치 최소 목록(R2). 고르기 화면 "내 배치"로 엽니다. 맨 위 [+ 새 배치], 행 = 이름 · '수정 HH:MM · 물건 N개'.
// 받은 순서(listLayoutSummaries = updatedAt 내림차순) 그대로 그립니다. 썸네일·복제·이름 변경·삭제·"열림" 배지는 Plan 7.
import { useId, type JSX } from 'react'
import type { LayoutSummary } from '../../app/layoutRepo'
import { Dialog } from '../common/Dialog'
import { layoutMetaText } from './pickSections'
import './pick.css'

function LayoutRow(p: { summary: LayoutSummary; onOpen(id: string): void }): JSX.Element {
  const nameId = useId()
  const metaId = useId()
  return (
    <button
      type="button"
      className="tf-mylayouts__row"
      aria-labelledby={nameId}
      aria-describedby={metaId}
      data-layout-id={p.summary.id}
      onClick={() => p.onOpen(p.summary.id)}
    >
      <span id={nameId} className="tf-mylayouts__name">
        {p.summary.name}
      </span>
      <span id={metaId} className="tf-mylayouts__meta">
        {layoutMetaText(p.summary)}
      </span>
    </button>
  )
}

export function MyLayoutsDialog(p: {
  open: boolean
  summaries: readonly LayoutSummary[]
  onOpen(id: string): void
  onNew(): void
  onClose(): void
}): JSX.Element | null {
  return (
    <Dialog title="내 배치" open={p.open} onClose={p.onClose} testId="my-layouts-dialog">
      <div className="tf-mylayouts">
        <button type="button" className="tf-mylayouts__new" onClick={p.onNew}>
          + 새 배치
        </button>
        <ul className="tf-mylayouts__list">
          {p.summaries.map((s) => (
            <li key={s.id}>
              <LayoutRow summary={s} onOpen={p.onOpen} />
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  )
}
