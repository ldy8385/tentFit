// 텐트 편집 표시 레이어(스펙 §4.4-7·§4.4-8·§4.6). 그리기만 하고 입력은 받지 않습니다(listening=false).
// 누름 판정은 Board 컨트롤러가 tentGesture.classifyTentPress(tentEdit.handleAt·tentHitAt)로 합니다(함정 R19).
// - 선택한 대상(외곽 또는 이너 하나)에 선택 테두리(halo)와 꼭짓점·+ 핸들. 선택 꼭짓점은 채움 + 확대.
// - 끄는 중에는 미리보기 고리. 잘못되면 빨간 점선 + 「놓으면 취소돼요」(이너 이탈 경고의 실선·빗금과 다름).
// 핸들·라벨은 화면 크기가 고정되도록 Group을 1/zoom으로 줄여 그립니다(nodes.tsx Badge와 같은 방식).
// 레이어를 새로 만들지 않고(Konva 권장 3~5개) Board가 경고 레이어(listening=false) 맨 위에 이 Group을 둡니다.
import type { JSX } from 'react'
import { Circle, Group, Line, Rect, Text } from 'react-konva'
import { ringBBox } from '../../core/geom'
import type { Layout, Pt } from '../../core/model'
import { targetWorldRing, type TentTarget } from '../../core/ops/tent'
import type { PolygonFocus } from '../../store/ui'
import { THEME } from '../../ui/theme'
import { edgeLabels, INVALID_EDIT_STYLE, tentHandles, type EdgeLabel } from '../tentEdit'
import type { View } from '../viewport'
import { FONT_FAMILY, HALO_PX } from './nodes'
import type { TentPreview } from './tentGesture'

/** 꼭짓점 점 지름(화면 px, 보이는 점 11~12px) */
export const VERTEX_DOT_PX = 12
/** 선택한 꼭짓점 지름(채움 + 확대) */
export const SELECTED_VERTEX_DOT_PX = 16
/** 변 중간 + 점 지름 */
export const PLUS_DOT_PX = 12
const HANDLE_STROKE_PX = 2.5
const SELECT_STROKE_PX = 1.5
const INVALID_STROKE_PX = 2
const INVALID_LABEL_FONT_PX = 12
const INVALID_LABEL_H_PX = 20
const INVALID_LABEL_GAP_PX = 8
/** 변 번호 배지 반지름(화면 px)·글자 크기 */
const EDGE_BADGE_R_PX = 9
const EDGE_BADGE_FONT_PX = 11
/** 패널에서 포커스한 변의 강조 굵기(화면 px) */
const FOCUS_EDGE_STROKE_PX = 4

/** 'var(--name)' → THEME 값(Konva는 CSS 변수를 못 읽음). 이미 색 값이면 그대로. */
export function themeColor(value: string): string {
  const m = /^var\(--([a-z0-9-]+)\)$/.exec(value)
  if (m === null) return value
  const key = m[1] ?? ''
  return THEME[key] ?? value
}

function flat(ring: readonly Pt[]): number[] {
  return ring.flatMap((p) => [p[0], p[1]])
}

function VertexDot(props: { at: Pt; zoom: number; color: string; selected: boolean }): JSX.Element {
  const k = 1 / props.zoom
  const r = (props.selected ? SELECTED_VERTEX_DOT_PX : VERTEX_DOT_PX) / 2
  return (
    <Group x={props.at[0]} y={props.at[1]} scaleX={k} scaleY={k} listening={false}>
      <Circle
        radius={r}
        fill={props.selected ? props.color : THEME['bg-surface']}
        stroke={props.selected ? THEME['bg-surface'] : props.color}
        strokeWidth={props.selected ? 2 : HANDLE_STROKE_PX}
        perfectDrawEnabled={false}
      />
    </Group>
  )
}

function PlusDot(props: { at: Pt; zoom: number; color: string }): JSX.Element {
  const k = 1 / props.zoom
  const r = PLUS_DOT_PX / 2
  const arm = r - 2.5
  return (
    <Group x={props.at[0]} y={props.at[1]} scaleX={k} scaleY={k} listening={false}>
      <Circle radius={r} fill={props.color} perfectDrawEnabled={false} />
      <Line points={[-arm, 0, arm, 0]} stroke={THEME['text-inverse']} strokeWidth={1.5} lineCap="round" />
      <Line points={[0, -arm, 0, arm]} stroke={THEME['text-inverse']} strokeWidth={1.5} lineCap="round" />
    </Group>
  )
}

/** 「놓으면 취소돼요」 라벨: 대상 bbox 위 가운데, 화면 크기 고정 */
function InvalidLabel(props: { at: Pt; zoom: number; color: string }): JSX.Element {
  const k = 1 / props.zoom
  const text = INVALID_EDIT_STYLE.label
  const width = [...text].length * INVALID_LABEL_FONT_PX + 16
  return (
    <Group x={props.at[0]} y={props.at[1]} scaleX={k} scaleY={k} listening={false}>
      <Rect
        x={-width / 2}
        y={-INVALID_LABEL_H_PX - INVALID_LABEL_GAP_PX}
        width={width}
        height={INVALID_LABEL_H_PX}
        cornerRadius={4}
        fill={props.color}
      />
      <Text
        x={-width / 2}
        y={-INVALID_LABEL_H_PX - INVALID_LABEL_GAP_PX}
        width={width}
        height={INVALID_LABEL_H_PX}
        text={text}
        fontSize={INVALID_LABEL_FONT_PX}
        fontFamily={FONT_FAMILY}
        fill={THEME['text-inverse']}
        align="center"
        verticalAlign="middle"
        wrap="none"
        listening={false}
        perfectDrawEnabled={false}
      />
    </Group>
  )
}

