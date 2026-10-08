import { useMemo, useState } from 'react'
import { expandSelection } from '../../core/ops/groups'
import { useStats } from '../../app/derived'
import { useDoc, useStores, type Stores } from '../../app/stores'
import { DangerIcon, WarnIcon } from './icons'
import { centerViewOn, warningRows, warningTargetPoint, type WarningRow } from './warningRows'
import './area.css'

/**
 * 경고 행을 눌렀을 때(스펙 §4.6 "항목을 눌렀을 때").
 * - 측정 중: 선택·모드는 그대로 두고 화면만 옮깁니다.
 * - 물건: 텐트 편집이면 배치 모드로 바꾸고, 그 물건(그룹이면 그룹 전체)을 선택한 뒤 화면을 옮깁니다.
 *   모바일(inSheet)은 경고 시트를 닫고 선택 시트로 바꿉니다. 데스크톱은 목록을 그대로 둡니다.
 * - 이너 이탈: Plan 4(텐트 편집) 전까지는 화면만 옮깁니다.
 */
export function focusWarning(stores: Stores, row: WarningRow, mobile: boolean): void {
  const layout = stores.doc.getState().layout
  const ui = stores.ui.getState()
  if (row.kind === 'item' && !ui.measuring && layout.items.some((it) => it.id === row.targetId)) {
    if (ui.mode !== 'place') ui.patch({ mode: 'place' })
    const scope = ui.scopeGroupId
    const inScope = scope !== null && layout.items.some((it) => it.id === row.targetId && it.groupId === scope)
    if (scope !== null && !inScope) ui.patch({ scopeGroupId: null })
    ui.setSelection(expandSelection(layout, [row.targetId], inScope ? scope : undefined))
    if (mobile) ui.patch({ mobileSheet: 'selection' })
  }
  const target = warningTargetPoint(layout, row)
  if (target !== null) {
    const { view, size, insets } = stores.ui.getState()
    stores.ui.getState().setView(centerViewOn(view, size, insets, target))
  }
}

function Legend() {
  const [open, setOpen] = useState(false)
  return (
    <div className="tf-warn__legend">
      <button type="button" className="tf-warn__legend-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        표시 규칙
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <ul className="tf-warn__legend-list">
          <li>
            <span className="tf-warn__sample tf-warn__sample--danger" aria-hidden="true" />
            빗금 + 빨강 실선 테두리 · 텐트 밖으로 나감, 이너 이탈
          </li>
          <li>
            <span className="tf-warn__sample tf-warn__sample--warn" aria-hidden="true" />
            주황 짧은 점선 테두리 · 이너 벽에 걸침
          </li>
          <li>
            <svg className="tf-warn__sample" width="28" height="18" viewBox="0 0 28 18" aria-hidden="true" focusable="false">
              <rect x="1" y="1" width="26" height="16" rx="2" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5" strokeDasharray="6 4" />
            </svg>
            긴 점선 테두리 · 점유 면적에서 뺀 물건
          </li>
          <li className="tf-warn__legend-note">색만으로 구분하지 않고 무늬와 아이콘을 함께 씁니다.</li>
        </ul>
      )}
    </div>
  )
}

/**
 * 경고 목록(스펙 §4.6). 데스크톱은 오른쪽 위 패널 자리(제목 줄 '경고 N건' + ×), 모바일은 BottomSheet 안(inSheet)에 넣습니다.
 * 행 전체가 버튼이고 '이동'은 표시만 합니다. 아래에 접히는 '표시 규칙' 범례가 있습니다.
 */
export function WarningPanel({ inSheet = false }: { inSheet?: boolean }) {
  const stores = useStores()
  const layout = useDoc((s) => s.layout)
  const stats = useStats()
  const rows = useMemo(() => warningRows(layout, stats), [layout, stats])

  return (
    <section className="tf-warn" aria-label="경고 목록">
      {!inSheet && (
        <header className="tf-warn__head">
          <h2 className="tf-warn__title">경고 {rows.length}건</h2>
          <button
            type="button"
            className="tf-warn__close"
            aria-label="경고 목록 닫기"
            onClick={() => stores.ui.getState().patch({ desktopPanel: 'auto' })}
          >
            ×
          </button>
        </header>
      )}
      {rows.length === 0 ? (
        <p className="tf-warn__empty">경고가 없어요</p>
      ) : (
        <ul className="tf-warn__list">
          {rows.map((r) => (
            <li key={r.key}>
              <button
                type="button"
                className={`tf-warn__row tf-warn__row--${r.severity}`}
                data-severity={r.severity}
                onClick={() => focusWarning(stores, r, inSheet)}
              >
                <span className="tf-warn__icon">{r.severity === 'danger' ? <DangerIcon size={18} /> : <WarnIcon size={18} />}</span>
                <span className="tf-warn__text">
                  <span className="tf-warn__rtitle">{r.title}</span>
                  <span className="tf-warn__reason">{r.reason}</span>
                </span>
                <span className="tf-warn__go" aria-hidden="true">
                  이동
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Legend />
    </section>
  )
}
