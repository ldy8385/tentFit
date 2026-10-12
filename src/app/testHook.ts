// 화면 테스트 보조 장치(스펙 §13.4). 테스트 빌드(import.meta.env.MODE === 'test')에서만 App이 설치합니다.
// Playwright의 page.evaluate가 그대로 돌려받을 수 있게 함수 없는 일반 객체만 돌려줍니다.
// - window.__tentfit: 편집기 훅(배치를 열었을 때만, Editor가 설치)
// - window.__tentfitApp: 앱 수준 훅(라우트와 무관, App이 설치). 고르기·만들기 화면에서도 배치 목록을 읽습니다.
import type { DocState } from '../store/doc'
import type { UiState } from '../store/ui'
import { worldToScreen } from '../view/viewport'
import { listLayoutSummaries, type LayoutSummary } from './layoutRepo'
import type { Stores } from './stores'
import { fitToLayout } from './viewActions'

/** 상태에서 함수(동작)를 뺀 데이터 부분 */
export type DataOf<T> = { [K in keyof T as T[K] extends (...args: never[]) => unknown ? never : K]: T[K] }
export type DocSnapshot = DataOf<DocState>
export type UiSnapshot = DataOf<UiState>

export type TentfitTestHook = {
  /** 문서 스토어의 데이터: { layout, canUndo, canRedo, inGesture } */
  getDoc(): DocSnapshot
  /** 화면 스토어의 데이터: { mode, selection, view, size, insets, mobileSheet, … } */
  getUi(): UiSnapshot
  /** 월드 좌표(cm) → 브라우저 client 좌표(px). page.mouse·터치 좌표로 그대로 씁니다. */
  worldToClient(x: number, y: number): { x: number; y: number }
  /** 맞춤 보기(외곽 ∪ 모든 물건) */
  fitView(): void
  /** 캔버스 크기가 잡히고 첫 보기 맞춤이 끝났으면 true */
  readonly ready: boolean
}

/** 캔버스(테스트 id 'canvas-host')가 쓰는 DOM 요소. 셸이 정합니다. */
export const CANVAS_HOST_TEST_ID = 'canvas-host'
/** 만들기 화면의 훅 이름·캔버스 test id(Plan 4.1 판단 Q16). 텐트 바꾸기에서 열어도 편집기 훅을 덮지 않습니다. */
export const MAKER_HOOK_KEY = '__tentfitMaker'
export const MAKER_CANVAS_HOST_TEST_ID = 'maker-canvas-host'

function dataOf<T extends object>(state: T): DataOf<T> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(state)) {
    if (typeof v !== 'function') out[k] = v
  }
  return out as DataOf<T>
}

/** Konva Stage의 그리기 영역(.konvajs-content) 왼쪽 위. 없으면 캔버스 호스트, 그것도 없으면 (0,0) */
function canvasOrigin(hostTestId: string): { left: number; top: number } {
  const host = document.querySelector(`[data-testid="${hostTestId}"]`)
  const surface = host?.querySelector('.konvajs-content') ?? host
  if (!surface) return { left: 0, top: 0 }
  const r = surface.getBoundingClientRect()
  return { left: r.left, top: r.top }
}

type HookWindow = Record<string, TentfitTestHook | undefined>

/**
 * window[key](기본 __tentfit)를 설치하고, 지우는 함수를 돌려줍니다.
 * hostTestId는 worldToClient가 기준으로 쓸 캔버스 호스트(기본 'canvas-host').
 */
export function installTestHook(stores: Stores, opts?: { key?: string; hostTestId?: string }): () => void {
  const key = opts?.key ?? '__tentfit'
  const hostTestId = opts?.hostTestId ?? CANVAS_HOST_TEST_ID
  const hook: TentfitTestHook = {
    getDoc: () => dataOf(stores.doc.getState()),
    getUi: () => dataOf(stores.ui.getState()),
    worldToClient(x, y) {
      const [sx, sy] = worldToScreen(stores.ui.getState().view, [x, y])
      const o = canvasOrigin(hostTestId)
      return { x: o.left + sx, y: o.top + sy }
    },
    fitView: () => fitToLayout(stores),
    get ready() {
      const ui = stores.ui.getState()
      // 스토어를 만들 때의 보기 객체에서 바뀌었으면(Board가 맞춤 보기를 한 번 했으면) 준비된 것입니다.
      return ui.size.width > 0 && ui.size.height > 0 && ui.view !== stores.ui.getInitialState().view
    },
  }
  const w = window as unknown as HookWindow
  w[key] = hook
  return () => {
    if (w[key] === hook) delete w[key]
  }
}

/** 앱 수준 훅. 데이터만 돌려줍니다. */
export type TentfitAppHook = {
  /** 보관소의 배치 요약(updatedAt 내림차순). 만들기 화면 [취소] 뒤 배치가 생기지 않았는지 등을 봅니다(§13.4). */
  layouts(): LayoutSummary[]
}

type AppHookWindow = { __tentfitApp?: TentfitAppHook }

/** window.__tentfitApp을 설치하고, 지우는 함수를 돌려줍니다. */
export function installAppTestHook(): () => void {
  const hook: TentfitAppHook = {
    layouts: () => listLayoutSummaries().map((s) => ({ ...s })),
  }
  const w = window as unknown as AppHookWindow
  w.__tentfitApp = hook
  return () => {
    if (w.__tentfitApp === hook) delete w.__tentfitApp
  }
}
