import { useMemo, useState } from 'react'
import type { ItemPreset } from '../../core/model'
import { addPresetItem } from '../../app/actions'
import { deleteMyItem, useMyItems } from '../../app/persist/storage'
import { useItemPresets } from '../../app/presets'
import { useStores, useUi } from '../../app/stores'
import { CategoryChips } from './CategoryChips'
import { BrandSelect } from './BrandSelect'
import { emptyLibraryText, filterByBrand, filterByCategory, isMine, rowMeta, sortByName, type CategoryFilter } from './libraryUtils'
import { ShapeSwatch } from './ShapeSwatch'
import './library.css'

/**
 * PC 왼쪽 라이브러리(스펙 §4.1). [내 도형] 탭은 Plan 7에서 붙이므로 지금은 탭 줄 없이 기본 프리셋만 보여 줍니다.
 * 항목 클릭 = 화면 가운데에 놓고 선택(D35). 텐트 편집·측정 중에는 흐리게 하고 막습니다(§4.3).
 */
/** onCollapse가 있으면 제목 옆에 [‹](라이브러리 접기, PC 셸) */
export function LibraryPanel(p: { onCollapse?: () => void } = {}) {
  const stores = useStores()
  const locked = useUi((s) => s.mode !== 'place' || s.measuring)
  const [filter, setFilter] = useState<CategoryFilter>('ALL')
  const [brand, setBrand] = useState<string | null>(null)
  const mine = useMyItems()
  const shared = useItemPresets()
  const all = useMemo(() => [...mine, ...shared], [mine, shared])
  const presets = useMemo(() => sortByName(filterByBrand(filterByCategory(all, filter), brand)), [all, filter, brand])

  const add = (preset: ItemPreset) => {
    addPresetItem(stores, preset)
    // 새 도형 폼·경고 패널이 열려 있었어도 방금 놓은 물건의 속성을 보여 줍니다.
    stores.ui.getState().patch({ desktopPanel: 'auto' })
  }

  return (
    <aside className="tf-lib" aria-label="라이브러리" data-locked={locked ? 'true' : 'false'}>
      <div className="tf-lib__head">
        <h2 className="tf-lib__title">라이브러리</h2>
        {p.onCollapse !== undefined && (
          <button type="button" className="tf-lib__collapse" aria-label="라이브러리 접기" title="라이브러리 접기" onClick={p.onCollapse}>
            ‹
          </button>
        )}
      </div>
      <CategoryChips presets={all} value={filter} onChange={setFilter} disabled={locked} />
      <BrandSelect presets={all} value={brand} onChange={setBrand} disabled={locked} />
      {presets.length === 0 && <p className="tf-lib__empty">{emptyLibraryText(filter)}</p>}
      <ul className="tf-lib__list">
        {presets.map((p) => (
          <li key={p.id} className={isMine(p) ? 'tf-lib__mine' : undefined}>
            <button type="button" className="tf-lib__row" disabled={locked} aria-label={`${p.name} 추가`} onClick={() => add(p)}>
              <span className="tf-lib__thumb">
                <ShapeSwatch shape={p.shape} color={p.color} countsArea={p.countsArea} size={32} />
              </span>
              <span className="tf-lib__text">
                <span className="tf-lib__name">{p.name}</span>
                <span className="tf-lib__dims">{rowMeta(p)}</span>
              </span>
              <span className="tf-lib__plus" aria-hidden="true">
                +
              </span>
            </button>
            {isMine(p) && (
              <button
                type="button"
                className="tf-lib__delete"
                aria-label={`${p.name} 내 도형에서 지우기`}
                onClick={() => {
                  if (window.confirm(`「${p.name}」을(를) 내 도형에서 지울까요?`)) void deleteMyItem(p.id)
                }}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="tf-lib__footer">
        <button
          type="button"
          className="tf-lib__new"
          disabled={locked}
          onClick={() => stores.ui.getState().patch({ desktopPanel: 'newShape' })}
        >
          + 새 도형
        </button>
        <button
          type="button"
          className="tf-lib__new"
          disabled={locked}
          onClick={() => stores.ui.getState().patch({ itemMaker: { editId: null } })}
        >
          그려서 만들기
        </button>
      </div>
    </aside>
  )
}
