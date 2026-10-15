// 화면 스토어(스펙 §7·§8). 실행 취소 대상이 아닌 화면 상태: 모드, 선택, 텐트 편집 대상, 보기, 패널·시트, 토스트.
// 같은 값으로 바꾸는 호출은 상태를 바꾸지 않습니다(구독자에게 알리지 않음).
import { createStore, type StoreApi } from 'zustand/vanilla'
import type { Layout, Pt } from '../core/model'
import { targetWorldRing, type TentTarget } from '../core/ops/tent'
import { clampZoom, fitView, zoomAt as zoomViewAt, type BBox, type Insets, type Size, type View } from '../view/viewport'

export type PointerKind = 'mouse' | 'pen' | 'touch'

/** PointerEvent.pointerType → PointerKind(알 수 없는 값은 마우스로) */
export function toPointerKind(t: string): PointerKind {
  return t === 'touch' || t === 'pen' ? t : 'mouse'
}
export type Mode = 'place' | 'tent'
export type MobileSheet = 'none' | 'selection' | 'library' | 'newShape' | 'area' | 'warnings' | 'tent'
export type DesktopPanel = 'auto' | 'newShape' | 'warnings' // auto = 선택 있으면 속성, 없으면 빈 안내
/** 편집기 위 대화상자(텐트 바꾸기). 고르기 화면의 내 배치 대화상자는 PickRoute 컴포넌트 상태입니다. */
export type EditorDialog = 'swapTent' | null
export type Toast = { id: number; text: string }
/** 자유 그리기 목표(설계 2026-10-12 §2.2): 외곽 새로·다시, 새 이너, 그 이너 다시 그리기 */
export type DrawGoal = 'outer' | 'newInner' | { innerId: string }
/** 그리는 중 상태. 점은 문서·실행 취소 기록 밖(월드 cm, 맞춤 적용 뒤) */
export type Drawing = { goal: DrawGoal; points: Pt[] }
/** 만들기 화면 단계 잠금(설계 §1.1): 단계 ① = 'inners', 단계 ② = 'outer', 편집기 = 'none' */
export type TentLock = 'none' | 'outer' | 'inners'
/**
 * 배경 이미지(소유자 요청 2026-10-14): 캔버스 맨 아래에 깔고 그 위에 그립니다. 편집하는 동안만(저장·내보내기 안 함).
 * url = 이미지 주소(object URL), x·y = 가운데(월드 cm), w = 가로(cm), aspect = 세로/가로, opacity = 0~1, rotation = 가운데 기준 회전(°, 시계 방향),
 * adjusting = 맞추기 중(끌기 = 이미지 이동, 휠·두 손가락 = 이미지 크기, 탭 = 아무것도 안 함)
 */
