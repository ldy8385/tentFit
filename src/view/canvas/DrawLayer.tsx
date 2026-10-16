// 자유 그리기 표시(설계 2026-10-12 §2.2, Plan 4.1). 그리기만 하고 입력은 받지 않습니다(listening=false).
// 점 찍기·닫기 판정은 Board 컨트롤러가 drawGesture(순수)로 하고, 점은 화면 스토어(ui.drawing)에 있습니다.
// Board가 경고 레이어 안 TentEditLayer 자리에 둡니다(그리는 중에는 선택 대상 핸들을 숨김 — 누르면 점이 되므로).
// 점·고무줄 끝은 화면 크기가 고정되도록 Group을 1/zoom으로 줄여 그립니다(TentLayer와 같은 방식).
// 선 길이(소유자 요청 2026-10-16): 찍은 변마다·지금 긋는 고무줄에 cm 숫자(고무줄은 진하게). 화면에서 짧은 선은 숨김.
// 안내(소유자 요청 2026-10-16): 찍힐 자리가 다른 점과 가로·세로 줄이 맞으면 정렬 안내선, 직전 변과 90°면 직각 표시(붙이지 않음).
import type { JSX } from 'react'
import { Circle, Group, Line, Rect, Text } from 'react-konva'
import { round1, type Pt } from '../../core/model'
import type { Drawing } from '../../store/ui'
import { THEME } from '../../ui/theme'
import type { RubberBand, drawGuides } from './drawGesture'
import { HALO_PX } from './nodes'
import { GUIDE_COLOR, GUIDE_DASH, GUIDE_OPACITY, GUIDE_STROKE_PX } from './TentLayer'
import { MIN_LABEL_SPAN_PX } from '../dimLabels'

/** 찍은 점 지름(화면 px) */
export const DRAW_DOT_PX = 10
/** 닫기 자리(첫 점) 지름 — 터치 잡는 거리가 보이도록 크게 */
export const CLOSE_DOT_PX = 18
const LINE_PX = 2
const RUBBER_DASH = [6, 4]
/** 직각 표시 한 변 길이(화면 px) */
export const RIGHT_MARK_PX = 12

export type DrawLayerModel = {
  /** 찍은 점을 잇는 열린 선(월드 cm, 평평한 배열) */
  line: number[]
  dots: { at: Pt; closeTarget: boolean }[]
  /** 마지막 점 → 고무줄 끝(대시). 점이 없으면 null */
  rubber: { points: number[]; closes: boolean } | null
  /** 탭하면 찍힐 자리(닫히는 고무줄이면 null) */
  preview: Pt | null
  /** 선 길이 숫자(선 가운데, 월드 cm). current = 지금 긋는 고무줄 */
  lengths: { at: Pt; text: string; current: boolean }[]
}

/** 선 길이 숫자들. zoom을 주면 화면에서 MIN_LABEL_SPAN_PX보다 짧은 선은 뺍니다. */
function lineLengths(pts: readonly Pt[], rubber: RubberBand | null, zoom: number | undefined): DrawLayerModel['lengths'] {
  const segs: [Pt, Pt, boolean][] = []
  for (let i = 0; i + 1 < pts.length; i++) segs.push([pts[i] as Pt, pts[i + 1] as Pt, false])
  if (rubber !== null && rubber.from !== null) segs.push([rubber.from, rubber.to, true])
  return segs.flatMap(([a, b, current]) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (zoom !== undefined && len * zoom < MIN_LABEL_SPAN_PX) return []
    return [{ at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Pt, text: String(round1(len)), current }]
  })
}

export function drawLayerModel(drawing: Drawing, rubber: RubberBand | null, zoom?: number): DrawLayerModel {
  const pts = drawing.points
  return {
    line: pts.flatMap((p) => [p[0], p[1]]),
    dots: pts.map((p, i) => ({ at: [p[0], p[1]], closeTarget: i === 0 && pts.length >= 3 })),
    rubber: rubber !== null && rubber.from !== null ? { points: [rubber.from[0], rubber.from[1], rubber.to[0], rubber.to[1]], closes: rubber.closes } : null,
    preview: rubber !== null && !rubber.closes ? [rubber.to[0], rubber.to[1]] : null,
    lengths: lineLengths(pts, rubber, zoom),
  }
}

