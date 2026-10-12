// 텐트 편집 패널(PC 오른쪽 위)·시트(모바일) 내용(스펙 §4.4-3~8). 두 곳이 같은 내용을 씁니다(variant만 다름).
// - 구성 목록 하나: 외곽 / 이너 1 / … / [+ 이너]. 선택 행 강조. 대상이 없으면 안내 「편집할 곳을 고르세요」.
// - 선택 대상 편집
//   · 템플릿이 있으면 템플릿 치수만(사각형 가로·세로·정사각형, 사다리꼴 4칸, 정N각형 n·[지름│한 변]·값), 원은 지름만.
//   · 원이 아니면 [꼭짓점 직접 편집(자유 다각형으로 바뀜)] → 좌표 표. 누르기만 해서는 문서가 그대로이고, 표에 입력하거나
//     캔버스에서 끌 때 자유 다각형이 됩니다(§4.4-6). 자유 다각형이면 바로 좌표 표.
//   · 좌표 표 기준점 = 외곽의 지금 바운딩 박스 왼쪽 위(D32). 표 안에 입력 포커스가 있는 동안 기준점을 고정하고,
//     포커스가 표를 떠나면 다시 계산합니다(끄는 동안에는 문서가 바뀌지 않으므로 끝난 뒤 한 번 다시 매겨짐).
//   · 선택한 꼭짓점이 있으면 x·y 입력(표가 없을 때)과 [꼭짓점 삭제].
//   · 이너: 이름, 회전 + [90도], 삭제. 외곽은 삭제 없음.
// - [텐트 바꾸기] → editorDialog 'swapTent'(Task 11). [내 텐트로 저장]은 Plan 7(R1).
// - Plan 4.1(설계 2026-10-12): [+ 이너 ▾] 예시·자유 그리기 메뉴, 대상마다 [모양 바꾸기 ▾]·[다시 그리기], 자유 다각형은
//   전체 크기·변 길이·꼭짓점 각도 칸(PolygonFields)과 접힌 「좌표로 고치기」, 이너는 [벽에 붙이기].
//   만들기 화면(context 'maker')은 같은 패널을 쓰되 [텐트 바꾸기]·목록의 [+ 이너]가 없고(도구 줄이 대신함), 단계 잠금(ui.tentLock)과
//   외곽 없음(ui.outerPending)을 목록에 반영합니다. 그리는 중에는 대상 칸 대신 안내만 둡니다.
// - 문서 동작은 app/tentActions만 부릅니다. 결과가 규칙을 깨면 입력칸은 그 칸에 오류(반영 안 함), 버튼은 토스트로 알립니다.
// - 측정 중(tentControlsEnabled false)이면 모든 컨트롤이 비활성입니다(§4.3).
import { useState, type JSX } from 'react'
import { useDoc, useStores, useUi } from '../../app/stores'
import {
  attachInnerToWall,
  changeTargetShape,
  currentShapeKind,
  deleteInnerAction,
  deleteTargetVertex,
  insertTargetVertex,
  renameInnerAction,
  rotateInner90,
  setInnerRotation,
  setTargetDiameter,
  setTargetTemplate,
  setTargetVertex,
  startDrawingAction,
  tentControlsEnabled,
  type EditResult,
} from '../../app/tentActions'
import { LIMITS, type Inner, type Layout, type Pt, type ShapeTemplate } from '../../core/model'
import { targetLocalRing, targetWorldRing, type TentTarget } from '../../core/ops/tent'
import { ATTACH_SIDE_LABELS, attachSidesFor } from '../../core/templates'
import { tableOrigin, tableToWorld, worldToTable } from '../../view/tentEdit'
import { SegmentedControl } from '../common/SegmentedControl'
import { NumberField } from '../fields/NumberField'
import { TextField } from '../fields/TextField'
import { NAME_MAX_LENGTH } from '../fields/limits'
import '../panels/panels.css'
import { MenuButton } from '../shell/MenuButton'
import { COORDS_LABEL, Disclosure, PolygonFields } from './PolygonFields'
import { DRAWING_HINT, innerShapeMenu, KIND_LABELS, TEMPLATE_KINDS } from './shapeMenu'
import { VertexTable } from './VertexTable'
import './tentEditor.css'
import {
  applyTemplateField,
  editableTemplate,
  parseTargetKey,
  parseVertexFieldId,
  samePoint,
  setSquare,
  shapeKindLabel,
  shapeSummary,
  switchNgonSizeBy,
  targetKey,
  targetName,
  targetShape,
  vertexFieldId,
  type TemplateField,
} from './tentEditorModel'

