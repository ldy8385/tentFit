// Board가 쓰는 Konva 그리기 조각들(스펙 §4.6). 장면 모델(scene.ts)을 그대로 그리기만 하고 문서를 바꾸지 않습니다.
// 좌표는 월드 cm(Stage가 zoom·pan을 적용), 선 굵기·대시는 strokeScaleEnabled=false로 화면 px입니다.
import type Konva from 'konva'
import { memo, useCallback, type JSX } from 'react'
import { Circle, Group, Line, Rect, Shape as KShape, Text } from 'react-konva'
import { hasRadii, shapeRing } from '../../core/geom'
import type { Pt, Shape } from '../../core/model'
import { THEME } from '../../ui/theme'
import type { InnerNode, ItemNode, PieceNode, Scene } from '../scene'
import type { TentDim } from './drawGesture'
import { itemLabelTooltip, setCanvasTitle } from './itemTooltip'
import { itemWorldBBox } from './marquee'

export const FONT_FAMILY = THEME['font-sans'] || 'sans-serif'
/** 캔버스 라벨 글자 크기(화면 px, §4.6 최소 11px) */
export const LABEL_FONT_PX = 11
/** 텐트 편집·그룹 밖 물건의 면·라벨 흐림 */
export const DIM_OPACITY = 0.3
/** 선택 halo: 선택 테두리(1.5px) 양쪽으로 흰색 2px씩(§4.6) */
export const HALO_PX = 5.5
const OUTER_STROKE_PX = 2.5
const INNER_STROKE_PX = 1.5
const WARN_STROKE_PX = 2
/** 걸침 경고의 짧은 대시(3-3). 깔개의 긴 대시(6-4)와 모양으로 구분합니다(§4.6). */
const STRADDLE_DASH = [3, 3]
const HATCH_SPACING_PX = 6
const HATCH_MAX_LINES = 3000
const BADGE_R_PX = 8

/** 가는 선 = 격자 간격, 굵은 선 = 그 10배(소유자 요청 2026-10-15) */
const GRID_STYLE = {
  fine: { stroke: THEME['grid-fine'], width: 1 },
  strong: { stroke: THEME['grid-strong'], width: 1.5 },
} as const

type GeomStyle = Omit<Konva.ShapeConfig, 'x' | 'y' | 'rotation' | 'sceneFunc'>

/** 모서리 반지름이 있는 사각형·다각형(윤곽 고리로 그림) */
function rounded(shape: Shape): boolean {
  return shape.kind !== 'circle' && hasRadii(shape.radii)
}

/** 도형 하나를 로컬 원점 기준으로 그립니다(사각형은 가운데가 원점, 원은 중심, 다각형은 점 그대로, 둥근 모서리는 윤곽 고리). */
export function Geom(props: { shape: Shape } & GeomStyle): JSX.Element {
  const { shape, ...style } = props
  if (rounded(shape)) return <Line points={shapeRing(shape).flat()} closed {...style} />
  switch (shape.kind) {
    case 'rect':
      return <Rect x={-shape.w / 2} y={-shape.h / 2} width={shape.w} height={shape.h} {...style} />
    case 'circle':
      return <Circle radius={shape.d / 2} {...style} />
    case 'polygon':
      return <Line points={shape.points.flat()} closed {...style} />
  }
}

/** 로컬 bbox(cm) */
function localBox(shape: Shape): { minX: number; minY: number; maxX: number; maxY: number } {
  switch (shape.kind) {
    case 'rect':
      return { minX: -shape.w / 2, minY: -shape.h / 2, maxX: shape.w / 2, maxY: shape.h / 2 }
    case 'circle':
      return { minX: -shape.d / 2, minY: -shape.d / 2, maxX: shape.d / 2, maxY: shape.d / 2 }
    case 'polygon': {
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const [x, y] of shape.points) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
      return shape.points.length > 0 ? { minX, minY, maxX, maxY } : { minX: 0, minY: 0, maxX: 0, maxY: 0 }
    }
  }
}

/** 도형 윤곽 경로를 만듭니다(채우거나 칠하지 않음). */
function tracePath(ctx: Konva.Context, shape: Shape): void {
  ctx.beginPath()
  if (rounded(shape)) {
    shapeRing(shape).forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
  } else if (shape.kind === 'rect') {
    ctx.rect(-shape.w / 2, -shape.h / 2, shape.w, shape.h)
  } else if (shape.kind === 'circle') {
    ctx.arc(0, 0, shape.d / 2, 0, Math.PI * 2, false)
  } else {
    shape.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
  }
  ctx.closePath()
}

