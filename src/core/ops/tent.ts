// 텐트 조작(스펙 §4.4·§4.7-8·§4.8). 바꾸는 함수는 immer draft를 직접 고치는 레시피입니다.
// 값을 돌려주는 레시피(deleteVertex·addInner)는 produce 본문을 중괄호로 감싸야 합니다.
// 같은 값이면 아무것도 쓰지 않습니다(패치 0 → doc.commit이 false, 기록 없음 — Plan 4 Review Focus 3).
import {
  LIMITS,
  newId,
  normAngle,
  round1,
  type Color,
  type Inner,
  type Layout,
  type Pt,
  type Shape,
  type ShapeTemplate,
  type Tent,
} from '../model'
import { cornerRing, outlineBBox, ringBBox, shapeRing, transformRing } from '../geom'
import { cornerCount, radiiOf, withRadii } from '../radii'
import { centerPolygon } from '../polygonEdit'
import { reflect, symmetryCenter, symmetryPartners, type SymAxis } from '../symmetry'
import { newInnerSide, shapeFromTemplate, shapesEqual } from '../templates'
import { innersOverlap, validateTent, type Issue } from '../validate'
import type { Zones } from '../zones'
import { clampCoord, clampLen, cloneJson, normalizeShape, roundPt, rotateAround } from './util'

export type TentTarget = 'outer' | { innerId: string }

type RectTemplate = Extract<ShapeTemplate, { kind: 'rect' }>

/** 템플릿 입력값을 반올림하고 범위로 자릅니다(n은 정수 5~12). */
function normalizeTemplate(t: ShapeTemplate): ShapeTemplate {
  switch (t.kind) {
    case 'rect': {
      const out: RectTemplate = { kind: 'rect', w: clampLen(t.w), h: clampLen(t.h) }
      if (t.square !== undefined) out.square = t.square
      return out
    }
    case 'trapezoid': {
      const [min, max] = LIMITS.offset
      return {
        kind: 'trapezoid',
        front: clampLen(t.front),
        back: clampLen(t.back),
        depth: clampLen(t.depth),
        offset: round1(Math.min(max, Math.max(min, t.offset))),
      }
    }
    case 'ngon': {
      const [min, max] = LIMITS.ngonN
      return { kind: 'ngon', n: Math.min(max, Math.max(min, Math.round(t.n))), sizeBy: t.sizeBy, size: clampLen(t.size) }
    }
    case 'circle':
      return { kind: 'circle', d: clampLen(t.d) }
    case 'hexagon':
      return { kind: 'hexagon', w: clampLen(t.w), h: clampLen(t.h), edge: clampLen(t.edge) }
    case 'pentagon':
      return { kind: 'pentagon', w: clampLen(t.w), h: clampLen(t.h), tip: clampLen(t.tip), dir: t.dir }
  }
}

/** 정규화한 두 템플릿의 입력값이 같은지. 사각형 square는 없으면 false로 봅니다. */
function sameTemplate(a: ShapeTemplate, b: ShapeTemplate): boolean {
  switch (a.kind) {
    case 'rect':
      return b.kind === 'rect' && a.w === b.w && a.h === b.h && (a.square ?? false) === (b.square ?? false)
    case 'trapezoid':
      return b.kind === 'trapezoid' && a.front === b.front && a.back === b.back && a.depth === b.depth && a.offset === b.offset
    case 'ngon':
      return b.kind === 'ngon' && a.n === b.n && a.sizeBy === b.sizeBy && a.size === b.size
    case 'circle':
      return b.kind === 'circle' && a.d === b.d
    case 'hexagon':
      return b.kind === 'hexagon' && a.w === b.w && a.h === b.h && a.edge === b.edge
    case 'pentagon':
      return b.kind === 'pentagon' && a.w === b.w && a.h === b.h && a.tip === b.tip && a.dir === b.dir
  }
}

/** 지금 템플릿·도형이 새 템플릿으로 만든 것과 같아 쓸 필요가 없는지. */
function unchanged(current: ShapeTemplate | undefined, shape: Shape, tpl: ShapeTemplate, made: Shape): boolean {
  return current !== undefined && sameTemplate(current, tpl) && shapesEqual(shape, made)
}

/** 템플릿으로 새로 만든 도형에 지금 도형의 모서리 반지름을 이어 붙입니다(꼭짓점 수가 같을 때만). */
function carryRadii(from: Shape, made: Shape): Shape {
  if (from.kind === 'circle' || made.kind === 'circle' || cornerCount(from) !== cornerCount(made)) return made
  return withRadii(made, radiiOf(from))
}

