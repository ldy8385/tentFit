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
            mobileSheet: PLACE_ONLY_SHEETS.has(s.mobileSheet) ? 'none' : s.mobileSheet,
            desktopPanel: s.desktopPanel === 'newShape' ? 'auto' : s.desktopPanel,
          })
          return
        }
        // 텐트 → 배치: 편집 대상·꼭짓점 선택과 텐트 시트를 정리합니다.
        set({
          mode,
          tentTarget: null,
          vertexIndex: null,
          mobileSheet: s.mobileSheet === 'tent' ? 'none' : s.mobileSheet,
        })
      },
      selectTentTarget(target, vertexIndex) {
        const s = get()
        const nextIndex = target === null ? null : cleanVertexIndex(vertexIndex)
        if (sameTentTarget(s.tentTarget, target) && s.vertexIndex === nextIndex) return
        set({ tentTarget: target, vertexIndex: nextIndex })
      },
      pruneTentTarget(layout) {
        const s = get()
        if (s.tentTarget === null) return
        const count = vertexCountOf(layout, s.tentTarget)
        if (count === null) {
          set({ tentTarget: null, vertexIndex: null })
          return
        }
        if (s.vertexIndex !== null && s.vertexIndex >= count) set({ vertexIndex: null })
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
      patch(p) {
        const cur = get()
        // undefined 값은 건너뜁니다(Partial이라 들어올 수 있음). 바뀐 키만 반영합니다.
        const changed = Object.entries(p).filter(([k, v]) => v !== undefined && v !== cur[k as keyof UiState])
        if (changed.length > 0) set(Object.fromEntries(changed) as Partial<UiState>)
      },
    }
  })
}