/** 한 격자 단계를 경로 하나로 그립니다(선마다 노드를 만들지 않음). */
export function GridShape(props: { strong: boolean; lines: number[][] }): JSX.Element {
  const style = props.strong ? GRID_STYLE.strong : GRID_STYLE.fine
  const { lines } = props
  return (
    <KShape
      listening={false}
      stroke={style.stroke}
      strokeWidth={style.width}
      strokeScaleEnabled={false}
      sceneFunc={(ctx, shape) => {
        ctx.beginPath()
        for (const l of lines) {
          ctx.moveTo(l[0] ?? 0, l[1] ?? 0)
          ctx.lineTo(l[2] ?? 0, l[3] ?? 0)
        }
        ctx.strokeShape(shape)
      }}
    />
  )
}

/** 화면 크기가 고정된 라벨(월드 점 at 가운데). 글자 둘레에 캔버스 배경색 테두리를 둘러 격자 위에서도 읽히게 합니다. */
function ScreenLabel(props: { text: string; at: Pt; zoom: number; color: string }): JSX.Element {
  const k = 1 / props.zoom
  const width = Math.max(40, [...props.text].length * 12)
  return (
    <Text
      x={props.at[0]}
      y={props.at[1]}
      scaleX={k}
      scaleY={k}
      width={width}
      offsetX={width / 2}
      offsetY={LABEL_FONT_PX / 2}
      text={props.text}
      fontSize={LABEL_FONT_PX}
      fontFamily={FONT_FAMILY}
      fill={props.color}
      stroke={THEME['canvas-bg']}
      strokeWidth={3}
      fillAfterStrokeEnabled
      lineJoin="round"
      align="center"
      wrap="none"
      listening={false}
      perfectDrawEnabled={false}
    />
  )
}

function PieceFill(props: { piece: PieceNode; fill: string }): JSX.Element {
  const { rings } = props.piece
  return (
    <KShape
      listening={false}
      fill={props.fill}
      fillRule="evenodd"
      perfectDrawEnabled={false}
      sceneFunc={(ctx, shape) => {
        ctx.beginPath()
        for (const ring of rings) {
          ring.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
          ctx.closePath()
        }
        ctx.fillShape(shape)
      }}
    />
  )
}

/** 흐림 없음 */
const NO_DIM: TentDim = { outer: false, innerIds: new Set() }

/**
 * 텐트 레이어: 전실(바닥) 면 → 이너(반투명 면 + 실선) → 외곽 굵은 실선 → 라벨.
 * dim: 만들기 화면 단계의 잠긴 쪽·다시 그리는 원본은 흐리게(Plan 4.1). scene.tentVisible이 false면(외곽 없음) 그리지 않습니다.
 */
export function TentContent(props: { scene: Scene; zoom: number; dim?: TentDim }): JSX.Element | null {
  const { scene, zoom } = props
  const dim = props.dim ?? NO_DIM
  if (!scene.tentVisible) return null
  const outerOpacity = dim.outer ? DIM_OPACITY : 1
  const innerOpacity = (id: string) => (dim.innerIds.has(id) ? DIM_OPACITY : 1)
  return (
    <>
      <Group opacity={outerOpacity}>
        {scene.pieces.map((p) => (
          <PieceFill key={p.key} piece={p} fill={scene.vest.fill} />
        ))}
      </Group>
      {scene.inners.map((n) => (
        <Group key={n.id} id={`inner:${n.id}`} name="inner" x={n.x} y={n.y} rotation={n.rotation} opacity={innerOpacity(n.id)}>
          <Geom
            shape={n.shape}
            fill={n.fill}
            stroke={n.stroke}
            strokeWidth={INNER_STROKE_PX}
            strokeScaleEnabled={false}
            perfectDrawEnabled={false}
          />
        </Group>
      ))}
      <Geom
        shape={scene.outer}
        name="outer"
        stroke={THEME['tent-outline']}
        strokeWidth={OUTER_STROKE_PX}
        strokeScaleEnabled={false}
        perfectDrawEnabled={false}
        opacity={outerOpacity}
      />
      {zoom > 0 && (
        <Group opacity={outerOpacity}>
          {scene.pieces
            .filter((p) => p.label.visible)
            .map((p) => (
              <ScreenLabel
                key={`label:${p.key}`}
                text={p.label.text}
                at={[p.label.x, p.label.y]}
                zoom={zoom}
                color={THEME['text-secondary']}
              />
            ))}
        </Group>
      )}
      {zoom > 0 &&
        scene.inners
          .filter((n) => n.label.visible)
          .map((n) => (
            <Group key={`label:${n.id}`} opacity={innerOpacity(n.id)}>
              <ScreenLabel text={n.label.text} at={[n.label.x, n.label.y]} zoom={zoom} color={n.stroke} />
            </Group>
          ))}
    </>
  )
}