/** 꼭짓점 번호의 기준이 되는 로컬 고리(항상 새 배열). 다각형은 points 순서 그대로, 사각형·원은 geom.cornerRing 순서(모서리 반지름과 무관). */
function localRing(shape: Shape): Pt[] {
  return cornerRing(shape)
}

function findInner(tent: Tent, innerId: string): Inner | undefined {
  for (let i = 0; i < tent.inners.length; i++) {
    const inner = tent.inners[i]
    if (inner !== undefined && inner.id === innerId) return inner
  }
  return undefined
}

type TargetRef = {
  shape: Shape
  x: number
  y: number
  rotation: number
  /** 도형을 자유 다각형으로 바꾸고 템플릿을 버립니다(§4.4-6). radii가 있으면 모서리 반지름(꼭짓점 순서)도 씁니다. */
  writePolygon: (points: Pt[], radii?: readonly number[]) => void
}

function polygonOf(points: Pt[], radii: readonly number[] | undefined): Shape {
  return withRadii({ kind: 'polygon', points: points.map((p) => roundPt(p)) }, radii)
}

function resolve(d: Layout, target: TentTarget): TargetRef | null {
  if (target === 'outer') {
    return {
      shape: d.tent.outer,
      x: 0,
      y: 0,
      rotation: 0,
      writePolygon: (points, radii) => {
        d.tent.outer = polygonOf(points, radii)
        delete d.tent.outerTemplate
      },
    }
  }
  const inner = findInner(d.tent, target.innerId)
  if (!inner) return null
  return {
    shape: inner.shape,
    x: inner.x,
    y: inner.y,
    rotation: inner.rotation,
    writePolygon: (points, radii) => {
      inner.shape = polygonOf(points, radii)
      delete inner.template
    },
  }
}

/** 외곽 템플릿을 바꿉니다. 정규화한 템플릿이 지금과 같고 도형도 같으면 아무것도 쓰지 않습니다. */
export function setOuterTemplate(d: Layout, t: ShapeTemplate): void {
  const tpl = normalizeTemplate(t)
  const made = carryRadii(d.tent.outer, shapeFromTemplate(tpl))
  if (unchanged(d.tent.outerTemplate, d.tent.outer, tpl, made)) return
  d.tent.outerTemplate = tpl
  d.tent.outer = made
}

/** 이너 템플릿을 바꿉니다(위치·회전 유지). 같은 값이면 아무것도 쓰지 않습니다. */
export function setInnerTemplate(d: Layout, innerId: string, t: ShapeTemplate): void {
  const inner = findInner(d.tent, innerId)
  if (!inner) return
  const tpl = normalizeTemplate(t)
  const made = carryRadii(inner.shape, shapeFromTemplate(tpl))
  if (unchanged(inner.template, inner.shape, tpl, made)) return
  inner.template = tpl
  inner.shape = made
}

/** 편집 대상의 월드 고리. 외곽은 월드 원점·회전 0이라 로컬 고리 그대로입니다. 없는 이너면 []. */
export function targetWorldRing(layout: Layout, target: TentTarget): Pt[] {
  if (target === 'outer') return localRing(layout.tent.outer)
  const inner = findInner(layout.tent, target.innerId)
  if (!inner) return []
  return transformRing(localRing(inner.shape), inner.x, inner.y, inner.rotation)
}

/** 편집 대상의 월드 윤곽(모서리 반지름을 넣은 고리 — 선택 테두리용). 없는 이너면 []. */
export function targetWorldOutline(layout: Layout, target: TentTarget): Pt[] {
  if (target === 'outer') return shapeRing(layout.tent.outer)
  const inner = findInner(layout.tent, target.innerId)
  if (!inner) return []
  return transformRing(shapeRing(inner.shape), inner.x, inner.y, inner.rotation)
}

/** 편집 대상의 로컬 고리(이너는 회전 전). 다각형은 점 그대로, 사각형은 cornerRing 순서. 원·없는 이너는 []. */
export function targetLocalRing(layout: Layout, target: TentTarget): Pt[] {
  const shape = target === 'outer' ? layout.tent.outer : findInner(layout.tent, target.innerId)?.shape
  if (shape === undefined || shape.kind === 'circle') return []
  return localRing(shape)
}

