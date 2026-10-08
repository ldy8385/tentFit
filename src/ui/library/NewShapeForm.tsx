import { useId, useState, type FormEvent, type KeyboardEvent } from 'react'
import { CATEGORY_LABELS, ITEM_CATEGORIES, LIMITS, round1, type ColorKey, type ItemCategory, type Shape } from '../../core/model'
import { nextColor } from '../../core/ops/items'
import { addCustomItem } from '../../app/actions'
import { useStores } from '../../app/stores'
import { INPUT_FONT_PX, checkNumber, checkText, type Checked } from '../fields/numberInput'
import { ColorSwatches } from '../panels/ColorSwatches'
import { dimsText } from '../panels/itemDims'
import { ShapeSwatch } from './ShapeSwatch'
import '../fields/fields.css'
import '../panels/panels.css'
import './newShape.css'

const [LEN_MIN, LEN_MAX] = LIMITS.length
const NAME_MAX = 40
/** 스펙 §4.7-3 기본값 */
const DEFAULT_NAME = '새 도형'
const DEFAULT_W = '100'
const DEFAULT_H = '50'
const DEFAULT_D = '50'

type FormShape = 'rect' | 'circle'

/**
 * 폼 안의 입력칸. 모양과 문구는 Task 6 입력칸(`tf-field`, checkNumber·checkText 문구)과 같고,
 * 문서가 아니라 폼 값을 바꾸므로 입력할 때마다 검사해 오류를 바로 보여 줍니다.
 */
function FormInput(p: {
  label: string
  value: string
  onChange(v: string): void
  check: Checked<unknown>
  unit?: string
  numeric?: boolean
  maxLength?: number
  /** 마지막 입력칸이면 'done', 아니면 'next'(휴대폰 키보드의 Enter 표시) */
  last?: boolean
}) {
  const id = useId()
  const errorId = useId()
  const invalid = !p.check.ok
  return (
    <div className="tf-field">
      <label className="tf-field__label" htmlFor={id}>
        {p.label}
      </label>
      <div className="tf-field__box" data-invalid={invalid}>
        <input
          id={id}
          className={p.numeric === true ? 'tf-field__input tf-num' : 'tf-field__input'}
          type="text"
          inputMode={p.numeric === true ? 'decimal' : undefined}
          enterKeyHint={p.last === true ? 'done' : 'next'}
          autoComplete="off"
          spellCheck={false}
          maxLength={p.maxLength}
          style={{ fontSize: INPUT_FONT_PX }}
          value={p.value}
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
          onChange={(e) => p.onChange(e.target.value)}
        />
        {p.unit !== undefined && <span className="tf-field__unit">{p.unit}</span>}
      </div>
      {!p.check.ok && (
        <span id={errorId} className="tf-field__error" role="alert">
          {p.check.error}
        </span>
      )}
    </div>
  )
}

/**
 * 새 도형 폼(스펙 §4.7-3, O2: 사각형·원). 확정 전에는 캔버스에 아무것도 그리지 않습니다(D35).
 * [캔버스에 추가] → addCustomItem(화면 가운데, 새 물건 선택) → onDone.
 * 데스크톱 패널에서는 제목 줄(제목·×=onCancel)을 그리고, BottomSheet 안(inSheet)에서는 시트가 제목·×를 그립니다.
 * "내 도형으로 저장"은 Plan 7(myItems)에서 붙입니다.
 */