export type ItemShapeProps = {
  node: ItemNode
  zoom: number
  selected: boolean
  dragDistance: number
  /** 상하좌우로만 이동(Shift·[상하좌우] 토글) 고정. Konva가 끄는 동안 절대 위치를 넘겨 부릅니다 */
  dragBoundFunc?(pos: { x: number; y: number }): { x: number; y: number }
  register(id: string, node: Konva.Group | null): void
  onDragStart(e: Konva.KonvaEventObject<DragEvent>): void
  onDragEnd(e: Konva.KonvaEventObject<DragEvent>): void
}

function sameDash(a: number[] | null, b: number[] | null): boolean {
  if (a === b) return true
  if (a === null || b === null || a.length !== b.length) return false
  return a.every((v, i) => v === b[i])
}

function sameItemProps(a: ItemShapeProps, b: ItemShapeProps): boolean {
  const p = a.node
  const q = b.node
  return (
    p.id === q.id &&
    p.shape === q.shape &&
    p.x === q.x &&
    p.y === q.y &&
    p.rotation === q.rotation &&
    p.stroke === q.stroke &&
    p.fill === q.fill &&
    sameDash(p.dash, q.dash) &&
    p.strokeWidth === q.strokeWidth &&
    p.label === q.label &&
    p.labelVisible === q.labelVisible &&
    p.dimmed === q.dimmed &&
    (!p.labelVisible || a.zoom === b.zoom) &&
    a.selected === b.selected &&
    a.dragDistance === b.dragDistance &&
    a.dragBoundFunc === b.dragBoundFunc &&
    a.register === b.register &&
    a.onDragStart === b.onDragStart &&
    a.onDragEnd === b.onDragEnd
  )
}

/**
 * 물건 하나 = 끌 수 있는 Group(name 'item', id = 물건 id). 안에 halo(선택 시) → 도형 → 라벨 순서로 그립니다.
 * 라벨 상자는 도형의 로컬 bbox와 같게 둬서 Transformer 상자가 도형과 같아지게 합니다. 거꾸로 보이는 각도면 180° 뒤집습니다.
 */