/** 변 번호 배지(자유 다각형 대상, 패널 「변 i」와 같은 번호). 포커스한 변은 채운 배지 */
function EdgeBadge(props: { label: EdgeLabel; zoom: number; color: string; focused: boolean }): JSX.Element {
  const k = 1 / props.zoom
  const r = EDGE_BADGE_R_PX
  return (
    <Group x={props.label.at[0]} y={props.label.at[1]} scaleX={k} scaleY={k} listening={false}>
      <Circle
        radius={r}
        fill={props.focused ? props.color : THEME['bg-surface']}
        stroke={props.color}
        strokeWidth={1.5}
        perfectDrawEnabled={false}
      />
      <Text
        x={-r}
        y={-r}
        width={2 * r}
        height={2 * r}
        text={props.label.text}
        fontSize={EDGE_BADGE_FONT_PX}
        fontFamily={FONT_FAMILY}
        fontStyle="bold"
        fill={props.focused ? THEME['text-inverse'] : props.color}
        align="center"
        verticalAlign="middle"
        listening={false}
        perfectDrawEnabled={false}
      />
    </Group>
  )
}

export type TentLayerProps = {
  layout: Layout
  /** ui.tentTarget */
  target: TentTarget | null
  /** ui.vertexIndex */
  vertexIndex: number | null
  view: View
  /** 끄는 중 미리보기(Board 화면 상태). 있으면 그 텐트로 대상·핸들을 그림 */
  preview: TentPreview | null
  /** 패널에서 포커스한 변·꼭짓점 칸(ui.polygonFocus). 그 변을 굵게, 그 꼭짓점을 선택 모양으로 */
  focus?: PolygonFocus | null
}

/** 텐트 모드에서 Board가 경고 레이어 안 맨 위(경고 표시 위·Transformer 아래)에 그립니다. */
export function TentLayer(props: TentLayerProps): JSX.Element | null {
  const { layout, vertexIndex, view, preview } = props
  const zoom = view.zoom
  const target = preview?.target ?? props.target
  if (target === null || !(zoom > 0)) return null

  const shown: Layout = preview ? { ...layout, tent: preview.tent } : layout
  const ring = targetWorldRing(shown, target)
  const isInner = target !== 'outer'
  const color = isInner ? THEME['info'] : THEME['accent']
  const invalid = preview?.invalid ?? false
  // 끄는 중에는 꼭짓점만(+ 는 변이 바뀌는 동안 튀므로 숨김)
  const handles = tentHandles(shown, target, view).filter((h) => preview === null || h.kind === 'vertex')
  const points = flat(ring)
  const danger = themeColor(INVALID_EDIT_STYLE.stroke)
  const box = ring.length > 0 ? ringBBox(ring) : null
  const focus = props.focus ?? null
  // 자유 다각형이면 변 번호 배지(소유자 피드백 「변 1·2·3이 어디인지」)
  const labels = edgeLabels(shown, target, view)
  const focusEdge =
    focus?.kind === 'edge' && ring.length >= 2 ? [ring[focus.index], ring[(focus.index + 1) % ring.length]] : null
  const focusVertex = focus?.kind === 'vertex' ? focus.index : null

  return (
    <Group listening={false} name="tent-edit">
      {ring.length >= 2 && !invalid && (
        <>
          <Line
            points={points}
            closed
            stroke={THEME['bg-surface']}
            strokeWidth={HALO_PX}
            strokeScaleEnabled={false}
            perfectDrawEnabled={false}
          />
          <Line
            points={points}
            closed
            fill={preview !== null && isInner ? THEME['inner-fill'] : undefined}
            stroke={THEME['select']}
            strokeWidth={SELECT_STROKE_PX}
            strokeScaleEnabled={false}
            perfectDrawEnabled={false}
          />
        </>
      )}
      {ring.length >= 2 && invalid && (
        <Line
          points={points}
          closed
          stroke={danger}
          strokeWidth={INVALID_STROKE_PX}
          dash={[...INVALID_EDIT_STYLE.dash]}
          strokeScaleEnabled={false}
          perfectDrawEnabled={false}
        />
      )}
      {focusEdge !== null && focusEdge[0] !== undefined && focusEdge[1] !== undefined && (
        <Line
          points={[focusEdge[0][0], focusEdge[0][1], focusEdge[1][0], focusEdge[1][1]]}
          stroke={color}
          strokeWidth={FOCUS_EDGE_STROKE_PX}
          lineCap="round"
          strokeScaleEnabled={false}
          perfectDrawEnabled={false}
        />
      )}
      {labels.map((l) => (
        <EdgeBadge key={`e${l.index}`} label={l} zoom={zoom} color={color} focused={focus?.kind === 'edge' && focus.index === l.index} />
      ))}
      {invalid && box !== null && (
        <InvalidLabel at={[(box.minX + box.maxX) / 2, box.minY]} zoom={zoom} color={danger} />
      )}
      {handles.map((h) =>
        h.kind === 'vertex' ? (
          <VertexDot key={`v${h.index}`} at={h.world} zoom={zoom} color={color} selected={h.index === vertexIndex || h.index === focusVertex} />
        ) : (
          <PlusDot key={`p${h.edgeIndex}`} at={h.world} zoom={zoom} color={color} />
        ),
      )}
    </Group>
  )
}
