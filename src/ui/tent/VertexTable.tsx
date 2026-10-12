// 꼭짓점 좌표 표(스펙 §4.4-3·§4.4-7, D32). 텐트 만들기 화면의 자유 모양(Task 7)과 텐트 편집 패널·시트(Task 12)가 같이 씁니다.
// 표 좌표는 기준점(외곽 바운딩 박스 왼쪽 위 = 0) 기준 cm이고, 월드 ↔ 표 변환과 기준점 고정은 부르는 쪽이 합니다.
// 칸은 blur·Enter 때 검사하고(범위 −10,000~10,000), 범위 밖이면 마지막 유효값으로 되돌리고 그 행 아래 오류를 보입니다.
// onChange가 문자열을 돌려주면 그 문구가 그 행의 오류이고 값은 반영되지 않은 것입니다(§4.4-8 숫자 입력 거부).
import type { JSX } from 'react'
import { LIMITS, type Pt } from '../../core/model'
import { useFormDraft, type FormDraft } from '../fields/formInput'
import { INPUT_FONT_PX, checkNumber, flipSignText, formatNumber } from '../fields/numberInput'
import './vertexTable.css'

const [COORD_MIN, COORD_MAX] = LIMITS.coord
/** 꼭짓점이 이 수 이하면 행 삭제(×)를 막습니다(§4.4-7, 다각형은 꼭짓점 3개 이상). */
const MIN_POINTS = 3

export type VertexTableProps = {
  /** 표 좌표(기준점 기준, cm) — 변환은 부르는 쪽 */
  points: readonly Pt[]
  selectedIndex: number | null
  disabled?: boolean
  onSelect(index: number): void
  /** 문자열을 돌려주면 그 행 오류(반영 안 됨) */
  onChange(index: number, p: Pt): string | void
  /** 3개면 × 비활성 */
  onDelete(index: number): void
  /** '+ 꼭짓점 추가' */
  onAdd(): void
}

/** X·Y 칸 하나. 상태(useFormDraft)는 행이 가지고, 오류는 행 아래 한 줄로 보여 줍니다. */
function CoordCell(p: { label: string; disabled: boolean; field: FormDraft }): JSX.Element {
  const f = p.field
  return (
    <div className="tf-vt__cell" data-invalid={f.error !== null} data-disabled={p.disabled}>
      <input
        className="tf-vt__input tf-num"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        style={{ fontSize: INPUT_FONT_PX }}
        aria-label={p.label}
        aria-invalid={f.error !== null}
        value={f.text}
        disabled={p.disabled}
        onChange={f.onChange}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={f.onBlur}
        onKeyDown={f.onKeyDown}
      />
      <button
        type="button"
        className="tf-vt__sign"
        aria-label={`${p.label} 부호 바꾸기`}
        disabled={p.disabled}
        // 입력칸의 포커스(키보드)를 빼앗지 않습니다.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          const next = flipSignText(f.text)
          if (next !== null) f.commitText(next)
        }}
      >
        ±
      </button>
    </div>
  )
}

function VertexRow(p: {
  index: number
  point: Pt
  selected: boolean
  canDelete: boolean
  disabled: boolean
  onSelect(index: number): void
  onChange(index: number, p: Pt): string | void
  onDelete(index: number): void
}): JSX.Element {
  const n = p.index + 1
  const check = (text: string) => checkNumber(text, COORD_MIN, COORD_MAX)
  const x = useFormDraft<number>({
    value: p.point[0],
    format: formatNumber,
    check,
    disabled: p.disabled,
    onCommit: (v) => (v === p.point[0] ? undefined : p.onChange(p.index, [v, p.point[1]])),
  })
  const y = useFormDraft<number>({
    value: p.point[1],
    format: formatNumber,
    check,
    disabled: p.disabled,
    onCommit: (v) => (v === p.point[1] ? undefined : p.onChange(p.index, [p.point[0], v])),
  })
  const error = x.error ?? y.error
  return (
    <li
      className="tf-vt__row"
      data-selected={p.selected}
      onFocus={() => {
        if (!p.selected) p.onSelect(p.index)
      }}
    >
      <div className="tf-vt__line">
        <button
          type="button"
          className="tf-vt__num tf-num"
          aria-label={`${n}번 꼭짓점 선택`}
          aria-pressed={p.selected}
          disabled={p.disabled}
          onClick={() => p.onSelect(p.index)}
        >
          {n}
        </button>
        <CoordCell label={`${n}번 꼭짓점 X`} disabled={p.disabled} field={x} />
        <CoordCell label={`${n}번 꼭짓점 Y`} disabled={p.disabled} field={y} />
        <button
          type="button"
          className="tf-vt__del"
          aria-label={`${n}번 꼭짓점 삭제`}
          disabled={p.disabled || !p.canDelete}
          onClick={() => p.onDelete(p.index)}
        >
          ×
        </button>
      </div>
      {error !== null && (
        <span className="tf-field__error tf-vt__error" role="alert">
          {error}
        </span>
      )}
    </li>
  )
}

export function VertexTable(p: VertexTableProps): JSX.Element {
  const disabled = p.disabled === true
  const canDelete = p.points.length > MIN_POINTS
  return (
    <div className="tf-vt" role="group" aria-label="꼭짓점 좌표">
      <div className="tf-vt__head" aria-hidden="true">
        <span>#</span>
        <span>X (cm)</span>
        <span>Y (cm)</span>
        <span />
      </div>
      <ol className="tf-vt__rows">
        {p.points.map((pt, i) => (
          <VertexRow
            // 행 번호가 곧 꼭짓점 번호입니다(§3 꼭짓점 번호). 삭제·추가는 번호가 다시 매겨지는 것이 맞습니다.
            key={i}
            index={i}
            point={pt}
            selected={p.selectedIndex === i}
            canDelete={canDelete}
            disabled={disabled}
            onSelect={p.onSelect}
            onChange={p.onChange}
            onDelete={p.onDelete}
          />
        ))}
      </ol>
      <button type="button" className="tf-vt__add" disabled={disabled} onClick={p.onAdd}>
        + 꼭짓점 추가
      </button>
    </div>
  )
}
