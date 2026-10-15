// 배치 그림 저장(PNG, 스펙 §11, 소유자 요청 2026-10-15). 보이는 캔버스는 건드리지 않고, 화면 밖 Konva Stage에 모델로 새로 그립니다.
// 핸들·안내선·선택 표시·캔버스 위 컨트롤은 넣지 않습니다. 측정 중이면 잰 선을 넣습니다. 아래에 요약 띠(배치·텐트 이름, 점유율, 날짜).
// 크기: 긴 변 2048px(최대 4096, 전체 16.7MP 이하). 범위 = 외곽 ∪ 물건 ∪ 측정선 + 여백 5%(최소 20cm).
import Konva from 'konva'
import type { MeasurementRow } from '../app/measureActions'
import { formatPercent, type Stats } from '../core/stats'
import { outlineBBox, ringBBox, shapeRing, transformRing, worldRing } from '../core/geom'
import type { Layout, Pt } from '../core/model'
import { innerColor, THEME, vestColor } from '../ui/theme'

export const PNG_LONG_EDGE = 2048
const MAX_PIXELS = 16_700_000
const FOOTER_RATIO = 0.06

export type ExportFrame = { minX: number; minY: number; w: number; h: number; scale: number; widthPx: number; heightPx: number; footerPx: number }

/** 자르는 범위·배율·그림 크기(긴 변 longEdge px, 요약 띠 포함 16.7MP 이하) */
export function exportFrame(layout: Layout, extra: readonly Pt[] = [], longEdge = PNG_LONG_EDGE): ExportFrame {
  let { minX, minY, maxX, maxY } = outlineBBox(layout.tent.outer)
  for (const it of layout.items) {
    const b = ringBBox(worldRing(it))
    minX = Math.min(minX, b.minX)
    minY = Math.min(minY, b.minY)
    maxX = Math.max(maxX, b.maxX)
    maxY = Math.max(maxY, b.maxY)
  }
  for (const [x, y] of extra) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  const pad = Math.max(20, 0.05 * Math.max(maxX - minX, maxY - minY))
  minX -= pad
  minY -= pad
  const w = maxX - minX + pad
  const h = maxY - minY + pad
  let scale = Math.min(4096, longEdge) / Math.max(w, h)
  const footer = (k: number) => Math.round(Math.max(w, h) * k * FOOTER_RATIO)
  if (w * scale * (h * scale + footer(scale)) > MAX_PIXELS) scale *= Math.sqrt(MAX_PIXELS / (w * scale * (h * scale + footer(scale))))
  return { minX, minY, w, h, scale, widthPx: Math.round(w * scale), heightPx: Math.round(h * scale) + footer(scale), footerPx: footer(scale) }
}

