// 도형 위 치수 표시 자리 계산(소유자 요청 2026-10-14: "각 변에 cm 숫자, 전체 가로·세로도 업체 도면처럼 도형 주변에"). 순수 계산, 화면 px.
// - 변 숫자: 자유 다각형·템플릿 다각형의 변마다(사각형은 가로·세로 치수선과 같은 값이라 빼고, 원은 변이 없음). 변 가운데에서 바깥으로.
// - 치수선: 도형 로컬 축(돌리면 같이 돎) 기준으로 가로는 아래, 세로는 오른쪽. 원은 지름 하나(가로 자리).
//   회전 핸들이 위에 있으므로 가로 치수선은 아래에 둡니다(물건 선택 핸들과 겹치지 않게).
// - 모서리 반지름: 반지름이 있는 꼭짓점마다 「R 10」, 뾰족한 꼭짓점 자리에서 바깥쪽으로.
// 화면에서 짧은 변·작은 도형은 숫자를 숨깁니다(겹쳐서 못 읽음).
import type { DimKey } from '../core/dimEdit'
import { dimValue } from '../core/dimEdit'
import { cornerRing, effectiveRadii, ringBBox, shapeRing, transformRing } from '../core/geom'
import { round1, type Pt, type Shape } from '../core/model'
import { worldToScreen, type View } from './viewport'

/** 변 숫자를 변에서 띄우는 거리(px) */
export const EDGE_LABEL_GAP_PX = 18
/** 치수선을 도형 윤곽 상자에서 띄우는 거리(px) */
export const DIM_LINE_GAP_PX = 46
/** 치수 보조선이 치수선을 넘어가는 길이(px) */
export const EXT_OVERSHOOT_PX = 6
/** 보조선이 도형에서 떨어져 시작하는 거리(px) */
const EXT_START_PX = 4
/** 화면에서 이보다 짧은 변·축은 숫자를 숨김(px) */
export const MIN_LABEL_SPAN_PX = 40
/** 바깥에 둘 자리가 화면 밖일 때 도형 안쪽 가장자리에서 띄우는 거리(px) */
export const DIM_INSIDE_GAP_PX = 28
/** 도형 안쪽에 치수선을 둘 수 있는 최소 화면 두께(px) */
export const MIN_INSIDE_SPAN_PX = 160
/** 치수 글자가 보이는 영역 가장자리에서 떨어져야 하는 거리(px) */
const LABEL_MARGIN_PX = 14
/** 반지름 숫자를 꼭짓점에서 띄우는 거리(px) */
export const RADIUS_LABEL_GAP_PX = 30

export type DimPlacement = { x: number; y: number; rotation: number }

export type DimLabel = {
  /** React key·화면 테스트용(e0, w, h, r2) */
  id: string
  key: DimKey
  /** 접근 이름(변 1, 가로, 세로, 지름, 모서리 3 반지름) */
  name: string
  /** 보이는 글자(260, ⌀300, R 10) */
  text: string
  /** 지금 값(cm, 0.1 반올림) — 입력칸 처음 값 */
  value: number
  /** 화면 가운데 */
  at: Pt
}

export type DimLine = { id: 'w' | 'h'; a: Pt; b: Pt; ext: Array<[Pt, Pt]> }

export type DimModel = { labels: DimLabel[]; lines: DimLine[] }

const EMPTY: DimModel = { labels: [], lines: [] }

function fmt(v: number): string {
  return String(round1(v))
}

function signedArea(ring: readonly Pt[]): number {
  let s = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i] as Pt
    const b = ring[(i + 1) % ring.length] as Pt
    s += a[0] * b[1] - b[0] * a[1]
  }
  return s / 2
}

function unit(dx: number, dy: number): Pt {
  const l = Math.hypot(dx, dy)
  return l > 0 ? [dx / l, dy / l] : [0, 0]
}

/** 보이는 캔버스 영역(화면 px). 시트·배너를 뺀 곳 */
export type DimBounds = { left: number; top: number; right: number; bottom: number }

