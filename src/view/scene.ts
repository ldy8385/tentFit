// 장면 모델(스펙 §4.6): 문서·통계·보기를 Konva가 그릴 데이터로 바꾸는 순수 함수.
// 색은 theme.ts에서만 가져오고, 계산(구역·경고·면적)은 core가 이미 한 결과를 읽기만 합니다.
// 길이·좌표는 월드 cm, 선 굵기·대시·라벨 판정 기준은 화면 px입니다(Board가 strokeScaleEnabled=false로 그림).
import { outerRing, regionRings, ringBBox, worldRing } from '../core/geom'
import { round1, type Item, type Layout, type Pt, type Shape } from '../core/model'
import { gridOriginOf } from '../core/snap'
import type { Stats } from '../core/stats'
import type { Zones } from '../core/zones'
import type { Mode } from '../store/ui'
import { objColor } from '../ui/theme'
import type { BBox, Size, View } from './viewport'

/** 물건 라벨: 화면에서 도형의 짧은 쪽이 이 값(px)보다 작으면 숨깁니다(§4.6). */
export const LABEL_MIN_SCREEN_PX = 40
/** 격자 단계: 화면 선 간격이 이 값(px)보다 좁으면 그 단계를 숨깁니다(§4.6). */
export const GRID_MIN_SPACING_PX = 6

export type GridLevel = 10 | 50 | 100

const GRID_STEPS: readonly GridLevel[] = [10, 50, 100]
/** 한 축의 격자선이 이보다 많으면(잘못된 입력) 그리지 않습니다. 보이는 영역 기준이면 화면 폭 / 6px을 넘지 않습니다. */
const MAX_LINES_PER_AXIS = 4000
/** 이너·전실 라벨 상자 추정(글자 11px 기준): 폭 = 글자 수 × 7px, 높이 16px */
const LABEL_CHAR_PX = 7
const LABEL_BOX_H_PX = 16
const ITEM_STROKE_PX = 1.5
/** 점유 면적 제외 물건(깔개 등)의 긴 대시(§4.6). 걸침 경고의 짧은 대시(3-3)와 모양으로 구분합니다. */
const EXCLUDED_DASH: readonly number[] = [6, 4]

/** -0을 0으로 바꿉니다. */
function nz(v: number): number {
  return v === 0 ? 0 : v
}

/** 화면 간격(단계 × zoom)이 GRID_MIN_SPACING_PX 이상인 단계만, 촘촘한 것부터. zoom이 유효하지 않으면 []. */
export function gridLevels(zoom: number): GridLevel[] {
  if (!(Number.isFinite(zoom) && zoom > 0)) return []
  return GRID_STEPS.filter((step) => step * zoom >= GRID_MIN_SPACING_PX)
}

/**
 * bbox 안에 드는 level 간격 격자선. origin(외곽 bbox 왼쪽 위, snap.gridOriginOf)에서 level의 정수배인 자리에만 긋습니다.
 * 결과: 세로선 [x, minY, x, maxY]들(x 오름차순) 다음에 가로선 [minX, y, maxX, y]들(y 오름차순), 월드 cm.
 */
export function gridLines(bbox: BBox, origin: Pt, level: GridLevel): number[][] {
  const { minX, minY, maxX, maxY } = bbox
  const finite = [minX, minY, maxX, maxY, origin[0], origin[1]].every(Number.isFinite)
  if (!finite || maxX < minX || maxY < minY) return []
  const [ox, oy] = origin
  const out: number[][] = []
  const i0 = Math.ceil((minX - ox) / level)
  const i1 = Math.floor((maxX - ox) / level)
  const j0 = Math.ceil((minY - oy) / level)
  const j1 = Math.floor((maxY - oy) / level)
  if (i1 - i0 + 1 > MAX_LINES_PER_AXIS || j1 - j0 + 1 > MAX_LINES_PER_AXIS) return []
  for (let i = i0; i <= i1; i++) {
    const x = nz(ox + i * level)
    out.push([x, nz(minY), x, nz(maxY)])
  }
  for (let j = j0; j <= j1; j++) {
    const y = nz(oy + j * level)
    out.push([nz(minX), y, nz(maxX), y])
  }
  return out
}

function fmt(v: number): string {
  return String(round1(v))
}

/** 도형의 로컬 바운딩 박스 가로·세로(cm). 원은 지름, 다각형은 점들의 bbox. */
function shapeSize(s: Shape): { w: number; h: number } {
  switch (s.kind) {
    case 'rect':
      return { w: s.w, h: s.h }
    case 'circle':
      return { w: s.d, h: s.d }
    case 'polygon': {
      const b = ringBBox(s.points)
      return { w: b.maxX - b.minX, h: b.maxY - b.minY }
    }
  }
}

/** '매트 200×60', 원은 '스툴 ⌀35', 다각형은 bbox 가로×세로. 치수는 0.1cm 반올림, '.0' 없음. */
export function itemLabel(item: Item): string {
  if (item.shape.kind === 'circle') return `${item.name} ⌀${fmt(item.shape.d)}`
  const { w, h } = shapeSize(item.shape)
  return `${item.name} ${fmt(w)}×${fmt(h)}`
}

/** '전실 1 · 13.2m²' — 넓이는 m² 소수 첫째 자리(§4.6). 음수·NaN은 0.0으로 씁니다. */
export function pieceLabel(name: string, areaCm2: number): string {
  const tenths = Number.isFinite(areaCm2) && areaCm2 > 0 ? Math.round(areaCm2 / 1000) : 0
  return `${name} · ${(tenths / 10).toFixed(1)}m²`
}

/** outside(밖으로 나감)가 straddle(이너 벽 걸침)보다 우선합니다. */
export type ItemWarnKind = 'none' | 'outside' | 'straddle'

