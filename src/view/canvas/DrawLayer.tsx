// 자유 그리기 표시(설계 2026-10-12 §2.2, Plan 4.1). 그리기만 하고 입력은 받지 않습니다(listening=false).
// 점 찍기·닫기 판정은 Board 컨트롤러가 drawGesture(순수)로 하고, 점은 화면 스토어(ui.drawing)에 있습니다.
// Board가 경고 레이어 안 TentEditLayer 자리에 둡니다(그리는 중에는 선택 대상 핸들을 숨김 — 누르면 점이 되므로).
// 점·고무줄 끝은 화면 크기가 고정되도록 Group을 1/zoom으로 줄여 그립니다(TentLayer와 같은 방식).
import type { JSX } from 'react'
import { Circle, Group, Line } from 'react-konva'
import type { Pt } from '../../core/model'
import type { Drawing } from '../../store/ui'
import { THEME } from '../../ui/theme'
import type { RubberBand } from './drawGesture'
import { HALO_PX } from './nodes'

/** 찍은 점 지름(화면 px) */
export const DRAW_DOT_PX = 10
/** 닫기 자리(첫 점) 지름 — 터치 잡는 거리가 보이도록 크게 */
export const CLOSE_DOT_PX = 18
const LINE_PX = 2
const RUBBER_DASH = [6, 4]

export type DrawLayerModel = {
  /** 찍은 점을 잇는 열린 선(월드 cm, 평평한 배열) */
  line: number[]
  dots: { at: Pt; closeTarget: boolean }[]
  /** 마지막 점 → 고무줄 끝(대시). 점이 없으면 null */
  rubber: { points: number[]; closes: boolean } | null
  /** 탭하면 찍힐 자리(닫히는 고무줄이면 null) */
  preview: Pt | null
}

export function drawLayerModel(drawing: Drawing, rubber: RubberBand | null): DrawLayerModel {
  const pts = drawing.points
  return {
    line: pts.flatMap((p) => [p[0], p[1]]),
    dots: pts.map((p, i) => ({ at: [p[0], p[1]], closeTarget: i === 0 && pts.length >= 3 })),
    rubber: rubber !== null && rubber.from !== null ? { points: [rubber.from[0], rubber.from[1], rubber.to[0], rubber.to[1]], closes: rubber.closes } : null,
    preview: rubber !== null && !rubber.closes ? [rubber.to[0], rubber.to[1]] : null,
  }
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

export function DrawLayer(props: { drawing: Drawing; rubber: RubberBand | null; zoom: number }): JSX.Element | null {
  const { drawing, rubber, zoom } = props
  if (!(zoom > 0)) return null
  const m = drawLayerModel(drawing, rubber)
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
    </Group>
  )
}
