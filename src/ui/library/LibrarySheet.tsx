import { useMemo, useState } from 'react'
import type { ItemPreset } from '../../core/model'
import { addPresetItem } from '../../app/actions'
import { loadItemPresets } from '../../app/presets'
import { useStores } from '../../app/stores'
import { BottomSheet } from '../sheets/BottomSheet'
import { CategoryChips } from './CategoryChips'
import { dimsText } from '../panels/itemDims'
import { BrandSelect } from './BrandSelect'
import { emptyLibraryText, filterByBrand, filterByCategory, type CategoryFilter } from './libraryUtils'
import { ShapeSwatch } from './ShapeSwatch'
import './library.css'

/**
 * 모바일 라이브러리 시트(스펙 §4.2 [+물건]). 2열 카드(견본·이름·치수), 하단 고정 [새 도형 만들기].
 * 카드를 누르면 화면 가운데에 놓고 선택한 뒤 이 시트를 닫고 선택 시트를 엽니다(D35).
 */
export function LibrarySheet() {
  const stores = useStores()
  const [filter, setFilter] = useState<CategoryFilter>('ALL')
  const [brand, setBrand] = useState<string | null>(null)
  const all = loadItemPresets()
  const presets = useMemo(() => filterByBrand(filterByCategory(all, filter), brand), [all, filter, brand])

  const pick = (preset: ItemPreset) => {
    addPresetItem(stores, preset)
    stores.ui.getState().patch({ mobileSheet: 'selection' })
  }

  return (
    <BottomSheet title="물건 추가" expanded onClose={() => stores.ui.getState().patch({ mobileSheet: 'none' })} testId="library-sheet">
      <div className="tf-libsheet">
        <CategoryChips presets={all} value={filter} onChange={setFilter} />
        <BrandSelect presets={all} value={brand} onChange={setBrand} />
        {presets.length === 0 && <p className="tf-lib__empty">{emptyLibraryText(filter)}</p>}
        <ul className="tf-libsheet__grid">
          {presets.map((p) => (
            <li key={p.id}>
              <button type="button" className="tf-libsheet__card" aria-label={`${p.name} 추가`} onClick={() => pick(p)}>
                <span className="tf-libsheet__thumb">
                  <ShapeSwatch shape={p.shape} color={p.color} countsArea={p.countsArea} size={64} />
                </span>
                <span className="tf-libsheet__name">{p.name}</span>
                <span className="tf-libsheet__dims">{p.brand === undefined ? dimsText(p.shape) : `${p.brand} · ${dimsText(p.shape)}`}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="tf-libsheet__footer">
          <button
            type="button"
            className="tf-libsheet__new"
            onClick={() => stores.ui.getState().patch({ mobileSheet: 'newShape' })}
          >
            + 새 도형 만들기
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