export function NewShapeForm(p: { onDone(): void; onCancel(): void; inSheet?: boolean }) {
  const stores = useStores()
  const categoryId = useId()
  const [kind, setKind] = useState<FormShape>('rect')
  const [name, setName] = useState(DEFAULT_NAME)
  const [w, setW] = useState(DEFAULT_W)
  const [h, setH] = useState(DEFAULT_H)
  const [d, setD] = useState(DEFAULT_D)
  const [color, setColor] = useState<ColorKey>(() => nextColor(stores.doc.getState().layout))
  const [category, setCategory] = useState<ItemCategory>('ETC')
  const [countsArea, setCountsArea] = useState(true)

  const nameCheck = checkText(name)
  const wCheck = checkNumber(w, LEN_MIN, LEN_MAX)
  const hCheck = checkNumber(h, LEN_MIN, LEN_MAX)
  const dCheck = checkNumber(d, LEN_MIN, LEN_MAX)
  // 미리보기·저장 모두 0.1cm로 맞춘 값(makeItem도 같은 반올림을 함)
  let shape: Shape | null = null
  if (kind === 'circle') {
    if (dCheck.ok) shape = { kind: 'circle', d: round1(dCheck.value) }
  } else if (wCheck.ok && hCheck.ok) {
    shape = { kind: 'rect', w: round1(wCheck.value), h: round1(hCheck.value) }
  }
  const ready = shape !== null && nameCheck.ok

  const chooseKind = (next: FormShape) => {
    if (next === kind) return
    // 원 → 사각형으로 돌아가면 지름을 가로·세로에 모두 넣습니다(§4.7-3).
    if (next === 'rect') {
      setW(d)
      setH(d)
    }
    setKind(next)
  }

  const chooseCategory = (value: string) => {
    const next = ITEM_CATEGORIES.find((c) => c === value)
    if (next === undefined) return
    setCategory(next)
    if (next === 'RUG') setCountsArea(false)
  }

  /**
   * 입력칸의 Enter는 폼을 제출하지 않고(암시적 제출로 물건이 생기지 않게, D35) 다음 입력칸으로 옮깁니다.
   * 마지막 칸이면 포커스를 풀어 키보드를 내립니다. 한글 조합을 끝내는 Enter는 칸을 옮기지 않습니다.
   */
  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Enter') return
    const target = e.target
    if (!(target instanceof HTMLInputElement) || target.type !== 'text') return
    e.preventDefault()
    if (e.nativeEvent.isComposing) return
    const fields = [...e.currentTarget.querySelectorAll<HTMLInputElement>('input[type="text"]')]
    const next = fields[fields.indexOf(target) + 1]
    if (next === undefined) target.blur()
    else next.focus()
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (shape === null || !nameCheck.ok) return
    addCustomItem(stores, { name: nameCheck.value, shape, color, category, countsArea })
    p.onDone()
  }

  return (
    <form className="tf-ns" aria-label="새 도형 만들기" onSubmit={submit} onKeyDown={onKeyDown} noValidate>
      {p.inSheet !== true && (
        <header className="tf-ns__head">
          <h2 className="tf-ns__title">새 도형 만들기</h2>
          <button type="button" className="tf-ns__close" aria-label="새 도형 닫기" onClick={p.onCancel}>
            ×
          </button>
        </header>
      )}
      <div className="tf-ns__body">
        <div className="tf-field" role="group" aria-label="모양">
          <span className="tf-field__label" aria-hidden="true">
            모양
          </span>
          <div className="tf-ns__seg">
            <button type="button" className="tf-ns__segbtn" aria-pressed={kind === 'rect'} onClick={() => chooseKind('rect')}>
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <rect x="2.5" y="2.5" width="13" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              사각형
            </button>
            <button type="button" className="tf-ns__segbtn" aria-pressed={kind === 'circle'} onClick={() => chooseKind('circle')}>
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <circle cx="9" cy="9" r="6.7" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              원
            </button>
          </div>
        </div>

        <FormInput label="이름" value={name} onChange={setName} check={nameCheck} maxLength={NAME_MAX} />

        {kind === 'rect' ? (
          <div className="tf-row2">
            <FormInput label="가로" unit="cm" numeric value={w} onChange={setW} check={wCheck} />
            <FormInput label="세로" unit="cm" numeric last value={h} onChange={setH} check={hCheck} />
          </div>
        ) : (
          <FormInput label="지름" unit="cm" numeric last value={d} onChange={setD} check={dCheck} />
        )}

        <div className="tf-field">
          <span className="tf-field__label">색</span>
          <ColorSwatches value={color} onChange={setColor} />
        </div>

        <div className="tf-field">
          <label className="tf-field__label" htmlFor={categoryId}>
            카테고리
          </label>
          <select
            id={categoryId}
            className="tf-select"
            style={{ fontSize: INPUT_FONT_PX }}
            value={category}
            onChange={(e) => chooseCategory(e.target.value)}
          >
            {ITEM_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>

        <label className="tf-toggle">
          <input type="checkbox" role="switch" checked={countsArea} onChange={(e) => setCountsArea(e.target.checked)} />
          <span>점유 면적에 포함</span>
        </label>

        <figure className="tf-ns__preview" aria-label="미리보기">
          {shape !== null ? (
            <ShapeSwatch shape={shape} color={color} countsArea={countsArea} size={96} />
          ) : (
            <span className="tf-ns__preview-empty">치수를 확인해 주세요</span>
          )}
          <figcaption className="tf-ns__caption">
            <span>{nameCheck.ok ? nameCheck.value : DEFAULT_NAME}</span>
            {shape !== null && <span className="tf-ns__caption-dims tf-num">{dimsText(shape)}</span>}
          </figcaption>
        </figure>
      </div>
      <div className="tf-ns__footer">
        <button type="submit" className="tf-ns__submit" disabled={!ready}>
          + 캔버스에 추가
        </button>
      </div>
    </form>
  )
}
