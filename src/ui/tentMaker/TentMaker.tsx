// 텐트 만들기 화면(스펙 §4.4-1·§4.8, D22–D24). 고르기 화면(#/pick) 위, 또는 텐트 바꾸기(편집기) 위에 띄우는 전체 화면 오버레이입니다.
// - 상태는 폼 상태(makerState, 문서 아님)이고 실행 취소 기록 밖입니다(§8). 확정 때 makerTent(state) 한 번만 밖으로 나갑니다.
// - history(Review Focus 4): 열 때 항목 하나를 쌓고(해시 그대로), 그 항목이 빠지면(popstate) 닫힙니다.
//   [취소]·‹ = history.back() → popstate → onCancel. 확정 = 텐트를 기억해 두고 history.back() → popstate → onConfirm.
//   그래서 확정·취소 뒤 history에 오버레이 항목이 남지 않고(뒤로 가기가 한 번 헛돌지 않음), 확정 뒤의 편집기 push가 고르기 화면 위에 쌓입니다.
// - 입력: blur·Enter 때 검사(Minor #17), Enter = 다음 칸·마지막 칸 blur(formEnterKeyDown), 한글 조합 Enter는 이동 없음.
// - 휴대폰 키보드(§4.2): 입력 포커스 동안 미리보기 약 140px, 포커스 칸 scrollIntoView({ block: 'nearest' }).
// - "내 텐트에도 저장" 체크는 Plan 7(R1) — 만들지 않습니다.
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type JSX } from 'react'
import { ringBBox } from '../../core/geom'
import { LIMITS, newId, round1, type Pt, type Tent } from '../../core/model'
import { ATTACH_SIDE_LABELS, attachSidesFor, ngonDiameterFromSide, ngonSideFromDiameter, type AttachSide } from '../../core/templates'
import {
  addMakerInner,
  checkMaker,
  deleteFreePoint,
  floorAreaText,
  initialMakerState,
  insertFreePoint,
  makerTent,
  outerTemplateOf,
  removeMakerInner,
  setFreePoint,
  setKind,
  setTemplateField,
  updateMakerInner,
  type MakerKind,
  type MakerState,
} from '../../app/tentMaker/makerState'
import { withSubject } from '../area/warningRows'
import { SegmentedControl } from '../common/SegmentedControl'
import { ToastView } from '../common/Toast'
import { FormNumberInput, FormTextInput, formEnterKeyDown, syncEnterKeyHints } from '../fields/formInput'
import { NAME_MAX_LENGTH } from '../fields/limits'
import { useVisualViewport } from '../fields/useVisualViewport'
import { BackIcon, TrashIcon } from '../shell/icons'
import { useIsDesktop } from '../shell/useIsDesktop'
import { VertexTable } from '../tent/VertexTable'
import { overlayBoxFor, previewHeightFor } from './makerLayout'
import { TentPreview } from './TentPreview'
import '../panels/panels.css'
import './tentMaker.css'

export type TentMakerMode = 'start' | 'swap'

/** 확정 버튼 문구(§4.7-8). 휴대폰은 짧은 글자를 보이고 접근 이름은 전체 문구입니다(시안 02 Mobile). */
export const CONFIRM_LABELS: Readonly<Record<TentMakerMode, { full: string; short: string }>> = {
  start: { full: '이 텐트로 시작', short: '시작' },
  swap: { full: '이 텐트로 바꾸기', short: '바꾸기' },
}

/** 이너 추가 실패 토스트(§4.4-1·§4.4-4) */
export const NO_SPACE_TEXT = '빈 공간이 부족해요'

const KIND_OPTIONS: readonly { kind: MakerKind; label: string }[] = [
  { kind: 'rect', label: '사각형' },
  { kind: 'trapezoid', label: '사다리꼴' },
  { kind: 'ngon', label: '정N각형' },
  { kind: 'circle', label: '원' },
  { kind: 'free', label: '자유' },
]

const SIZE_BY_OPTIONS = [
  { value: 'diameter', label: '지름' },
  { value: 'side', label: '한 변' },
] as const

const [LEN_MIN, LEN_MAX] = LIMITS.length
const [OFF_MIN, OFF_MAX] = LIMITS.offset
const [N_MIN, N_MAX] = LIMITS.ngonN