export type TentEditorVariant = 'panel' | 'sheet'
export { ANGLES_LABEL, COORDS_LABEL, EDGE_HINT } from './PolygonFields'
export { DRAWING_HINT } from './shapeMenu'

/** 꼭짓점 직접 편집 버튼 문구(§4.4-3 원문) */
export const FREE_EDIT_LABEL = '꼭짓점 직접 편집(자유 다각형으로 바뀜)'
/** 대상이 없을 때 안내 */
export const EMPTY_TARGET_TEXT = '편집할 곳을 고르세요'

const [LEN_MIN, LEN_MAX] = LIMITS.length
const [OFFSET_MIN, OFFSET_MAX] = LIMITS.offset
const [N_MIN, N_MAX] = LIMITS.ngonN
const [COORD_MIN, COORD_MAX] = LIMITS.coord

const NGON_SIZE_OPTIONS = [
  { value: 'diameter', label: '지름' },
  { value: 'side', label: '한 변' },
] as const

/** 입력칸 onCommit용: 거부면 오류 문구 */
function errorOf(r: EditResult): string | undefined {
  return r.ok ? undefined : r.error
}

export function TentEditor(p: {
  variant: TentEditorVariant
  /** 'maker'면 만들기 화면(설계 §1.1): [텐트 바꾸기]·목록의 [+ 이너] 없음 */
  context?: 'editor' | 'maker'
  /** PC 패널 제목(기본 「텐트 편집」) */
  title?: string
  /** 대상이 없을 때 안내(기본 「편집할 곳을 고르세요」) */
  emptyText?: string
}): JSX.Element {
  const stores = useStores()
  const layout = useDoc((s) => s.layout)
  const target = useUi((s) => s.tentTarget)
  const vertexIndex = useUi((s) => s.vertexIndex)
  const enabled = useUi((s) => tentControlsEnabled(s))
  const tentLock = useUi((s) => s.tentLock)
  const outerPending = useUi((s) => s.outerPending)
  const drawing = useUi((s) => s.drawing !== null)
  const maker = p.context === 'maker'
  const tent = layout.tent
  const key = targetKey(target)
  // 없는 이너를 가리키면(정리 직전 한 번) 대상이 없는 것처럼 그립니다.
  const live = target !== null && targetName(tent, target) !== null ? target : null

  const select = (t: TentTarget) => stores.ui.getState().selectTentTarget(t)
  const openSwap = () => {
    if (tentControlsEnabled(stores.ui.getState())) stores.ui.getState().patch({ editorDialog: 'swapTent' })
  }

  return (
    <section
      className={p.variant === 'panel' ? 'tf-panel tf-tent' : 'tf-tent'}
      aria-label="텐트 편집"
      data-testid="tent-editor"
      data-variant={p.variant}
    >
      {p.variant === 'panel' && <h2 className="tf-panel__title">{p.title ?? '텐트 편집'}</h2>}
      <ul className="tf-tent__list" aria-label="텐트 구성">
        {!outerPending && (
          <li>
            <button
              type="button"
              className="tf-tent__row"
              aria-pressed={key === 'outer'}
              disabled={!enabled || tentLock === 'outer'}
              onClick={() => select('outer')}
            >
              <span className="tf-tent__dot tf-tent__dot--outer" aria-hidden="true" />
              <span className="tf-tent__name">외곽</span>
              <span className="tf-tent__meta">{shapeSummary(tent.outer, tent.outerTemplate)}</span>
            </button>
          </li>
        )}
        {tent.inners.map((inner) => (
          <li key={inner.id}>
            <button
              type="button"
              className="tf-tent__row"
              aria-pressed={key === targetKey({ innerId: inner.id })}
              disabled={!enabled || tentLock === 'inners'}
              onClick={() => select({ innerId: inner.id })}
            >
              <span className="tf-tent__dot tf-tent__dot--inner" aria-hidden="true" />
              <span className="tf-tent__name">{inner.name}</span>
              <span className="tf-tent__meta">{shapeSummary(inner.shape, inner.template)}</span>
            </button>
          </li>
        ))}
        {/* 휴대폰 시트에는 두지 않습니다(휴대폰 [+ 이너]는 툴바, 설계 §3 — 시트 스크롤 안의 메뉴는 잘림, 최종 리뷰). */}
        {!maker && p.variant === 'panel' && tentLock !== 'inners' && !outerPending && (
          <li>
            <MenuButton
              label="+ 이너"
              showLabel
              align="left"
              buttonClassName="tf-tent__add"
              disabled={!enabled || drawing}
              items={innerShapeMenu(stores)}
            />
          </li>
        )}
      </ul>

      {drawing ? (
        <p className="tf-panel__empty">{DRAWING_HINT}</p>
      ) : live === null ? (
        <p className="tf-panel__empty">{p.emptyText ?? EMPTY_TARGET_TEXT}</p>
      ) : (
        <TargetFields target={live} layout={layout} vertexIndex={vertexIndex} enabled={enabled} variant={p.variant} />
      )}

      {!maker && (
        <button type="button" className="tf-btn tf-tent__swap" disabled={!enabled || drawing} onClick={openSwap}>
          텐트 바꾸기
        </button>
      )}
    </section>
  )
}

