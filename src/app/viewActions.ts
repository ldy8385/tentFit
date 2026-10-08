// 화면(보기) 동작 공용 함수. 단축키·상단 바·메뉴·캔버스 컨트롤·테스트 훅이 같이 씁니다.
import type { Pt } from '../core/model'
import { layoutBBox, type Insets, type Size } from '../view/viewport'
import type { Stores } from './stores'

/** 확대·축소 버튼 한 번의 배율 */
export const ZOOM_STEP = 1.25

/** 시트·배너를 뺀 캔버스 보이는 영역의 가운데(화면 px). 크기가 0이면 (0,0) 쪽으로 붙습니다. */
export function visibleCenter(size: Size, insets: Insets): Pt {
  const visible = Math.max(0, size.height - insets.top - insets.bottom)
  return [Math.max(0, size.width) / 2, insets.top + visible / 2]
}

/** 맞춤 보기: 외곽 ∪ 모든 물건(밖으로 나간 것 포함)에 맞춥니다(스펙 §4.6 기타). */
export function fitToLayout(stores: Stores): void {
  stores.ui.getState().fitTo(layoutBBox(stores.doc.getState().layout))
}

/** 보이는 영역 가운데를 고정하고 factor배 확대합니다(1보다 작으면 축소). */
export function zoomByStep(stores: Stores, factor: number): void {
  const ui = stores.ui.getState()
  ui.zoomAt(factor, visibleCenter(ui.size, ui.insets))
}
