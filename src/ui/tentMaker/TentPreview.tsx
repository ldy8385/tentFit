// 텐트 만들기 화면의 실시간 미리보기(스펙 §4.4-1, R15). Konva가 아닌 React SVG라 happy-dom에서도 그려 보고 테스트합니다.
// 화면 px 좌표로 그립니다(라벨 11px 이상·선 굵기를 화면 기준으로 지키려고). 맞춤 = 외곽 ∪ 이너 바운딩 박스 + 여백.
// - 격자 10/50/100cm, 원점 = 외곽 바운딩 박스 왼쪽 위(§4.6, gridOriginOf)
// - 외곽: vest-fill + tent-outline 2px(원은 실제 원, D15). 이너: 반투명 inner-fill + inner-stroke, 라벨 '이너 1 · 300×220'
// - 이탈 이너: 빨간 실선 + 빗금(편집기 경고 표시와 같은 모양, §4.6)
// - 전실 조각 라벨 '전실 1 · 13.2m²'(구역 계산은 core buildZones)
// - 사다리꼴: 앞변·뒷변 길이와 깊이 수직 치수선(검토 L191)
// - 자유 모양(template null)이면 꼭짓점 점(끌기 없음, R8). 템플릿 모양이면 꼭짓점·+ 없음(§4.4-1)
import { useEffect, useId, useMemo, useRef, useState, type JSX, type ReactNode, type RefObject } from 'react'
import { outerRing, ringBBox, worldRing } from '../../core/geom'
import type { Inner, Pt, ShapeTemplate, Tent } from '../../core/model'
import { gridOriginOf } from '../../core/snap'
import { buildZones } from '../../core/zones'
import './tentPreview.css'

export type BBox = { minX: number; minY: number; maxX: number; maxY: number }
/** 화면 = 월드 × scale + (ox, oy) */
export type PreviewFit = { scale: number; ox: number; oy: number }

/** 텐트 둘레 여백(px). 사다리꼴 치수선·라벨이 이 안에 들어갑니다. */
export const PREVIEW_MARGIN_PX = 32
/** 크기를 아직 못 쟀을 때(첫 그림·테스트 환경) 쓰는 크기 */
const FALLBACK_SIZE = { width: 320, height: 240 }
/** 이보다 촘촘한 격자 간격(px)은 그리지 않습니다. */
const MIN_GRID_GAP_PX = 4
const MAX_GRID_LINES = 400

/** 미리보기 맞춤 범위: 외곽 ∪ 모든 이너(이탈 이너도 보이게). 원은 근사 다각형이 아니라 정확한 지름으로 잡습니다. */
export function previewBBox(tent: Tent): BBox {
  const boxes: BBox[] = []
  const add = (b: BBox) => boxes.push(b)
  if (tent.outer.kind === 'circle') {
    const r = tent.outer.d / 2
    add({ minX: -r, minY: -r, maxX: r, maxY: r })
  } else {
    const ring = outerRing(tent)
    if (ring.length > 0) add(ringBBox(ring))
  }
  for (const inner of tent.inners) {
    if (inner.shape.kind === 'circle') {
      const r = inner.shape.d / 2
      add({ minX: inner.x - r, minY: inner.y - r, maxX: inner.x + r, maxY: inner.y + r })
    } else {
      const ring = worldRing(inner)
      if (ring.length > 0) add(ringBBox(ring))
    }
  }
  if (boxes.length === 0) return { minX: -50, minY: -50, maxX: 50, maxY: 50 }
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    maxY: Math.max(...boxes.map((b) => b.maxY)),
  }
}

/** bbox를 size 안에 여백 marginPx를 두고 가운데 맞춤. 너비·높이가 0이어도 나누기 0이 없게 최소 1cm로 봅니다. */
export function previewFit(bbox: BBox, size: { width: number; height: number }, marginPx: number): PreviewFit {
  const bw = Math.max(1, bbox.maxX - bbox.minX)
  const bh = Math.max(1, bbox.maxY - bbox.minY)
  const aw = Math.max(1, size.width - marginPx * 2)
  const ah = Math.max(1, size.height - marginPx * 2)
  const scale = Math.min(aw / bw, ah / bh)
  const cx = (bbox.minX + bbox.maxX) / 2
  const cy = (bbox.minY + bbox.maxY) / 2
  return { scale, ox: size.width / 2 - cx * scale, oy: size.height / 2 - cy * scale }
}

