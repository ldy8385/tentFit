// 도형 위 치수 편집 계산(소유자 요청 2026-10-14). 순수 함수이고 입력을 바꾸지 않습니다. 반올림은 쓰는 쪽(ops)이 합니다.
// - 치수 키: 변 i(꼭짓점 고리 기준, 사각형은 [가로, 세로, 가로, 세로]), 전체 가로·세로(보이는 윤곽 기준, 원은 지름), 모서리 반지름 i.
// - 비율 유지 켬: 변·가로·세로 어느 것을 바꿔도 전체를 같은 배율로(템플릿은 템플릿째, 모서리 반지름도 같은 배율). 모양이 그대로입니다.
// - 비율 유지 끔: 그 변·그 축만. 사각형·원·육각형 가로세로·사다리꼴 앞뒤변·육각형 윗아랫변은 템플릿 값으로,
//   그 밖의 변·축은 자유 다각형(템플릿 버림)으로 바꿉니다(꼭짓점 끌기와 같은 규칙, §4.4-6).
// - 모서리 반지름: 비율 유지와 상관없이 그 꼭짓점만. 변 길이로 줄어드는 값은 실제로 쓰는 값(effectiveRadii)으로 저장합니다.
import { cornerRing, effectiveRadii, ringBBox, shapeRing } from './geom'
import { LIMITS, type Pt, type Shape, type ShapeTemplate } from './model'
import { edgeLengths, MIN_EDGE_CM, setAnyEdgeLength } from './polygonEdit'
import { radiiOf, withRadii } from './radii'
import { shapeFromTemplate } from './templates'
import { ringIssue } from './validate'

export type DimKey = { kind: 'edge'; index: number } | { kind: 'w' } | { kind: 'h' } | { kind: 'radius'; index: number }

/** 도형과(있으면) 그 도형을 만든 템플릿 */
export type ShapeSpec = { shape: Shape; template?: ShapeTemplate }

/** range = 1~5000(반지름 0~5000)·좌표 범위 밖, hexagon-edge = 육각형 윗·아랫변 > 가로, zero-edge = 0.05cm 미만 변, invalid = 꼬임·그 키 없음 */
export type DimReason = 'range' | 'hexagon-edge' | 'zero-edge' | 'invalid'
export type DimResult = { ok: true; spec: ShapeSpec } | { ok: false; reason: DimReason }

const [LEN_MIN, LEN_MAX] = LIMITS.length
const [COORD_MIN, COORD_MAX] = LIMITS.coord

function inLen(v: number): boolean {
  return Number.isFinite(v) && v >= LEN_MIN && v <= LEN_MAX
}

/** 보이는 윤곽의 가로·세로(원은 지름) */
export function outlineSize(shape: Shape): { w: number; h: number } {
  if (shape.kind === 'circle') return { w: shape.d, h: shape.d }
  const b = ringBBox(shapeRing(shape))
  return { w: b.maxX - b.minX, h: b.maxY - b.minY }
}

/** 지금 치수 값. 그 키가 없는 도형(원의 변·반지름, 범위 밖 번호)이면 null */
export function dimValue(shape: Shape, key: DimKey): number | null {
  if (key.kind === 'w' || key.kind === 'h') return outlineSize(shape)[key.kind]
  if (shape.kind === 'circle') return null
  const corners = cornerRing(shape)
  if (!Number.isInteger(key.index) || key.index < 0 || key.index >= corners.length) return null
  if (key.kind === 'edge') return edgeLengths(corners)[key.index] ?? null
  return effectiveRadii(corners, shape.radii)[key.index] ?? null
}

// ── 템플릿 ──────────────────────────────────────────────────────

function scaleTemplate(t: ShapeTemplate, k: number): ShapeTemplate {
  switch (t.kind) {
    case 'rect':
      return { ...t, w: t.w * k, h: t.h * k }
    case 'trapezoid':
      return { ...t, front: t.front * k, back: t.back * k, depth: t.depth * k, offset: t.offset * k }
    case 'ngon':
      return { ...t, size: t.size * k }
    case 'circle':
      return { ...t, d: t.d * k }
    case 'hexagon':
      return { ...t, w: t.w * k, h: t.h * k, edge: t.edge * k }
  }
}

