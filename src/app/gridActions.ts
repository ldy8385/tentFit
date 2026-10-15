// 격자 간격(소유자 요청 2026-10-15: "1cm~1000cm 까지, 확대축소와는 무관하게")·정렬 안내선 켜기·끄기.
// 화면 상태(ui)만 바꾸고 문서·기록은 그대로입니다. 이 브라우저에 기억합니다(localStorage, 막혀 있거나 값이 잘못되면 기본값).
import { GRID_STEP, GRID_STEP_RANGE } from '../core/snap'
import type { SymAxis } from '../core/symmetry'
import type { SymmetryMode } from '../store/ui'
import type { Stores } from './stores'

const KEY = 'tentfit.gridStep'
const [MIN, MAX] = GRID_STEP_RANGE

/** 빠른 선택(cm) */
export const GRID_STEP_PRESETS: readonly number[] = [1, 5, 10, 50, 100]

/** 기억해 둔 간격(없거나 잘못되면 10cm) */
export function loadGridStep(): number {
  try {
    const v = Number(localStorage.getItem(KEY) ?? '')
    return Number.isInteger(v) && v >= MIN && v <= MAX ? v : GRID_STEP
  } catch {
    return GRID_STEP
  }
}

/** 간격을 정수 1~1000으로 맞춰 바꾸고 기억합니다. 숫자가 아니면 그대로. */
export function setGridStep(stores: Stores, cm: number): void {
  if (!Number.isFinite(cm)) return
  const step = Math.min(MAX, Math.max(MIN, Math.round(cm)))
  stores.ui.getState().patch({ gridStep: step })
  try {
    localStorage.setItem(KEY, String(step))
  } catch {
    // 저장이 막힌 브라우저: 이번 화면에서만 씁니다.
  }
}

const GUIDES_KEY = 'tentfit.guidesVisible'

/** 기억해 둔 정렬 안내선 켜기·끄기(없으면 켬) */
export function loadGuidesVisible(): boolean {
  try {
    return localStorage.getItem(GUIDES_KEY) !== 'false'
  } catch {
    return true
  }
}

/** 정렬 안내선 켜기·끄기(기억함) */
export function setGuidesVisible(stores: Stores, on: boolean): void {
  stores.ui.getState().patch({ guidesVisible: on })
  try {
    localStorage.setItem(GUIDES_KEY, String(on))
  } catch {
    // 저장이 막힌 브라우저: 이번 화면에서만 씁니다.
  }
}

const SYMMETRY_KEY = 'tentfit.symmetryAxis'

/** 기억해 둔 대칭 맞춤 축(없거나 잘못되면 끄기 — 「자동 맞춤」이 기본이라 켜기 전에는 꼭짓점이 혼자 움직이게) */
export function loadSymmetryAxis(): 'off' | SymAxis {
  try {
    const v = localStorage.getItem(SYMMETRY_KEY)
    return v === 'off' || v === 'y' || v === 'x' ? v : 'off'
  } catch {
    return 'off'
  }
}

/** 대칭 맞춤 축 바꾸기(기억함) */
export function setSymmetryAxis(stores: Stores, axis: 'off' | SymAxis): void {
  stores.ui.getState().patch({ symmetryAxis: axis })
  try {
    localStorage.setItem(SYMMETRY_KEY, axis)
  } catch {
    // 저장이 막힌 브라우저: 이번 화면에서만 씁니다.
  }
}

const SYMMETRY_MODE_KEY = 'tentfit.symmetryMode'

/** 기억해 둔 대칭 맞춤 방식(없거나 잘못되면 자동 맞춤) */
export function loadSymmetryMode(): SymmetryMode {
  try {
    return localStorage.getItem(SYMMETRY_MODE_KEY) === 'guide' ? 'guide' : 'mirror'
  } catch {
    return 'mirror'
  }
}

/** 대칭 맞춤 방식 바꾸기(기억함) */
export function setSymmetryMode(stores: Stores, mode: SymmetryMode): void {
  stores.ui.getState().patch({ symmetryMode: mode })
  try {
    localStorage.setItem(SYMMETRY_MODE_KEY, mode)
  } catch {
    // 저장이 막힌 브라우저: 이번 화면에서만 씁니다.
  }
}