/** 이너 라벨의 치수: 사각형 '300×220', 원 '지름 120', 다각형은 바운딩 박스 '가로×세로' */
function fmt(v: number): string {
  return String(Math.round(v * 10) / 10)
}

export function innerSizeText(inner: Inner): string {
  const t = inner.template
  if (t?.kind === 'rect') return `${fmt(t.w)}×${fmt(t.square === true ? t.w : t.h)}`
  const s = inner.shape
  if (s.kind === 'rect') return `${fmt(s.w)}×${fmt(s.h)}`
  if (s.kind === 'circle') return `지름 ${fmt(s.d)}`
  const b = ringBBox(s.points)
  return `${fmt(b.maxX - b.minX)}×${fmt(b.maxY - b.minY)}`
}

function areaM2Text(cm2: number): string {
  return `${(cm2 / 10000).toFixed(1)}m²`
}

function useElementSize(): [RefObject<HTMLDivElement | null>, { width: number; height: number }] {
  const ref = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState(FALLBACK_SIZE)
  useEffect(() => {
    const el = ref.current
    if (el === null || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect === undefined || rect.width <= 0 || rect.height <= 0) return
      setSize((s) => (s.width === rect.width && s.height === rect.height ? s : { width: rect.width, height: rect.height }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size]
}

function gridLines(origin: Pt, fit: PreviewFit, size: { width: number; height: number }): ReactNode[] {
  const step = [10, 50, 100].find((s) => s * fit.scale >= MIN_GRID_GAP_PX)
  if (step === undefined) return []
  const out: ReactNode[] = []
  const levelOf = (m: number) => (m % 100 === 0 ? 'strong' : m % 50 === 0 ? 'mid' : 'fine')
  for (const axis of ['x', 'y'] as const) {
    const o = axis === 'x' ? origin[0] : origin[1]
    const off = axis === 'x' ? fit.ox : fit.oy
    const len = axis === 'x' ? size.width : size.height
    const w0 = (0 - off) / fit.scale
    const w1 = (len - off) / fit.scale
    const k0 = Math.ceil((w0 - o) / step)
    const k1 = Math.floor((w1 - o) / step)
    if (k1 - k0 > MAX_GRID_LINES) continue
    for (let k = k0; k <= k1; k++) {
      const m = Math.round(k * step)
      const s = (o + m) * fit.scale + off
      const cls = `tf-tp__grid tf-tp__grid--${levelOf(Math.abs(m))}`
      out.push(
        axis === 'x' ? (
          <line key={`x${k}`} className={cls} x1={s} y1={0} x2={s} y2={size.height} />
        ) : (
          <line key={`y${k}`} className={cls} x1={0} y1={s} x2={size.width} y2={s} />
        ),
      )
    }
  }
  return out
}

/**
 * 사다리꼴 치수: 뒷변·앞변 길이는 변 가운데 위·아래에, 깊이는 오른쪽 수직 치수선(기울어진 변에 붙이면 실제 변 길이로 읽히므로, 검토 L191).
 * 외곽 고리 순서 = 뒷변 왼쪽 → 뒷변 오른쪽 → 앞변 오른쪽 → 앞변 왼쪽(templates.ts).
 */
function TrapezoidDims(p: {
  ring: readonly Pt[]
  template: Extract<ShapeTemplate, { kind: 'trapezoid' }>
  sx(x: number): number
  sy(y: number): number
}): JSX.Element | null {
  const [bl, br, fr, fl] = p.ring
  if (bl === undefined || br === undefined || fr === undefined || fl === undefined) return null
  const box = ringBBox([...p.ring])
  const x = p.sx(box.maxX) + 12
  const top = p.sy(box.minY)
  const bottom = p.sy(box.maxY)
  const mid = (top + bottom) / 2
  return (
    <g className="tf-tp__dims">
      <line className="tf-tp__dim-line" x1={x} y1={top} x2={x} y2={bottom} />
      <line className="tf-tp__dim-line" x1={x - 5} y1={top} x2={x + 5} y2={top} />
      <line className="tf-tp__dim-line" x1={x - 5} y1={bottom} x2={x + 5} y2={bottom} />
      <text className="tf-tp__dim-text" x={x + 14} y={mid} textAnchor="middle" transform={`rotate(-90 ${x + 14} ${mid})`}>
        {`깊이 ${fmt(p.template.depth)}cm`}
      </text>
      <text className="tf-tp__dim-text" x={p.sx((bl[0] + br[0]) / 2)} y={top - 8} textAnchor="middle">
        {`뒷변 ${fmt(p.template.back)}cm`}
      </text>
      <text className="tf-tp__dim-text" x={p.sx((fr[0] + fl[0]) / 2)} y={bottom + 18} textAnchor="middle">
        {`앞변 ${fmt(p.template.front)}cm`}
      </text>
    </g>
  )
}

export type TentPreviewProps = {
  tent: Tent
  /** 외곽 템플릿. null이면 자유 모양 → 꼭짓점 점을 그림 */
  template: ShapeTemplate | null
  /** 자유 모양에서 좌표 표로 고른 꼭짓점(채움 + 확대) */
  selectedVertex?: number | null
}

export function TentPreview(p: TentPreviewProps): JSX.Element {
  // url(#…) 안에 쓰므로 영문·숫자·_·- 만 남깁니다(React useId에는 «»·: 같은 글자가 들어갈 수 있음).
  const hatchId = `tf-tp-hatch-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`
  const [hostRef, size] = useElementSize()
  const { tent, template } = p
  const zones = useMemo(() => buildZones(tent), [tent])
  const bbox = useMemo(() => previewBBox(tent), [tent])
  const fit = previewFit(bbox, size, PREVIEW_MARGIN_PX)
  const sx = (x: number) => x * fit.scale + fit.ox
  const sy = (y: number) => y * fit.scale + fit.oy
  const pts = (ring: readonly Pt[]) => ring.map(([x, y]) => `${sx(x)},${sy(y)}`).join(' ')
  const escaped = new Set(zones.innerEscapes)
  const outer = outerRing(tent)

  const shapeOf = (inner: Inner, className: string, fill?: string): JSX.Element =>
    inner.shape.kind === 'circle' ? (
      <circle className={className} cx={sx(inner.x)} cy={sy(inner.y)} r={(inner.shape.d / 2) * fit.scale} fill={fill} />
    ) : (
      <polygon className={className} points={pts(worldRing(inner))} fill={fill} />
    )

  return (
    <div ref={hostRef} className="tf-tp">
      <svg
        className="tf-tp__svg"
        width={size.width}
        height={size.height}
        viewBox={`0 0 ${size.width} ${size.height}`}
        role="img"
        aria-label={`${tent.name} 미리보기`}
      >
        <defs>
          <pattern id={hatchId} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line className="tf-tp__hatch-line" x1={0} y1={0} x2={0} y2={6} />
          </pattern>
        </defs>
        <rect className="tf-tp__bg" x={0} y={0} width={size.width} height={size.height} />
        <g>{gridLines(gridOriginOf(tent), fit, size)}</g>

        {tent.outer.kind === 'circle' ? (
          <circle className="tf-tp__outer" cx={sx(0)} cy={sy(0)} r={(tent.outer.d / 2) * fit.scale} />
        ) : (
          <polygon className="tf-tp__outer" points={pts(outer)} />
        )}

        {tent.inners.map((inner) => {
          const esc = escaped.has(inner.id)
          return (
            <g key={inner.id} data-inner-id={inner.id}>
              {shapeOf(inner, esc ? 'tf-tp__inner tf-tp__inner--escape' : 'tf-tp__inner')}
              {esc && shapeOf(inner, 'tf-tp__hatch', `url(#${hatchId})`)}
            </g>
          )
        })}

        {zones.pieces.map((piece) => (
          <text
            key={piece.key}
            className="tf-tp__label tf-tp__label--vest"
            x={sx(piece.label[0])}
            y={sy(piece.label[1])}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {`${piece.name} · ${areaM2Text(piece.area)}`}
          </text>
        ))}

        {tent.inners.map((inner) => {
          const b = ringBBox(worldRing(inner))
          return (
            <text key={`label-${inner.id}`} className="tf-tp__label tf-tp__label--inner" x={sx(b.minX) + 4} y={sy(b.minY) + 14}>
              {`${inner.name} · ${innerSizeText(inner)}`}
            </text>
          )
        })}

        {template?.kind === 'trapezoid' && <TrapezoidDims ring={outer} template={template} sx={sx} sy={sy} />}

        {template === null &&
          tent.outer.kind !== 'circle' &&
          outer.map(([x, y], i) => {
            const selected = p.selectedVertex === i
            return (
              <circle
                key={`v${i}`}
                className={selected ? 'tf-tp__vertex tf-tp__vertex--selected' : 'tf-tp__vertex'}
                cx={sx(x)}
                cy={sy(y)}
                r={selected ? 7.5 : 6}
              />
            )
          })}
      </svg>
    </div>
  )
}
