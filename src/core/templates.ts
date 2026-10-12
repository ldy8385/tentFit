import { LIMITS, round1 } from './model'
import type { Pt, Shape, ShapeTemplate } from './model'

/** 정N각형: 외접원 지름 → 한 변 */
export function ngonSideFromDiameter(n: number, diameter: number): number {
  return diameter * Math.sin(Math.PI / n)
}

/** 정N각형: 한 변 → 외접원 지름 */
export function ngonDiameterFromSide(n: number, side: number): number {
  return side / Math.sin(Math.PI / n)
}

/** 바운딩 박스 중심이 원점이 되도록 옮기고 꼭짓점을 0.1cm로 반올림합니다. */
function centerAndRound(points: Pt[]): Pt[] {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  return points.map(([x, y]): Pt => [round1(x - cx), round1(y - cy)])
}

/**
 * 사다리꼴: 앞변은 아래(y+), 뒷변은 위(y−). offset이 +면 뒷변이 오른쪽(x+)으로 이동.
 * 꼭짓점 순서: 뒷변 왼쪽 → 뒷변 오른쪽 → 앞변 오른쪽 → 앞변 왼쪽.
 */
function trapezoidPoints(front: number, back: number, depth: number, offset: number): Pt[] {
  const top = -depth / 2
  const bottom = depth / 2
  return centerAndRound([
    [offset - back / 2, top],
    [offset + back / 2, top],
    [front / 2, bottom],
    [-front / 2, bottom],
  ])
}

/**
 * 정N각형: 외접원 지름 기준, 한 변이 아래쪽(y+)에 수평.
 * 꼭짓점 순서: 아래 변 왼쪽에서 시작해 왼쪽 변을 타고 올라가 오른쪽으로 돌아 아래 변 오른쪽에서 끝납니다.
 * 좌우 대칭을 정확히 맞추려고 오른쪽 절반은 왼쪽 절반을 뒤집어 만듭니다.
 */
function ngonPoints(n: number, diameter: number): Pt[] {
  const r = diameter / 2
  const pts: Pt[] = []
  for (let k = 0; k < n; k++) {
    const phi = Math.PI / n + (2 * Math.PI * k) / n // 아래쪽(y+)에서 시작해 화면 기준 시계 방향으로 잰 각
    pts.push([-r * Math.sin(phi), r * Math.cos(phi)])
  }
  for (let k = 0; k < Math.floor(n / 2); k++) {
    const left = pts[k]
    if (left) pts[n - 1 - k] = [-left[0], left[1]]
  }
  if (n % 2 === 1) {
    const mid = pts[(n - 1) / 2]
    if (mid) pts[(n - 1) / 2] = [0, mid[1]]
  }
  return centerAndRound(pts)
}

/**
 * 육각형(업체 도면식): 가로 w = 좌우 꼭짓점 끝↔끝, 세로 h = 윗변↔아랫변, edge = 윗·아랫변 길이.
 * 꼭짓점 순서: 윗변 왼쪽 → 윗변 오른쪽 → 오른쪽 꼭짓점 → 아랫변 오른쪽 → 아랫변 왼쪽 → 왼쪽 꼭짓점.
 */
function hexagonPoints(w: number, h: number, edge: number): Pt[] {
  const e = edge / 2
  return centerAndRound([
    [-e, -h / 2],
    [e, -h / 2],
    [w / 2, 0],
    [e, h / 2],
    [-e, h / 2],
    [-w / 2, 0],
  ])
}

/** 템플릿 → 도형(§4.8). 템플릿이 원본이고 도형은 여기서 만든 값입니다. */
export function shapeFromTemplate(t: ShapeTemplate): Shape {
  switch (t.kind) {
    case 'rect': {
      const w = round1(t.w)
      return { kind: 'rect', w, h: t.square ? w : round1(t.h) }
    }
    case 'circle':
      return { kind: 'circle', d: round1(t.d) }
    case 'trapezoid':
      return { kind: 'polygon', points: trapezoidPoints(t.front, t.back, t.depth, t.offset) }
    case 'ngon': {
      const diameter = t.sizeBy === 'diameter' ? t.size : ngonDiameterFromSide(t.n, t.size)
      return { kind: 'polygon', points: ngonPoints(t.n, diameter) }
    }
    case 'hexagon':
      return { kind: 'polygon', points: hexagonPoints(t.w, t.h, t.edge) }
  }
}

/** 두 도형이 tol(cm) 안에서 같은지. 다각형은 같은 순서의 꼭짓점끼리 x·y를 각각 비교합니다. */
export function shapesEqual(a: Shape, b: Shape, tol = 0.1): boolean {
  const near = (u: number, v: number) => Math.abs(u - v) <= tol + 1e-9
  switch (a.kind) {
    case 'rect':
      return b.kind === 'rect' && near(a.w, b.w) && near(a.h, b.h)
    case 'circle':
      return b.kind === 'circle' && near(a.d, b.d)
    case 'polygon': {
      if (b.kind !== 'polygon' || a.points.length !== b.points.length) return false
      return a.points.every((p, i) => {
        const q = b.points[i]
        return q !== undefined && near(p[0], q[0]) && near(p[1], q[1])
      })
    }
  }
}

