// 텐트 만들기 화면(설계 2026-10-12 §1·§4, Plan 4.1). 고르기 화면(#/pick) 위, 또는 텐트 바꾸기(편집기) 위에 띄우는 전체 화면 오버레이입니다.
// - 편집기와 같은 캔버스(Board)·텐트 패널(TentEditor)을 임시 스토어(mode 'tent', 보관소에 쓰지 않음) 위에서 씁니다.
//   외곽이 아직 없을 때는 자리표시 외곽 + ui.outerPending(판단 Q1). 첫 외곽은 doc.load(기록 빈 시작, 판단 Q2).
// - 두 단계: ① 외곽(이너 잠금 'inners') → [다음] → ② 이너(외곽 잠금 'outer'). 단계 ②의 ‹ 「외곽으로」는 단계 ①로(이너 유지),
//   단계 ①의 ‹ 「뒤로」와 [취소]·브라우저 뒤로 가기는 취소입니다(판단 Q4).
// - 확정 = 임시 문서 텐트 + 이름 칸 값(앞뒤 공백 정리, 비면 「내 텐트」). 임시 기록은 확정·취소하면 버립니다(D22).
// - history: 열 때 항목 하나(해시 그대로), 그 항목이 빠지면(popstate) 닫힘. [취소]·‹ = history.back() → onCancel,
//   확정 = 텐트를 기억해 두고 history.back() → onConfirm. 그래서 확정·취소 뒤 오버레이 항목이 남지 않습니다.
// - 포커스는 오버레이 안에 가둡니다(Plan 4 최종 리뷰). 단축키는 자기 스토어로 따로 걸고 자기 루트는 모달로 치지 않습니다(판단 Q17).
// - 그리는 중에는 주 버튼·실행 취소를 끄고 사유 「그리기를 마치거나 취소하세요」(판단 Q5). 휴대폰 시트는 숨깁니다(판단 Q13).
// - "내 텐트에도 저장" 체크는 Plan 7(R1) — 만들지 않습니다.
import { useEffect, useId, useRef, useState, type CSSProperties, type JSX } from 'react'
import { useShortcuts } from '../../app/shortcuts'
import { createStores, StoresProvider, useDoc, useStores, useUi, type Stores } from '../../app/stores'
import { MAKER_CANVAS_HOST_TEST_ID, MAKER_HOOK_KEY, installTestHook } from '../../app/testHook'
import { tentIssues } from '../../core/ops/tent'
import { newId, type Shape, type Tent } from '../../core/model'
import { initialTentName, makerConfirmTent, makerLayout } from '../../app/tentMaker/makerTent'
import { toPointerKind } from '../../store/ui'
import { Board } from '../../view/canvas/Board'
import { useFocusTrap } from '../common/useFocusTrap'
import { NAME_MAX_LENGTH } from '../fields/limits'
import { TextField } from '../fields/TextField'
import { ScaleBarView, ToastHost, ZoomControls } from '../shell/CanvasOverlay'
import { BackdropControl } from '../shell/BackdropControl'
import { BackIcon, RedoIcon, UndoIcon } from '../shell/icons'
import { useRevealOnSheet, useSheetInsets } from '../shell/sheetHooks'
import { useIsDesktop } from '../shell/useIsDesktop'
import { BottomSheet } from '../sheets/BottomSheet'
import { DrawTools } from '../tent/DrawTools'
import { TentEditor } from '../tent/TentEditor'
import { targetName } from '../tent/tentEditorModel'
import { ShapeTools } from './ShapeTools'
import '../panels/panels.css'
import '../shell/shell.css'
import './tentMaker.css'

/** item = 물건(매트) 그리기, itemEdit = 물건 모양 편집(소유자 요청 2026-10-14). 둘 다 한 단계(외곽 = 물건 모양)입니다. */
export type TentMakerMode = 'start' | 'swap' | 'item' | 'itemEdit'

/** 확정 버튼 문구(§4.7-8). 휴대폰은 짧은 글자를 보이고 접근 이름은 전체 문구입니다(시안 02 Mobile). */
export const CONFIRM_LABELS: Readonly<Record<TentMakerMode, { full: string; short: string }>> = {
  start: { full: '이 텐트로 시작', short: '시작' },
  swap: { full: '이 텐트로 바꾸기', short: '바꾸기' },
  item: { full: '캔버스에 추가', short: '추가' },
  itemEdit: { full: '이 모양으로 적용', short: '적용' },
}

