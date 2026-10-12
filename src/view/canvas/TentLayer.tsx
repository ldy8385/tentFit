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
import { THEME } from '../../ui/theme'
import { INVALID_EDIT_STYLE, tentHandles } from '../tentEdit'
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

export type TentLayerProps = {
  layout: Layout
  /** ui.tentTarget */
  target: TentTarget | null
  /** ui.vertexIndex */
  vertexIndex: number | null
  view: View
  /** 끄는 중 미리보기(Board 화면 상태). 있으면 그 텐트로 대상·핸들을 그림 */
  preview: TentPreview | null
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
      {invalid && box !== null && (
        <InvalidLabel at={[(box.minX + box.maxX) / 2, box.minY]} zoom={zoom} color={danger} />
      )}
      {handles.map((h) =>
        h.kind === 'vertex' ? (
          <VertexDot key={`v${h.index}`} at={h.world} zoom={zoom} color={color} selected={h.index === vertexIndex} />
        ) : (
          <PlusDot key={`p${h.edgeIndex}`} at={h.world} zoom={zoom} color={color} />
        ),
      )}
    </Group>
  )
}
