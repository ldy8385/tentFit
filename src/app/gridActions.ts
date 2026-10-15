// 격자 간격(소유자 요청 2026-10-15: "1cm~1000cm 까지, 확대축소와는 무관하게"). 화면 상태(ui.gridStep)만 바꾸고 문서·기록은 그대로입니다.
// 이 브라우저에 기억합니다(localStorage, 막혀 있거나 값이 잘못되면 기본 10cm).
import { GRID_STEP, GRID_STEP_RANGE } from '../core/snap'
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
