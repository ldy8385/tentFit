// 만들기 화면 도구 줄(설계 2026-10-12 §1.1): 예시 [사각형][사다리꼴][정N각형][원] · [자유 그리기].
// 단계 ①은 외곽(예시 = 외곽을 그 예시로, 자유 그리기 = 외곽 그리기), 단계 ②는 이너(예시 = 이너 추가, 자유 그리기 = 새 이너 그리기).
// 그리는 중·측정 중에는 꺼집니다. 문서 동작은 app/tentActions만 부릅니다.
import type { JSX } from 'react'
import { useStores, useUi } from '../../app/stores'
import { addInnerShape, setMakerOuterShape, startDrawingAction, tentControlsEnabled } from '../../app/tentActions'
import { defaultItemTemplate, type TemplateKind } from '../../core/templates'
import { ShapeCircleIcon, ShapeFreeIcon, ShapeHexagonIcon, ShapeNgonIcon, ShapePentagonIcon, ShapeRectIcon, ShapeTrapezoidIcon } from '../shell/icons'
import { FREE_DRAW_LABEL, KIND_LABELS, TEMPLATE_KINDS } from '../tent/shapeMenu'

function KindIcon(p: { kind: TemplateKind }): JSX.Element {
  switch (p.kind) {
    case 'rect':
      return <ShapeRectIcon size={20} />
    case 'trapezoid':
      return <ShapeTrapezoidIcon size={20} />
    case 'hexagon':
      return <ShapeHexagonIcon size={20} />
    case 'pentagon':
      return <ShapePentagonIcon size={20} />
    case 'ngon':
      return <ShapeNgonIcon size={20} />
    case 'circle':
      return <ShapeCircleIcon size={20} />
  }
}

export function ShapeTools(p: { step: 1 | 2; item?: boolean }): JSX.Element {
  const stores = useStores()
  const drawing = useUi((s) => s.drawing !== null)
  const enabled = useUi((s) => tentControlsEnabled(s)) && !drawing
  const pick = (kind: TemplateKind) => {
    if (p.step === 1) setMakerOuterShape(stores, kind, p.item === true ? defaultItemTemplate(kind) : undefined)
    else addInnerShape(stores, kind)
  }
  return (
    <div className="tf-maker__tools" role="toolbar" aria-label="모양 도구" data-testid="maker-shape-tools">
      <span className="tf-maker__tools-label" aria-hidden="true">
        예시
      </span>
      {TEMPLATE_KINDS.map((kind) => (
        <button key={kind} type="button" className="tf-maker__tool" disabled={!enabled} onClick={() => pick(kind)}>
          <KindIcon kind={kind} />
          <span>{KIND_LABELS[kind]}</span>
        </button>
      ))}
      <span className="tf-maker__tools-sep" aria-hidden="true" />
      <button
        type="button"
        className="tf-maker__tool"
        disabled={!enabled}
        onClick={() => startDrawingAction(stores, p.step === 1 ? 'outer' : 'newInner')}
      >
        <ShapeFreeIcon size={20} />
        <span>{FREE_DRAW_LABEL}</span>
      </button>
    </div>
  )
}
