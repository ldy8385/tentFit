// 여러 개 선택 패널(스펙 §4.5): 회전 입력과 [90도](피벗 = 선택 전체 월드 바운딩 박스 중심), 선택 목록(누르면 선택에서 뺌).
// 크기 입력은 두지 않습니다(D17). [그룹 만들기]·순서 버튼은 Plan 6이 더합니다.
import type { JSX } from 'react'
import { useMemo } from 'react'
import { useDoc, useStores, useUi } from '../../app/stores'
import { expandSelection } from '../../core/ops/groups'
import { NumberField } from '../fields/NumberField'
import { deleteAndDeselect, duplicateAndSelect, rotateBy90, setRotation } from './commands'
import { dimsText } from './itemDims'
import './panels.css'

/** 입력칸 대상 id에 선택 id 목록을 담는 구분자(uuid에는 쉼표가 없음) */
const ID_SEP = ','

/** compact: 모바일 선택 시트 펼침용. [90도]·[복제]·[삭제]는 시트 요약 줄에 있으므로 뺍니다. 목록은 칩 모양입니다. */
export function MultiFields(p: { compact?: boolean } = {}): JSX.Element {
  const stores = useStores()
  const layout = useDoc((s) => s.layout)
  const selection = useUi((s) => s.selection)
  const compact = p.compact === true
  const items = useMemo(() => {
    const set = new Set(selection)
    return layout.items.filter((it) => set.has(it.id))
  }, [layout, selection])

  const ref = items[0]
  if (ref === undefined) return <></>
  const ids = items.map((it) => it.id)
  const mixed = items.some((it) => it.rotation !== ref.rotation)

  const removeFromSelection = (id: string) => {
    const ui = stores.ui.getState()
    const drop = new Set(expandSelection(stores.doc.getState().layout, [id], ui.scopeGroupId ?? undefined))
    drop.add(id)
    ui.setSelection(ui.selection.filter((x) => !drop.has(x)))
  }

  return (
    <div className="tf-multi" data-compact={compact}>
      <div className="tf-rotate-row" data-compact={compact}>
        <NumberField
          label="회전"
          unit="°"
          value={ref.rotation}
          targetId={ids.join(ID_SEP)}
          min={Number.NEGATIVE_INFINITY}
          max={Number.POSITIVE_INFINITY}
          onCommit={(target, deg) => setRotation(stores, target.split(ID_SEP), deg)}
        />
        {!compact && (
          <button type="button" className="tf-btn" onClick={() => rotateBy90(stores, ids)}>
            90도
          </button>
        )}
      </div>
      {mixed && <p className="tf-hint">각도가 다른 물건이 섞여 있어요. 첫 물건({ref.name}) 기준으로 함께 돌려요.</p>}

      <ul className="tf-multi__list" aria-label="선택한 물건 목록">
        {items.map((it) => (
          <li key={it.id}>
            <button
              type="button"
              className="tf-multi__row"
              aria-label={`${it.name} 선택에서 빼기`}
              onClick={() => removeFromSelection(it.id)}
            >
              <span
                className="tf-multi__chip"
                style={{ background: `var(--obj-${it.color}-fill)`, borderColor: `var(--obj-${it.color})` }}
              />
              <span className="tf-multi__name">{it.name}</span>
              <span className="tf-multi__dims tf-num">{dimsText(it.shape)}</span>
              <span className="tf-multi__check" aria-hidden="true">
                ✓
              </span>
            </button>
          </li>
        ))}
      </ul>

      {!compact && (
        <div className="tf-row2">
          <button type="button" className="tf-btn" onClick={() => duplicateAndSelect(stores, ids)}>
            복제
          </button>
          <button type="button" className="tf-btn tf-btn--danger" onClick={() => deleteAndDeselect(stores, ids)}>
            삭제
          </button>
        </div>
      )}
    </div>
  )
}