/** 대상의 로컬 ↔ 월드(외곽은 그대로, 이너는 위치·회전). 원이거나 없는 이너면 null */
export function targetFrame(layout: Layout, target: TentTarget): { toLocal(p: Pt): Pt; toWorld(p: Pt): Pt } | null {
  if (target === 'outer') {
    if (layout.tent.outer.kind === 'circle') return null
    return { toLocal: (p) => [p[0], p[1]], toWorld: (p) => [p[0], p[1]] }
  }
  const inner = findInner(layout.tent, target.innerId)
  if (!inner || inner.shape.kind === 'circle') return null
  return {
    toLocal: (p) => rotateAround([p[0] - inner.x, p[1] - inner.y], [0, 0], -inner.rotation),
    toWorld: (p) => {
      const q = rotateAround(p, [0, 0], inner.rotation)
      return [q[0] + inner.x, q[1] + inner.y]
    },
  }
}

/**
 * 대칭 맞춤 「자동 맞춤」(소유자 요청 2026-10-15): 대상이 axis 기준(꼭짓점 상자의 가운데) 대칭이면, 꼭짓점 index를 world로 옮길 때
 * 같이 옮길 반대편 짝. 기준선 위 점(짝 = 자기)은 world를 기준선 위로 고치고 짝은 null. 대칭이 아니거나 원이면 null.
 */
export function mirrorVertexMove(
  layout: Layout,
  target: TentTarget,
  index: number,
  world: Pt,
  axis: SymAxis,
): { world: Pt; mirror: { index: number; world: Pt } | null } | null {
  const frame = targetFrame(layout, target)
  const ring = targetLocalRing(layout, target)
  const c = symmetryCenter(ring, axis)
  const mate = frame === null ? undefined : symmetryPartners(ring, axis, c)?.[index]
  if (frame === null || mate === undefined) return null
  const local = frame.toLocal(world)
  if (mate === index) return { world: frame.toWorld(axis === 'x' ? [c, local[1]] : [local[0], c]), mirror: null }
  return { world, mirror: { index: mate, world: frame.toWorld(reflect(local, axis, c)) } }
}

/** 대칭 맞춤 「자동 맞춤」: 대칭이면 꼭짓점 짝 번호(기준선 위 점은 자기), 아니거나 원이면 null */
export function mirrorPartners(layout: Layout, target: TentTarget, axis: SymAxis): number[] | null {
  return symmetryPartners(targetLocalRing(layout, target), axis)
}

/** 로컬 고리 변 edgeIndex(꼭짓점 e → e+1)의 바깥쪽 단위 법선. 없는 번호·길이 0이면 null */
function localEdgeNormal(ring: readonly Pt[], edgeIndex: number): Pt | null {
  const n = ring.length
  if (n < 3 || !Number.isInteger(edgeIndex) || edgeIndex < 0 || edgeIndex >= n) return null
  const a = ring[edgeIndex] as Pt
  const b = ring[(edgeIndex + 1) % n] as Pt
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  if (len === 0) return null
  let area2 = 0
  for (let i = 0; i < n; i++) {
    const p = ring[i] as Pt
    const q = ring[(i + 1) % n] as Pt
    area2 += p[0] * q[1] - q[0] * p[1]
  }
  // 넓이 부호가 양이면 (dy, −dx)가 바깥쪽
  const s = area2 >= 0 ? 1 : -1
  return [(s * (b[1] - a[1])) / len, (s * -(b[0] - a[0])) / len]
}

/** 변 끌기: 대상 변 edgeIndex의 바깥쪽 단위 법선(월드). 원·없는 번호·길이 0이면 null */
export function edgeNormal(layout: Layout, target: TentTarget, edgeIndex: number): Pt | null {
  const frame = targetFrame(layout, target)
  const n = frame === null ? null : localEdgeNormal(targetLocalRing(layout, target), edgeIndex)
  if (frame === null || n === null) return null
  const o = frame.toWorld([0, 0])
  const w = frame.toWorld(n)
  return [w[0] - o[0], w[1] - o[1]]
}

/** 변 끌기: 이웃 변과 끄는 변이 이루는 각이 이보다 작으면(거의 일직선·아주 뾰족) 그 끝점은 미끄러지지 않고 법선으로 */
const EDGE_SLIDE_MIN_SIN = Math.sin(Math.PI / 12)

/**
 * 변 끌기 한 끝점이 변의 법선 이동 1cm당 움직이는 양(로컬). along(이웃 변 방향, 기준선 위 점이면 기준선 방향)을 따라
 * 변의 선이 1cm 밀린 자리까지. along이 법선과 거의 수직이면 법선 그대로(기준선 위 점은 법선의 기준선 성분만).
 */
