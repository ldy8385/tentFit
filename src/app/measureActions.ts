// 거리 재기(Plan 5, 스펙 §4.3·§6.7, 소유자 요청 2026-10-15): 대상 두 개를 누르면 최단 거리. 화면 상태만 바꿉니다(문서·실행 취소 밖).
// 켜는 동안 선택을 비우고 텐트·물건은 잠깁니다(tentControlsEnabled·Board). 끄면 잰 것을 모두 지웁니다.
import { measure, pickTarget, type MeasureResult, type MeasureTarget } from '../core/measure'
import type { Layout, Pt } from '../core/model'
import type { Measurement, PointerKind } from '../store/ui'
import type { Stores } from './stores'

/** 대상을 잡는 거리(화면 px, §6.7) */
const PICK_PX: Readonly<Record<PointerKind, number>> = { mouse: 12, pen: 12, touch: 24 }

let nextId = 1

export function startMeasuring(stores: Stores): void {
  const ui = stores.ui.getState()
  if (ui.measuring) return
  ui.endDrawing()
  ui.clearSelection()
  ui.selectTentTarget(null)
  ui.patch({ measuring: true, measurements: [], measureFirst: null, desktopPanel: 'auto', mobileSheet: 'none' })
}

export function endMeasuring(stores: Stores): void {
  stores.ui.getState().patch({ measuring: false, measurements: [], measureFirst: null })
}

/** 측정 중 누름(월드 cm): 첫 대상이면 기억, 둘째면 하나 잼 */
export function measureTap(stores: Stores, world: Pt, pointer: PointerKind): void {
  const ui = stores.ui.getState()
  if (!ui.measuring) return
  const target = pickTarget(stores.doc.getState().layout, world, PICK_PX[pointer] / ui.view.zoom)
  const first = ui.measureFirst
  if (first === null) {
    ui.patch({ measureFirst: { target, at: [world[0], world[1]] } })
    return
  }
  const m: Measurement = { id: nextId++, a: first.target, b: target }
  ui.patch({ measurements: [...ui.measurements, m], measureFirst: null })
}

/** 첫 대상 고른 것 취소 */
export function cancelMeasureFirst(stores: Stores): void {
  stores.ui.getState().patch({ measureFirst: null })
}

export function removeMeasurement(stores: Stores, id: number): void {
  const ui = stores.ui.getState()
  ui.patch({ measurements: ui.measurements.filter((m) => m.id !== id) })
}

export function clearMeasurements(stores: Stores): void {
  stores.ui.getState().patch({ measurements: [], measureFirst: null })
}

/** 대상 이름(§6.7): 물건 이름, 「외곽 변 2」, 「이너 1 변 3」, 원 벽은 「둘레」, 그 밖은 「빈 곳」 */
export function targetName(layout: Layout, t: MeasureTarget): string {
  if (t.kind === 'point') return '빈 곳'
  if (t.kind === 'item') return layout.items.find((it) => it.id === t.id)?.name ?? '물건'
  if (t.wall === 'outer') return layout.tent.outer.kind === 'circle' ? '외곽 둘레' : `외곽 변 ${t.edge + 1}`
  const inner = layout.tent.inners.find((it) => it.id === t.wall)
  if (inner === undefined) return '이너'
  return inner.shape.kind === 'circle' ? `${inner.name} 둘레` : `${inner.name} 변 ${t.edge + 1}`
}

export type MeasurementRow = MeasureResult & { id: number; aName: string; bName: string }

/** 잰 것을 지금 배치로 계산한 줄들(목록·캔버스 선) */
export function measurementRows(layout: Layout, list: readonly Measurement[]): MeasurementRow[] {
  return list.map((m) => ({ ...measure(layout, m.a, m.b), id: m.id, aName: targetName(layout, m.a), bName: targetName(layout, m.b) }))
}
