// 내 배치 최소 목록(R2). 고르기 화면 "내 배치"로 엽니다. 맨 위 [+ 새 배치], 행 = 이름 · '수정 HH:MM · 물건 N개'.
// 받은 순서(listLayoutSummaries = updatedAt 내림차순) 그대로 그립니다. 행 옆 ×로 지우기(확인 후, 2026-10-15),
// 목록 아래 [전체 지우기](확인 후, 2026-10-16). 썸네일·복제·이름 변경은 아직 없음.
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
  /** 지우기(없으면 × 없음) */
  onDelete?(id: string): void
  /** 전체 지우기(없거나 배치가 없으면 버튼 없음) */
  onDeleteAll?(): void
}): JSX.Element | null {
  return (
    <Dialog title="내 배치" open={p.open} onClose={p.onClose} testId="my-layouts-dialog">
      <div className="tf-mylayouts">
        <button type="button" className="tf-mylayouts__new" onClick={p.onNew}>
          + 새 배치
        </button>
        <ul className="tf-mylayouts__list">
          {p.summaries.map((s) => (
            <li key={s.id} className="tf-mylayouts__item">
              <LayoutRow summary={s} onOpen={p.onOpen} />
              {p.onDelete !== undefined && (
                <button
                  type="button"
                  className="tf-mylayouts__delete"
                  aria-label={`${s.name} 지우기`}
                  onClick={() => {
                    if (window.confirm(`「${s.name}」을(를) 지울까요? 되돌릴 수 없어요.`)) p.onDelete?.(s.id)
                  }}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
        {p.onDeleteAll !== undefined && p.summaries.length > 0 && (
          <button
            type="button"
            className="tf-mylayouts__delete-all"
            onClick={() => {
              if (window.confirm(`내 배치 ${p.summaries.length}개를 모두 지울까요? 되돌릴 수 없어요.`)) p.onDeleteAll?.()
            }}
          >
            전체 지우기
          </button>
        )}
      </div>
    </Dialog>
  )
}