function slideRate(along: Pt, n: Pt, onAxis: boolean): Pt {
  const len = Math.hypot(along[0], along[1])
  const u: Pt = len === 0 ? [0, 0] : [along[0] / len, along[1] / len]
  const dot = u[0] * n[0] + u[1] * n[1]
  if (Math.abs(dot) >= EDGE_SLIDE_MIN_SIN) return [u[0] / dot, u[1] / dot]
  return onAxis ? [u[0] * dot, u[1] * dot] : n
}

/** 변 끌기 두 끝점(edgeIndex, edgeIndex+1)의 1cm당 이동(로컬): 시작점은 앞 변, 끝점은 뒤 변을 따라. 기준선 위 점은 기준선을 따라. */
function localEndRates(ring: readonly Pt[], edgeIndex: number, n: Pt, axis: SymAxis | null, partners: readonly number[] | null): [Pt, Pt] {
  const len = ring.length
  const a = edgeIndex
  const b = (edgeIndex + 1) % len
  const rate = (i: number, neighbor: number): Pt => {
    const onAxis = axis !== null && partners?.[i] === i
    const p = ring[i] as Pt
    const q = ring[neighbor] as Pt
    const along: Pt = onAxis ? (axis === 'x' ? [0, 1] : [1, 0]) : [p[0] - q[0], p[1] - q[1]]
    return slideRate(along, n, onAxis)
  }
  return [rate(a, (a - 1 + len) % len), rate(b, (b + 1) % len)]
}

/** 변 끌기: 변이 바깥으로 1cm 갈 때 두 끝점([edgeIndex, edgeIndex+1])이 움직이는 양(월드 벡터). edgeMoves와 같은 규칙. 원·없는 번호면 null */
export function edgeEndRates(layout: Layout, target: TentTarget, edgeIndex: number, axis: SymAxis | null): [Pt, Pt] | null {
  const frame = targetFrame(layout, target)
  const ring = targetLocalRing(layout, target)
  const n = frame === null ? null : localEdgeNormal(ring, edgeIndex)
  if (frame === null || n === null) return null
  const partners = axis === null ? null : symmetryPartners(ring, axis, symmetryCenter(ring, axis))
  const o = frame.toWorld([0, 0])
  const toWorldVec = (v: Pt): Pt => {
    const w = frame.toWorld(v)
    return [w[0] - o[0], w[1] - o[1]]
  }
  const [ra, rb] = localEndRates(ring, edgeIndex, n, axis, partners)
  return [toWorldVec(ra), toWorldVec(rb)]
}

/**
 * 변 끌기(소유자 요청 2026-10-16): 변 edgeIndex를 바깥쪽 법선 방향으로 offset(cm, 음수면 안쪽)만큼 평행 이동한 꼭짓점 자리(월드, 번호 순).
 * 2026-10-19부터 두 끝점은 이웃 변을 따라 미끄러집니다 — 변 기울기와 이웃 변의 기울기가 그대로(사다리꼴 옆 변은 가로로).
 * 이웃 변이 끄는 변과 거의 일직선이면 그 끝점은 법선으로. axis(대칭 「자동 맞춤」)가 있고 대상이 대칭이면 반대편 짝 꼭짓점도 거울로,
 * 기준선 위 꼭짓점은 기준선을 따라서만 움직입니다(mirrorVertexMove와 같은 규칙). 원·없는 번호면 null.
 */
export function edgeMoves(
  layout: Layout,
  target: TentTarget,
  edgeIndex: number,
  offset: number,
  axis: SymAxis | null,
): Array<{ index: number; world: Pt }> | null {
  const frame = targetFrame(layout, target)
  const ring = targetLocalRing(layout, target)
  const n = frame === null ? null : localEdgeNormal(ring, edgeIndex)
  if (frame === null || n === null) return null
  const ends = [edgeIndex, (edgeIndex + 1) % ring.length]
  const c = axis === null ? 0 : symmetryCenter(ring, axis)
  const partners = axis === null ? null : symmetryPartners(ring, axis, c)
  const rates = localEndRates(ring, edgeIndex, n, axis, partners)
  const moved = new Map<number, Pt>()
  ends.forEach((i, k) => {
    const p = ring[i] as Pt
    const r = rates[k] as Pt
    let q: Pt = [p[0] + r[0] * offset, p[1] + r[1] * offset]
    const mate = partners?.[i]
    if (axis !== null && mate === i) q = axis === 'x' ? [c, q[1]] : [q[0], c]
    moved.set(i, q)
  })
  for (const i of ends) {
    const mate = partners?.[i]
    if (axis === null || mate === undefined || ends.includes(mate)) continue
    moved.set(mate, reflect(moved.get(i) as Pt, axis, c))
  }
  return [...moved.entries()].sort((a, b) => a[0] - b[0]).map(([index, q]) => ({ index, world: frame.toWorld(q) }))
}