function clampLength(v: number): number {
  return Math.min(LEN_MAX, Math.max(LEN_MIN, round1(v)))
}

/** history 항목에 단 표시. 이 오버레이가 쌓은 항목인지 알아보는 데 씁니다. */
function markOf(state: unknown): unknown {
  return typeof state === 'object' && state !== null ? (state as { tentMaker?: unknown }).tentMaker : undefined
}

/** 모양 카드 아이콘(20px, currentColor) */
function KindIcon(p: { kind: MakerKind }): JSX.Element {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinejoin: 'round' as const }
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      {p.kind === 'rect' && <rect x="2.5" y="4.5" width="15" height="11" rx="1.5" {...common} />}
      {p.kind === 'trapezoid' && <path d="M6 4.5h8l3.5 11h-15z" {...common} />}
      {p.kind === 'ngon' && <path d="M10 2.5 16.5 6.2v7.6L10 17.5l-6.5-3.7V6.2z" {...common} />}
      {p.kind === 'circle' && <circle cx="10" cy="10" r="7.5" {...common} />}
      {p.kind === 'free' && <path d="M4 5.5 12.5 3l4.5 6-3 7.5-9.5-1.5z" {...common} />}
    </svg>
  )
}

export function TentMaker(p: {
  mode: TentMakerMode
  myTentNames: readonly string[]
  onConfirm(tent: Tent): void
  onCancel(): void
}): JSX.Element {
  const isDesktop = useIsDesktop()
  const vv = useVisualViewport()
  const titleId = useId()
  const reasonId = useId()
  const [state, setState] = useState<MakerState>(() => initialMakerState({ myTentNames: p.myTentNames }))
  const tent = useMemo(() => makerTent(state), [state])
  const check = useMemo(() => checkMaker(state), [state])
  const template = outerTemplateOf(state)
  const sides = attachSidesFor(template ?? undefined)
  const escaped = new Set(check.escapedInnerIds)
  const labels = CONFIRM_LABELS[p.mode]
  const reason = check.canConfirm ? '' : (check.problems[0] ?? '')

  // ── 토스트 ────────────────────────────────────────────────
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null)
  const toastSeq = useRef(0)
  const showToast = (text: string) => {
    toastSeq.current += 1
    setToast({ id: toastSeq.current, text })
  }
  const dismissToast = useCallback((id: number) => setToast((t) => (t !== null && t.id === id ? null : t)), [])

  // ── history: 열 때 항목 하나, popstate로 닫힘 ─────────────────
  const [token] = useState(() => newId())
  const pendingTent = useRef<Tent | null>(null)
  const leaving = useRef(false)
  const closed = useRef(false)
  const callbacks = useRef({ onConfirm: p.onConfirm, onCancel: p.onCancel })
  useEffect(() => {
    callbacks.current = { onConfirm: p.onConfirm, onCancel: p.onCancel }
  })
  useEffect(() => {
    // StrictMode의 두 번째 효과 실행에서는 이미 쌓은 항목 위이므로 다시 쌓지 않습니다.
    if (markOf(window.history.state) !== token) window.history.pushState({ tentMaker: token }, '', window.location.href)
    const onPop = () => {
      if (markOf(window.history.state) === token || closed.current) return
      closed.current = true
      const confirmed = pendingTent.current
      pendingTent.current = null
      if (confirmed !== null) callbacks.current.onConfirm(confirmed)
      else callbacks.current.onCancel()
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [token])

  /** 오버레이 항목을 지웁니다. tent가 있으면 지운 뒤 onConfirm, 없으면 onCancel(popstate에서). 한 번만. */
  const leave = (confirmed: Tent | null) => {
    if (leaving.current || closed.current) return
    leaving.current = true
    pendingTent.current = confirmed
    window.history.back()
  }
  const cancel = () => leave(null)
  const confirm = () => {
    if (!check.canConfirm) return
    leave(tent)
  }

  // ── 휴대폰 키보드: 입력 포커스 중 미리보기 축소 + 포커스 칸 보이게 ─────
  const formRef = useRef<HTMLDivElement>(null)
  const focusedInput = useRef<HTMLInputElement | null>(null)
  const [inputFocused, setInputFocused] = useState(false)
  const [focusSeq, setFocusSeq] = useState(0)
  const isTextInput = (el: EventTarget | null): el is HTMLInputElement => el instanceof HTMLInputElement && el.type === 'text'
  const onFormFocus = (e: FocusEvent<HTMLDivElement>) => {
    if (!isTextInput(e.target)) return
    focusedInput.current = e.target
    setInputFocused(true)
    setFocusSeq((n) => n + 1)
  }
  const onFormBlur = (e: FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget
    if (isTextInput(next) && e.currentTarget.contains(next)) return
    focusedInput.current = null
    setInputFocused(false)
  }
  useLayoutEffect(() => {
    if (isDesktop || !inputFocused) return
    focusedInput.current?.scrollIntoView({ block: 'nearest' })
  }, [isDesktop, inputFocused, focusSeq, vv.height, vv.keyboardInset])

  // 칸 구성이 모양·이너 수에 따라 바뀌므로 그릴 때마다 Enter 표시(next/done)를 맞춥니다.
  useLayoutEffect(() => {
    if (formRef.current !== null) syncEnterKeyHints(formRef.current)
  })

  // ── 자유 모양 좌표 표: 기준점 = 지금 꼭짓점 바운딩 박스 왼쪽 위, 표 안에 포커스가 있는 동안 고정(D32) ─────
  const [freeSelected, setFreeSelected] = useState<number | null>(null)
  const [frozenOrigin, setFrozenOrigin] = useState<Pt | null>(null)
  const liveOrigin: Pt = state.free.length > 0 ? [ringBBox(state.free).minX, ringBBox(state.free).minY] : [0, 0]
  const origin = frozenOrigin ?? liveOrigin
  const tablePoints = state.free.map((pt): Pt => [round1(pt[0] - origin[0]), round1(pt[1] - origin[1])])

  // ── 동작 ────────────────────────────────────────────────
  const update = (f: (s: MakerState) => MakerState) => setState((s) => f(s))
  const chooseKind = (kind: MakerKind) => {
    setFreeSelected(null)
    update((s) => setKind(s, kind))
  }
  const addInner = () => {
    const r = addMakerInner(state)
    if (r.ok) setState(r.state)
    else showToast(NO_SPACE_TEXT)
  }
  const chooseSizeBy = (next: 'diameter' | 'side') => {
    update((s) => {
      if (s.ngon.sizeBy === next) return s
      const size = next === 'side' ? ngonSideFromDiameter(s.ngon.n, s.ngon.size) : ngonDiameterFromSide(s.ngon.n, s.ngon.size)
      return setTemplateField(s, { sizeBy: next, size: clampLength(size) })
    })
  }

  const confirmButton = (
    <button
      type="button"
      className="tf-maker__confirm"
      aria-label={labels.full}
      aria-describedby={reason === '' ? undefined : reasonId}
      disabled={!check.canConfirm}
      onClick={confirm}
    >
      <span aria-hidden="true">✓ {isDesktop ? labels.full : labels.short}</span>
    </button>
  )

  const overlayBox = isDesktop ? null : overlayBoxFor(vv)
  const viewportHeight = vv.height > 0 ? vv.height : typeof window === 'undefined' ? 0 : window.innerHeight
  const previewHeight = previewHeightFor(viewportHeight, inputFocused)

  return (
    <div
      className="tf-maker"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="tent-maker"
      data-layout={isDesktop ? 'desktop' : 'mobile'}
      style={overlayBox === null ? undefined : { top: overlayBox.top, bottom: 'auto', height: overlayBox.height }}
    >
      <header className="tf-maker__bar">
        <button type="button" className="tf-maker__back" aria-label="뒤로" onClick={cancel}>
          <BackIcon />
        </button>
        <h1 id={titleId} className="tf-maker__title">
          텐트 만들기
        </h1>
        <div className="tf-maker__actions">
          {isDesktop && (
            <button type="button" className="tf-maker__cancel" onClick={cancel}>
              취소
            </button>
          )}
          {confirmButton}
        </div>
      </header>
      <p id={reasonId} className="tf-maker__reason" role="status" data-testid="tent-maker-reason" data-empty={reason === ''}>
        {reason}
      </p>

      <div className="tf-maker__body">
        <section
          className="tf-maker__preview"
          aria-label="미리보기"
          data-testid="tent-maker-preview"
          style={isDesktop ? undefined : { height: previewHeight }}
        >
          <TentPreview tent={tent} template={template} selectedVertex={state.kind === 'free' ? freeSelected : null} />
        </section>

        <div
          ref={formRef}
          className="tf-maker__form"
          data-testid="tent-maker-form"
          onKeyDown={formEnterKeyDown}
          onFocus={onFormFocus}
          onBlur={onFormBlur}
        >
          <FormTextInput
            label="텐트 이름"
            value={state.name}
            maxLength={NAME_MAX_LENGTH}
            onCommit={(name) => update((s) => ({ ...s, name }))}
          />

          <div className="tf-maker__group" role="group" aria-label="모양">
            <span className="tf-maker__label" aria-hidden="true">
              모양
            </span>
            <div className="tf-maker__kinds">
              {KIND_OPTIONS.map((o) => (
                <button
                  key={o.kind}
                  type="button"
                  className="tf-maker__kind"
                  aria-pressed={state.kind === o.kind}
                  onClick={() => chooseKind(o.kind)}
                >
                  <KindIcon kind={o.kind} />
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="tf-maker__group" role="group" aria-label="치수">
            <span className="tf-maker__label" aria-hidden="true">
              치수
            </span>
            {state.kind === 'rect' && (
              <>
                <div className="tf-row2">
                  <FormNumberInput
                    label="가로"
                    unit="cm"
                    value={state.rect.w}
                    min={LEN_MIN}
                    max={LEN_MAX}
                    onCommit={(w) => update((s) => setTemplateField(s, s.rect.square ? { w, h: w } : { w }))}
                  />
                  <FormNumberInput
                    label="세로"
                    unit="cm"
                    value={state.rect.square ? state.rect.w : state.rect.h}
                    min={LEN_MIN}
                    max={LEN_MAX}
                    onCommit={(h) => update((s) => setTemplateField(s, s.rect.square ? { w: h, h } : { h }))}
                  />
                </div>
                <label className="tf-toggle">
                  <input
                    type="checkbox"
                    checked={state.rect.square}
                    onChange={(e) => {
                      const square = e.target.checked
                      update((s) => setTemplateField(s, { square }))
                    }}
                  />
                  <span>정사각형</span>
                </label>
              </>
            )}
            {state.kind === 'trapezoid' && (
              <>
                <div className="tf-maker__grid2">
                  <FormNumberInput
                    label="앞변"
                    unit="cm"
                    value={state.trapezoid.front}
                    min={LEN_MIN}
                    max={LEN_MAX}
                    onCommit={(front) => update((s) => setTemplateField(s, { front }))}
                  />
                  <FormNumberInput
                    label="뒷변"
                    unit="cm"
                    value={state.trapezoid.back}
                    min={LEN_MIN}
                    max={LEN_MAX}
                    onCommit={(back) => update((s) => setTemplateField(s, { back }))}
                  />
                  <FormNumberInput
                    label="깊이"
                    unit="cm"
                    value={state.trapezoid.depth}
                    min={LEN_MIN}
                    max={LEN_MAX}
                    onCommit={(depth) => update((s) => setTemplateField(s, { depth }))}
                  />
                  <FormNumberInput
                    label="치우침"
                    unit="cm"
                    allowNegative
                    value={state.trapezoid.offset}
                    min={OFF_MIN}
                    max={OFF_MAX}
                    onCommit={(offset) => update((s) => setTemplateField(s, { offset }))}
                  />
                </div>
                <p className="tf-maker__hint">+면 뒷변이 오른쪽으로</p>
              </>
            )}
            {state.kind === 'ngon' && (
              <>
                <FormNumberInput
                  label="변 수"
                  integer
                  value={state.ngon.n}
                  min={N_MIN}
                  max={N_MAX}
                  onCommit={(n) => update((s) => setTemplateField(s, { n }))}
                />
                <SegmentedControl
                  label="크기 기준"
                  options={SIZE_BY_OPTIONS}
                  value={state.ngon.sizeBy}
                  onChange={chooseSizeBy}
                />
                <FormNumberInput
                  key={state.ngon.sizeBy}
                  label={state.ngon.sizeBy === 'diameter' ? '지름' : '한 변'}
                  unit="cm"
                  value={state.ngon.size}
                  min={LEN_MIN}
                  max={LEN_MAX}
                  onCommit={(size) => update((s) => setTemplateField(s, { size }))}
                />
              </>
            )}
            {state.kind === 'circle' && (
              <FormNumberInput
                label="지름"
                unit="cm"
                value={state.circle.d}
                min={LEN_MIN}
                max={LEN_MAX}
                onCommit={(d) => update((s) => setTemplateField(s, { d }))}
              />
            )}
            {state.kind === 'free' && (
              <div
                onFocus={() => {
                  if (frozenOrigin === null) setFrozenOrigin(liveOrigin)
                }}
                onBlur={(e) => {
                  if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) setFrozenOrigin(null)
                }}
              >
                <VertexTable
                  points={tablePoints}
                  selectedIndex={freeSelected}
                  onSelect={setFreeSelected}
                  onChange={(index, tp) => update((s) => setFreePoint(s, index, [tp[0] + origin[0], tp[1] + origin[1]]))}
                  onDelete={(index) => {
                    setFreeSelected(null)
                    update((s) => deleteFreePoint(s, index))
                  }}
                  onAdd={() => {
                    const after = freeSelected ?? state.free.length - 1
                    update((s) => insertFreePoint(s, freeSelected))
                    setFreeSelected(after + 1)
                  }}
                />
              </div>
            )}
            <p className="tf-maker__area tf-num">{floorAreaText(state)}</p>
          </div>

          <section className="tf-maker__group" aria-label="이너">
            <div className="tf-maker__inners-head">
              <span className="tf-maker__label">이너</span>
              <span className="tf-maker__count tf-num">{state.inners.length}개</span>
            </div>
            {state.inners.map((inner) => (
              <div
                key={inner.id}
                className="tf-maker__inner"
                role="group"
                aria-label={inner.name}
                data-escaped={escaped.has(inner.id)}
              >
                <div className="tf-maker__inner-head">
                  <span className="tf-maker__dot" aria-hidden="true" />
                  <strong className="tf-maker__inner-name">{inner.name}</strong>
                  <button
                    type="button"
                    className="tf-maker__trash"
                    aria-label={`${inner.name} 삭제`}
                    onClick={() => update((s) => removeMakerInner(s, inner.id))}
                  >
                    <TrashIcon size={18} />
                  </button>
                </div>
                <div className="tf-row2">
                  <FormNumberInput
                    label="폭"
                    ariaLabel={`${inner.name} 폭`}
                    unit="cm"
                    value={inner.width}
                    min={LEN_MIN}
                    max={LEN_MAX}
                    onCommit={(width) => update((s) => updateMakerInner(s, inner.id, { width }))}
                  />
                  <FormNumberInput
                    label="깊이"
                    ariaLabel={`${inner.name} 깊이`}
                    unit="cm"
                    value={inner.depth}
                    min={LEN_MIN}
                    max={LEN_MAX}
                    onCommit={(depth) => update((s) => updateMakerInner(s, inner.id, { depth }))}
                  />
                </div>
                {sides.length > 0 && (
                  <SegmentedControl<AttachSide | 'none'>
                    label={`${inner.name} 붙일 위치`}
                    options={sides.map((side) => ({ value: side, label: ATTACH_SIDE_LABELS[side] }))}
                    value={inner.side ?? 'none'}
                    onChange={(side) => {
                      if (side !== 'none') update((s) => updateMakerInner(s, inner.id, { side }))
                    }}
                  />
                )}
                {escaped.has(inner.id) && <p className="tf-maker__warn">{`${withSubject(inner.name)} 외곽 밖으로 나감`}</p>}
              </div>
            ))}
            <button type="button" className="tf-maker__add-inner" onClick={addInner}>
              + 이너 추가
            </button>
          </section>
        </div>
      </div>

      <ToastView toast={toast} onDismiss={dismissToast} />
    </div>
  )
}
