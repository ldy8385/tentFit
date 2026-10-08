// 화면 보기 계산(스펙 §4.5·§4.6). 순수 함수만 둡니다(React·Konva·DOM 없음).
// 좌표: 월드는 cm(y 아래), 화면은 캔버스 컨테이너 기준 px. screen = world × zoom + pan, zoom = px/cm.
import { outerRing, ringBBox, worldRing } from '../core/geom'
import type { Layout, Pt } from '../core/model'

export type View = { zoom: number; panX: number; panY: number }
export type Size = { width: number; height: number }
export type Insets = { top: number; bottom: number }
export type BBox = { minX: number; minY: number; maxX: number; maxY: number }

export const ZOOM_MIN = 0.1
export const ZOOM_MAX = 20

/** 맞춤 보기의 최소 여백 = 핸들 반경 + 이 값(px). §4.6 */
const FIT_EXTRA_PX = 16
/** 맞춤 보기 여백 비율(보이는 영역 짧은 변 기준). §4.6 */
const FIT_MARGIN_RATIO = 0.05
/** 휠 deltaMode 1(줄)·2(쪽)을 px로 바꾸는 값 */
const WHEEL_LINE_PX = 16
const WHEEL_PAGE_PX = 800
/** 휠 확대: 이벤트 한 번에 쓰는 px 상한과 px당 지수. 마우스 한 칸(100px) ≈ 18%, 트랙패드 핀치(이벤트당 1~5px) ≈ 1~5% */
const WHEEL_ZOOM_CLAMP_PX = 20
const WHEEL_ZOOM_PER_PX = 0.01

/** -0을 0으로 */
function nz(v: number): number {
  return v === 0 ? 0 : v
}

function finiteOr(v: number, fallback: number): number {
  return Number.isFinite(v) ? v : fallback
}

/** NaN·±Infinity는 1로 본 뒤 [ZOOM_MIN, ZOOM_MAX]로 자릅니다. */
export function clampZoom(z: number): number {
  const v = Number.isFinite(z) ? z : 1
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v))
}

export function worldToScreen(v: View, p: Pt): Pt {
  return [nz(p[0] * v.zoom + v.panX), nz(p[1] * v.zoom + v.panY)]
}

export function screenToWorld(v: View, p: Pt): Pt {
  return [nz((p[0] - v.panX) / v.zoom), nz((p[1] - v.panY) / v.zoom)]
}

/**
 * 화면 점 screenPt 아래의 월드 점을 그 자리에 둔 채 factor배 확대합니다(배율은 clampZoom).
 * factor가 0 이하이거나 유한하지 않으면 보기를 그대로 돌려줍니다.
 */
export function zoomAt(v: View, factor: number, screenPt: Pt): View {
  if (!(factor > 0) || !Number.isFinite(factor)) return { ...v }
  const zoom = clampZoom(v.zoom * factor)
  const w = screenToWorld(v, screenPt)
  return { zoom, panX: nz(screenPt[0] - w[0] * zoom), panY: nz(screenPt[1] - w[1] * zoom) }
}

/** 유한하지 않은 값은 0으로, min > max면 맞바꿉니다. */
function cleanBBox(b: BBox): BBox {
  const x0 = finiteOr(b.minX, 0)
  const x1 = finiteOr(b.maxX, 0)
  const y0 = finiteOr(b.minY, 0)
  const y1 = finiteOr(b.maxY, 0)
  return { minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minY: Math.min(y0, y1), maxY: Math.max(y0, y1) }
}

/**
 * 맞춤 보기에서 띠 높이 − 여백 2배가 이보다 작으면 insets를 무시하고 캔버스 전체에 맞춥니다.
 * 여백 2배가 띠를 넘으면 배율이 0.1로 무너지기 때문입니다(펼친 시트 위 46px 띠 등).
 */
export const MIN_FIT_USABLE_PX = 40

/** 시트·배너를 뺀 보이는 영역의 위·아래 경계(px). insets가 캔버스를 다 덮으면 insets를 무시합니다. */
function visibleBand(size: Size, insets: Insets): { top: number; height: number } {
  const h = Math.max(0, finiteOr(size.height, 0))
  const top = Math.max(0, finiteOr(insets.top, 0))
  const bottom = Math.max(0, finiteOr(insets.bottom, 0))
  if (top + bottom >= h) return { top: 0, height: h }
  return { top, height: h - top - bottom }
}

function fitMargin(width: number, bandHeight: number, handlePx: number): number {
  return Math.max(FIT_MARGIN_RATIO * Math.min(width, bandHeight), Math.max(0, finiteOr(handlePx, 14)) + FIT_EXTRA_PX)
}