// ── 벽에 붙이기 도우미(설계 2026-10-12 §2.4) ─────────────────

/** 붙일 벽. 앞 = 화면 아래(y+) 벽, 뒤 = 위(y−) 벽(§4.4-1, §4.8 사다리꼴과 같음). 저장하지 않는 생성 도우미입니다(D23). */
export type AttachSide = 'front' | 'back' | 'left' | 'right'

export const ATTACH_SIDE_LABELS: Readonly<Record<AttachSide, string>> = Object.freeze({
  front: '앞',
  back: '뒤',
  left: '왼쪽',
  right: '오른쪽',
})

/**
 * 붙일 위치 선택지: 사각형 템플릿 = 뒤·앞·왼쪽·오른쪽 순, 사다리꼴·육각형·짝수 정N각형 = 뒤(윗변)·앞(아랫변),
 * 홀수 정N각형 = 앞(아랫변만 수평), 원·템플릿 없음 = []
 */
export function attachSidesFor(outer: ShapeTemplate | undefined): AttachSide[] {
  if (outer === undefined) return []
  if (outer.kind === 'rect') return ['back', 'front', 'left', 'right']
  if (outer.kind === 'trapezoid' || outer.kind === 'hexagon') return ['back', 'front']
  if (outer.kind === 'ngon') return Math.round(outer.n) % 2 === 0 ? ['back', 'front'] : ['front']
  return []
}

/** 다각형에서 y가 가장 작은(top) 또는 큰 수평 변의 가운데. 수평 변이 아니면(꼭짓점 하나) null */
function horizontalEdgeMid(points: readonly Pt[], top: boolean): { cx: number; cy: number } | null {
  const ys = points.map((p) => p[1])
  const y = top ? Math.min(...ys) : Math.max(...ys)
  const on = points.filter((p) => Math.abs(p[1] - y) < 0.05)
  if (on.length !== 2) return null
  const [a, b] = on as [Pt, Pt]
  return { cx: (a[0] + b[0]) / 2, cy: y }
}

/** 길이를 LIMITS.length(1~5000)로 자르고 0.1cm로 반올림합니다. */
function clampLength(v: number): number {
  const [min, max] = LIMITS.length
  return round1(Math.min(max, Math.max(min, Number.isFinite(v) ? v : min)))
}

/** 붙일 벽 하나: 벽 가운데(cx, cy)와 안쪽 방향(dx, dy — 단위 벡터, 축 나란). */
type Wall = { cx: number; cy: number; dx: number; dy: number }

function wallOf(outer: ShapeTemplate, side: AttachSide): Wall | null {
  if (outer.kind === 'rect') {
    const shape = shapeFromTemplate(outer)
    if (shape.kind !== 'rect') return null
    const hw = shape.w / 2
    const hh = shape.h / 2
    switch (side) {
      case 'back':
        return { cx: 0, cy: -hh, dx: 0, dy: 1 }
      case 'front':
        return { cx: 0, cy: hh, dx: 0, dy: -1 }
      case 'left':
        return { cx: -hw, cy: 0, dx: 1, dy: 0 }
      case 'right':
        return { cx: hw, cy: 0, dx: -1, dy: 0 }
    }
  }
  if (outer.kind === 'trapezoid') {
    const shape = shapeFromTemplate(outer)
    if (shape.kind !== 'polygon') return null
    // 꼭짓점 순서: 뒷변 왼쪽 → 뒷변 오른쪽 → 앞변 오른쪽 → 앞변 왼쪽
    const [bl, br, fr, fl] = shape.points
    if (bl === undefined || br === undefined || fr === undefined || fl === undefined) return null
    if (side === 'back') return { cx: (bl[0] + br[0]) / 2, cy: bl[1], dx: 0, dy: 1 }
    if (side === 'front') return { cx: (fl[0] + fr[0]) / 2, cy: fl[1], dx: 0, dy: -1 }
    return null
  }
  if ((outer.kind === 'hexagon' || outer.kind === 'ngon') && (side === 'back' || side === 'front') && attachSidesFor(outer).includes(side)) {
    const shape = shapeFromTemplate(outer)
    if (shape.kind !== 'polygon') return null
    const mid = horizontalEdgeMid(shape.points, side === 'back')
    return mid === null ? null : { ...mid, dx: 0, dy: side === 'back' ? 1 : -1 }
  }
  return null
}

/** 정육각형의 세로(윗변↔아랫변) / 가로(꼭짓점↔꼭짓점) = √3/2 */
const HEX_RATIO = Math.sqrt(3) / 2

/** 예시 모양 종류(설계 2026-10-12 §2.1) */
export type TemplateKind = ShapeTemplate['kind']

/** 10cm 단위 반올림 */
export function round10(v: number): number {
  return Math.round(v / 10) * 10
}

