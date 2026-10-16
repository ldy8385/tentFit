// 도형 위 치수 표시 자리 계산(소유자 요청 2026-10-14: "각 변에 cm 숫자, 전체 가로·세로도 업체 도면처럼 도형 주변에"). 순수 계산, 화면 px.
// - 변 숫자: 자유 다각형·템플릿 다각형의 변마다(사각형은 가로·세로 치수선과 같은 값이라 빼고, 원은 변이 없음). 변 가운데에서 바깥으로.
// - 치수선: 도형 로컬 축(돌리면 같이 돎) 기준으로 가로는 아래, 세로는 오른쪽. 원은 지름 하나(가로 자리).
//   회전 핸들이 위에 있으므로 가로 치수선은 아래에 둡니다(물건 선택 핸들과 겹치지 않게).
// - 모서리 반지름: 반지름이 있는 꼭짓점마다 「R 10」, 뾰족한 꼭짓점 자리에서 바깥쪽으로.
// - 구간 치수(소유자 요청 2026-10-16, 켤 때만): 꼭짓점 위치로 전체 가로·세로를 나눈 줄(「110 / 100 / 110」)을 도형 가까이,
//   전체 치수선은 한 줄 바깥으로. 각 변의 길이가 아니라 전체를 나눈 값이라 구간을 더하면 전체입니다. 자르는 자리·값은 core(segmentStops)와 같고,
//   편집 대상이면 눌러 고칩니다(치수 키 seg).
// 화면에서 짧은 변·작은 도형은 숫자를 숨깁니다(겹쳐서 못 읽음).
import { dimValue, SEG_MERGE_CM, segmentStops, type DimKey } from '../core/dimEdit'
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
/** 구간 치수를 켜면 전체 치수선이 구간 줄에서 바깥으로 물러나는 거리(px) */
export const SEG_ROW_PX = 28

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
  /** 모서리 포인트만: 도형 바깥쪽 단위 방향(화면). 입력 창을 이쪽으로 띄웁니다 */
  dir?: Pt
}

/** 사각형 모서리 위치(꼭짓점 순서: 왼쪽 위부터 시계 방향) */
const RECT_CORNERS = ['왼쪽 위', '오른쪽 위', '오른쪽 아래', '왼쪽 아래'] as const

/** 모서리 이름: 「모서리 i」, 사각형은 「모서리 i(왼쪽 위)」(패널 칸·캔버스 포인트가 같이 씀) */
export function cornerLabel(shape: Shape, index: number): string {
  const pos = shape.kind === 'rect' ? RECT_CORNERS[index] : undefined
  return pos === undefined ? `모서리 ${index + 1}` : `모서리 ${index + 1}(${pos})`
}

/** id: 전체 치수선 'w'·'h', 구간 줄 'sw0'·'sh1'(축 + 왼쪽·위부터 번호) */
export type DimLine = { id: string; a: Pt; b: Pt; ext: Array<[Pt, Pt]> }

/** 구간 치수 숫자. id = 그 구간 줄의 id, key = 고칠 때 쓰는 치수 키 */
export type DimSeg = { id: string; key: DimKey; name: string; text: string; value: number; at: Pt }

export type DimModel = { labels: DimLabel[]; lines: DimLine[]; segments: DimSeg[] }

export type DimOptions = { segments?: boolean }

const EMPTY: DimModel = { labels: [], lines: [], segments: [] }

