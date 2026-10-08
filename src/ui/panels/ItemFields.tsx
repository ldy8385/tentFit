// 물건 1개 편집 칸(스펙 §4.1 오른쪽 위 선택 속성, §4.2 선택 시트 펼침). PC 속성 패널과 모바일 선택 시트가 같이 씁니다.
// 입력칸은 item.id를 targetId로 받아 포커스 시점의 물건에 반영합니다. key로 다시 만들지 않습니다(그래야 기억이 유지됨).
import type { JSX } from 'react'
import { useId } from 'react'
import { useStores } from '../../app/stores'
import { CATEGORY_LABELS, ITEM_CATEGORIES, LIMITS, type Item } from '../../core/model'
import { NumberField } from '../fields/NumberField'
import { TextField } from '../fields/TextField'
import { INPUT_FONT_PX } from '../fields/numberInput'
import { ColorSwatches } from './ColorSwatches'
import { deleteAndDeselect, duplicateAndSelect, resize, rotateBy90, setProps, setRotation } from './commands'
import { itemDims } from './itemDims'
import './panels.css'

const [LEN_MIN, LEN_MAX] = LIMITS.length

/** compact: 모바일 선택 시트 펼침용. [90도]·[복제]·[삭제]는 시트 요약 줄에 있으므로 여기서는 뺍니다. */
export function ItemFields(p: { item: Item; compact?: boolean }): JSX.Element {
  const stores = useStores()
  const categoryId = useId()
  const { item } = p
  const compact = p.compact === true
  const dims = itemDims(item.shape)

  return (
    <div className="tf-item-fields" data-compact={compact}>
      <TextField label="이름" value={item.name} targetId={item.id} onCommit={(id, name) => setProps(stores, id, { name })} />

      {dims.kind === 'circle' ? (
        <NumberField
          label="지름"
          unit="cm"
          value={dims.d}
          targetId={item.id}
          min={LEN_MIN}
          max={LEN_MAX}
          onCommit={(id, d) => resize(stores, id, { d })}
        />
      ) : (
        <div className="tf-row2">
          <NumberField
            label="가로"
            unit="cm"
            value={dims.w}
            targetId={item.id}
            min={LEN_MIN}
            max={LEN_MAX}
            onCommit={(id, w) => resize(stores, id, { w })}
          />
          <NumberField
            label="세로"
            unit="cm"
            value={dims.h}
            targetId={item.id}
            min={LEN_MIN}
            max={LEN_MAX}
            onCommit={(id, h) => resize(stores, id, { h })}
          />
        </div>
      )}

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
