// 모바일 선택 시트(스펙 §4.2): 요약 줄(이름 · 치수 · 회전) + [90도][복제][삭제]. 펼치면 상세 속성.
// × = 선택 해제이고 시트도 함께 닫힙니다(D29). 여러 개면 제목이 'N개 선택됨'이고 펼치면 선택 칩·회전 입력입니다.
// [순서]는 Plan 6이 더합니다.
import type { JSX } from 'react'
import { useMemo, useState } from 'react'
import { useDoc, useStores, useUi } from '../../app/stores'
import { formatNumber } from '../fields/numberInput'
import { ItemFields } from '../panels/ItemFields'
import { MultiFields } from '../panels/MultiFields'
import { deleteAndDeselect, duplicateAndSelect, rotateBy90 } from '../panels/commands'
import { dimsText } from '../panels/itemDims'
import { BottomSheet } from './BottomSheet'

export function SelectionSheet(): JSX.Element {
  const stores = useStores()
  const layout = useDoc((s) => s.layout)
  const selection = useUi((s) => s.selection)
  const [expanded, setExpanded] = useState(false)
  const items = useMemo(() => {
    const set = new Set(selection)
    return layout.items.filter((it) => set.has(it.id))
  }, [layout, selection])

  const first = items[0]
  if (first === undefined) return <></>
  const single = items.length === 1
  const ids = items.map((it) => it.id)

  const closeSheet = () => {
    const ui = stores.ui.getState()
    ui.clearSelection()
    ui.patch({ mobileSheet: 'none' })
  }

  return (
    <BottomSheet
      title={single ? first.name : `${items.length}개 선택됨`}
      onClose={closeSheet}
      expanded={expanded}
      onToggleExpand={() => setExpanded((v) => !v)}
      testId="selection-sheet"
    >
      {single && (
        <p className="tf-sheet__summary tf-num">
          {dimsText(first.shape)}cm · 회전 {formatNumber(first.rotation)}°
        </p>
      )}
      <div className="tf-sheet__actions">
        <button type="button" className="tf-sheet__action" onClick={() => rotateBy90(stores, ids)}>
          90도
        </button>
        <button type="button" className="tf-sheet__action" onClick={() => duplicateAndSelect(stores, ids)}>
          복제
        </button>
        <button
          type="button"
          className="tf-sheet__action tf-sheet__action--danger"
          onClick={() => {
            deleteAndDeselect(stores, ids)
            stores.ui.getState().patch({ mobileSheet: 'none' })
          }}
        >
          삭제
        </button>
      </div>
      {expanded && (single ? <ItemFields item={first} compact /> : <MultiFields compact />)}
    </BottomSheet>
  )
}
