// 도형 위 치수 편집 계산(소유자 요청 2026-10-14). 순수 함수이고 입력을 바꾸지 않습니다. 반올림은 쓰는 쪽(ops)이 합니다.
// - 치수 키: 변 i(꼭짓점 고리 기준, 사각형은 [가로, 세로, 가로, 세로]), 전체 가로·세로(보이는 윤곽 기준, 원은 지름), 모서리 반지름 i.
// - 비율 유지 켬: 변·가로·세로 어느 것을 바꿔도 전체를 같은 배율로(템플릿은 템플릿째, 모서리 반지름도 같은 배율). 모양이 그대로입니다.
// - 비율 유지 끔: 그 변·그 축만. 사각형·원·육각형 가로세로·사다리꼴 앞뒤변·육각형 윗아랫변은 템플릿 값으로,
//   그 밖의 변·축은 자유 다각형(템플릿 버림)으로 바꿉니다(꼭짓점 끌기와 같은 규칙, §4.4-6).
// - 모서리 반지름: 비율 유지와 상관없이 그 꼭짓점만. 변 길이로 줄어드는 값은 실제로 쓰는 값(effectiveRadii)으로 저장합니다.
import { cornerRing, effectiveRadii, outlineBBox, ringBBox } from './geom'
import { LIMITS, type Pt, type Shape, type ShapeTemplate } from './model'
import { edgeLengths, MIN_EDGE_CM, setAnyEdgeLength } from './polygonEdit'
import { normalizeShape } from './ops/util'
import { radiiOf, withRadii } from './radii'
import { shapeFromTemplate } from './templates'
import { ringIssue } from './validate'

export type DimKey = { kind: 'edge'; index: number } | { kind: 'w' } | { kind: 'h' } | { kind: 'radius'; index: number }

/** 도형과(있으면) 그 도형을 만든 템플릿 */
export type ShapeSpec = { shape: Shape; template?: ShapeTemplate }

/** range = 1~5000(반지름 0~5000)·좌표 범위 밖, hexagon-edge = 육각형 윗·아랫변 > 가로, zero-edge = 0.05cm 미만 변, invalid = 꼬임·그 키 없음 */
export type DimReason = 'range' | 'hexagon-edge' | 'pentagon-tip' | 'zero-edge' | 'invalid'
export type DimResult = { ok: true; spec: ShapeSpec } | { ok: false; reason: DimReason }

const [LEN_MIN, LEN_MAX] = LIMITS.length
const [COORD_MIN, COORD_MAX] = LIMITS.coord

function inLen(v: number): boolean {
  return Number.isFinite(v) && v >= LEN_MIN && v <= LEN_MAX
}

/** 보이는 윤곽의 가로·세로(원은 지름). 둥근 모서리는 원의 식으로 정확히 잽니다. */
export function outlineSize(shape: Shape): { w: number; h: number } {
  if (shape.kind === 'circle') return { w: shape.d, h: shape.d }
  const b = outlineBBox(shape)
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
    case 'pentagon':
      return { ...t, w: t.w * k, h: t.h * k, tip: t.tip * k }
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
    case 'pentagon': {
      if (!inLen(t.w) || !inLen(t.h) || !inLen(t.tip)) return 'range'
      const along = t.dir === 'left' || t.dir === 'right' ? t.w : t.h
      return t.tip >= along - 1e-9 ? 'pentagon-tip' : null
    }
  }
}

/** 템플릿으로 도형을 다시 만들고 반지름을 이어 붙인 결과(반지름 배율 k) */
function fromTemplate(t: ShapeTemplate, radii: readonly number[], k = 1): DimResult {
  const reason = templateReason(t)
  if (reason !== null) return { ok: false, reason }
  return { ok: true, spec: { shape: withRadii(shapeFromTemplate(t), radii.map((r) => r * k)), template: t } }
}

// ── 도형 ────────────────────────────────────────────────────────

