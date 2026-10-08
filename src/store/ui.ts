// 화면 스토어(스펙 §7·§8). 실행 취소 대상이 아닌 화면 상태: 모드, 선택, 보기, 패널·시트.
// 같은 값으로 바꾸는 호출은 상태를 바꾸지 않습니다(구독자에게 알리지 않음).
import { createStore, type StoreApi } from 'zustand/vanilla'
import type { Layout, Pt } from '../core/model'
import { clampZoom, fitView, zoomAt as zoomViewAt, type BBox, type Insets, type Size, type View } from '../view/viewport'

export type PointerKind = 'mouse' | 'pen' | 'touch'
export type Mode = 'place' | 'tent'
export type MobileSheet = 'none' | 'selection' | 'library' | 'newShape' | 'area' | 'warnings'
export type DesktopPanel = 'auto' | 'newShape' | 'warnings' // auto = 선택 있으면 속성, 없으면 빈 안내
export type UiState = {
  mode: Mode
  measuring: boolean
  selection: string[]
  scopeGroupId: string | null
  selectToggle: boolean // 모바일 [선택]
  view: View
  size: Size // 캔버스 크기
  insets: Insets // 시트·배너 높이(맞춤 보기에서 뺌)
  snapEnabled: boolean
  gridVisible: boolean
  pointer: PointerKind // 마지막 pointerdown의 pointerType
  mobileSheet: MobileSheet
  desktopPanel: DesktopPanel
  areaExpanded: boolean
  setSelection(ids: string[]): void
  toggleSelected(id: string): void
  clearSelection(): void
  pruneSelection(layout: Layout): void // 없는 id 제거
  setView(v: View): void
  setSize(s: Size): void
  setInsets(i: Insets): void
  zoomAt(factor: number, screenPt: Pt): void
  panBy(dx: number, dy: number): void
  fitTo(bbox: BBox): void
  setPointer(p: PointerKind): void
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
      >
    >,
  ): void
}
export type UiStore = StoreApi<UiState>

const DEFAULT_VIEW: View = { zoom: 1, panX: 0, panY: 0 }

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

export function createUiStore(
  init?: Partial<Pick<UiState, 'mode' | 'snapEnabled' | 'gridVisible' | 'view' | 'size'>>,
): UiStore {
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
      view: cleanView(init?.view ?? DEFAULT_VIEW),
      size: { width: len(init?.size?.width ?? 0), height: len(init?.size?.height ?? 0) },
      insets: { top: 0, bottom: 0 },
      snapEnabled: init?.snapEnabled ?? true,
      gridVisible: init?.gridVisible ?? true,
      pointer: 'mouse',
      mobileSheet: 'none',
      desktopPanel: 'auto',
      areaExpanded: false,

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
      patch(p) {
        const cur = get()
        // undefined 값은 건너뜁니다(Partial이라 들어올 수 있음). 바뀐 키만 반영합니다.
        const changed = Object.entries(p).filter(([k, v]) => v !== undefined && v !== cur[k as keyof UiState])
        if (changed.length > 0) set(Object.fromEntries(changed) as Partial<UiState>)
      },
    }
  })
}