/** 도형 하나의 치수 표시(화면 px). 줌이 0 이하이거나 도형이 화면에서 너무 작으면 빈 모델. bounds를 주면 치수선을 보이는 쪽에 둡니다. */
export function dimModel(shape: Shape, place: DimPlacement, view: View, bounds?: DimBounds): DimModel {
  if (!(view.zoom > 0)) return EMPTY
  const toScreen = (local: readonly Pt[]): Pt[] =>
    transformRing(local.map((p): Pt => [p[0], p[1]]), place.x, place.y, place.rotation).map((p) => worldToScreen(view, p))
  const k = 1 / view.zoom
  const box =
    shape.kind === 'circle'
      ? { minX: -shape.d / 2, minY: -shape.d / 2, maxX: shape.d / 2, maxY: shape.d / 2 }
      : ringBBox(shapeRing(shape))
  const widthPx = (box.maxX - box.minX) * view.zoom
  const heightPx = (box.maxY - box.minY) * view.zoom
  if (Math.max(widthPx, heightPx) < MIN_LABEL_SPAN_PX) return EMPTY

  const labels: DimLabel[] = []
  const lines: DimLine[] = []

  // 치수선(로컬 축): 가로는 아래, 세로는 오른쪽이 기본. 보이는 영역(bounds) 밖이면 반대쪽 바깥 → 안쪽 아래·오른쪽 → 안쪽 위·왼쪽 순서로
  // 글자 자리가 보이는 첫 자리를 씁니다(도형이 화면을 가득 채우거나 시트가 아래를 가릴 때).
  const g = DIM_LINE_GAP_PX * k
  const gi = DIM_INSIDE_GAP_PX * k
  const o = EXT_OVERSHOOT_PX * k
  const s0 = EXT_START_PX * k
  const visible = (p: Pt) =>
    bounds === undefined ||
    (p[0] >= bounds.left + LABEL_MARGIN_PX &&
      p[0] <= bounds.right - LABEL_MARGIN_PX &&
      p[1] >= bounds.top + LABEL_MARGIN_PX &&
      p[1] <= bounds.bottom - LABEL_MARGIN_PX)
  /** 한 축 치수선: along = 선 방향 축, edges = [기본 쪽 가장자리, 반대쪽 가장자리], 각 후보는 [가장자리, 선 위치] */
  const placeLine = (axis: 'w' | 'h'): { a: Pt; b: Pt; ext: Array<[Pt, Pt]> } => {
    const lo = axis === 'w' ? box.minX : box.minY
    const hi = axis === 'w' ? box.maxX : box.maxY
    const far = axis === 'w' ? box.maxY : box.maxX
    const near = axis === 'w' ? box.minY : box.minX
    // 안쪽 자리는 도형이 화면에서 충분히 클 때만(작은 물건이면 숫자가 물건을 덮음)
    const spanPx = (far - near) * view.zoom
    const candidates: Array<[number, number]> = [
      [far, far + g],
      [near, near - g],
      ...(spanPx >= MIN_INSIDE_SPAN_PX
        ? ([
            [far, far - gi],
            [near, near + gi],
          ] as Array<[number, number]>)
        : []),
    ]
    const pt = (u: number, v: number): Pt => (axis === 'w' ? [u, v] : [v, u])
    const build = ([edge, pos]: [number, number]) => {
      const dir = pos >= edge ? 1 : -1
      const [a, b, e1a, e1b, e2a, e2b] = toScreen([
        pt(lo, pos),
        pt(hi, pos),
        pt(lo, edge + dir * s0),
        pt(lo, pos + dir * o),
        pt(hi, edge + dir * s0),
        pt(hi, pos + dir * o),
      ]) as [Pt, Pt, Pt, Pt, Pt, Pt]
      return { a, b, ext: [[e1a, e1b], [e2a, e2b]] as Array<[Pt, Pt]> }
    }
    for (const c of candidates) {
      const line = build(c)
      if (visible([(line.a[0] + line.b[0]) / 2, (line.a[1] + line.b[1]) / 2])) return line
    }
    return build(candidates[0] as [number, number])
  }
  if (widthPx >= MIN_LABEL_SPAN_PX) {
    const { a, b, ext } = placeLine('w')
    lines.push({ id: 'w', a, b, ext })
    const w = dimValue(shape, { kind: 'w' }) ?? 0
    const circle = shape.kind === 'circle'
    labels.push({
      id: 'w',
      key: { kind: 'w' },
      name: circle ? '지름' : '가로',
      text: circle ? `⌀${fmt(w)}` : fmt(w),
      value: round1(w),
      at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
    })
  }
  if (shape.kind !== 'circle' && heightPx >= MIN_LABEL_SPAN_PX) {
    const { a, b, ext } = placeLine('h')
    lines.push({ id: 'h', a, b, ext })
    const h = dimValue(shape, { kind: 'h' }) ?? 0
    labels.push({ id: 'h', key: { kind: 'h' }, name: '세로', text: fmt(h), value: round1(h), at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] })
  }
  if (shape.kind === 'circle') return { labels, lines }

  const corners = toScreen(cornerRing(shape))
  const n = corners.length
  const outwardSign = signedArea(corners) > 0 ? 1 : -1

  // 변 숫자(다각형만)
  if (shape.kind === 'polygon') {
    for (let i = 0; i < n; i++) {
      const a = corners[i] as Pt
      const b = corners[(i + 1) % n] as Pt
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (len < MIN_LABEL_SPAN_PX) continue
      const nx = (outwardSign * (b[1] - a[1])) / len
      const ny = (outwardSign * -(b[0] - a[0])) / len
      const v = dimValue(shape, { kind: 'edge', index: i }) ?? 0
      labels.push({
        id: `e${i}`,
        key: { kind: 'edge', index: i },
        name: `변 ${i + 1}`,
        text: fmt(v),
        value: round1(v),
        at: [(a[0] + b[0]) / 2 + nx * EDGE_LABEL_GAP_PX, (a[1] + b[1]) / 2 + ny * EDGE_LABEL_GAP_PX],
      })
    }
  }

  // 모서리 반지름(반지름이 있는 꼭짓점만)
  const eff = effectiveRadii(cornerRing(shape), shape.radii)
  for (let i = 0; i < n; i++) {
    const r = eff[i] ?? 0
    if (!(r > 0.05)) continue
    const v = corners[i] as Pt
    const p = corners[(i - 1 + n) % n] as Pt
    const q = corners[(i + 1) % n] as Pt
    const u1 = unit(p[0] - v[0], p[1] - v[1])
    const u2 = unit(q[0] - v[0], q[1] - v[1])
    const d = unit(-(u1[0] + u2[0]), -(u1[1] + u2[1]))
    labels.push({
      id: `r${i}`,
      key: { kind: 'radius', index: i },
      name: `모서리 ${i + 1} 반지름`,
      text: `R ${fmt(r)}`,
      value: round1(r),
      at: [v[0] + d[0] * RADIUS_LABEL_GAP_PX, v[1] + d[1] * RADIUS_LABEL_GAP_PX],
    })
  }
  return { labels, lines }
}