/** 요약 띠 글자: 윗줄 = 배치 · 텐트, 아랫줄 = 이너·바닥 점유율 · 날짜 */
export function footerLines(layout: Layout, stats: Stats, now: Date): [string, string] {
  const d = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`
  const parts = [`${stats.totalInner.name} ${formatPercent(stats.totalInner.percent)}`, `${stats.totalFloor.name} ${formatPercent(stats.totalFloor.percent)}`, d]
  return [`${layout.name} · ${layout.tent.name}`, parts.join(' · ')]
}

function color(key: string, fallback: string): string {
  return THEME[key] ?? fallback
}

/** 배치를 PNG로 그립니다(화면 밖 Stage, 다 그리면 없앰). */
export async function renderLayoutPng(layout: Layout, stats: Stats, opts?: { measurements?: MeasurementRow[]; now?: Date; longEdge?: number }): Promise<Blob> {
  const rows = opts?.measurements ?? []
  const frame = exportFrame(layout, rows.flatMap((r) => [r.p1, r.p2]), opts?.longEdge)
  const container = document.createElement('div')
  const stage = new Konva.Stage({ container, width: frame.widthPx, height: frame.heightPx })
  try {
    const layer = new Konva.Layer()
    stage.add(layer)
    layer.add(new Konva.Rect({ x: 0, y: 0, width: frame.widthPx, height: frame.heightPx, fill: color('canvas-bg', '#FBFAF7') }))
    const k = 1 / frame.scale
    // 글자·선 굵기는 그림 크기에 맞춰(긴 변 1000px당 1배)
    const u = Math.max(frame.widthPx, frame.heightPx) / 1000
    const world = new Konva.Group({ x: -frame.minX * frame.scale, y: -frame.minY * frame.scale, scaleX: frame.scale, scaleY: frame.scale })
    layer.add(world)
    const poly = (ring: Pt[], attrs: Konva.LineConfig) => new Konva.Line({ points: ring.flat(), closed: true, ...attrs })
    const label = (text: string, at: Pt, fill: string, px = 14) =>
      new Konva.Text({ x: at[0], y: at[1], text, fontSize: px * k, fontFamily: color('font-sans', 'sans-serif'), fill, offsetX: (text.length * px * 0.55 * k) / 2, offsetY: (px * k) / 2 })
    // 바닥(전실) → 이너 → 외곽선
    // 직접 고른 텐트 색(2026-10-15)이 있으면 그 색, 없으면 기본 색
    world.add(poly(shapeRing(layout.tent.outer), { fill: layout.tent.color === undefined ? color('vest-fill', '#F2EEE3') : vestColor(layout.tent.color).fill }))
    for (const inner of layout.tent.inners) {
      const ic = inner.color === undefined ? { fill: color('inner-fill', '#E3EAF0'), stroke: color('inner-stroke', '#4F6D84') } : innerColor(inner.color)
      world.add(poly(transformRing(shapeRing(inner.shape), inner.x, inner.y, inner.rotation), { fill: ic.fill, stroke: ic.stroke, strokeWidth: 1.5 * u * k }))
      world.add(label(inner.name, [inner.x, inner.y], ic.stroke, 13 * u))
    }
    world.add(poly(shapeRing(layout.tent.outer), { stroke: color('tent-outline', '#2C2A26'), strokeWidth: 2.5 * u * k }))
    // 물건(배열 순서 = 아래부터), 이름
    for (const it of layout.items) {
      const ring = it.shape.kind === 'circle' ? null : transformRing(shapeRing(it.shape), it.x, it.y, it.rotation)
      const attrs = {
        fill: color(`obj-${it.color}-fill`, '#DDE7F5'),
        stroke: color(`obj-${it.color}`, '#4A7FD0'),
        strokeWidth: 1.5 * u * k,
        dash: it.countsArea ? undefined : [6 * u * k, 4 * u * k],
      }
      world.add(ring === null ? new Konva.Circle({ x: it.x, y: it.y, radius: (it.shape as { d: number }).d / 2, ...attrs }) : poly(ring, attrs))
      world.add(label(it.name, [it.x, it.y], color('text-primary', '#1D1B17'), 11 * u))
    }
    // 측정선
    for (const r of rows) {
      world.add(new Konva.Line({ points: [...r.p1, ...r.p2], stroke: color('accent', '#36704A'), strokeWidth: 2 * u * k }))
      world.add(label(r.label, [(r.p1[0] + r.p2[0]) / 2, (r.p1[1] + r.p2[1]) / 2 - 10 * u * k], color('accent', '#36704A'), 12 * u))
    }
    // 요약 띠
    const [top, bottom] = footerLines(layout, stats, opts?.now ?? new Date())
    const fy = frame.heightPx - frame.footerPx
    const fs = Math.max(12, Math.round(frame.footerPx * 0.28))
    layer.add(new Konva.Rect({ x: 0, y: fy, width: frame.widthPx, height: frame.footerPx, fill: color('bg-surface', '#FFFFFF') }))
    layer.add(new Konva.Line({ points: [0, fy, frame.widthPx, fy], stroke: color('border', '#DDD9CF'), strokeWidth: 1 }))
    layer.add(new Konva.Text({ x: fs, y: fy + frame.footerPx * 0.16, text: top, fontSize: fs, fontStyle: 'bold', fill: color('text-primary', '#1D1B17') }))
    layer.add(new Konva.Text({ x: fs, y: fy + frame.footerPx * 0.56, text: bottom, fontSize: Math.round(fs * 0.85), fill: color('text-secondary', '#5C574D') }))
    layer.add(new Konva.Text({ x: frame.widthPx - fs * 5.5, y: fy + frame.footerPx * 0.36, text: 'tentFit', fontSize: fs, fontStyle: 'bold', fill: color('accent', '#36704A') }))
    layer.draw()
    return await (stage.toBlob({ mimeType: 'image/png', pixelRatio: 1 }) as Promise<Blob>)
  } finally {
    stage.destroy()
  }
}