function signedArea2(ring: readonly Pt[]): number {
  let s = 0
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i] as Pt
    const q = ring[(i + 1) % ring.length] as Pt
    s += p[0] * q[1] - q[0] * p[1]
  }
  return s
}

/**
 * 변 끌기로 대상이 뒤집혔는지(변을 맞은편 너머로 옮겨 꼭짓점 순서 방향이 반대가 됨). 꼬이지 않아 검사에 걸리지 않으므로 따로 봅니다.
 * 넓이가 0이 되는 경우는 넓이 검사가 맡으므로 false. 대상이 없거나 원이면 false.
 */
export function targetFlipped(before: Pick<Layout, 'tent'>, after: Pick<Layout, 'tent'>, target: TentTarget): boolean {
  const a = signedArea2(targetLocalRing(before as Layout, target))
  const b = signedArea2(targetLocalRing(after as Layout, target))
  return a * b < 0
}

/** 월드 좌표를 대상의 로컬 좌표로: 이동을 빼고 반대로 돌립니다(transformRing의 역변환). */
function toLocal(ref: TargetRef, world: Pt): Pt {
  return rotateAround([world[0] - ref.x, world[1] - ref.y], [0, 0], -ref.rotation)
}

/** 꼭짓점 하나를 월드 좌표로 옮깁니다. 사각형·템플릿 도형은 자유 다각형이 됩니다. 원과 없는 번호는 무시. */
export function setVertex(d: Layout, target: TentTarget, index: number, world: Pt): void {
  const ref = resolve(d, target)
  if (!ref || ref.shape.kind === 'circle') return
  const pts = localRing(ref.shape)
  if (!Number.isInteger(index) || index < 0 || index >= pts.length) return
  pts[index] = toLocal(ref, world)
  ref.writePolygon(pts, radiiOf(ref.shape))
}

/** edgeIndex번 변(꼭짓점 edgeIndex → edgeIndex+1)의 중점에 꼭짓점을 넣습니다. 새 점의 번호는 edgeIndex+1. */
export function insertVertex(d: Layout, target: TentTarget, edgeIndex: number): void {
  const ref = resolve(d, target)
  if (!ref || ref.shape.kind === 'circle') return
  const pts = localRing(ref.shape)
  if (!Number.isInteger(edgeIndex) || edgeIndex < 0 || edgeIndex >= pts.length) return
  const a = pts[edgeIndex]
  const b = pts[(edgeIndex + 1) % pts.length]
  if (a === undefined || b === undefined) return
  pts.splice(edgeIndex + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])
  const radii = radiiOf(ref.shape)
  radii.splice(edgeIndex + 1, 0, 0)
  ref.writePolygon(pts, radii)
}

/** 꼭짓점을 지웁니다. 3개 이하가 되면 지우지 않고 false(§6.9). 원·없는 번호도 false. */
export function deleteVertex(d: Layout, target: TentTarget, index: number): boolean {
  const ref = resolve(d, target)
  if (!ref || ref.shape.kind === 'circle') return false
  const pts = localRing(ref.shape)
  if (pts.length <= 3 || !Number.isInteger(index) || index < 0 || index >= pts.length) return false
  pts.splice(index, 1)
  const radii = radiiOf(ref.shape)
  radii.splice(index, 1)
  ref.writePolygon(pts, radii)
  return true
}

/**
 * 원 외곽·원 이너의 지름(§4.4-5). 원 템플릿이 있으면 템플릿도 같이 바꿉니다. 원이 아니면 무시.
 * 같은 지름인 칸은 쓰지 않습니다.
 */
export function setCircleDiameter(d: Layout, target: TentTarget, diameter: number): void {
  const value = clampLen(diameter)
  if (target === 'outer') {
    if (d.tent.outer.kind !== 'circle') return
    if (d.tent.outer.d !== value) d.tent.outer.d = value
    if (d.tent.outerTemplate?.kind === 'circle' && d.tent.outerTemplate.d !== value) d.tent.outerTemplate.d = value
    return
  }
  const inner = findInner(d.tent, target.innerId)
  if (!inner || inner.shape.kind !== 'circle') return
  if (inner.shape.d !== value) inner.shape.d = value
  if (inner.template?.kind === 'circle' && inner.template.d !== value) inner.template.d = value
}

function nextInnerName(tent: Tent): string {
  const used = new Set(tent.inners.map((it) => it.name))
  let n = tent.inners.length + 1
  while (used.has(`이너 ${n}`)) n++
  return `이너 ${n}`
}