/** 다각형 점 검사: 좌표 범위, 0.05cm 미만 변, 꼬임·넓이(§5.3-3). 괜찮으면 null */
function polygonReason(points: readonly Pt[]): DimReason | null {
  if (points.some(([x, y]) => !(x >= COORD_MIN && x <= COORD_MAX && y >= COORD_MIN && y <= COORD_MAX))) return 'range'
  if (Math.min(...edgeLengths(points)) < MIN_EDGE_CM) return 'zero-edge'
  if (ringIssue([...points]) !== null) return 'invalid'
  return null
}

/** 저장 단위로 반올림한 결과를 고를 때 살펴보는 후보 수(한쪽) */
const SEARCH_STEPS = 40

type PolygonCandidate = { points: Pt[]; radii: readonly number[] }

/** 반올림 전 도형 전체를 옮겨 보는 거리(cm, 저장 단위보다 작음). 양 끝 점이 같은 순간에 반올림돼 0.2cm씩 뛰는 것을 피합니다. */
const ROUND_SHIFTS = [0, 0.05, 0.025, 0.075]
/** 이보다 가까우면 더 찾지 않음(cm) */
const EXACT_TOL = 0.005

/** t0에서 step씩 양쪽으로(0, +1, −1, +2, …) n칸 */
function* around(t0: number, step: number, n: number): Generator<number> {
  yield t0
  for (let k = 1; k <= n; k++) {
    yield t0 + k * step
    yield t0 - k * step
  }
}

/**
 * 다각형 결과를 저장 단위(0.1cm)로 반올림한 뒤에도 입력한 치수가 그대로 보이게 고릅니다(소유자 피드백 2026-10-14 「183이 183.1로」).
 * 꼭짓점을 하나씩 반올림하면 양 끝 점이 따로 움직여 가로·변 길이가 0.1~0.2cm 어긋나므로, 후보(배율·길이를 조금씩 바꾼 것)마다
 * 도형 전체를 0.1cm 미만으로 옮겨 반올림해 보고 error(cm)가 가장 작은 것을 씁니다(0.005cm 안이면 바로).
 * 결과 도형은 이미 반올림돼 있습니다. 옮김은 0.1cm 미만이라 보이는 자리는 그대로입니다.
 */
function fitPolygon(candidates: Iterable<PolygonCandidate>, error: (s: Shape) => number | null): DimResult {
  let best: Shape | null = null
  let bestErr = Infinity
  let first = true
  search: for (const c of candidates) {
    if (first) {
      first = false
      const reason = polygonReason(c.points)
      if (reason !== null) return { ok: false, reason }
    }
    for (const d of ROUND_SHIFTS) {
      const pts = c.points.map((p): Pt => [p[0] + d, p[1] + d])
      const rounded = normalizeShape(withRadii({ kind: 'polygon', points: pts }, c.radii))
      if (rounded.kind !== 'polygon' || polygonReason(rounded.points) !== null) continue
      const err = error(rounded)
      if (err === null) continue
      if (err < bestErr) {
        best = rounded
        bestErr = err
      }
      if (err < EXACT_TOL) break search
    }
  }
  return best === null ? { ok: false, reason: 'zero-edge' } : { ok: true, spec: { shape: best } }
}

/** 1차원 후보: make(t), t = t0 둘레로 step씩 */
function* candidates1(make: (t: number) => PolygonCandidate, t0: number, step: number): Generator<PolygonCandidate> {
  for (const t of around(t0, step, SEARCH_STEPS)) yield make(t)
}

/** 꼭짓점 고리 bbox 가운데를 기준으로 축별 배율 */
function scalePoints(points: readonly Pt[], sx: number, sy: number): Pt[] {
  const b = ringBBox([...points])
  const cx = (b.minX + b.maxX) / 2
  const cy = (b.minY + b.maxY) / 2
  return points.map(([x, y]): Pt => [cx + (x - cx) * sx, cy + (y - cy) * sy])
}