function templateReason(t: ShapeTemplate): DimReason | null {
  switch (t.kind) {
    case 'rect':
      return inLen(t.w) && inLen(t.h) ? null : 'range'
    case 'trapezoid': {
      const [omin, omax] = LIMITS.offset
      return inLen(t.front) && inLen(t.back) && inLen(t.depth) && t.offset >= omin && t.offset <= omax ? null : 'range'
    }
    case 'ngon':
      return inLen(t.size) ? null : 'range'
    case 'circle':
      return inLen(t.d) ? null : 'range'
    case 'hexagon':
      if (!inLen(t.w) || !inLen(t.h) || !inLen(t.edge)) return 'range'
      return t.edge > t.w + 1e-9 ? 'hexagon-edge' : null
  }
}

/** 템플릿으로 도형을 다시 만들고 반지름을 이어 붙인 결과(반지름 배율 k) */
function fromTemplate(t: ShapeTemplate, radii: readonly number[], k = 1): DimResult {
  const reason = templateReason(t)
  if (reason !== null) return { ok: false, reason }
  return { ok: true, spec: { shape: withRadii(shapeFromTemplate(t), radii.map((r) => r * k)), template: t } }
}

// ── 도형 ────────────────────────────────────────────────────────

/** 다각형 결과 검사: 좌표 범위, 0.05cm 미만 변, 꼬임·넓이(§5.3-3) */
function polygonResult(points: Pt[], radii: readonly number[]): DimResult {
  if (points.some(([x, y]) => !(x >= COORD_MIN && x <= COORD_MAX && y >= COORD_MIN && y <= COORD_MAX))) return { ok: false, reason: 'range' }
  if (Math.min(...edgeLengths(points)) < MIN_EDGE_CM) return { ok: false, reason: 'zero-edge' }
  if (ringIssue(points) !== null) return { ok: false, reason: 'invalid' }
  return { ok: true, spec: { shape: withRadii({ kind: 'polygon', points }, radii) } }
}

/** 꼭짓점 고리 bbox 가운데를 기준으로 축별 배율 */
function scalePoints(points: readonly Pt[], sx: number, sy: number): Pt[] {
  const b = ringBBox([...points])
  const cx = (b.minX + b.maxX) / 2
  const cy = (b.minY + b.maxY) / 2
  return points.map(([x, y]): Pt => [cx + (x - cx) * sx, cy + (y - cy) * sy])
}

/** 전체를 같은 배율 k로(가운데 그대로) */
function scaleUniform(spec: ShapeSpec, k: number): DimResult {
  if (!(k > 0) || !Number.isFinite(k)) return { ok: false, reason: 'invalid' }
  const { shape, template } = spec
  const radii = radiiOf(shape)
  if (template !== undefined) return fromTemplate(scaleTemplate(template, k), radii, k)
  switch (shape.kind) {
    case 'rect': {
      const w = shape.w * k
      const h = shape.h * k
      if (!inLen(w) || !inLen(h)) return { ok: false, reason: 'range' }
      return { ok: true, spec: { shape: withRadii({ kind: 'rect', w, h }, radii.map((r) => r * k)) } }
    }
    case 'circle': {
      const d = shape.d * k
      return inLen(d) ? { ok: true, spec: { shape: { kind: 'circle', d } } } : { ok: false, reason: 'range' }
    }
    case 'polygon':
      return polygonResult(scalePoints(shape.points, k, k), radii.map((r) => r * k))
  }
}

/** 한 축만: 보이는 윤곽의 그 축 길이가 value가 되게(둥근 꼭짓점 때문에 몇 번 고쳐 맞춤) */
function scaleAxis(spec: ShapeSpec, axis: 'w' | 'h', value: number): DimResult {
  const { shape } = spec
  const radii = radiiOf(shape)
  const corners = cornerRing(shape)
  const size = (pts: Pt[]) => outlineSize(withRadii({ kind: 'polygon', points: pts }, radii))[axis]
  let s = value / size(corners)
  let pts = corners
  for (let i = 0; i < 6 && Number.isFinite(s) && s > 0; i++) {
    pts = scalePoints(corners, axis === 'w' ? s : 1, axis === 'h' ? s : 1)
    const got = size(pts)
    if (Math.abs(got - value) < 0.005 || !(got > 0)) break
    s *= value / got
  }
  return polygonResult(pts, radii)
}