/**
 * bbox(월드 cm)를 보이는 영역(캔버스 − insets) 가운데에 맞추는 보기(§4.6 맞춤 보기).
 * 여백 = max(보이는 영역 짧은 변의 5%, handlePx + 16). 배율은 0.1~20으로 자릅니다.
 * 여백을 빼고 MIN_FIT_USABLE_PX도 안 남는 띠면 insets를 무시합니다.
 * 캔버스 크기가 0(숨김)이거나 유한하지 않으면 { zoom: 1, panX: 0, panY: 0 }.
 */
export function fitView(bbox: BBox, size: Size, insets: Insets, handlePx = 14): View {
  const w = finiteOr(size.width, 0)
  const h = finiteOr(size.height, 0)
  if (!(w > 0) || !(h > 0)) return { zoom: 1, panX: 0, panY: 0 }
  let band = visibleBand(size, insets)
  let margin = fitMargin(w, band.height, handlePx)
  if (band.height - 2 * margin < MIN_FIT_USABLE_PX) {
    band = { top: 0, height: h }
    margin = fitMargin(w, h, handlePx)
  }
  const usableW = Math.max(1, w - 2 * margin)
  const usableH = Math.max(1, band.height - 2 * margin)
  const b = cleanBBox(bbox)
  const bw = b.maxX - b.minX
  const bh = b.maxY - b.minY
  const zx = bw > 0 ? usableW / bw : Infinity
  const zy = bh > 0 ? usableH / bh : Infinity
  // 점 하나짜리 bbox(둘 다 Infinity)는 clampZoom이 1로 바꿉니다.
  const zoom = clampZoom(Math.min(zx, zy))
  const cx = (b.minX + b.maxX) / 2
  const cy = (b.minY + b.maxY) / 2
  return { zoom, panX: nz(w / 2 - cx * zoom), panY: nz(band.top + band.height / 2 - cy * zoom) }
}

/** 외곽 ∪ 모든 물건(밖으로 나간 것 포함)의 월드 bbox(cm). §4.6 */
export function layoutBBox(layout: Layout): BBox {
  const b = { ...ringBBox(outerRing(layout.tent)) }
  for (const item of layout.items) {
    const r = ringBBox(worldRing(item))
    if (r.minX < b.minX) b.minX = r.minX
    if (r.minY < b.minY) b.minY = r.minY
    if (r.maxX > b.maxX) b.maxX = r.maxX
    if (r.maxY > b.maxY) b.maxY = r.maxY
  }
  return b
}

/** 보이는 영역(캔버스 − insets) 가운데의 월드 점. 새 물건 위치(§4.7-3)에 씁니다. */
export function viewCenterWorld(v: View, size: Size, insets: Insets): Pt {
  const w = Math.max(0, finiteOr(size.width, 0))
  const band = visibleBand(size, insets)
  return screenToWorld(v, [w / 2, band.top + band.height / 2])
}

function wheelPx(delta: number, mode: number): number {
  const d = finiteOr(delta, 0)
  if (mode === 1) return d * WHEEL_LINE_PX
  if (mode === 2) return d * WHEEL_PAGE_PX
  return d
}

/**
 * 휠 이벤트 해석(§4.5). Ctrl·Cmd+휠(트랙패드 핀치는 브라우저가 ctrlKey=true로 보냄)은 확대, 그 밖은 화면 이동.
 * 확대: factor = exp(−clamp(deltaY px, ±20) × 0.01) — 위로 굴리면(deltaY < 0) 확대.
 * 이동: 스크롤 반대 방향으로 내용이 움직이도록 dx = −deltaX, dy = −deltaY(px).
 */
export function wheelAction(e: {
  deltaX: number
  deltaY: number
  deltaMode: number
  ctrlKey: boolean
  metaKey: boolean
}): { type: 'zoom'; factor: number } | { type: 'pan'; dx: number; dy: number } {
  if (e.ctrlKey || e.metaKey) {
    const px = Math.min(WHEEL_ZOOM_CLAMP_PX, Math.max(-WHEEL_ZOOM_CLAMP_PX, wheelPx(e.deltaY, e.deltaMode)))
    return { type: 'zoom', factor: Math.exp(-px * WHEEL_ZOOM_PER_PX) }
  }
  return { type: 'pan', dx: nz(-wheelPx(e.deltaX, e.deltaMode)), dy: nz(-wheelPx(e.deltaY, e.deltaMode)) }
}