function isItemMode(mode: TentMakerMode): boolean {
  return mode === 'item' || mode === 'itemEdit'
}

/** 물건 그리기 화면 문구 */
export const ITEM_GUIDE = '예시 모양을 고르거나 자유롭게 그려 모양을 만드세요 · 배경 이미지를 깔고 따라 그릴 수 있어요'
export const ITEM_NEED_SHAPE_REASON = '예시 모양을 고르거나 그려서 모양을 만드세요'
export const DEFAULT_ITEM_NAME = '새 매트'

/** 단계 ① [다음]이 꺼진 사유(외곽 없음) */
export const NEED_OUTER_REASON = '예시 모양을 고르거나 그려서 외곽을 만드세요'
/** 그리는 중 주 버튼이 꺼진 사유(판단 Q5) */
export const DRAWING_REASON = '그리기를 마치거나 취소하세요'
/** 대상이 없을 때 패널·시트 안내(설계 §1.1) */
export const STEP_GUIDES: Readonly<Record<1 | 2, string>> = {
  1: '예시 모양을 고르거나 자유롭게 그려 외곽을 만드세요',
  2: '예시 모양을 고르거나 자유롭게 그려 이너를 더하세요(없어도 돼요)',
}
const STEP_TITLES: Readonly<Record<1 | 2, string>> = { 1: '외곽', 2: '이너' }
const SHEET_TITLES: Readonly<Record<1 | 2, string>> = { 1: '외곽 만들기', 2: '이너 추가' }

/** history 항목에 단 표시. 이 오버레이가 쌓은 항목인지 알아보는 데 씁니다. */
function markOf(state: unknown): unknown {
  return typeof state === 'object' && state !== null ? (state as { tentMaker?: unknown }).tentMaker : undefined
}

/** 만들기 화면 임시 스토어: 텐트 모드, 외곽 없음(initialShape가 있으면 그 모양), 단계 ① 잠금(이너) */
function createMakerStores(name: string, initialShape?: Shape): Stores {
  const layout = makerLayout(name)
  if (initialShape !== undefined) {
    layout.tent.outer = structuredClone(initialShape)
    if (initialShape.kind === 'rect') layout.tent.outerTemplate = { kind: 'rect', w: initialShape.w, h: initialShape.h }
    if (initialShape.kind === 'circle') layout.tent.outerTemplate = { kind: 'circle', d: initialShape.d }
  }
  const stores = createStores(layout, { mode: 'tent' })
  const ui = stores.ui.getState()
  ui.setOuterPending(initialShape === undefined)
  ui.setTentLock('inners')
  if (initialShape !== undefined) ui.selectTentTarget('outer')
  return stores
}

export function TentMaker(p: {
  mode: TentMakerMode
  myTentNames: readonly string[]
  onConfirm(tent: Tent): void
  onCancel(): void
  /** 물건 모양 편집(itemEdit): 처음 모양 */
  initialShape?: Shape
}): JSX.Element {
  const [initialName] = useState(() => (isItemMode(p.mode) ? DEFAULT_ITEM_NAME : initialTentName(p.myTentNames)))
  const [stores] = useState(() => createMakerStores(initialName, p.initialShape))
  const [name, setName] = useState(initialName)

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

  return (
    <StoresProvider stores={stores}>
      <MakerScreen mode={p.mode} name={name} onName={setName} onCancel={() => leave(null)} onConfirm={(tent) => leave(tent)} />
    </StoresProvider>
  )
}