/**
 * 새 이너(§4.4-4): 정사각형, 한 변 = templates.newInnerSide(외곽)(min(200, 외곽 바운딩 박스 짧은 변 × 0.6)을 10cm 단위로 반올림, 최소 10),
 * 위치 = 가장 큰 바닥 조각(zones.pieces[0])의 polylabel, 회전 0, 이름 "이너 N".
 * 바닥 조각이 없거나 다른 이너와 겹치면(§5.3-4) 추가하지 않고 no-space.
 * zones는 지금 d.tent로 만든 buildZones 결과여야 합니다.
 */
export function addInner(d: Layout, zones: Zones): { ok: true; id: string } | { ok: false; reason: 'no-space' } {
  const side = newInnerSide(d.tent.outer)
  return addInnerFromTemplate(d, zones, { kind: 'rect', w: side, h: side }, newId())
}

/**
 * 예시 모양 이너(설계 2026-10-12 §2.1): 템플릿 도형을 가장 큰 바닥 조각(zones.pieces[0])의 polylabel에, 회전 0, 이름 "이너 N".
 * 바닥 조각이 없거나 다른 이너와 겹치면 추가하지 않고 no-space. id는 부르는 쪽이 한 번 만들어 넘깁니다(미리보기·커밋이 같은 id).
 */
export function addInnerFromTemplate(
  d: Layout,
  zones: Zones,
  template: ShapeTemplate,
  id: string,
): { ok: true; id: string } | { ok: false; reason: 'no-space' } {
  const piece = zones.pieces[0]
  if (!piece) return { ok: false, reason: 'no-space' }
  const tpl = normalizeTemplate(template)
  const inner: Inner = {
    id,
    name: nextInnerName(d.tent),
    shape: shapeFromTemplate(tpl),
    template: tpl,
    x: clampCoord(piece.label[0]),
    y: clampCoord(piece.label[1]),
    rotation: 0,
  }
  for (let i = 0; i < d.tent.inners.length; i++) {
    const other = d.tent.inners[i]
    if (other !== undefined && innersOverlap(inner, other)) return { ok: false, reason: 'no-space' }
  }
  d.tent.inners.push(inner)
  return { ok: true, id: inner.id }
}

/** 그린 이너(설계 §2.2): x·y = 월드 bbox 가운데, 도형 = 그 기준 로컬 다각형, 회전 0, 이름 "이너 N", 템플릿 없음. 겹침 판정은 부르는 쪽. */
export function addInnerFromPolygon(d: Layout, worldPoints: readonly Pt[], id: string): void {
  const { center, points } = centerPolygon(worldPoints)
  d.tent.inners.push({
    id,
    name: nextInnerName(d.tent),
    shape: { kind: 'polygon', points: points.map((p) => roundPt(p)) },
    x: clampCoord(center[0]),
    y: clampCoord(center[1]),
    rotation: 0,
  })
}

/**
 * 대상 도형을 자유 다각형으로(템플릿 버림, 설계 §2.2 다시 그리기·§2.3 cm 맞추기). space 'world'면 대상 로컬로 바꿉니다
 * (외곽 = 그대로, 이너 = 이동 빼고 반대로 회전 — x·y·회전은 그대로). 원도 다각형이 됩니다.
 * keepRadii면 지금 모서리 반지름을 그대로(꼭짓점 수가 같을 때, cm 맞추기), 아니면 버립니다(다시 그리기).
 * 템플릿이 없고 반올림한 점·반지름이 지금과 같으면 아무것도 쓰지 않습니다.
 */
export function setTargetPolygon(
  d: Layout,
  target: TentTarget,
  points: readonly Pt[],
  space: 'world' | 'local',
  opts?: { keepRadii?: boolean; radii?: readonly number[] },
): void {
  const ref = resolve(d, target)
  if (!ref) return
  const local = points.map((p) => roundPt(space === 'world' ? toLocal(ref, p) : [p[0], p[1]]))
  const radii =
    opts?.radii !== undefined && opts.radii.length === local.length
      ? [...opts.radii]
      : opts?.keepRadii === true && cornerCount(ref.shape) === local.length
        ? radiiOf(ref.shape)
        : undefined
  const hasTemplate = target === 'outer' ? d.tent.outerTemplate !== undefined : findInner(d.tent, target.innerId)?.template !== undefined
  if (!hasTemplate && shapesEqual(ref.shape, polygonOf(local, radii), 0)) return
  ref.writePolygon(local, radii)
}