/**
 * [모양 바꾸기 ▾](지금 종류는 비활성)·[다시 그리기](설계 §3). 거부는 토스트.
 * 휴대폰 시트는 본문이 스크롤 영역이라 펼침 메뉴가 잘리므로 같은 항목을 버튼 줄로 둡니다(최종 리뷰).
 */
function ShapeActions(p: { target: TentTarget; layout: Layout; enabled: boolean; variant: TentEditorVariant }): JSX.Element {
  const stores = useStores()
  const { target, enabled } = p
  const current = currentShapeKind(p.layout, target)
  const toastIfRejected = (r: EditResult) => {
    if (!r.ok) stores.ui.getState().showToast(r.error)
  }
  const items = TEMPLATE_KINDS.map((kind) => ({
    label: KIND_LABELS[kind],
    disabled: kind === current,
    onSelect: () => toastIfRejected(changeTargetShape(stores, target, kind)),
  }))
  const redraw = (
    <button
      type="button"
      className="tf-btn"
      disabled={!enabled}
      onClick={() => startDrawingAction(stores, target === 'outer' ? 'outer' : { innerId: target.innerId })}
    >
      다시 그리기
    </button>
  )
  if (p.variant === 'sheet') {
    return (
      <div className="tf-tent__shape-actions tf-tent__shape-actions--sheet">
        <div className="tf-tent__attach" role="group" aria-label="모양 바꾸기">
          <span className="tf-tent__attach-label" aria-hidden="true">
            모양 바꾸기
          </span>
          <div className="tf-tent__attach-buttons">
            {items.map((item) => (
              <button key={item.label} type="button" className="tf-btn" disabled={!enabled || item.disabled} onClick={item.onSelect}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
        {redraw}
      </div>
    )
  }
  return (
    <div className="tf-tent__shape-actions">
      <MenuButton label="모양 바꾸기" showLabel align="left" buttonClassName="tf-btn" disabled={!enabled} items={items} />
      {redraw}
    </div>
  )
}

/** [벽에 붙이기: 뒤 · 앞 · 왼쪽 · 오른쪽](설계 §2.4) — 외곽 템플릿이 사각형·사다리꼴일 때만. 한 번 옮기는 버튼 묶음. */
function AttachWallRow(p: { innerId: string; layout: Layout; enabled: boolean }): JSX.Element | null {
  const stores = useStores()
  const sides = attachSidesFor(p.layout.tent.outerTemplate)
  if (sides.length === 0) return null
  return (
    <div className="tf-tent__attach" role="group" aria-label="벽에 붙이기">
      <span className="tf-tent__attach-label" aria-hidden="true">
        벽에 붙이기
      </span>
      <div className="tf-tent__attach-buttons">
        {sides.map((side) => (
          <button
            key={side}
            type="button"
            className="tf-btn"
            disabled={!p.enabled}
            onClick={() => {
              const r = attachInnerToWall(stores, p.innerId, side)
              if (!r.ok) stores.ui.getState().showToast(r.error)
            }}
          >
            {ATTACH_SIDE_LABELS[side]}
          </button>
        ))}
      </div>
    </div>
  )
}

/** 선택한 대상(외곽 또는 이너 하나)의 편집 칸 */
function TargetFields(p: {
  target: TentTarget
  layout: Layout
  vertexIndex: number | null
  enabled: boolean
  variant: TentEditorVariant
}): JSX.Element {
  const stores = useStores()
  const { target, layout, enabled } = p
  const tid = targetKey(target)
  const found = targetShape(layout.tent, target)
  // 표를 연 대상(키). 다른 대상을 고르면 닫힌 것으로 봅니다(문서는 그대로라 다시 버튼이 보임).
  const [tableFor, setTableFor] = useState<string | null>(null)
  if (found === null) return <></>
  const { shape } = found
  const template = editableTemplate(shape, found.template)
  const inner: Inner | undefined = target === 'outer' ? undefined : layout.tent.inners.find((it) => it.id === target.innerId)
  const name = targetName(layout.tent, target) ?? ''
  const isCircle = shape.kind === 'circle'
  const free = template === null
  // 표는 [꼭짓점 직접 편집](예시 모양)이나 「좌표로 고치기」(자유 다각형)를 눌렀을 때만 펼칩니다.
  const showTable = !isCircle && tableFor === tid

  const toastIfRejected = (r: EditResult) => {
    if (!r.ok) stores.ui.getState().showToast(r.error)
  }

  /** 템플릿 숫자 칸 반영: 포커스 때의 대상(targetId)의 지금 템플릿을 읽어 그 칸만 바꿉니다. */
  const commitTemplateField = (field: TemplateField) => (id: string, value: number): string | void => {
    const t = parseTargetKey(id)
    if (t === null) return
    const cur = targetShape(stores.doc.getState().layout.tent, t)
    if (cur === null) return
    const tpl = editableTemplate(cur.shape, cur.template)
    if (tpl === null) return
    if (tpl.kind === 'circle') return errorOf(setTargetDiameter(stores, t, value))
    if (field === 'n' && !Number.isInteger(value)) return `${N_MIN}~${N_MAX} 사이의 정수로 입력해 주세요`
    return errorOf(setTargetTemplate(stores, t, applyTemplateField(tpl, field, value)))
  }

  const commitTemplate = (next: ShapeTemplate) => toastIfRejected(setTargetTemplate(stores, target, next))

  return (
    <div className="tf-tent__target" data-testid="tent-target-fields">
      <h3 className="tf-tent__target-title">
        {name}
        <span className="tf-tent__meta">{shapeKindLabel(shape, found.template)}</span>
      </h3>

      {inner !== undefined && (
        <TextField
          label="이름"
          value={inner.name}
          targetId={inner.id}
          maxLength={NAME_MAX_LENGTH}
          disabled={!enabled}
          onCommit={(id, v) => renameInnerAction(stores, id, v)}
        />
      )}

      <ShapeActions target={target} layout={layout} enabled={enabled} variant={p.variant} />

      {free && (
        <>
          <PolygonFields key={tid} target={target} points={targetLocalRing(layout, target)} enabled={enabled} />
          <Disclosure
            label={COORDS_LABEL}
            open={showTable}
            controls={`${tid}-coords`}
            onToggle={() => setTableFor((cur) => (cur === tid ? null : tid))}
          />
        </>
      )}

      {template !== null && (
        <TemplateFields
          template={template}
          targetId={tid}
          enabled={enabled}
          onField={commitTemplateField}
          onTemplate={commitTemplate}
        />
      )}

      {!isCircle && !free && !showTable && (
        <button type="button" className="tf-btn" disabled={!enabled} onClick={() => setTableFor(tid)}>
          {FREE_EDIT_LABEL}
        </button>
      )}

      {!isCircle && (
        <VertexSection
          key={tid}
          id={`${tid}-coords`}
          target={target}
          layout={layout}
          vertexIndex={p.vertexIndex}
          showTable={showTable}
          enabled={enabled}
        />
      )}

      {inner !== undefined && (
        <>
          <AttachWallRow innerId={inner.id} layout={layout} enabled={enabled} />
          <div className="tf-rotate-row">
            {/* 회전은 아무 실수나 받고 [0,360)으로 정규화합니다(§5.1). */}
            <NumberField
              label="회전"
              unit="°"
              value={inner.rotation}
              targetId={inner.id}
              min={Number.NEGATIVE_INFINITY}
              max={Number.POSITIVE_INFINITY}
              disabled={!enabled}
              onCommit={(id, deg) => errorOf(setInnerRotation(stores, id, deg))}
            />
            <button type="button" className="tf-btn" disabled={!enabled} onClick={() => toastIfRejected(rotateInner90(stores, inner.id))}>
              90도
            </button>
          </div>
          <button
            type="button"
            className="tf-btn tf-btn--danger"
            aria-label={`${inner.name} 삭제`}
            disabled={!enabled}
            onClick={() => deleteInnerAction(stores, inner.id)}
          >
            삭제
          </button>
        </>
      )}
    </div>
  )
}

/** 템플릿 치수 칸(§4.8 표). 원은 지름만(§4.4-5). */
function TemplateFields(p: {
  template: ShapeTemplate
  targetId: string
  enabled: boolean
  onField(field: TemplateField): (id: string, value: number) => string | void
  onTemplate(next: ShapeTemplate): void
}): JSX.Element {
  const { template: t, targetId, enabled } = p
  const len = (label: string, field: TemplateField, value: number, disabled = false) => (
    <NumberField
      label={label}
      unit="cm"
      value={value}
      targetId={targetId}
      min={LEN_MIN}
      max={LEN_MAX}
      disabled={!enabled || disabled}
      onCommit={p.onField(field)}
    />
  )
  switch (t.kind) {
    case 'rect': {
      const square = t.square === true
      return (
        <div className="tf-tent__dims">
          <div className="tf-row2">
            {len('가로', 'w', t.w)}
            {len('세로', 'h', square ? t.w : t.h, square)}
          </div>
          <label className="tf-toggle">
            <input
              type="checkbox"
              checked={square}
              disabled={!enabled}
              onChange={(e) => p.onTemplate(setSquare(t, e.target.checked))}
            />
            <span>정사각형</span>
          </label>
        </div>
      )
    }
    case 'trapezoid':
      // 업체 도면처럼 윗변·아랫변·세로로 부릅니다(괄호는 벽에 붙이기의 뒤·앞과 같은 방향).
      return (
        <div className="tf-tent__dims">
          <div className="tf-row2">
            {len('윗변(뒤)', 'back', t.back)}
            {len('아랫변(앞)', 'front', t.front)}
          </div>
          <div className="tf-row2">
            {len('세로', 'depth', t.depth)}
            <NumberField
              label="치우침"
              unit="cm"
              value={t.offset}
              targetId={targetId}
              min={OFFSET_MIN}
              max={OFFSET_MAX}
              allowNegative
              disabled={!enabled}
              onCommit={p.onField('offset')}
            />
          </div>
          <p className="tf-hint">+면 윗변이 오른쪽으로</p>
        </div>
      )
    case 'hexagon':
      // 업체 도면식: 가로(좌우 꼭짓점 끝↔끝)·세로(윗변↔아랫변)·윗·아랫변 길이
      return (
        <div className="tf-tent__dims">
          <div className="tf-row2">
            {len('가로', 'w', t.w)}
            {len('세로', 'h', t.h)}
          </div>
          {len('윗·아랫변', 'edge', t.edge)}
          <p className="tf-hint">가로는 좌우 꼭짓점 끝↔끝, 세로는 윗변↔아랫변</p>
        </div>
      )
    case 'ngon':
      return (
        <div className="tf-tent__dims">
          <NumberField
            label="변 수"
            value={t.n}
            targetId={targetId}
            min={N_MIN}
            max={N_MAX}
            disabled={!enabled}
            onCommit={p.onField('n')}
          />
          <SegmentedControl
            label="크기 기준"
            options={NGON_SIZE_OPTIONS}
            value={t.sizeBy}
            disabled={!enabled}
            onChange={(v) => p.onTemplate(switchNgonSizeBy(t, v))}
          />
          {len(t.sizeBy === 'diameter' ? '지름' : '한 변', 'size', t.size)}
        </div>
      )
    case 'circle':
      return <div className="tf-tent__dims">{len('지름', 'd', t.d)}</div>
  }
}

/** 좌표 표와 선택 꼭짓점 칸. 안에 입력 포커스가 있는 동안 표 기준점을 고정합니다(D32). 대상이 바뀌면 새로 만듭니다(key). */
function VertexSection(p: {
  id: string
  target: TentTarget
  layout: Layout
  vertexIndex: number | null
  showTable: boolean
  enabled: boolean
}): JSX.Element {
  const stores = useStores()
  const { target, layout, enabled } = p
  const [frozenOrigin, setFrozenOrigin] = useState<Pt | null>(null)
  const liveOrigin = tableOrigin(layout.tent)
  const origin = frozenOrigin ?? liveOrigin
  const ring = targetWorldRing(layout, target)
  const points = ring.map((w) => worldToTable(w, origin))
  const selected = p.vertexIndex !== null && p.vertexIndex < ring.length ? p.vertexIndex : null

  const toastIfRejected = (r: EditResult) => {
    if (!r.ok) stores.ui.getState().showToast(r.error)
  }

  /** 표 좌표(기준점 기준) → 월드로 바꿔 반영. 같은 자리면 쓰지 않습니다(템플릿이 공연히 자유 다각형이 되지 않게). */
  const moveVertex = (t: TentTarget, index: number, tablePt: Pt): string | void => {
    const world = tableToWorld(tablePt, origin)
    const cur = targetWorldRing(stores.doc.getState().layout, t)[index]
    if (cur !== undefined && samePoint(cur, world)) return
    return errorOf(setTargetVertex(stores, t, index, world))
  }

  const deleteVertex = (index: number) => toastIfRejected(deleteTargetVertex(stores, target, index))
  const selectedPt = selected === null ? undefined : points[selected]

  return (
    <div
      id={p.id}
      className="tf-tent__vertices"
      data-testid="tent-vertex-section"
      onFocus={() => setFrozenOrigin((o) => o ?? liveOrigin)}
      onBlur={(e) => {
        const next = e.relatedTarget
        if (!(next instanceof Node) || !e.currentTarget.contains(next)) setFrozenOrigin(null)
      }}
    >
      {p.showTable && (
        <div data-testid="tent-vertex-table">
          <VertexTable
            points={points}
            selectedIndex={selected}
            disabled={!enabled}
            onSelect={(index) => stores.ui.getState().selectTentTarget(target, index)}
            onChange={(index, pt) => moveVertex(target, index, pt)}
            onDelete={deleteVertex}
            onAdd={() => {
              // §4.4-7: 선택한 꼭짓점 다음 변의 중점, 없으면 마지막 변(n→1)
              insertTargetVertex(stores, target, selected ?? ring.length - 1)
            }}
          />
        </div>
      )}
      {selected !== null && selectedPt !== undefined && (
        <div className="tf-tent__vertex" data-testid="tent-selected-vertex">
          <p className="tf-tent__vertex-title">{selected + 1}번 꼭짓점</p>
          {!p.showTable && (
            <div className="tf-row2">
              <NumberField
                label="X"
                unit="cm"
                value={selectedPt[0]}
                targetId={vertexFieldId(target, selected)}
                min={COORD_MIN}
                max={COORD_MAX}
                allowNegative
                disabled={!enabled}
                onCommit={(id, x) => {
                  const v = parseVertexFieldId(id)
                  if (v === null) return
                  const cur = targetWorldRing(stores.doc.getState().layout, v.target)[v.index]
                  if (cur === undefined) return
                  return moveVertex(v.target, v.index, [x, worldToTable(cur, origin)[1]])
                }}
              />
              <NumberField
                label="Y"
                unit="cm"
                value={selectedPt[1]}
                targetId={vertexFieldId(target, selected)}
                min={COORD_MIN}
                max={COORD_MAX}
                allowNegative
                disabled={!enabled}
                onCommit={(id, y) => {
                  const v = parseVertexFieldId(id)
                  if (v === null) return
                  const cur = targetWorldRing(stores.doc.getState().layout, v.target)[v.index]
                  if (cur === undefined) return
                  return moveVertex(v.target, v.index, [worldToTable(cur, origin)[0], y])
                }}
              />
            </div>
          )}
          <button
            type="button"
            className="tf-btn tf-btn--danger"
            disabled={!enabled || ring.length <= 3}
            onClick={() => deleteVertex(selected)}
          >
            꼭짓점 삭제
          </button>
        </div>
      )}
    </div>
  )
}