/** 축 방향 좌표 at에서 외곽선의 가로지르는 좌표 중 dir 쪽 끝(dir > 0이면 가장 큰 값). 보조선은 여기서 시작합니다. */
function outlineReach(corners: readonly Pt[], axis: 'w' | 'h', at: number, dir: number): number | null {
  const along = axis === 'w' ? 0 : 1
  let best: number | null = null
  const take = (v: number) => {
    if (best === null || dir * (v - best) > 0) best = v
  }
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i] as Pt
    const b = corners[(i + 1) % corners.length] as Pt
    const [ua, ub] = [a[along], b[along]]
    if (at < Math.min(ua, ub) - SEG_MERGE_CM || at > Math.max(ua, ub) + SEG_MERGE_CM) continue
    if (Math.abs(ub - ua) < 1e-9) {
      take(a[1 - along])
      take(b[1 - along])
    } else {
      const t = Math.min(1, Math.max(0, (at - ua) / (ub - ua)))
      take(a[1 - along] + t * (b[1 - along] - a[1 - along]))
    }
  }
  return best
}

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
export function dimModel(shape: Shape, place: DimPlacement, view: View, bounds?: DimBounds, opts?: DimOptions): DimModel {
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
  const segments: DimSeg[] = []
  const corners0 = shape.kind === 'circle' ? [] : cornerRing(shape)

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
  /**
   * 한 축 치수선. 후보는 [가장자리, 선 위치]. 구간 치수가 있으면 구간 줄이 그 자리에 오고 전체 치수선은 한 줄(SEG_ROW_PX) 바깥으로.
   * 구간 줄의 안쪽 자르는 자리에는 그 자리 외곽선(줄 쪽 끝)에서 줄까지 보조선을 긋습니다(도형을 가로지르지 않게).
   */
  const placeLine = (axis: 'w' | 'h'): { line: DimLine; segs: DimLine[] } => {
    const lo = axis === 'w' ? box.minX : box.minY
    const hi = axis === 'w' ? box.maxX : box.maxY
    const far = axis === 'w' ? box.maxY : box.maxX
    const near = axis === 'w' ? box.minY : box.minX
    const cuts = opts?.segments === true ? (segmentStops(shape, axis)?.slice(1, -1) ?? []) : []
    const row = cuts.length > 0 ? SEG_ROW_PX * k : 0
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
      const total = pos + dir * row
      const [a, b, e1a, e1b, e2a, e2b] = toScreen([
        pt(lo, total),
        pt(hi, total),
        pt(lo, edge + dir * s0),
        pt(lo, total + dir * o),
        pt(hi, edge + dir * s0),
        pt(hi, total + dir * o),
      ]) as [Pt, Pt, Pt, Pt, Pt, Pt]
      const line: DimLine = { id: axis, a, b, ext: [[e1a, e1b], [e2a, e2b]] }
      const stops = [lo, ...cuts, hi]
      const segs: DimLine[] = []
      for (let i = 0; i + 1 < stops.length; i++) {
        const [sa, sb] = toScreen([pt(stops[i] as number, pos), pt(stops[i + 1] as number, pos)]) as [Pt, Pt]
        const cut = i > 0 ? cuts[i - 1] : undefined
        // 보조선: 그 자리 외곽선의 줄 쪽 끝에서 줄 너머까지. 외곽선이 줄 너머에 있으면(안쪽 자리) 줄 위의 짧은 눈금만
        const reach = cut === undefined ? null : outlineReach(corners0, axis, cut, dir)
        const from = reach === null ? pos : reach + dir * s0
        const ext: Array<[Pt, Pt]> =
          cut === undefined
            ? []
            : [toScreen([pt(cut, dir * (from - pos) < 0 ? from : pos - dir * o), pt(cut, pos + dir * o)]) as [Pt, Pt]]
        segs.push({ id: `s${axis}${String(i)}`, a: sa, b: sb, ext })
      }
      return { line, segs: cuts.length > 0 ? segs : [] }
    }
    const mid = (l: DimLine): Pt => [(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2]
    for (const c of candidates) {
      const built = build(c)
      if (visible(mid(built.line)) && built.segs.every((l) => visible(mid(l)))) return built
    }
    return build(candidates[0] as [number, number])
  }
  /** 구간 숫자: 화면에서 짧은 구간은 줄만 남기고 숫자를 숨깁니다. 값은 core와 같은 dimValue(보이는 윤곽 기준) */
  const pushSegs = (axis: 'w' | 'h', segs: DimLine[]) => {
    segs.forEach((l, i) => {
      lines.push(l)
      if (Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]) < MIN_LABEL_SPAN_PX) return
      const key: DimKey = { kind: 'seg', axis, index: i }
      const v = dimValue(shape, key) ?? 0
      segments.push({
        id: l.id,
        key,
        name: `${axis === 'w' ? '가로' : '세로'} 구간 ${String(i + 1)}`,
        text: fmt(v),
        value: round1(v),
        at: [(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2],
      })
    })
  }
  if (widthPx >= MIN_LABEL_SPAN_PX) {
    const { line, segs } = placeLine('w')
    const { a, b } = line
    lines.push(line)
    pushSegs('w', segs)
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
    const { line, segs } = placeLine('h')
    const { a, b } = line
    lines.push(line)
    pushSegs('h', segs)
    const h = dimValue(shape, { kind: 'h' }) ?? 0
    labels.push({ id: 'h', key: { kind: 'h' }, name: '세로', text: fmt(h), value: round1(h), at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] })
  }
  if (shape.kind === 'circle') return { labels, lines, segments }

  const corners = toScreen(corners0)
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

  // 모서리 포인트(모든 꼭짓점, 소유자 요청 2026-10-14): 둥근 모서리는 「R 10」, 뾰족한 모서리는 점(글자 없음). 누르면 옆에 둥글기 입력 창
  const eff = effectiveRadii(cornerRing(shape), shape.radii)
  for (let i = 0; i < n; i++) {
    const r = eff[i] ?? 0
    const rounded = r > 0.05
    const v = corners[i] as Pt
    const p = corners[(i - 1 + n) % n] as Pt
    const q = corners[(i + 1) % n] as Pt
    const u1 = unit(p[0] - v[0], p[1] - v[1])
    const u2 = unit(q[0] - v[0], q[1] - v[1])
    const d = unit(-(u1[0] + u2[0]), -(u1[1] + u2[1]))
    labels.push({
      id: `r${i}`,
      key: { kind: 'radius', index: i },
      name: `${cornerLabel(shape, i)} 둥글기`,
      text: rounded ? `R ${fmt(r)}` : '',
      value: rounded ? round1(r) : 0,
      at: [v[0] + d[0] * RADIUS_LABEL_GAP_PX, v[1] + d[1] * RADIUS_LABEL_GAP_PX],
      dir: d,
    })
  }
  return { labels, lines, segments }
}
