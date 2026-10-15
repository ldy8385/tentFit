// 도형 위 치수(소유자 요청 2026-10-14): 고른 도형 하나(텐트 모드 = 편집 대상, 배치 모드 = 물건 하나)에 변 cm·전체 가로/세로 치수선·모서리 R을
// 업체 도면처럼 그리고, 숫자를 누르면 그 자리에서 고칩니다. 캔버스(Konva) 위 DOM 층이라 글자가 또렷하고 화면 테스트·낭독이 바로 읽습니다.
// - PC: 숫자 자리에 작은 입력 상자(Enter 반영, Esc 닫기, 밖을 누르면 반영). 휴대폰: 키보드 바로 위 입력 막대(가려지지 않게).
// - 「비율 유지」(ui.keepRatio, 기본 켬)는 입력 상자·막대 안에서도 바꿀 수 있습니다. 반지름에는 쓰지 않습니다.
// - 이 층의 누름은 캔버스 제스처로 가지 않습니다(Board가 [data-canvas-ui] 안의 포인터를 건너뜀).
// - 끄는 중·변형 중·그리는 중·측정 중·잠긴 단계에는 숨깁니다.
import { useEffect, useRef, useState, type FocusEvent, type JSX } from 'react'
import { flushSync } from 'react-dom'
import { applyDim, type DimSubject } from '../../app/dimActions'
import { useDoc, useStores, useUi } from '../../app/stores'
import type { EditResult } from '../../app/tentActions'
import type { DimKey } from '../../core/dimEdit'
import { LIMITS, type Layout, type Pt, type Shape } from '../../core/model'
import { tentTargetBlocked, type UiState } from '../../store/ui'
import { KeepRatioToggle } from '../../ui/common/KeepRatioToggle'
import { checkNumber, INPUT_FONT_PX } from '../../ui/fields/numberInput'
import { useVisualViewport } from '../../ui/fields/useVisualViewport'
import { useIsDesktop } from '../../ui/shell/useIsDesktop'
import { dimModel, type DimBounds, type DimLabel, type DimLine, type DimPlacement } from '../dimLabels'
import type { View } from '../viewport'
import '../../ui/panels/panels.css'
import './dimOverlay.css'

export type ActiveDim = { subject: DimSubject; shape: Shape; place: DimPlacement }

/**
 * 치수를 보여 줄 도형. 텐트 편집 모드(편집기의 텐트 편집·만들기 화면·물건 모양 편집 화면)의 편집 대상만입니다.
 * 배치 모드는 이동·회전만이라 치수·모서리 포인트를 띄우지 않습니다(소유자 결정 2026-10-15). 없으면 null.
 */
export function activeDimSubject(
  ui: Pick<UiState, 'mode' | 'measuring' | 'drawing' | 'tentTarget' | 'tentLock' | 'outerPending'>,
  layout: Layout,
): ActiveDim | null {
  if (ui.measuring || ui.mode !== 'tent') return null
  const target = ui.tentTarget
  if (target === null || ui.drawing !== null || tentTargetBlocked(ui, target)) return null
  if (target === 'outer') return { subject: { kind: 'tent', target }, shape: layout.tent.outer, place: { x: 0, y: 0, rotation: 0 } }
  const inner = layout.tent.inners.find((it) => it.id === target.innerId)
  if (inner === undefined) return null
  return { subject: { kind: 'tent', target }, shape: inner.shape, place: { x: inner.x, y: inner.y, rotation: inner.rotation } }
}

export type ReadonlyDim = { key: string; who: string; shape: Shape; place: DimPlacement }

/**
 * 배치 모드의 읽기 전용 치수(소유자 요청 2026-10-15: "배치 모드에서도 텐트와 오브젝트 모두 가로세로 길이 정도는"):
 * 텐트 외곽 + 고른 물건 하나. 가로·세로(원은 지름)만, 누를 수 없습니다. 측정·그리는 중이면 없음.
 */
export function placeDims(ui: Pick<UiState, 'mode' | 'measuring' | 'drawing' | 'selection'>, layout: Layout): ReadonlyDim[] {
  if (ui.mode !== 'place' || ui.measuring || ui.drawing !== null) return []
  const out: ReadonlyDim[] = [{ key: 'tent', who: '텐트', shape: layout.tent.outer, place: { x: 0, y: 0, rotation: 0 } }]
  const it = ui.selection.length === 1 ? layout.items.find((x) => x.id === ui.selection[0]) : undefined
  if (it !== undefined) out.push({ key: `item:${it.id}`, who: '물건', shape: it.shape, place: { x: it.x, y: it.y, rotation: it.rotation } })
  return out
}