function MakerScreen(p: {
  mode: TentMakerMode
  name: string
  onName(name: string): void
  onCancel(): void
  onConfirm(tent: Tent): void
}): JSX.Element {
  const stores = useStores()
  const isDesktop = useIsDesktop()
  const titleId = useId()
  const reasonId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const trapTab = useFocusTrap(rootRef)
  useShortcuts({ modalRoot: rootRef })

  const [step, setStep] = useState<1 | 2>(1)
  const tent = useDoc((s) => s.layout.tent)
  const canUndo = useDoc((s) => s.canUndo)
  const canRedo = useDoc((s) => s.canRedo)
  const outerPending = useUi((s) => s.outerPending)
  const drawing = useUi((s) => s.drawing !== null)

  // 시트·버튼(DOM)을 눌러도 마지막 포인터 종류를 기억합니다(편집기와 같은 규칙, 자기 스토어).
  useEffect(() => {
    const onDown = (e: PointerEvent) => stores.ui.getState().setPointer(toPointerKind(e.pointerType))
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [stores])

  // 화면 테스트 훅: 편집기 훅(__tentfit)을 덮지 않게 자기 이름·자기 캔버스로(판단 Q16)
  useEffect(() => {
    if (import.meta.env.MODE !== 'test') return
    return installTestHook(stores, { key: MAKER_HOOK_KEY, hostTestId: MAKER_CANVAS_HOST_TEST_ID })
  }, [stores])

  // 휴대폰은 늘 보이는 시트(텐트 시트 규칙으로 대상이 시트 위에 보이게), PC는 시트 없음
  useEffect(() => {
    stores.ui.getState().patch({ mobileSheet: isDesktop ? 'none' : 'tent' })
  }, [isDesktop, stores])

  const issues = tentIssues(tent)
  const outerIssue = issues.find((i) => i.path === 'tent.outer')
  const item = isItemMode(p.mode)
  const reason = drawing
    ? DRAWING_REASON
    : step === 1
      ? outerPending
        ? item
          ? ITEM_NEED_SHAPE_REASON
          : NEED_OUTER_REASON
        : (outerIssue?.message ?? '')
      : (issues[0]?.message ?? '')
  const ready = reason === ''

  const finalStep = item || step === 2
  const primaryFull = finalStep ? CONFIRM_LABELS[p.mode].full : '다음'
  const primaryText = finalStep ? (isDesktop ? CONFIRM_LABELS[p.mode].full : `✓ ${CONFIRM_LABELS[p.mode].short}`) : '다음'
  const onPrimary = () => {
    if (!ready) return
    if (!finalStep) {
      stores.ui.getState().setTentLock('outer')
      setStep(2)
      return
    }
    p.onConfirm(makerConfirmTent(stores.doc.getState().layout, p.name))
  }
  const onBack = () => {
    if (step === 1) {
      p.onCancel()
      return
    }
    stores.ui.getState().setTentLock('inners')
    setStep(1)
  }

  const nameField =
    step === 1 && p.mode !== 'itemEdit' ? (
      <div className="tf-maker__name">
        <TextField label={item ? '이름' : '텐트 이름'} value={p.name} targetId="maker-tent-name" maxLength={NAME_MAX_LENGTH} onCommit={(_id, v) => p.onName(v)} />
      </div>
    ) : null

  return (
    <div
      ref={rootRef}
      onKeyDown={trapTab}
      className="tf-maker"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="tent-maker"
      data-layout={isDesktop ? 'desktop' : 'mobile'}
      data-step={step}
    >
      <header className="tf-maker__bar">
        <button type="button" className="tf-maker__back" aria-label={step === 1 ? '뒤로' : '외곽으로'} onClick={onBack}>
          <BackIcon />
        </button>
        <h1 id={titleId} className="tf-maker__title">
          {p.mode === 'item' ? '물건 그리기' : p.mode === 'itemEdit' ? '모양 편집' : '텐트 만들기'}
        </h1>
        {!item && (
          <ol className="tf-maker__steps" aria-label="단계">
            <li aria-current={step === 1 ? 'step' : undefined}>① 외곽</li>
            <li aria-current={step === 2 ? 'step' : undefined}>② 이너</li>
          </ol>
        )}
        <div className="tf-maker__actions">
          <button
            type="button"
            className="tf-maker__icon"
            aria-label="실행 취소"
            disabled={!canUndo || drawing}
            onClick={() => stores.doc.getState().undo()}
          >
            <UndoIcon />
          </button>
          <button
            type="button"
            className="tf-maker__icon"
            aria-label="다시 실행"
            disabled={!canRedo || drawing}
            onClick={() => stores.doc.getState().redo()}
          >
            <RedoIcon />
          </button>
          {isDesktop && (
            <button type="button" className="tf-maker__cancel" onClick={p.onCancel}>
              취소
            </button>
          )}
          <button
            type="button"
            className="tf-maker__confirm"
            aria-label={primaryFull}
            aria-describedby={ready ? undefined : reasonId}
            disabled={!ready}
            onClick={onPrimary}
          >
            <span aria-hidden="true">{primaryText}</span>
          </button>
        </div>
      </header>
      <p id={reasonId} className="tf-maker__reason" role="status" data-testid="tent-maker-reason" data-empty={reason === ''}>
        {reason}
      </p>

      <ShapeTools step={step} item={item} />

      <div className="tf-maker__body">
        <MakerCanvas desktop={isDesktop} step={step} nameField={nameField} item={item} />
        {isDesktop && (
          <aside className="tf-maker__panel" aria-label={item ? '모양' : STEP_TITLES[step]}>
            {nameField}
            <TentEditor
              variant="panel"
              context="maker"
              title={item ? '모양' : STEP_TITLES[step]}
              emptyText={item ? ITEM_GUIDE : STEP_GUIDES[step]}
              outerLabel={item ? '모양' : undefined}
            />
          </aside>
        )}
      </div>
      {!isDesktop && drawing && (
        <nav className="shell-toolbar tf-maker__drawtools" aria-label="그리기 도구">
          <DrawTools variant="toolbar" />
        </nav>
      )}
    </div>
  )
}

/** 캔버스 + 위 컨트롤(축척·확대·그리기 막대·토스트) + 휴대폰 시트 */
function MakerCanvas(p: { desktop: boolean; step: 1 | 2; nameField: JSX.Element | null; item: boolean }): JSX.Element {
  const zoom = useUi((s) => s.view.zoom)
  const insetTop = useUi((s) => s.insets.top)
  const insetBottom = useUi((s) => s.insets.bottom)
  const drawing = useUi((s) => s.drawing !== null)
  const sheetHostRef = useRef<HTMLDivElement>(null)
  useSheetInsets(sheetHostRef, p.desktop ? 'none' : drawing ? 'none' : 'tent')
  useRevealOnSheet({ topZonePx: 0 })
  const style = { '--overlay-top': `${insetTop}px`, '--overlay-bottom': `${insetBottom}px` } as CSSProperties
  return (
    <div className="tf-maker__canvas" data-sheet-bounds="">
      <div className="canvas-host shell-canvas" data-testid={MAKER_CANVAS_HOST_TEST_ID}>
        <Board />
      </div>
      <div className="shell-overlay" style={style}>
        <ScaleBarView zoom={zoom} />
        <BackdropControl />
        {p.desktop && <ZoomControls zoom={zoom} />}
        {p.desktop && drawing && <DrawTools variant="bar" />}
        <div className="shell-toast">
          <ToastHost />
        </div>
      </div>
      {!p.desktop && (
        <div className="shell-mobile__sheet" ref={sheetHostRef} data-testid="maker-sheet-host">
          {!drawing && <MakerSheet step={p.step} nameField={p.nameField} item={p.item} />}
        </div>
      )}
    </div>
  )
}

/** 휴대폰 늘 보이는 시트(판단 Q13): 제목 = 대상 이름(없으면 단계 제목), × = 선택 해제(대상이 있을 때만) */
function MakerSheet(p: { step: 1 | 2; nameField: JSX.Element | null; item: boolean }): JSX.Element {
  const stores = useStores()
  const tent = useDoc((s) => s.layout.tent)
  const target = useUi((s) => s.tentTarget)
  const [expanded, setExpanded] = useState(false)
  const title = p.item ? '모양' : ((target === null ? null : targetName(tent, target)) ?? SHEET_TITLES[p.step])
  return (
    <BottomSheet
      title={title}
      closeLabel="선택 해제"
      onClose={target === null ? undefined : () => stores.ui.getState().selectTentTarget(null)}
      expanded={expanded}
      onToggleExpand={() => setExpanded((v) => !v)}
      testId="tent-maker-sheet"
    >
      {p.nameField}
      <TentEditor variant="sheet" context="maker" emptyText={p.item ? ITEM_GUIDE : STEP_GUIDES[p.step]} outerLabel={p.item ? '모양' : undefined} />
    </BottomSheet>
  )
}