export type Backdrop = { url: string; x: number; y: number; w: number; aspect: number; opacity: number; adjusting: boolean; rotation: number }
/** 패널에서 포커스한 자유 다각형 칸(변 길이 = edge, 꼭짓점 각도 = vertex, 번호는 0부터). 캔버스가 그 변·꼭짓점을 강조합니다. */
export type PolygonFocus = { kind: 'edge' | 'vertex'; index: number }
export type UiState = {
  mode: Mode
  measuring: boolean
  selection: string[] // 물건 id 전용. 텐트 편집 대상은 tentTarget
  scopeGroupId: string | null
  selectToggle: boolean // 모바일 [선택]
  tentTarget: TentTarget | null // 텐트 편집 대상(외곽 또는 이너)
  vertexIndex: number | null // 선택한 꼭짓점 번호(0부터). 대상이 없으면 늘 null
  view: View
  size: Size // 캔버스 크기
  insets: Insets // 시트·배너 높이(맞춤 보기에서 뺌)
  snapEnabled: boolean
  gridVisible: boolean
  pointer: PointerKind // 마지막 pointerdown의 pointerType
  canvasPressed: boolean // 캔버스를 누르고 있는 동안 true(이때는 시트를 따라 화면을 옮기지 않음)
  revealRequest: number // 새로 만든 물건을 보이게 해 달라는 요청 번호(셸이 바뀔 때마다 선택을 시트 위로 옮김)
  mobileSheet: MobileSheet
  desktopPanel: DesktopPanel
  areaExpanded: boolean
  toast: Toast | null
  editorDialog: EditorDialog
  /** 자유 그리기 중이면 그 상태(설계 §2.2). 정리 규칙은 아래 구현 주석 */
  drawing: Drawing | null
  tentLock: TentLock
  /** 만들기 화면에서 외곽이 아직 없음(문서의 외곽은 자리표시라 그리지도 고르지도 않음, Plan 4.1 판단 Q1) */
  outerPending: boolean
  /** 패널에서 포커스한 변·꼭짓점 칸(대상이 바뀌거나 모드가 바뀌면 지움) */
  polygonFocus: PolygonFocus | null
  /** 휴대폰 [상하좌우] 토글: 끌기·그리기를 가로·세로로만(PC는 끄는 동안 Shift) */
  axisLock: boolean
  /** 「비율 유지」(소유자 요청 2026-10-14, 기본 켬): 변·가로·세로 숫자를 바꾸면 전체를 같은 배율로. 끄면 그 변·축만 */
  keepRatio: boolean
  /** 물건 그리기·모양 편집 화면(소유자 요청 2026-10-14). editId가 있으면 그 물건의 모양 편집, 없으면 새 물건 */
  itemMaker: { editId: string | null } | null
  /** 배경 이미지(없으면 null) */
  backdrop: Backdrop | null
  setBackdrop(b: Backdrop | null): void
  setSelection(ids: string[]): void
  toggleSelected(id: string): void
  clearSelection(): void
  pruneSelection(layout: Layout): void // 없는 id 제거
  /** 모드 전환과 정리(같은 모드·측정 중이면 아무것도 안 함). 정리 규칙은 아래 구현 주석 */
  setMode(mode: Mode): void
  /** 편집 대상과 꼭짓점 선택. 같으면 알리지 않음. target이 null이면 vertexIndex도 null */
  selectTentTarget(target: TentTarget | null, vertexIndex?: number | null): void
  /** 없는 이너면 대상·꼭짓점 해제, 꼭짓점 번호가 고리 길이 이상이거나 원이면 vertexIndex null */
  pruneTentTarget(layout: Layout): void
  /** 그리기 시작: 점 0개, 꼭짓점 선택 해제, 대상 = 새 이너면 없음·외곽/이너 다시 그리기면 그 대상(외곽 없음이면 없음). 한 번에 바꿉니다 */
  startDrawing(goal: DrawGoal): void
  /** 그리는 중일 때만 점 목록을 바꿉니다 */
  setDrawPoints(points: Pt[]): void
  endDrawing(): void
  /** 잠금을 바꾸면 잠긴 쪽 대상을 풀고 그리던 것을 버립니다(단계 전환 = 그리기 끝, 설계 §2.2) */
  setTentLock(lock: TentLock): void
  setOuterPending(pending: boolean): void
  setPolygonFocus(focus: PolygonFocus | null): void
  /** 토스트를 띄웁니다. id는 부를 때마다 1씩 올라갑니다(같은 문구도 새 토스트) */
  showToast(text: string): void
  /** 지금 토스트의 id가 같을 때만 지웁니다(늦게 도착한 타이머가 새 토스트를 지우지 않게) */
  dismissToast(id: number): void
  setView(v: View): void
  setSize(s: Size): void
  setInsets(i: Insets): void
  zoomAt(factor: number, screenPt: Pt): void
  panBy(dx: number, dy: number): void
  fitTo(bbox: BBox): void
  setPointer(p: PointerKind): void
  setCanvasPressed(pressed: boolean): void
  requestReveal(): void
  /** 'mode'는 Plan 3 호환으로 남긴 키입니다. 모드 전환은 정리 규칙이 있는 setMode를 쓰세요. */
  patch(
    p: Partial<
      Pick<
        UiState,
        | 'mode'
        | 'measuring'
        | 'scopeGroupId'
        | 'selectToggle'
        | 'snapEnabled'
        | 'gridVisible'
        | 'mobileSheet'
        | 'desktopPanel'
        | 'areaExpanded'
        | 'editorDialog'
        | 'axisLock'
        | 'keepRatio'
        | 'itemMaker'
      >
    >,
  ): void
}
export type UiStore = StoreApi<UiState>

