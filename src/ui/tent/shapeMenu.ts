// 예시 모양 메뉴·그리기 안내 문구(Plan 4.1). 패널·툴바·만들기 화면 도구 줄이 같은 항목·문구를 씁니다.
import type { Stores } from '../../app/stores'
import { addInnerShape, startDrawingAction } from '../../app/tentActions'
import type { TemplateKind } from '../../core/templates'
import type { MenuItem } from '../shell/MenuButton'

/** 예시 모양 순서(설계 §2.1) */
export const TEMPLATE_KINDS: readonly TemplateKind[] = ['rect', 'trapezoid', 'hexagon', 'ngon', 'circle']

export const KIND_LABELS: Readonly<Record<TemplateKind, string>> = {
  rect: '사각형',
  trapezoid: '사다리꼴',
  hexagon: '육각형',
  ngon: '정N각형',
  circle: '원',
}

export const FREE_DRAW_LABEL = '자유 그리기'
/** 그리는 중 안내(설계 §3 PC 그리기 막대) */
export const DRAWING_HINT = '점을 찍어 그리세요 · 첫 점을 누르면 닫혀요'

/** [+ 이너 ▾] 항목: 예시 4종(addInnerShape) + 자유 그리기(새 이너 그리기 시작) */
export function innerShapeMenu(stores: Stores): MenuItem[] {
  return [
    ...TEMPLATE_KINDS.map((kind) => ({ label: KIND_LABELS[kind], onSelect: () => void addInnerShape(stores, kind) })),
    { label: FREE_DRAW_LABEL, onSelect: () => startDrawingAction(stores, 'newInner') },
  ]
}
