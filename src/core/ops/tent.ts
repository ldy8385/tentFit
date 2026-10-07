// 텐트 조작(스펙 §4.4·§4.7-8·§4.8). 바꾸는 함수는 immer draft를 직접 고치는 레시피입니다.
// 값을 돌려주는 레시피(deleteVertex·addInner)는 produce 본문을 중괄호로 감싸야 합니다.
import {
  LIMITS,
  newId,
  normAngle,
  round1,
  type Inner,
  type Layout,
  type Pt,
  type Shape,
  type ShapeTemplate,
  type Tent,
} from '../model'
import { ringBBox, shapeRing, transformRing } from '../geom'
import { shapeFromTemplate } from '../templates'
import { innersOverlap, validateTent, type Issue } from '../validate'
import type { Zones } from '../zones'
import { clampCoord, clampLen, cloneJson, roundPt, rotateAround } from './util'

export type TentTarget = 'outer' | { innerId: string }

type RectTemplate = Extract<ShapeTemplate, { kind: 'rect' }>

/** 새 이너 한 변의 최댓값(cm)과 외곽 짧은 변에 대한 비율(§4.4-4) */
const NEW_INNER_MAX = 200
const NEW_INNER_RATIO = 0.6

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
  }
}

/** 꼭짓점 번호의 기준이 되는 로컬 고리(항상 새 배열). 다각형은 points 순서 그대로, 사각형·원은 geom.shapeRing 순서. */
function localRing(shape: Shape): Pt[] {
  const ring = shape.kind === 'polygon' ? shape.points : shapeRing(shape)
  return ring.map((p): Pt => [p[0], p[1]])
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
  /** 도형을 자유 다각형으로 바꾸고 템플릿을 버립니다(§4.4-6). */
  writePolygon: (points: Pt[]) => void
}

function resolve(d: Layout, target: TentTarget): TargetRef | null {
  if (target === 'outer') {
    return {
      shape: d.tent.outer,
      x: 0,
      y: 0,
      rotation: 0,
      writePolygon: (points) => {
        d.tent.outer = { kind: 'polygon', points: points.map((p) => roundPt(p)) }
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
    writePolygon: (points) => {
      inner.shape = { kind: 'polygon', points: points.map((p) => roundPt(p)) }
      delete inner.template
    },
  }
}

export function setOuterTemplate(d: Layout, t: ShapeTemplate): void {
  const tpl = normalizeTemplate(t)
  d.tent.outerTemplate = tpl
  d.tent.outer = shapeFromTemplate(tpl)
}

export function setInnerTemplate(d: Layout, innerId: string, t: ShapeTemplate): void {
  const inner = findInner(d.tent, innerId)
  if (!inner) return
  const tpl = normalizeTemplate(t)
  inner.template = tpl
  inner.shape = shapeFromTemplate(tpl)
}

/** 편집 대상의 월드 고리. 외곽은 월드 원점·회전 0이라 로컬 고리 그대로입니다. 없는 이너면 []. */
export function targetWorldRing(layout: Layout, target: TentTarget): Pt[] {
  if (target === 'outer') return localRing(layout.tent.outer)
  const inner = findInner(layout.tent, target.innerId)
  if (!inner) return []
  return transformRing(localRing(inner.shape), inner.x, inner.y, inner.rotation)
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
  ref.writePolygon(pts)
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
  ref.writePolygon(pts)
}

/** 꼭짓점을 지웁니다. 3개 이하가 되면 지우지 않고 false(§6.9). 원·없는 번호도 false. */
export function deleteVertex(d: Layout, target: TentTarget, index: number): boolean {
  const ref = resolve(d, target)
  if (!ref || ref.shape.kind === 'circle') return false
  const pts = localRing(ref.shape)
  if (pts.length <= 3 || !Number.isInteger(index) || index < 0 || index >= pts.length) return false
  pts.splice(index, 1)
  ref.writePolygon(pts)
  return true
}

/** 원 외곽·원 이너의 지름(§4.4-5). 원 템플릿이 있으면 템플릿도 같이 바꿉니다. 원이 아니면 무시. */
export function setCircleDiameter(d: Layout, target: TentTarget, diameter: number): void {
  const value = clampLen(diameter)
  if (target === 'outer') {
    if (d.tent.outer.kind !== 'circle') return
    d.tent.outer.d = value
    if (d.tent.outerTemplate?.kind === 'circle') d.tent.outerTemplate.d = value
    return
  }
  const inner = findInner(d.tent, target.innerId)
  if (!inner || inner.shape.kind !== 'circle') return
  inner.shape.d = value
  if (inner.template?.kind === 'circle') inner.template.d = value
}

function nextInnerName(tent: Tent): string {
  const used = new Set(tent.inners.map((it) => it.name))
  let n = tent.inners.length + 1
  while (used.has(`이너 ${n}`)) n++
  return `이너 ${n}`
}

/**
 * 새 이너(§4.4-4): 정사각형, 한 변 = min(200, 외곽 바운딩 박스 짧은 변 × 0.6)을 10cm 단위로 반올림(최소 10),
 * 위치 = 가장 큰 바닥 조각(zones.pieces[0])의 polylabel, 회전 0, 이름 "이너 N".
 * 바닥 조각이 없거나 다른 이너와 겹치면(§5.3-4) 추가하지 않고 no-space.
 * zones는 지금 d.tent로 만든 buildZones 결과여야 합니다.
 */
export function addInner(d: Layout, zones: Zones): { ok: true; id: string } | { ok: false; reason: 'no-space' } {
  const piece = zones.pieces[0]
  if (!piece) return { ok: false, reason: 'no-space' }
  const outer = d.tent.outer
  const b = outer.kind === 'circle' ? { minX: 0, minY: 0, maxX: outer.d, maxY: outer.d } : ringBBox(localRing(outer))
  const short = Math.min(b.maxX - b.minX, b.maxY - b.minY)
  const side = Math.max(10, Math.round(Math.min(NEW_INNER_MAX, short * NEW_INNER_RATIO) / 10) * 10)
  const inner: Inner = {
    id: newId(),
    name: nextInnerName(d.tent),
    shape: { kind: 'rect', w: side, h: side },
    template: { kind: 'rect', w: side, h: side },
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

export function moveInner(d: Layout, innerId: string, dx: number, dy: number): void {
  const inner = findInner(d.tent, innerId)
  if (!inner) return
  inner.x = clampCoord(inner.x + dx)
  inner.y = clampCoord(inner.y + dy)
}

/** 이너 자신의 로컬 원점을 기준으로 돌립니다. */
export function rotateInner(d: Layout, innerId: string, deltaDeg: number): void {
  const inner = findInner(d.tent, innerId)
  if (!inner) return
  inner.rotation = normAngle(inner.rotation + deltaDeg)
}

export function deleteInner(d: Layout, innerId: string): void {
  for (let i = d.tent.inners.length - 1; i >= 0; i--) {
    if (d.tent.inners[i]?.id === innerId) d.tent.inners.splice(i, 1)
  }
}

export function renameInner(d: Layout, innerId: string, name: string): void {
  const inner = findInner(d.tent, innerId)
  if (inner) inner.name = name
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