/** 전체를 같은 배율 k로(가운데 그대로). 다각형은 fit(바꾼 치수·입력값)이 반올림 뒤에도 그대로 보이게 고릅니다. */
function scaleUniform(spec: ShapeSpec, k: number, fit: { key: DimKey; value: number }): DimResult {
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
    case 'polygon': {
      const points = shape.points
      return fitPolygon(
        candidates1((t) => ({ points: scalePoints(points, t, t), radii: radii.map((r) => r * t) }), k, (0.01 * k) / fit.value),
        (sh) => {
          const m = dimValue(sh, fit.key)
          return m === null ? null : Math.abs(m - fit.value)
        },
      )
    }
  }
}

/**
 * 한 축만: 보이는 윤곽의 그 축 길이가 value가 되게, 다른 축은 지금 보이는 값(0.1cm) 그대로.
 * 둥근 모서리는 한 축으로 늘리면 꼭짓점 각이 바뀌어 다른 축 윤곽도 움직이므로 두 축 배율을 함께 맞춥니다.
 */
function scaleAxis(spec: ShapeSpec, axis: 'w' | 'h', value: number): DimResult {
  const { shape } = spec
  const radii = radiiOf(shape)
  const corners = cornerRing(shape)
  const other = axis === 'w' ? 'h' : 'w'
  const keep = Math.round(outlineSize(shape)[other] * 10) / 10
  const scaled = (sm: number, so: number): PolygonCandidate => ({
    points: scalePoints(corners, axis === 'w' ? sm : so, axis === 'h' ? sm : so),
    radii,
  })
  const size = (c: PolygonCandidate) => outlineSize(withRadii({ kind: 'polygon', points: c.points }, c.radii))
  let sm = value / size(scaled(1, 1))[axis]
  let so = 1
  for (let i = 0; i < 8 && Number.isFinite(sm) && sm > 0 && Number.isFinite(so) && so > 0; i++) {
    const got = size(scaled(sm, so))
    if (Math.abs(got[axis] - value) < 0.001 && Math.abs(got[other] - keep) < 0.001) break
    if (got[axis] > 0) sm *= value / got[axis]
    if (got[other] > 0) so *= keep / got[other]
  }
  if (!(Number.isFinite(sm) && sm > 0 && Number.isFinite(so) && so > 0)) return { ok: false, reason: 'invalid' }
  const stepM = (0.01 * sm) / value
  const stepO = keep > 0 ? (0.01 * so) / keep : 0
  function* cands(): Generator<PolygonCandidate> {
    for (const a of around(sm, stepM, SEARCH_STEPS)) for (const b of around(so, stepO, 3)) yield scaled(a, b)
  }
  return fitPolygon(cands(), (sh) => {
    const got = outlineSize(sh)
    return Math.max(Math.abs(got[axis] - value), Math.abs(got[other] - keep))
  })
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
  return fitPolygon(candidates1((len) => ({ points: setAnyEdgeLength(corners, index, len), radii }), value, 0.01), (sh) => {
    const m = dimValue(sh, { kind: 'edge', index })
    return m === null ? null : Math.abs(m - value)
  })
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
  if (template?.kind === 'hexagon' || template?.kind === 'pentagon') return fromTemplate({ ...template, [axis]: value }, radii)
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
  if (keepRatio) return scaleUniform(spec, value / current, { key, value })
  return key.kind === 'edge' ? edgeOnly(spec, key.index, value) : axisOnly(spec, key.kind, value)
}

/** 모든 모서리를 같은 반지름 r로(0 = 모두 뾰족). 변 길이로 줄어드는 값은 실제로 되는 값으로. */
export function setAllRadii(spec: ShapeSpec, r: number): DimResult {
  if (!Number.isFinite(r) || r < 0 || r > LEN_MAX) return { ok: false, reason: 'range' }
  if (spec.shape.kind === 'circle') return { ok: false, reason: 'invalid' }
  return withEffectiveRadii(spec, radiiOf(spec.shape).map(() => r))
}