/** 선 길이 숫자(화면 크기 고정). 지금 긋는 선은 채운 상자, 찍은 변은 테두리만 */
function LengthTag(props: { at: Pt; zoom: number; text: string; color: string; current: boolean }): JSX.Element {
  const k = 1 / props.zoom
  const w = [...props.text].length * 7 + 14
  return (
    <Group name="draw-length" x={props.at[0]} y={props.at[1]} scaleX={k} scaleY={k} listening={false}>
      <Rect
        x={-w / 2}
        y={-10}
        width={w}
        height={20}
        cornerRadius={10}
        fill={props.current ? props.color : THEME['bg-surface']}
        stroke={props.color}
        strokeWidth={1}
        perfectDrawEnabled={false}
      />
      <Text
        x={-w / 2}
        y={-10}
        width={w}
        height={20}
        text={props.text}
        fontSize={12}
        fontStyle={props.current ? 'bold' : 'normal'}
        fill={props.current ? THEME['text-inverse'] : props.color}
        align="center"
        verticalAlign="middle"
      />
    </Group>
  )
}

function Dot(props: { at: Pt; zoom: number; color: string; size: number; filled: boolean }): JSX.Element {
  const k = 1 / props.zoom
  return (
    <Group x={props.at[0]} y={props.at[1]} scaleX={k} scaleY={k} listening={false}>
      <Circle
        radius={props.size / 2}
        fill={props.filled ? props.color : THEME['bg-surface']}
        stroke={props.filled ? THEME['bg-surface'] : props.color}
        strokeWidth={2}
        perfectDrawEnabled={false}
      />
    </Group>
  )
}

/** guides = 정렬 안내선·직각 표시(정렬 안내선을 끄면 null) */
export function DrawLayer(props: { drawing: Drawing; rubber: RubberBand | null; zoom: number; guides?: ReturnType<typeof drawGuides> | null }): JSX.Element | null {
  const { drawing, rubber, zoom } = props
  const s = RIGHT_MARK_PX / zoom
  if (!(zoom > 0)) return null
  const m = drawLayerModel(drawing, rubber, zoom)
  const color = drawing.goal === 'outer' ? THEME['accent'] : THEME['info']
  return (
    <Group listening={false} name="tent-draw">
      {m.line.length >= 4 && (
        <>
          <Line points={m.line} stroke={THEME['bg-surface']} strokeWidth={HALO_PX} strokeScaleEnabled={false} lineJoin="round" perfectDrawEnabled={false} />
          <Line points={m.line} stroke={color} strokeWidth={LINE_PX} strokeScaleEnabled={false} lineJoin="round" perfectDrawEnabled={false} />
        </>
      )}
      {m.rubber !== null && (
        <Line points={m.rubber.points} stroke={color} strokeWidth={LINE_PX} dash={RUBBER_DASH} strokeScaleEnabled={false} perfectDrawEnabled={false} />
      )}
      {m.dots.map((d, i) => (
        <Dot
          key={i}
          at={d.at}
          zoom={zoom}
          color={color}
          size={d.closeTarget ? CLOSE_DOT_PX : DRAW_DOT_PX}
          filled={d.closeTarget && (m.rubber?.closes ?? false)}
        />
      ))}
      {m.preview !== null && <Dot at={m.preview} zoom={zoom} color={color} size={DRAW_DOT_PX} filled />}
      {props.guides?.lines.map((g, i) => (
        <Line
          key={`guide${String(i)}`}
          name="draw-guide"
          points={[g.a[0], g.a[1], g.b[0], g.b[1]]}
          stroke={GUIDE_COLOR}
          strokeWidth={GUIDE_STROKE_PX}
          dash={GUIDE_DASH}
          opacity={GUIDE_OPACITY}
          strokeScaleEnabled={false}
          perfectDrawEnabled={false}
        />
      ))}
      {props.guides?.right.map((r, i) => (
        <Line
          key={`right${String(i)}`}
          name="draw-right-angle"
          points={[r.at[0] + r.u[0] * s, r.at[1] + r.u[1] * s, r.at[0] + (r.u[0] + r.v[0]) * s, r.at[1] + (r.u[1] + r.v[1]) * s, r.at[0] + r.v[0] * s, r.at[1] + r.v[1] * s]}
          stroke={GUIDE_COLOR}
          strokeWidth={GUIDE_STROKE_PX}
          strokeScaleEnabled={false}
          perfectDrawEnabled={false}
        />
      ))}
      {m.lengths.map((l, i) => (
        <LengthTag key={`len${String(i)}`} at={l.at} zoom={zoom} text={l.text} color={color} current={l.current} />
      ))}
    </Group>
  )
}