const DEFAULT_VIEW: View = { zoom: 1, panX: 0, panY: 0 }

/** 배치 모드에서만 쓰는 모바일 시트(텐트 모드로 들어가면 닫음) */
const PLACE_ONLY_SHEETS: ReadonlySet<MobileSheet> = new Set<MobileSheet>(['selection', 'library', 'newShape'])

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

/** 순서를 지키며 중복을 뺍니다. */
function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)]
}

function finiteOr(v: number, fallback: number): number {
  return Number.isFinite(v) ? v : fallback
}

/** 배율은 0.1~20, 위치는 유한한 값(아니면 0) */
function cleanView(v: View): View {
  return { zoom: clampZoom(v.zoom), panX: finiteOr(v.panX, 0), panY: finiteOr(v.panY, 0) }
}

function sameView(a: View, b: View): boolean {
  return a.zoom === b.zoom && a.panX === b.panX && a.panY === b.panY
}

/** 0 이상 유한한 값(아니면 0) */
function len(v: number): number {
  return Math.max(0, finiteOr(v, 0))
}

/** 같은 편집 대상인지('outer'끼리, 또는 같은 innerId) */
export function sameTentTarget(a: TentTarget | null, b: TentTarget | null): boolean {
  if (a === null || b === null) return a === b
  if (a === 'outer' || b === 'outer') return a === b
  return a.innerId === b.innerId
}

/** 잠금·외곽 없음 때문에 고를 수 없는 대상인지 */
export function tentTargetBlocked(s: Pick<UiState, 'tentLock' | 'outerPending'>, target: TentTarget | null): boolean {
  if (target === null) return false
  if (target === 'outer') return s.tentLock === 'outer' || s.outerPending
  return s.tentLock === 'inners'
}

/** 꼭짓점 번호는 0 이상 정수만(아니면 null) */
function cleanVertexIndex(v: number | null | undefined): number | null {
  return v !== null && v !== undefined && Number.isInteger(v) && v >= 0 ? v : null
}

/** 대상의 꼭짓점 수. 원이면 0(꼭짓점 없음), 없는 이너면 null */
function vertexCountOf(layout: Layout, target: TentTarget): number | null {
  if (target === 'outer') return layout.tent.outer.kind === 'circle' ? 0 : targetWorldRing(layout, target).length
  const inner = layout.tent.inners.find((it) => it.id === target.innerId)
  if (inner === undefined) return null
  return inner.shape.kind === 'circle' ? 0 : targetWorldRing(layout, target).length
}