export const ItemShape = memo(function ItemShape(props: ItemShapeProps): JSX.Element {
  const { node, zoom, selected, dragDistance, dragBoundFunc, register, onDragStart, onDragEnd } = props
  const id = node.id
  const ref = useCallback(
    (g: Konva.Group | null) => {
      if (!g) return
      register(id, g)
      return () => register(id, null)
    },
    [id, register],
  )
  const box = localBox(node.shape)
  const w = box.maxX - box.minX
  const h = box.maxY - box.minY
  const flip = node.rotation > 90 && node.rotation <= 270
  // 이름이 다 보이지 않으면(말줄임·숨김) 마우스를 올렸을 때 전체 이름을 툴팁으로(2026-10-15)
  const onMouseEnter = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const text = (e.currentTarget as Konva.Group).findOne<Konva.Text>('Text')
    setCanvasTitle(e.currentTarget, itemLabelTooltip(node.label, text === undefined ? null : text.textArr.map((l) => l.text)))
  }
  const onMouseLeave = (e: Konva.KonvaEventObject<MouseEvent>) => setCanvasTitle(e.currentTarget, null)
  return (
    <Group
      ref={ref}
      id={id}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      name="item"
      x={node.x}
      y={node.y}
      rotation={node.rotation}
      draggable={!node.dimmed}
      listening={!node.dimmed}
      opacity={node.dimmed ? DIM_OPACITY : 1}
      dragDistance={dragDistance}
      dragBoundFunc={dragBoundFunc}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {selected && (
        <Geom
          shape={node.shape}
          stroke={THEME['bg-surface']}
          strokeWidth={HALO_PX}
          strokeScaleEnabled={false}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
      <Geom
        shape={node.shape}
        fill={node.fill}
        stroke={node.stroke}
        strokeWidth={node.strokeWidth}
        dash={node.dash ?? undefined}
        dashEnabled={node.dash !== null}
        strokeScaleEnabled={false}
        perfectDrawEnabled={false}
        shadowForStrokeEnabled={false}
      />
      {node.labelVisible && zoom > 0 && (
        <Text
          x={(box.minX + box.maxX) / 2}
          y={(box.minY + box.maxY) / 2}
          offsetX={w / 2}
          offsetY={h / 2}
          width={w}
          height={h}
          rotation={flip ? 180 : 0}
          padding={4 / zoom}
          text={node.label}
          fontSize={LABEL_FONT_PX / zoom}
          fontFamily={FONT_FAMILY}
          fill={THEME['text-primary']}
          align="center"
          verticalAlign="middle"
          wrap="none"
          ellipsis
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
    </Group>
  )
}, sameItemProps)

/** 빗금 + 윤곽선. 빗금은 도형 안에만(clip), 화면 6px 간격·1px. 윤곽선은 shape의 stroke 설정으로 그립니다. */
function HatchedOutline(props: { shape: Shape; zoom: number; color: string }): JSX.Element {
  const { shape, zoom, color } = props
  return (
    <KShape
      listening={false}
      stroke={color}
      strokeWidth={WARN_STROKE_PX}
      strokeScaleEnabled={false}
      sceneFunc={(ctx, s) => {
        const b = localBox(shape)
        const height = b.maxY - b.minY
        const span = b.maxX - b.minX + height
        const step = Math.max(HATCH_SPACING_PX / zoom, span / HATCH_MAX_LINES)
        ctx.save()
        tracePath(ctx, shape)
        ctx.clip()
        ctx.beginPath()
        for (let t = b.minX - height; t <= b.maxX; t += step) {
          ctx.moveTo(t, b.maxY)
          ctx.lineTo(t + height, b.minY)
        }
        ctx.setAttr('strokeStyle', color)
        ctx.setAttr('lineWidth', 1 / zoom)
        ctx.setAttr('globalAlpha', 0.55)
        ctx.stroke()
        ctx.restore()
        tracePath(ctx, shape)
        ctx.strokeShape(s)
      }}
    />
  )
}

/** 화면 크기 고정 배지(지름 16px). danger = 원 안 삼각형(나감·이탈), warn = 둥근 사각 안 사각형(걸침). */
function Badge(props: { kind: 'danger' | 'warn'; at: Pt; zoom: number }): JSX.Element {
  const k = 1 / props.zoom
  const r = BADGE_R_PX
  return (
    <Group x={props.at[0]} y={props.at[1]} scaleX={k} scaleY={k} listening={false}>
      {props.kind === 'danger' ? (
        <>
          <Circle radius={r} fill={THEME['danger']} stroke={THEME['text-inverse']} strokeWidth={1.5} />
          <Line points={[0, -4.5, 4.5, 3.5, -4.5, 3.5]} closed stroke={THEME['text-inverse']} strokeWidth={1.5} lineJoin="round" />
        </>
      ) : (
        <>
          <Rect x={-r} y={-r} width={r * 2} height={r * 2} cornerRadius={4} fill={THEME['warn']} stroke={THEME['text-inverse']} strokeWidth={1.5} />
          <Rect x={-3.5} y={-3.5} width={7} height={7} stroke={THEME['text-inverse']} strokeWidth={1.5} />
        </>
      )}
    </Group>
  )
}

/**
 * 경고 레이어(§4.6): 흐림과 상관없이 100%로 그립니다.
 * - 밖으로 나감·이너 이탈: 빨간 실선 + 빗금 + 삼각 배지
 * - 이너 벽 걸침: 주황 2px 짧은 대시(3-3) + 사각 배지
 * hidden(끄는 중·변형 중인 물건)은 값이 손을 뗄 때 다시 계산되므로 그 사이에는 그리지 않습니다.
 */
export function WarningMarks(props: {
  items: ItemNode[]
  inners: InnerNode[]
  zoom: number
  hidden: ReadonlySet<string>
}): JSX.Element | null {
  const { items, inners, zoom, hidden } = props
  if (!(zoom > 0)) return null
  const danger = THEME['danger']
  const warn = THEME['warn']
  return (
    <>
      {inners
        .filter((n) => n.escape)
        .map((n) => {
          const b = itemWorldBBox(n)
          return (
            <Group key={`inner:${n.id}`}>
              <Group x={n.x} y={n.y} rotation={n.rotation}>
                <HatchedOutline shape={n.shape} zoom={zoom} color={danger} />
              </Group>
              <Badge kind="danger" at={[b.maxX, b.minY]} zoom={zoom} />
            </Group>
          )
        })}
      {items
        .filter((n) => n.warn !== 'none' && !hidden.has(n.id))
        .map((n) => {
          const b = itemWorldBBox(n)
          return (
            <Group key={n.id}>
              <Group x={n.x} y={n.y} rotation={n.rotation}>
                {n.warn === 'outside' ? (
                  <HatchedOutline shape={n.shape} zoom={zoom} color={danger} />
                ) : (
                  <Geom
                    shape={n.shape}
                    stroke={warn}
                    strokeWidth={WARN_STROKE_PX}
                    dash={STRADDLE_DASH}
                    strokeScaleEnabled={false}
                    listening={false}
                  />
                )}
              </Group>
              <Badge kind={n.warn === 'outside' ? 'danger' : 'warn'} at={[b.maxX, b.minY]} zoom={zoom} />
            </Group>
          )
        })}
    </>
  )
}
