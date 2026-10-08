import { useMemo, useState } from 'react'
import type { ItemPreset } from '../../core/model'
import { addPresetItem } from '../../app/actions'
import { loadItemPresets } from '../../app/presets'
import { useStores, useUi } from '../../app/stores'
import { CategoryChips } from './CategoryChips'
import { dimsText } from '../panels/itemDims'
import { filterByCategory, type CategoryFilter } from './libraryUtils'
import { ShapeSwatch } from './ShapeSwatch'
import './library.css'

/**
 * PC 왼쪽 라이브러리(스펙 §4.1). [내 도형] 탭은 Plan 7에서 붙이므로 지금은 탭 줄 없이 기본 프리셋만 보여 줍니다.
 * 항목 클릭 = 화면 가운데에 놓고 선택(D35). 텐트 편집·측정 중에는 흐리게 하고 막습니다(§4.3).
 */
export function LibraryPanel() {
  const stores = useStores()
  const locked = useUi((s) => s.mode !== 'place' || s.measuring)
  const [filter, setFilter] = useState<CategoryFilter>('ALL')
  const presets = useMemo(() => filterByCategory(loadItemPresets(), filter), [filter])

  const add = (preset: ItemPreset) => {
    addPresetItem(stores, preset)
    // 새 도형 폼·경고 패널이 열려 있었어도 방금 놓은 물건의 속성을 보여 줍니다.
    stores.ui.getState().patch({ desktopPanel: 'auto' })
  }

  return (
    <aside className="tf-lib" aria-label="라이브러리" data-locked={locked ? 'true' : 'false'}>
      <h2 className="tf-lib__title">라이브러리</h2>
      <CategoryChips value={filter} onChange={setFilter} disabled={locked} />
      <ul className="tf-lib__list">
        {presets.map((p) => (
          <li key={p.id}>
            <button type="button" className="tf-lib__row" disabled={locked} aria-label={`${p.name} 추가`} onClick={() => add(p)}>
              <span className="tf-lib__thumb">
                <ShapeSwatch shape={p.shape} color={p.color} countsArea={p.countsArea} size={32} />
              </span>
              <span className="tf-lib__text">
                <span className="tf-lib__name">{p.name}</span>
                <span className="tf-lib__dims">{dimsText(p.shape)}</span>
              </span>
              <span className="tf-lib__plus" aria-hidden="true">
                +
              </span>
            </button>
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
      </div>
    </aside>
  )
}