/** 읽기 전용 치수 층: 가로·세로 치수선과 숫자(누름은 캔버스로 그대로) */
function ReadonlyDims(p: { dims: ReadonlyDim[]; view: View; area: DimBounds }): JSX.Element | null {
  const models = p.dims.map((d) => {
    const m = dimModel(d.shape, d.place, p.view, p.area)
    return { d, lines: m.lines, labels: m.labels.filter((l) => l.id === 'w' || l.id === 'h') }
  })
  if (models.every((m) => m.labels.length === 0 && m.lines.length === 0)) return null
  return (
    <div className="tf-dims tf-dims--readonly" data-testid="dim-overlay-readonly">
      <DimLines lines={models.flatMap((m) => m.lines.map((l) => ({ ...l, key: `${m.d.key}:${l.id}` })))} />
      {models.flatMap((m) =>
        m.labels.map((l) => (
          <span
            key={`${m.d.key}:${l.id}`}
            className="tf-dim tf-dim--readonly"
            data-dim={`${m.d.key}:${l.id}`}
            aria-label={`${m.d.who} ${l.name} ${String(l.value)}cm`}
            style={{ left: l.at[0], top: l.at[1] }}
          >
            {l.text}
          </span>
        )),
      )}
    </div>
  )
}

function subjectKey(s: DimSubject): string {
  if (s.kind === 'item') return `item:${s.id}`
  return s.target === 'outer' ? 'tent:outer' : `tent:${s.target.innerId}`
}

type Edit = { subject: DimSubject; subjectKey: string; key: DimKey; id: string; name: string; at: Pt; dir?: Pt; text: string; error: string | null }

/** 모서리 둥글기 입력 창(PC) 크기·모서리 포인트와의 여백(px). 창은 도형 바깥쪽 옆에 띄워 모서리·도형을 가리지 않습니다. */
const CORNER_POP = { w: 196, h: 96, gap: 16, margin: 8 }

type Box = { left: number; top: number; right: number; bottom: number }

/** 모서리 포인트(at) 옆, 바깥쪽(dir)으로 띄운 창 자리. 보이는 영역을 넘으면 반대쪽으로 돌리고 안으로 당깁니다. */
export function cornerPopoverPos(at: Pt, dir: Pt, area: Box): { left: number; top: number } {
  const { w, h, gap, margin } = CORNER_POP
  const right = at[0] + gap
  const leftSide = at[0] - gap - w
  let left = dir[0] >= 0 ? right : leftSide
  if (left < area.left + margin) left = right
  if (left + w > area.right - margin) left = leftSide
  let top = dir[1] >= 0 ? at[1] - h / 4 : at[1] - (h * 3) / 4
  top = Math.min(Math.max(top, area.top + margin), area.bottom - margin - h)
  left = Math.min(Math.max(left, area.left + margin), area.right - margin - w)
  return { left, top }
}

const TICK_PX = 5
/** 캔버스 위쪽 칩이 차지하는 높이(px): PC는 모드 칩, 휴대폰은 요약 칩 + 모드 칩 */
const TOP_CHIPS_DESKTOP_PX = 56
const TOP_CHIPS_MOBILE_PX = 104

function DimLines(p: { lines: (DimLine & { key?: string })[] }): JSX.Element {
  return (
    <svg className="tf-dims__svg" aria-hidden="true">
      {p.lines.map((l) => {
        const len = Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]) || 1
        const ux = (l.b[0] - l.a[0]) / len
        const uy = (l.b[1] - l.a[1]) / len
        // 도면식 끝 표시: 45° 빗금
        const tx = ((ux - uy) * TICK_PX) / Math.SQRT2
        const ty = ((uy + ux) * TICK_PX) / Math.SQRT2
        return (
          <g key={l.key ?? l.id} data-dim-line={l.key ?? l.id}>
            <line x1={l.a[0]} y1={l.a[1]} x2={l.b[0]} y2={l.b[1]} />
            {l.ext.map(([s, e], i) => (
              <line key={i} x1={s[0]} y1={s[1]} x2={e[0]} y2={e[1]} />
            ))}
            {[l.a, l.b].map((q, i) => (
              <line key={`t${i}`} x1={q[0] - tx} y1={q[1] - ty} x2={q[0] + tx} y2={q[1] + ty} />
            ))}
          </g>
        )
      })}
    </svg>
  )
}