export type ItemNode = {
  id: string
  shape: Shape
  x: number
  y: number
  rotation: number
  stroke: string
  fill: string
  /** 화면 px. null이면 실선 */
  dash: number[] | null
  /** 화면 px */
  strokeWidth: number
  label: string
  labelVisible: boolean
  warn: ItemWarnKind
  dimmed: boolean
}

export type InnerNode = {
  id: string
  name: string
  shape: Shape
  x: number
  y: number
  rotation: number
  /** 이너 이탈(§6.5) */
  escape: boolean
  label: { text: string; x: number; y: number; visible: boolean }
}

export type PieceNode = { key: string; rings: Pt[][]; label: { text: string; x: number; y: number; visible: boolean } }

export type Scene = {
  grid: { level: GridLevel; lines: number[][] }[]
  outer: Shape
  inners: InnerNode[]
  pieces: PieceNode[]
  items: ItemNode[]
}

export type SceneInput = {
  layout: Layout
  zones: Zones
  stats: Stats
  view: View
  mode: Mode
  scopeGroupId: string | null
  gridVisible: boolean
  /** 캔버스 크기(px). 있으면 격자를 보이는 영역 전체에 깔고, 없거나 0이면 외곽 bbox 안에만 깝니다(계약에 더한 선택 필드). */
  size?: Size
}

function validZoom(view: View): number {
  return Number.isFinite(view.zoom) && view.zoom > 0 ? view.zoom : 0
}

/** 라벨 상자(글자 수 × 7px, 16px, 라벨 점 중심)가 box 안에 다 들어가는지. zoom이 0이면 false. */
function labelFits(text: string, at: Pt, box: BBox, zoom: number): boolean {
  if (zoom <= 0 || text === '') return false
  const halfW = ([...text].length * LABEL_CHAR_PX) / zoom / 2
  const halfH = LABEL_BOX_H_PX / zoom / 2
  return at[0] - halfW >= box.minX && at[0] + halfW <= box.maxX && at[1] - halfH >= box.minY && at[1] + halfH <= box.maxY
}

function ringsBBox(rings: Pt[][]): BBox {
  return ringBBox(rings.flat())
}

function itemWarn(stats: Stats, id: string): ItemWarnKind {
  const w = stats.warnings[id]
  if (!w) return 'none'
  if (w.outside) return 'outside'
  return w.straddles.length > 0 ? 'straddle' : 'none'
}

function itemNode(item: Item, input: SceneInput, zoom: number): ItemNode {
  const color = objColor(item.color)
  const { w, h } = shapeSize(item.shape)
  const outOfScope = input.scopeGroupId !== null && item.groupId !== input.scopeGroupId
  return {
    id: item.id,
    shape: item.shape,
    x: item.x,
    y: item.y,
    rotation: item.rotation,
    stroke: color.stroke,
    fill: color.fill,
    dash: item.countsArea ? null : [...EXCLUDED_DASH],
    strokeWidth: ITEM_STROKE_PX,
    label: itemLabel(item),
    labelVisible: Math.min(w, h) * zoom >= LABEL_MIN_SCREEN_PX,
    warn: itemWarn(input.stats, item.id),
    dimmed: input.mode === 'tent' || outOfScope,
  }
}

/** 보이는 월드 영역. screen = world × zoom + pan 이므로 world = (screen − pan) / zoom. */
function visibleBBox(view: View, size: Size, zoom: number): BBox {
  return {
    minX: (0 - view.panX) / zoom,
    minY: (0 - view.panY) / zoom,
    maxX: (size.width - view.panX) / zoom,
    maxY: (size.height - view.panY) / zoom,
  }
}

export function buildScene(input: SceneInput): Scene {
  const { layout, zones, stats, view } = input
  const zoom = validZoom(view)

  let grid: Scene['grid'] = []
  if (input.gridVisible) {
    const size = input.size
    const bbox =
      size !== undefined && size.width > 0 && size.height > 0 && zoom > 0
        ? visibleBBox(view, size, zoom)
        : ringBBox(outerRing(layout.tent))
    const origin = gridOriginOf(layout.tent)
    grid = gridLevels(zoom).map((level) => ({ level, lines: gridLines(bbox, origin, level) }))
  }

  const escapes = new Set(stats.innerEscapes)
  const inners: InnerNode[] = layout.tent.inners.map((inner) => {
    const zone = zones.inners.find((z) => z.innerId === inner.id)
    let at: Pt
    let box: BBox
    if (zone && zone.area > 0) {
      at = zone.label
      box = ringsBBox(regionRings(zone.region))
    } else {
      // 외곽과 안 겹쳐 구역이 없는 이너: 자기 도형의 bbox 가운데에 붙입니다.
      box = ringBBox(worldRing(inner))
      at = [(box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2]
    }
    return {
      id: inner.id,
      name: inner.name,
      shape: inner.shape,
      x: inner.x,
      y: inner.y,
      rotation: inner.rotation,
      escape: escapes.has(inner.id),
      label: { text: inner.name, x: at[0], y: at[1], visible: labelFits(inner.name, at, box, zoom) },
    }
  })

  const pieces: PieceNode[] = zones.pieces.map((p) => {
    const rings = regionRings(p.region)
    const text = pieceLabel(p.name, p.area)
    return {
      key: p.key,
      rings,
      label: { text, x: p.label[0], y: p.label[1], visible: labelFits(text, p.label, ringsBBox(rings), zoom) },
    }
  })

  return {
    grid,
    outer: layout.tent.outer,
    inners,
    pieces,
    items: layout.items.map((item) => itemNode(item, input, zoom)),
  }
}