/** 비율 유지 끔: 그 변만 */
function edgeOnly(spec: ShapeSpec, index: number, value: number): DimResult {
  const { shape, template } = spec
  const radii = radiiOf(shape)
  if (shape.kind === 'circle') return { ok: false, reason: 'invalid' }
  if (template?.kind === 'rect' || (template === undefined && shape.kind === 'rect')) {
    const t = template?.kind === 'rect' ? template : { kind: 'rect' as const, w: (shape as { w: number }).w, h: (shape as { h: number }).h }
    const axisW = index % 2 === 0
    const next = t.square === true ? { ...t, w: value, h: value } : axisW ? { ...t, w: value } : { ...t, h: value }
    return template !== undefined ? fromTemplate(next, radii) : fromRect(next.w, next.h, radii)
  }
  if (template?.kind === 'trapezoid' && (index === 0 || index === 2)) {
    return fromTemplate(index === 0 ? { ...template, back: value } : { ...template, front: value }, radii)
  }
  if (template?.kind === 'hexagon' && (index === 0 || index === 3)) return fromTemplate({ ...template, edge: value }, radii)
  const corners = cornerRing(shape)
  if (!Number.isInteger(index) || index < 0 || index >= corners.length) return { ok: false, reason: 'invalid' }
  return polygonResult(setAnyEdgeLength(corners, index, value), radii)
}

function fromRect(w: number, h: number, radii: readonly number[]): DimResult {
  if (!inLen(w) || !inLen(h)) return { ok: false, reason: 'range' }
  return { ok: true, spec: { shape: withRadii({ kind: 'rect', w, h }, radii) } }
}

/** 비율 유지 끔: 그 축만 */
function axisOnly(spec: ShapeSpec, axis: 'w' | 'h', value: number): DimResult {
  const { shape, template } = spec
  const radii = radiiOf(shape)
  if (shape.kind === 'circle') {
    if (!inLen(value)) return { ok: false, reason: 'range' }
    return template?.kind === 'circle' ? fromTemplate({ ...template, d: value }, radii) : { ok: true, spec: { shape: { kind: 'circle', d: value } } }
  }
  if (template?.kind === 'rect') {
    return fromTemplate(template.square === true ? { ...template, w: value, h: value } : { ...template, [axis]: value }, radii)
  }
  if (template?.kind === 'hexagon') return fromTemplate({ ...template, [axis]: value }, radii)
  if (template === undefined && shape.kind === 'rect') return fromRect(axis === 'w' ? value : shape.w, axis === 'h' ? value : shape.h, radii)
  return scaleAxis(spec, axis, value)
}

/** 모서리 반지름들을 실제로 되는 값으로 바꿔 씁니다(템플릿 유지) */
function withEffectiveRadii(spec: ShapeSpec, radii: readonly number[]): DimResult {
  const { shape } = spec
  if (shape.kind === 'circle') return { ok: false, reason: 'invalid' }
  const eff = effectiveRadii(cornerRing(shape), radii)
  const out: ShapeSpec = { shape: withRadii(shape, eff) }
  if (spec.template !== undefined) out.template = spec.template
  return { ok: true, spec: out }
}

/**
 * 치수 하나를 value로. 변·가로·세로는 1~5000, 반지름은 0~5000(0 = 뾰족). keepRatio는 변·가로·세로에만 씁니다.
 * 결과 도형은 반올림 전이고, 템플릿이 남으면 그 템플릿으로 다시 만든 도형입니다.
 */
export function editDim(spec: ShapeSpec, key: DimKey, value: number, keepRatio: boolean): DimResult {
  if (key.kind === 'radius') {
    if (!Number.isFinite(value) || value < 0 || value > LEN_MAX) return { ok: false, reason: 'range' }
    if (spec.shape.kind === 'circle' || dimValue(spec.shape, key) === null) return { ok: false, reason: 'invalid' }
    const radii = radiiOf(spec.shape)
    radii[key.index] = value
    return withEffectiveRadii(spec, radii)
  }
  if (!inLen(value)) return { ok: false, reason: 'range' }
  const current = dimValue(spec.shape, key)
  if (current === null || !(current > 0)) return { ok: false, reason: 'invalid' }
  if (keepRatio) return scaleUniform(spec, value / current)
  return key.kind === 'edge' ? edgeOnly(spec, key.index, value) : axisOnly(spec, key.kind, value)
}

/** 모든 모서리를 같은 반지름 r로(0 = 모두 뾰족). 변 길이로 줄어드는 값은 실제로 되는 값으로. */
export function setAllRadii(spec: ShapeSpec, r: number): DimResult {
  if (!Number.isFinite(r) || r < 0 || r > LEN_MAX) return { ok: false, reason: 'range' }
  if (spec.shape.kind === 'circle') return { ok: false, reason: 'invalid' }
  return withEffectiveRadii(spec, radiiOf(spec.shape).map(() => r))
}
