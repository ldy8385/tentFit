import { outerRing, worldRing } from './geom'
import { COLOR_KEYS, round1 } from './model'
import type { ColorKey, Item, Pt, Shape, Tent } from './model'

/**
 * 썸네일용 물건 색. 디자인 시안 tokens.css의 obj-<키> 라이트 값입니다(OD-2, 순서는 COLOR_KEYS와 같음).
 * pen에 sky·brown·gray 조정을 요청해 두었으므로, 시안이 바뀌면 값만 바꿉니다.
 * 경고색(빨강·주황)은 넣지 않습니다(스펙 §5.2).
 */
export const THUMB_COLORS: Record<ColorKey, string> = {
  blue: '#4A7FD0',
  teal: '#159C92',
  green: '#6F9636',
  purple: '#8A6AD4',
  pink: '#C2559E',
  gray: '#5B7386',
  sky: '#2BA3C7',
  brown: '#9A8449',
}

type Box = { minX: number; minY: number; maxX: number; maxY: number }
type Placement = { shape: Shape; x: number; y: number; rotation: number }
type Paint = { fill: string; fillOpacity: number; stroke: string; strokeWidth: number; dashed: boolean }

const DEFAULT_SIZE = 160
const MARGIN_RATIO = 0.05
/** 외곽 크기를 알 수 없을 때 쓰는 상자(cm). */
const FALLBACK_BOX: Box = { minX: -100, minY: -100, maxX: 100, maxY: 100 }

const OUTER_PAINT: Paint = { fill: '#F3EFE6', fillOpacity: 1, stroke: '#4A4A4A', strokeWidth: 2, dashed: false }
const INNER_PAINT: Paint = { fill: '#9DB59A', fillOpacity: 0.45, stroke: '#5F7A5C', strokeWidth: 1.5, dashed: false }

/** 0.1cm로 반올림한 숫자 문자열. -0과 NaN을 쓰지 않습니다. */
function num(v: number): string {
  return Number.isFinite(v) ? String(round1(v)) : '0'
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isFinitePt(p: Pt): boolean {
  return Number.isFinite(p[0]) && Number.isFinite(p[1])
}

/** 꼭짓점이 3개 미만인 다각형은 geom 함수에 넘기지 않고 그리지 않습니다(손상 데이터 대비). */
function tooFewPoints(shape: Shape): boolean {
  return shape.kind === 'polygon' && shape.points.length < 3
}

function ringBox(ring: Pt[]): Box | null {
  if (ring.length === 0 || !ring.every(isFinitePt)) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of ring) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
}

/** 외곽 바운딩 박스. 원은 근사 다각형이 아니라 실제 원의 상자를 씁니다. */
function outerBox(tent: Tent): Box | null {
  const o = tent.outer
  if (o.kind === 'circle') {
    const r = o.d / 2
    return Number.isFinite(r) && r > 0 ? { minX: -r, minY: -r, maxX: r, maxY: r } : null
  }
  if (tooFewPoints(o)) return null
  return ringBox(outerRing(tent))
}

function viewBoxOf(tent: Tent): string {
  let box = outerBox(tent) ?? FALLBACK_BOX
  if (!(Math.max(box.maxX - box.minX, box.maxY - box.minY) > 0)) box = FALLBACK_BOX
  const w = box.maxX - box.minX
  const h = box.maxY - box.minY
  const m = MARGIN_RATIO * Math.max(w, h)
  return [box.minX - m, box.minY - m, w + 2 * m, h + 2 * m].map(num).join(' ')
}

function paintAttrs(p: Paint): string {
  const dash = p.dashed ? ' stroke-dasharray="4 3"' : ''
  return (
    `fill="${esc(p.fill)}" fill-opacity="${p.fillOpacity}" stroke="${esc(p.stroke)}" stroke-width="${p.strokeWidth}"` +
    `${dash} stroke-linejoin="round" vector-effect="non-scaling-stroke"`
  )
}

function circleEl(cls: string, cx: number, cy: number, d: number, paint: Paint): string {
  const r = d / 2
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(r) || r <= 0) return ''
  return `<circle class="${cls}" cx="${num(cx)}" cy="${num(cy)}" r="${num(r)}" ${paintAttrs(paint)}/>`
}

function polygonEl(cls: string, ring: Pt[], paint: Paint): string {
  if (ring.length < 3 || !ring.every(isFinitePt)) return ''
  const points = ring.map(([x, y]) => `${num(x)},${num(y)}`).join(' ')
  return `<polygon class="${cls}" points="${points}" ${paintAttrs(paint)}/>`
}

function placedEl(cls: string, p: Placement, paint: Paint): string {
  if (p.shape.kind === 'circle') return circleEl(cls, p.x, p.y, p.shape.d, paint)
  if (tooFewPoints(p.shape)) return ''
  return polygonEl(cls, worldRing(p), paint)
}

/** 외곽은 월드 원점·회전 0에 놓입니다(스펙 §3). */
function outerEl(tent: Tent): string {
  const o = tent.outer
  if (o.kind === 'circle') return circleEl('tf-outer', 0, 0, o.d, OUTER_PAINT)
  if (tooFewPoints(o)) return ''
  return polygonEl('tf-outer', outerRing(tent), OUTER_PAINT)
}

function palette(over?: Partial<Record<ColorKey, string>>): Record<ColorKey, string> {
  const out: Record<ColorKey, string> = { ...THUMB_COLORS }
  if (over) {
    for (const k of COLOR_KEYS) {
      const v = over[k]
      if (typeof v === 'string' && v !== '') out[k] = v
    }
  }
  return out
}

/** 모르는 색 키(손상된 데이터)는 gray로 그립니다(스펙 §5.2). */
function colorOf(pal: Record<ColorKey, string>, key: string): string {
  return Object.prototype.hasOwnProperty.call(pal, key) ? pal[key as ColorKey] : pal.gray
}

function itemPaint(item: Item, pal: Record<ColorKey, string>): Paint {
  const c = colorOf(pal, item.color)
  return {
    fill: c,
    fillOpacity: item.countsArea ? 0.7 : 0.3,
    stroke: c,
    strokeWidth: 1,
    dashed: !item.countsArea,
  }
}

/**
 * 배치·텐트를 미니 평면도 SVG 문자열로 만듭니다(배치 목록, 프리셋 카드 공용).
 * - viewBox = 외곽 바운딩 박스 + 긴 변의 5% 여백
 * - 그리는 순서: 외곽 → 이너(배열 순서) → 물건(배열 순서, 뒤쪽이 위)
 * - 원은 <circle>, 나머지는 월드 좌표 <polygon>. 바닥 무늬 없이 단색입니다.
 * - 선 굵기는 화면 px 기준(vector-effect="non-scaling-stroke")입니다.
 */
export function thumbnailSvg(
  src: { tent: Tent; items?: Item[] },
  opts?: { size?: number; colors?: Partial<Record<ColorKey, string>> },
): string {
  const { tent } = src
  const sizeOpt = opts?.size
  const size = sizeOpt !== undefined && Number.isFinite(sizeOpt) && sizeOpt > 0 ? sizeOpt : DEFAULT_SIZE
  const pal = palette(opts?.colors)

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(size)}" height="${num(size)}" viewBox="${viewBoxOf(tent)}" role="img" aria-label="${esc(tent.name)}">`,
  ]
  parts.push(outerEl(tent))
  for (const inner of tent.inners) parts.push(placedEl('tf-inner', inner, INNER_PAINT))
  for (const item of src.items ?? []) parts.push(placedEl('tf-item', item, itemPaint(item, pal)))
  parts.push('</svg>')
  return parts.join('')
}