/**
 * 모양 바꾸기(설계 §3): 대상을 다른 예시 템플릿으로. 외곽은 setOuterTemplate 그대로(외곽은 위치가 없어 원점 가운데).
 * 이너는 보이는 가운데(로컬 bbox 가운데의 월드 자리)를 지키도록 x·y를 먼저 옮기고 템플릿을 씁니다(회전 그대로).
 */
export function setTargetShapeTemplate(d: Layout, target: TentTarget, t: ShapeTemplate): void {
  if (target === 'outer') {
    setOuterTemplate(d, t)
    return
  }
  const inner = findInner(d.tent, target.innerId)
  if (!inner) return
  const ring = localRing(inner.shape)
  const bb = ringBBox(ring)
  const c: Pt = inner.shape.kind === 'circle' ? [0, 0] : [(bb.minX + bb.maxX) / 2, (bb.minY + bb.maxY) / 2]
  const off = rotateAround(c, [0, 0], inner.rotation)
  moveInnerTo(d, inner.id, inner.x + off[0], inner.y + off[1])
  setInnerTemplate(d, inner.id, t)
}

/** 색(소유자 요청 2026-10-15): 외곽 = 전실 바닥 색, 이너 = 그 이너 색. null이면 지워 기본 색으로. 같으면 쓰지 않습니다. */
export function setTargetColor(d: Layout, target: TentTarget, color: Color | null): void {
  const owner: { color?: Color } | undefined = target === 'outer' ? d.tent : findInner(d.tent, target.innerId)
  if (owner === undefined) return
  if (color === null) {
    if (owner.color !== undefined) delete owner.color
  } else if (owner.color !== color) {
    owner.color = color
  }
}

/**
 * 대상 도형과 템플릿을 통째로(도형 위 치수·모서리 반지름, 소유자 요청 2026-10-14). 템플릿이 있으면 그 템플릿으로 다시 만든 도형에
 * spec 도형의 반지름을 붙이고, 없으면 도형을 정리해 쓰고 템플릿을 버립니다. 이너의 위치·회전은 그대로, 같으면 아무것도 쓰지 않습니다.
 */
export function setTargetSpec(d: Layout, target: TentTarget, spec: { shape: Shape; template?: ShapeTemplate }): void {
  const tpl = spec.template === undefined ? undefined : normalizeTemplate(spec.template)
  const shape = tpl === undefined ? normalizeShape(spec.shape) : carryRadii(spec.shape, shapeFromTemplate(tpl))
  const same = (cur: ShapeTemplate | undefined, curShape: Shape) =>
    shapesEqual(curShape, shape, 0) && (tpl === undefined ? cur === undefined : cur !== undefined && sameTemplate(cur, tpl))
  if (target === 'outer') {
    if (same(d.tent.outerTemplate, d.tent.outer)) return
    d.tent.outer = shape
    if (tpl === undefined) delete d.tent.outerTemplate
    else d.tent.outerTemplate = tpl
    return
  }
  const inner = findInner(d.tent, target.innerId)
  if (!inner || same(inner.template, inner.shape)) return
  inner.shape = shape
  if (tpl === undefined) delete inner.template
  else inner.template = tpl
}

/**
 * 텐트 전체 회전(소유자 요청 2026-10-14 「회전은 전부」): 외곽 윤곽 상자 가운데를 피벗으로 외곽과 이너를 함께 deg(시계 방향 양수)만큼.
 * 물건은 그대로(텐트 편집은 물건을 건드리지 않음). 0°(360°의 배수)면 아무것도 쓰지 않습니다.
 * 외곽: 원은 그대로. 사각형(템플릿 포함)은 90°·270°면 가로·세로를 바꾸고(템플릿 유지), 180°면 모양 그대로 — 모서리 반지름은 돈 자리로.
 * 그 밖의 각도·다각형은 꼭짓점을 돌린 자유 다각형(템플릿 버림, 꼭짓점 순서·반지름 그대로). 이너는 자리를 돌리고 회전을 더합니다(템플릿 유지).
 */