export function createUiStore(
  init?: Partial<Pick<UiState, 'mode' | 'snapEnabled' | 'gridVisible' | 'view' | 'size' | 'pointer'>>,
): UiStore {
  // 토스트 번호. 지운 뒤에도 줄지 않아서, 같은 문구를 다시 띄워도 새 id가 됩니다.
  let toastSeq = 0
  return createStore<UiState>()((set, get) => {
    const setViewIfChanged = (next: View): void => {
      const v = cleanView(next)
      if (!sameView(v, get().view)) set({ view: v })
    }
    return {
      mode: init?.mode ?? 'place',
      measuring: false,
      selection: [],
      scopeGroupId: null,
      selectToggle: false,
      tentTarget: null,
      vertexIndex: null,
      view: cleanView(init?.view ?? DEFAULT_VIEW),
      size: { width: len(init?.size?.width ?? 0), height: len(init?.size?.height ?? 0) },
      insets: { top: 0, bottom: 0 },
      snapEnabled: init?.snapEnabled ?? true,
      gridVisible: init?.gridVisible ?? true,
      pointer: init?.pointer ?? 'mouse',
      canvasPressed: false,
      revealRequest: 0,
      mobileSheet: 'none',
      desktopPanel: 'auto',
      areaExpanded: false,
      toast: null,
      editorDialog: null,
      drawing: null,
      tentLock: 'none',
      outerPending: false,
      polygonFocus: null,
      axisLock: false,
      keepRatio: true,
      backdrop: null,
      itemMaker: null,

      setSelection(ids) {
        const next = unique(ids)
        if (!sameList(next, get().selection)) set({ selection: next })
      },
      toggleSelected(id) {
        const cur = get().selection
        set({ selection: cur.includes(id) ? cur.filter((v) => v !== id) : [...cur, id] })
      },
      clearSelection() {
        if (get().selection.length > 0) set({ selection: [] })
      },
      pruneSelection(layout) {
        const s = get()
        const ids = new Set(layout.items.map((it) => it.id))
        const selection = s.selection.filter((id) => ids.has(id))
        const scopeAlive = s.scopeGroupId === null || layout.groups.some((g) => g.id === s.scopeGroupId)
        if (selection.length === s.selection.length && scopeAlive) return
        set({ selection, scopeGroupId: scopeAlive ? s.scopeGroupId : null })
      },
      setMode(mode) {
        const s = get()
        // 측정 중에는 모드를 바꾸지 않습니다(§4.3 — 모드 토글 비활성. Plan 5 규칙 자리).
        if (s.mode === mode || s.measuring) return
        if (mode === 'tent') {
          // 배치 → 텐트: 물건 선택·그룹 안 편집·배치 전용 시트·새 도형 패널을 정리합니다(함정 R2).
          set({
            mode,
            selection: s.selection.length > 0 ? [] : s.selection,
            scopeGroupId: null,
            tentTarget: null,
            vertexIndex: null,
            drawing: null,
            polygonFocus: null,
            mobileSheet: PLACE_ONLY_SHEETS.has(s.mobileSheet) ? 'none' : s.mobileSheet,
            desktopPanel: s.desktopPanel === 'newShape' ? 'auto' : s.desktopPanel,
          })
          return
        }
        // 텐트 → 배치: 편집 대상·꼭짓점 선택·그리기와 텐트 시트를 정리합니다.
        set({
          mode,
          tentTarget: null,
          vertexIndex: null,
          drawing: null,
          polygonFocus: null,
          mobileSheet: s.mobileSheet === 'tent' ? 'none' : s.mobileSheet,
        })
      },
      selectTentTarget(target, vertexIndex) {
        const s = get()
        // 잠긴 대상은 고르지 않습니다(캔버스·목록·키보드가 한 번에 막힘, 설계 §1.1).
        const next = tentTargetBlocked(s, target) ? null : target
        const nextIndex = next === null ? null : cleanVertexIndex(vertexIndex)
        if (sameTentTarget(s.tentTarget, next) && s.vertexIndex === nextIndex) return
        // 다른 대상을 고르면 그리던 것을 버립니다(설계 §2.2 끝나는 조건).
        const changed = !sameTentTarget(s.tentTarget, next)
        const dropDrawing = s.drawing !== null && changed
        set({
          tentTarget: next,
          vertexIndex: nextIndex,
          ...(dropDrawing ? { drawing: null } : {}),
          ...(changed && s.polygonFocus !== null ? { polygonFocus: null } : {}),
        })
      },
      pruneTentTarget(layout) {
        const s = get()
        // 다시 그리는 이너가 없어지면(실행 취소 등) 그리기도 끝냅니다. 새 이너 그리기는 대상이 null이라 아래 조기 return보다 먼저 봅니다.
        const goal = s.drawing?.goal
        if (goal !== undefined && typeof goal === 'object' && !layout.tent.inners.some((it) => it.id === goal.innerId)) {
          set({ drawing: null })
        }
        if (s.tentTarget === null) return
        const count = vertexCountOf(layout, s.tentTarget)
        if (count === null) {
          set({ tentTarget: null, vertexIndex: null })
          return
        }
        if (s.vertexIndex !== null && s.vertexIndex >= count) set({ vertexIndex: null })
      },
      startDrawing(goal) {
        const s = get()
        const target: TentTarget | null = goal === 'newInner' ? null : goal === 'outer' ? (s.outerPending ? null : 'outer') : { innerId: goal.innerId }
        set({ drawing: { goal, points: [] }, tentTarget: target, vertexIndex: null })
      },
      setDrawPoints(points) {
        const d = get().drawing
        if (d !== null) set({ drawing: { goal: d.goal, points } })
      },
      endDrawing() {
        if (get().drawing !== null) set({ drawing: null })
      },
      setTentLock(lock) {
        const s = get()
        if (s.tentLock === lock) return
        const locked = tentTargetBlocked({ tentLock: lock, outerPending: s.outerPending }, s.tentTarget)
        set({
          tentLock: lock,
          drawing: null,
          ...(locked ? { tentTarget: null, vertexIndex: null } : {}),
        })
      },
      setOuterPending(pending) {
        if (get().outerPending !== pending) set({ outerPending: pending })
      },
      setPolygonFocus(focus) {
        const cur = get().polygonFocus
        if (cur === focus || (cur !== null && focus !== null && cur.kind === focus.kind && cur.index === focus.index)) return
        set({ polygonFocus: focus })
      },
      showToast(text) {
        toastSeq += 1
        set({ toast: { id: toastSeq, text } })
      },
      dismissToast(id) {
        if (get().toast?.id === id) set({ toast: null })
      },
      setView(v) {
        setViewIfChanged(v)
      },
      setSize(s) {
        const next = { width: len(s.width), height: len(s.height) }
        const cur = get().size
        if (next.width !== cur.width || next.height !== cur.height) set({ size: next })
      },
      setInsets(i) {
        const next = { top: len(i.top), bottom: len(i.bottom) }
        const cur = get().insets
        if (next.top !== cur.top || next.bottom !== cur.bottom) set({ insets: next })
      },
      zoomAt(factor, screenPt) {
        setViewIfChanged(zoomViewAt(get().view, factor, screenPt))
      },
      panBy(dx, dy) {
        const v = get().view
        setViewIfChanged({ zoom: v.zoom, panX: v.panX + finiteOr(dx, 0), panY: v.panY + finiteOr(dy, 0) })
      },
      fitTo(bbox) {
        const s = get()
        setViewIfChanged(fitView(bbox, s.size, s.insets))
      },
      setPointer(p) {
        if (get().pointer !== p) set({ pointer: p })
      },
      setCanvasPressed(pressed) {
        if (get().canvasPressed !== pressed) set({ canvasPressed: pressed })
      },
      requestReveal() {
        set({ revealRequest: get().revealRequest + 1 })
      },
      setBackdrop(b) {
        if (b !== get().backdrop) set({ backdrop: b })
      },
      patch(p) {
        const cur = get()
        // undefined 값은 건너뜁니다(Partial이라 들어올 수 있음). 바뀐 키만 반영합니다.
        const changed = Object.entries(p).filter(([k, v]) => v !== undefined && v !== cur[k as keyof UiState])
        if (changed.length > 0) set(Object.fromEntries(changed) as Partial<UiState>)
      },
    }
  })
}
