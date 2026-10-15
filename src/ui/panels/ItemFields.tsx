// 물건 1개 편집 칸(스펙 §4.1 오른쪽 위 선택 속성, §4.2 선택 시트 펼침). PC 속성 패널과 모바일 선택 시트가 같이 씁니다.
// 입력칸은 item.id를 targetId로 받아 포커스 시점의 물건에 반영합니다. key로 다시 만들지 않습니다(그래야 기억이 유지됨).
import { saveMyItem } from '../../app/persist/storage'
import type { JSX } from 'react'
import { useId } from 'react'
import { useStores } from '../../app/stores'
import { CATEGORY_LABELS, ITEM_CATEGORIES, type Item } from '../../core/model'
import { NumberField } from '../fields/NumberField'
import { TextField } from '../fields/TextField'
import { INPUT_FONT_PX } from '../fields/numberInput'
import { ColorSwatches } from './ColorSwatches'
import { deleteAndDeselect, duplicateAndSelect, rotateBy90, setProps, setRotation } from './commands'
import { SavePresetForm } from './SavePresetForm'
import { dimsText } from './itemDims'
import './panels.css'

/** compact: 모바일 선택 시트 펼침용. [90도]·[복제]·[삭제]는 시트 요약 줄에 있으므로 여기서는 뺍니다. */
export function ItemFields(p: { item: Item; compact?: boolean }): JSX.Element {
  const stores = useStores()
  const categoryId = useId()
  const { item } = p
  const compact = p.compact === true
  return (
    <div className="tf-item-fields" data-compact={compact}>
      <TextField label="이름" value={item.name} targetId={item.id} onCommit={(id, name) => setProps(stores, id, { name })} />

      {/* 배치 모드는 이동·회전만(소유자 결정 2026-10-15): 크기·모서리·꼭짓점은 [모양 편집] 화면에서 */}
      <div className="tf-item-size">
        <span className="tf-field__label">크기</span>
        <span className="tf-item-size__value" data-testid="item-size">
          {dimsText(item.shape)} cm
        </span>
        <button type="button" className="tf-btn" onClick={() => stores.ui.getState().patch({ itemMaker: { editId: item.id } })}>
          모양 편집
        </button>
      </div>
      <button
        type="button"
        className="tf-btn"
        onClick={() => {
          void saveMyItem(item).then((p) => stores.ui.getState().showToast(`내 도형에 「${p.name}」로 저장했어요 · 라이브러리 「내 도형」에서 쓸 수 있어요`))
        }}
      >
        내 도형으로 저장
      </button>
      {import.meta.env.DEV && !compact && <SavePresetForm key={item.id} item={item} />}

      <div className="tf-rotate-row" data-compact={compact}>
        {/* 회전은 아무 실수나 받고 [0,360)으로 정규화합니다(§5.1). 400 → 40 */}
        <NumberField
          label="회전"
          unit="°"
          value={item.rotation}
          targetId={item.id}
          min={Number.NEGATIVE_INFINITY}
          max={Number.POSITIVE_INFINITY}
          onCommit={(id, deg) => setRotation(stores, [id], deg)}
        />
        {!compact && (
          <button type="button" className="tf-btn" onClick={() => rotateBy90(stores, [item.id])}>
            90도
          </button>
        )}
      </div>

      <div className="tf-field">
        <span className="tf-field__label">색</span>
        <ColorSwatches value={item.color} onChange={(color) => setProps(stores, item.id, { color })} />
      </div>

      <div className="tf-field">
        <label className="tf-field__label" htmlFor={categoryId}>
          카테고리
        </label>
        <select
          id={categoryId}
          className="tf-select"
          style={{ fontSize: INPUT_FONT_PX }}
          value={item.category}
          onChange={(e) => {
            const category = ITEM_CATEGORIES.find((c) => c === e.target.value)
            if (category !== undefined) setProps(stores, item.id, { category })
          }}
        >
          {ITEM_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>

      <label className="tf-toggle">
        <input
          type="checkbox"
          role="switch"
          checked={item.countsArea}
          onChange={(e) => setProps(stores, item.id, { countsArea: e.target.checked })}
        />
        <span>점유 면적에 포함</span>
      </label>

      {!compact && (
        <div className="tf-row2">
          <button type="button" className="tf-btn" onClick={() => duplicateAndSelect(stores, [item.id])}>
            복제
          </button>
          <button type="button" className="tf-btn tf-btn--danger" onClick={() => deleteAndDeselect(stores, [item.id])}>
            삭제
          </button>
        </div>
      )}
    </div>
  )
}