/**
 * 도형 위 치수 층. busy = 물건을 끌거나 변형하는 중(값이 손을 뗄 때 바뀌므로 숨김), dimmed = 그룹 밖이라 흐린 물건.
 * hidden = 그 밖에 숨길 때(텐트 끌기 미리보기·배경 맞추기).
 */
export function DimOverlay(p: { busy: boolean; hidden: boolean }): JSX.Element | null {
  const stores = useStores()
  const layout = useDoc((s) => s.layout)
  const view = useUi((s) => s.view)
  const mode = useUi((s) => s.mode)
  const measuring = useUi((s) => s.measuring)
  const drawing = useUi((s) => s.drawing)
  const tentTarget = useUi((s) => s.tentTarget)
  const selection = useUi((s) => s.selection)
  const tentLock = useUi((s) => s.tentLock)
  const outerPending = useUi((s) => s.outerPending)
  const keepRatio = useUi((s) => s.keepRatio)
  const size = useUi((s) => s.size)
  const insets = useUi((s) => s.insets)
  const desktop = useIsDesktop()
  const [editState, setEdit] = useState<Edit | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  /** 닫은 뒤(Esc·확인·닫기) 따라오는 blur가 다시 반영하지 않게 */
  const closedRef = useRef(false)

  const active = p.busy || p.hidden ? null : activeDimSubject({ mode, measuring, drawing, tentTarget, tentLock, outerPending }, layout)
  const key = active === null ? null : subjectKey(active.subject)

  // 대상이 바뀌거나 숨으면 입력은 보이지 않습니다(반영하지 않음). 다음에 숫자를 누르면 새로 엽니다.
  const edit = editState !== null && editState.subjectKey === key ? editState : null

  // 텐트 대상의 변·꼭짓점을 고치는 동안 캔버스가 그 변·꼭짓점을 강조합니다.
  const focusKey = edit === null ? null : edit.key
  useEffect(() => {
    if (focusKey === null || edit?.subject.kind !== 'tent') return
    const ui = stores.ui.getState()
    if (focusKey.kind === 'edge') ui.setPolygonFocus({ kind: 'edge', index: focusKey.index })
    else if (focusKey.kind === 'radius') ui.setPolygonFocus({ kind: 'vertex', index: focusKey.index })
    return () => stores.ui.getState().setPolygonFocus(null)
  }, [focusKey, edit?.subject.kind, stores])

  // 위쪽 칩(PC 모드 칩, 휴대폰 요약·모드 칩) 자리는 피합니다.
  const top = insets.top + (desktop ? TOP_CHIPS_DESKTOP_PX : TOP_CHIPS_MOBILE_PX)
  const area = { left: 0, top, right: size.width, bottom: size.height - insets.bottom }
  if (active === null) {
    const ro = p.busy || p.hidden ? [] : placeDims({ mode, measuring, drawing, selection }, layout)
    return ro.length === 0 ? null : <ReadonlyDims dims={ro} view={view} area={area} />
  }
  const model = dimModel(active.shape, active.place, view, area)
  const radiusEdit = edit?.key.kind === 'radius'
  const circle = active.shape.kind === 'circle'

  const open = (l: DimLabel) => {
    closedRef.current = false
    // 휴대폰 키보드는 누른 그 순간(같은 이벤트 처리 안)에 포커스해야 올라옵니다.
    flushSync(() =>
      setEdit({
        subject: active.subject,
        subjectKey: subjectKey(active.subject),
        key: l.key,
        id: l.id,
        name: l.name,
        at: l.at,
        ...(l.dir !== undefined ? { dir: l.dir } : {}),
        text: String(l.value),
        error: null,
      }),
    )
    inputRef.current?.focus()
    inputRef.current?.select()
  }

  const close = () => {
    closedRef.current = true
    setEdit(null)
  }

  /** 지금 입력을 반영해 봅니다. */
  const run = (e: Edit): EditResult => {
    const c = checkNumber(e.text, e.key.kind === 'radius' ? 0 : LIMITS.length[0], LIMITS.length[1])
    if (!c.ok) return { ok: false, error: c.error }
    return applyDim(stores, e.subject, e.key, c.value, stores.ui.getState().keepRatio)
  }

  /** Enter·[확인]: 성공이면 닫고, 아니면 문구를 보입니다(입력 유지). */
  const apply = () => {
    if (edit === null) return
    const r = run(edit)
    if (r.ok) close()
    else setEdit({ ...edit, error: r.error })
  }

  /** 밖을 누름: 반영해 보고 닫습니다. 안 되면 문구를 토스트로(입력이 걸려 있지 않게). Esc·닫기 뒤의 blur는 무시. */
  const onBlur = (e: FocusEvent) => {
    if (edit === null || closedRef.current) return
    if (e.relatedTarget instanceof Node && boxRef.current?.contains(e.relatedTarget)) return
    const r = run(edit)
    if (!r.ok) stores.ui.getState().showToast(r.error)
    close()
  }

  const editingLabel = edit !== null ? model.labels.find((l) => l.id === edit.id) : undefined
  const editing = edit !== null ? (editingLabel?.at ?? edit.at) : null
  const cornerDir = editingLabel?.dir ?? edit?.dir
  // 모서리 둥글기 창은 모서리 옆에(가리지 않게), 그 밖의 숫자는 그 숫자 자리에
  const popStyle =
    !desktop || editing === null
      ? undefined
      : radiusEdit && cornerDir !== undefined
        ? cornerPopoverPos(editing, cornerDir, area)
        : { left: editing[0], top: editing[1] }

  const editor =
    edit === null ? null : (
      <div
        ref={boxRef}
        className={desktop ? (radiusEdit ? 'tf-dimedit tf-dimedit--corner' : 'tf-dimedit') : 'tf-dimbar'}
        data-canvas-ui=""
        role="group"
        aria-label={`${edit.name} 고치기`}
        style={popStyle}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            close()
          }
        }}
      >
        {(!desktop || radiusEdit) && <span className={desktop ? 'tf-dimedit__title' : 'tf-dimbar__name'}>{edit.name}</span>}
        <span className="tf-dimedit__row">
          <input
            ref={inputRef}
            className="tf-dimedit__input"
            type="text"
            inputMode="decimal"
            enterKeyHint="done"
            autoComplete="off"
            spellCheck={false}
            aria-label={edit.name}
            aria-invalid={edit.error !== null}
            style={{ fontSize: INPUT_FONT_PX }}
            value={edit.text}
            onChange={(e) => setEdit({ ...edit, text: e.target.value, error: null })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault()
                apply()
              }
            }}
          />
          <span className="tf-dimedit__unit">{radiusEdit ? 'cm (0 = 뾰족)' : 'cm'}</span>
        </span>
        {!radiusEdit && !circle && <KeepRatioToggle className="tf-dimedit__ratio" />}
        {!desktop && (
          <span className="tf-dimbar__actions">
            <button type="button" className="tf-btn tf-btn--primary" onClick={apply}>
              확인
            </button>
            <button type="button" className="tf-btn" aria-label="닫기" onClick={close}>
              ×
            </button>
          </span>
        )}
        {edit.error !== null && (
          <span className="tf-dimedit__error" role="alert">
            {edit.error}
          </span>
        )}
      </div>
    )

  return (
    <div className="tf-dims" data-canvas-ui="" data-testid="dim-overlay" data-keep-ratio={keepRatio}>
      <DimLines lines={model.lines} />
      {model.labels.map((l) =>
        edit !== null && desktop && l.id === edit.id && l.key.kind !== 'radius' ? null : (
          <button
            key={l.id}
            type="button"
            className="tf-dim"
            data-dim={l.id}
            data-kind={l.key.kind}
            data-dot={l.text === '' ? 'true' : undefined}
            data-active={edit?.id === l.id}
            aria-label={`${l.name} ${l.value}cm 고치기`}
            style={{ left: l.at[0], top: l.at[1] }}
            onClick={() => open(l)}
          >
            {l.text}
          </button>
        ),
      )}
      {desktop ? editor : <MobileBar>{editor}</MobileBar>}
    </div>
  )
}

/** 휴대폰 입력 막대 자리: 키보드 바로 위(visualViewport) */
function MobileBar(p: { children: JSX.Element | null }): JSX.Element | null {
  const vv = useVisualViewport()
  if (p.children === null) return null
  return (
    <div className="tf-dimbar-host" style={{ bottom: vv.keyboardInset }}>
      {p.children}
    </div>
  )
}