/** 외곽 예시 기본값(설계 §2.1, 원점 가운데) */
export function defaultOuterTemplate(kind: TemplateKind): ShapeTemplate {
  switch (kind) {
    case 'rect':
      return { kind: 'rect', w: 400, h: 300 }
    case 'trapezoid':
      return { kind: 'trapezoid', front: 400, back: 300, depth: 300, offset: 0 }
    case 'ngon':
      return { kind: 'ngon', n: 6, sizeBy: 'diameter', size: 400 }
    case 'circle':
      return { kind: 'circle', d: 400 }
    case 'hexagon':
      return { kind: 'hexagon', w: 400, h: round1(400 * HEX_RATIO), edge: 200 }
  }
}

/** 이너 예시 기본값(설계 §2.1): s = newInnerSide(외곽), 사다리꼴 뒷변 = round10(0.7s)(최소 10) */
export function defaultInnerTemplate(kind: TemplateKind, outer: Shape): ShapeTemplate {
  const s = newInnerSide(outer)
  switch (kind) {
    case 'rect':
      return { kind: 'rect', w: s, h: s }
    case 'trapezoid':
      return { kind: 'trapezoid', front: s, back: Math.max(NEW_INNER_MIN, round10(s * 0.7)), depth: s, offset: 0 }
    case 'ngon':
      return { kind: 'ngon', n: 6, sizeBy: 'diameter', size: s }
    case 'circle':
      return { kind: 'circle', d: s }
    case 'hexagon':
      return { kind: 'hexagon', w: s, h: round1(s * HEX_RATIO), edge: round1(s / 2) }
  }
}

/**
 * 모양 바꾸기(설계 §3): 지금 로컬 bbox w×h를 이어받은 다른 예시 템플릿.
 * 사각형 w×h, 사다리꼴 앞·뒤 w·깊이 h·치우침 0, 정6각형 지름 min(w,h), 원 지름 min(w,h). 1~5000으로 자르고 0.1cm 반올림.
 */
export function templateFromBBox(kind: TemplateKind, w: number, h: number): ShapeTemplate {
  const W = clampLength(w)
  const H = clampLength(h)
  switch (kind) {
    case 'rect':
      return { kind: 'rect', w: W, h: H }
    case 'trapezoid':
      return { kind: 'trapezoid', front: W, back: W, depth: H, offset: 0 }
    case 'ngon':
      return { kind: 'ngon', n: 6, sizeBy: 'diameter', size: Math.min(W, H) }
    case 'circle':
      return { kind: 'circle', d: Math.min(W, H) }
    case 'hexagon':
      return { kind: 'hexagon', w: W, h: H, edge: clampLength(W / 2) }
  }
}

export type BBoxLike = { minX: number; minY: number; maxX: number; maxY: number }

/**
 * 벽에 붙이기(설계 §2.4): 월드 bbox를 그 벽에 맞닿게, 벽 가운데에 오게 옮길 이동량.
 * 벽 = 외곽 템플릿 도형의 그 변(뒤 = y 최소, 앞 = y 최대, 왼쪽 = x 최소, 오른쪽 = x 최대), 가운데 = 그 변 중점.
 * 그 모양에 그 벽이 없으면 null. 반올림하지 않습니다(옮기는 레시피가 반올림).
 */
export function attachBBoxToWall(outer: ShapeTemplate, bbox: BBoxLike, side: AttachSide): { dx: number; dy: number } | null {
  const wall = wallOf(outer, side)
  if (wall === null) return null
  const midX = (bbox.minX + bbox.maxX) / 2
  const midY = (bbox.minY + bbox.maxY) / 2
  switch (side) {
    case 'back':
      return { dx: wall.cx - midX, dy: wall.cy - bbox.minY }
    case 'front':
      return { dx: wall.cx - midX, dy: wall.cy - bbox.maxY }
    case 'left':
      return { dx: wall.cx - bbox.minX, dy: wall.cy - midY }
    case 'right':
      return { dx: wall.cx - bbox.maxX, dy: wall.cy - midY }
  }
}

/** 새 이너 한 변의 최댓값(cm)·외곽 짧은 변에 대한 비율·최솟값(§4.4-4) */
const NEW_INNER_MAX = 200
const NEW_INNER_RATIO = 0.6
const NEW_INNER_MIN = 10

/** §4.4-4 새 이너 한 변: min(200, 외곽 bbox 짧은 변 × 0.6)을 10cm로 반올림, 최소 10 */
export function newInnerSide(outer: Shape): number {
  let w: number
  let h: number
  if (outer.kind === 'rect') {
    w = outer.w
    h = outer.h
  } else if (outer.kind === 'circle') {
    w = outer.d
    h = outer.d
  } else {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const [x, y] of outer.points) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    w = maxX - minX
    h = maxY - minY
  }
  const short = Math.min(w, h)
  if (!(short > 0) || !Number.isFinite(short)) return NEW_INNER_MIN
  return Math.max(NEW_INNER_MIN, Math.round(Math.min(NEW_INNER_MAX, short * NEW_INNER_RATIO) / 10) * 10)
}