export function rotateTent(d: Layout, deg: number): void {
  const delta = normAngle(deg)
  if (delta === 0 || !Number.isFinite(delta)) return
  const bb = outlineBBox(d.tent.outer)
  const pivot: Pt = [(bb.minX + bb.maxX) / 2, (bb.minY + bb.maxY) / 2]
  const outer = d.tent.outer
  const quarter = delta === 90 || delta === 180 || delta === 270
  const tpl = d.tent.outerTemplate
  // 오각형(전실형) 템플릿은 90° 단위면 뾰족한 방향만 돌리고 가로·세로를 바꿉니다(모서리 반지름이 없을 때)
  if (tpl?.kind === 'pentagon' && quarter && !(outer.kind !== 'circle' && (outer.radii ?? []).some((r) => r > 0))) {
    const order = ['right', 'front', 'left', 'back'] as const // 시계 방향 90°씩
    const dir = order[(order.indexOf(tpl.dir) + delta / 90) % 4] as (typeof order)[number]
    const swap = delta !== 180
    const next = { ...tpl, dir, w: swap ? tpl.h : tpl.w, h: swap ? tpl.w : tpl.h }
    d.tent.outerTemplate = next
    d.tent.outer = shapeFromTemplate(next)
  } else if (outer.kind === 'rect' && quarter) {
    const steps = delta / 90
    const radii = radiiOf(outer)
    const turned = radii.map((_, i) => radii[(i - steps + 4) % 4] ?? 0)
    const swap = steps % 2 === 1
    d.tent.outer = withRadii({ kind: 'rect', w: swap ? outer.h : outer.w, h: swap ? outer.w : outer.h }, turned)
    const t = d.tent.outerTemplate
    if (t?.kind === 'rect' && swap) d.tent.outerTemplate = t.square === true ? { ...t } : { ...t, w: t.h, h: t.w }
    else if (t !== undefined && t.kind !== 'rect') delete d.tent.outerTemplate
  } else if (outer.kind !== 'circle') {
    const points = cornerRing(outer).map((p) => roundPt(rotateAround(p, pivot, delta)))
    d.tent.outer = withRadii({ kind: 'polygon', points }, radiiOf(outer))
    delete d.tent.outerTemplate
  }
  for (let i = 0; i < d.tent.inners.length; i++) {
    const inner = d.tent.inners[i]
    if (inner === undefined) continue
    const [x, y] = rotateAround([inner.x, inner.y], pivot, delta)
    inner.x = clampCoord(x)
    inner.y = clampCoord(y)
    inner.rotation = normAngle(inner.rotation + delta)
  }
}

/** 이너를 절대 위치로 옮깁니다(0.1cm 반올림). 같은 자리면 아무것도 쓰지 않습니다. */
export function moveInnerTo(d: Layout, innerId: string, x: number, y: number): void {
  const inner = findInner(d.tent, innerId)
  if (!inner) return
  const nx = clampCoord(x)
  const ny = clampCoord(y)
  if (inner.x === nx && inner.y === ny) return
  inner.x = nx
  inner.y = ny
}

/** 이너를 (dx, dy)만큼 옮깁니다. 둘 다 0이면 아무것도 쓰지 않습니다. */
export function moveInner(d: Layout, innerId: string, dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return
  const inner = findInner(d.tent, innerId)
  if (!inner) return
  inner.x = clampCoord(inner.x + dx)
  inner.y = clampCoord(inner.y + dy)
}

/** 이너 자신의 로컬 원점을 기준으로 돌립니다. delta가 0 또는 360의 배수(0.01° 반올림 기준)면 아무것도 쓰지 않습니다. */
export function rotateInner(d: Layout, innerId: string, deltaDeg: number): void {
  if (normAngle(deltaDeg) === 0) return
  const inner = findInner(d.tent, innerId)
  if (!inner) return
  inner.rotation = normAngle(inner.rotation + deltaDeg)
}

export function deleteInner(d: Layout, innerId: string): void {
  for (let i = d.tent.inners.length - 1; i >= 0; i--) {
    if (d.tent.inners[i]?.id === innerId) d.tent.inners.splice(i, 1)
  }
}

/** 이너 이름을 바꿉니다. 같은 이름이면 아무것도 쓰지 않습니다. */
export function renameInner(d: Layout, innerId: string, name: string): void {
  const inner = findInner(d.tent, innerId)
  if (inner && inner.name !== name) inner.name = name
}

/** 텐트 바꾸기(§4.7-8): layout.tent만 복사본으로 바꾸고 물건 좌표는 그대로 둡니다. */
export function swapTent(d: Layout, tent: Tent, sourcePresetId?: string): void {
  d.tent = cloneJson(tent)
  if (sourcePresetId !== undefined) d.sourcePresetId = sourcePresetId
  else delete d.sourcePresetId
}

/** UI가 "반영할지·되돌릴지"를 정할 때 쓰는 기하 이슈(자기교차·꼭짓점 부족·넓이·이너 겹침). */
export function tentIssues(tent: Tent): Issue[] {
  return validateTent(tent)
}
