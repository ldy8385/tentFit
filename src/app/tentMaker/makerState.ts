// 텐트 만들기 화면의 폼 상태(스펙 §4.4-1, §4.8, Plan 4 R6·R7·R8). React 없는 순수 모듈입니다.
// 이 화면은 배치가 없으므로 문서 스토어·실행 취소 기록 밖입니다(§8). 모든 함수는 새 상태를 돌려주고 입력을 고치지 않습니다.
// 붙일 위치(side)는 저장하지 않는 생성 도우미이고(D23), 확정할 때 makerTent가 위치만 남긴 Tent를 만듭니다.
import { area, outerRing, region, shapeRing } from '../../core/geom'
import { LIMITS, newId, round1, type Inner, type Pt, type Shape, type ShapeTemplate, type Tent } from '../../core/model'
import { uniqueName } from '../../core/ops/items'
import { tentIssues } from '../../core/ops/tent'
import {
  attachedInner,
  attachSidesFor,
  newInnerSide,
  ngonDiameterFromSide,
  ngonSideFromDiameter,
  shapeFromTemplate,
  type AttachSide,
} from '../../core/templates'
import { innersOverlap } from '../../core/validate'
import { buildZones } from '../../core/zones'

export type MakerKind = 'rect' | 'trapezoid' | 'ngon' | 'circle' | 'free'

/**
 * 만들기 화면의 이너 한 개(사각형만, R7).
 * side null = 붙이지 않음(정N각형·원·자유 외곽, 또는 모양을 바꿔 그 벽이 없어짐) — 그때 x·y는 그 자리(월드).
 * side가 있으면 x·y는 붙인 결과(계산값)이고, 외곽 치수·폭·깊이가 바뀔 때마다 다시 계산합니다.
 */
export type MakerInner = { id: string; name: string; width: number; depth: number; side: AttachSide | null; x: number; y: number }

export type MakerState = {
  name: string
  kind: MakerKind
  rect: { w: number; h: number; square: boolean }
  trapezoid: { front: number; back: number; depth: number; offset: number }
  ngon: { n: number; sizeBy: 'diameter' | 'side'; size: number }
  circle: { d: number }
  /** kind 'free'의 꼭짓점(월드 = 외곽 로컬) */
  free: Pt[]
  inners: MakerInner[]
}

export type MakerCheck = { canConfirm: boolean; problems: string[]; escapedInnerIds: string[] }

/** 기본 텐트 이름(R6, §4.4-1) */
const DEFAULT_TENT_NAME = '내 텐트'

// ── 값 정리 ──────────────────────────────────────────────────────────

function clampLength(v: number): number {
  const [min, max] = LIMITS.length
  return round1(Math.min(max, Math.max(min, Number.isFinite(v) ? v : min)))
}

function clampOffset(v: number): number {
  const [min, max] = LIMITS.offset
  return round1(Math.min(max, Math.max(min, Number.isFinite(v) ? v : 0)))
}

function clampCoordinate(v: number): number {
  const [min, max] = LIMITS.coord
  return round1(Math.min(max, Math.max(min, Number.isFinite(v) ? v : 0)))
}

function clampN(v: number): number {
  const [min, max] = LIMITS.ngonN
  return Math.min(max, Math.max(min, Math.round(Number.isFinite(v) ? v : min)))
}

function roundPoint(p: Pt): Pt {
  return [clampCoordinate(p[0]), clampCoordinate(p[1])]
}

/** 비어 있는 가장 작은 「이너 N」(ops/tent의 새 이너 이름과 같은 규칙) */
function nextInnerName(inners: readonly MakerInner[]): string {
  const used = new Set(inners.map((it) => it.name))
  let n = inners.length + 1
  while (used.has(`이너 ${n}`)) n++
  return `이너 ${n}`
}

// ── 외곽 ─────────────────────────────────────────────────────────────

/** 지금 모양의 외곽 템플릿. 자유 모양이면 null. */
export function outerTemplateOf(s: MakerState): ShapeTemplate | null {
  switch (s.kind) {
    case 'rect':
      return s.rect.square ? { kind: 'rect', w: s.rect.w, h: s.rect.w, square: true } : { kind: 'rect', w: s.rect.w, h: s.rect.h }
    case 'trapezoid':
      return { kind: 'trapezoid', front: s.trapezoid.front, back: s.trapezoid.back, depth: s.trapezoid.depth, offset: s.trapezoid.offset }
    case 'ngon':
      return { kind: 'ngon', n: s.ngon.n, sizeBy: s.ngon.sizeBy, size: s.ngon.size }
    case 'circle':
      return { kind: 'circle', d: s.circle.d }
    case 'free':
      return null
  }
}

export function outerShapeOf(s: MakerState): Shape {
  const tpl = outerTemplateOf(s)
  if (tpl !== null) return shapeFromTemplate(tpl)
  return { kind: 'polygon', points: s.free.map((p) => roundPoint(p)) }
}

/** 템플릿 모양의 꼭짓점 고리(자유로 바꿀 때 씀). 사각형은 왼쪽 위부터 시계 방향, 원은 지름 크기 정사각형. */
function templatePoints(s: MakerState): Pt[] {
  const shape = outerShapeOf(s)
  if (shape.kind === 'circle') {
    const r = shape.d / 2
    const square: Pt[] = [
      [-r, -r],
      [r, -r],
      [r, r],
      [-r, r],
    ]
    return square.map((p) => roundPoint(p))
  }
  return shapeRing(shape).map((p) => roundPoint(p))
}

// ── 이너 ─────────────────────────────────────────────────────────────

/** 텐트에 들어갈 사각형 크기. 왼쪽·오른쪽 벽은 w = 깊이·h = 폭(R7), 그 밖은 w = 폭·h = 깊이. */
function innerSize(inner: MakerInner): { w: number; h: number } {
  const sideways = inner.side === 'left' || inner.side === 'right'
  return sideways ? { w: inner.depth, h: inner.width } : { w: inner.width, h: inner.depth }
}

function toInner(inner: MakerInner): Inner {
  const { w, h } = innerSize(inner)
  return {
    id: inner.id,
    name: inner.name,
    shape: { kind: 'rect', w, h },
    template: { kind: 'rect', w, h },
    x: inner.x,
    y: inner.y,
    rotation: 0,
  }
}

/** side가 있는 이너를 지금 외곽에 다시 붙입니다. 그 벽이 없으면 side null(지금 자리 유지). */
function reattachOne(tpl: ShapeTemplate | null, inner: MakerInner): MakerInner {
  if (inner.side === null) return inner
  const side = inner.side
  if (tpl === null || !attachSidesFor(tpl).includes(side)) return { ...inner, side: null }
  const placed = attachedInner(tpl, side, inner.width, inner.depth)
  if (placed === null) return { ...inner, side: null }
  if (placed.x === inner.x && placed.y === inner.y) return inner
  return { ...inner, x: placed.x, y: placed.y }
}

function reattachAll(s: MakerState): MakerState {
  const tpl = outerTemplateOf(s)
  const inners = s.inners.map((it) => reattachOne(tpl, it))
  return inners.every((it, i) => it === s.inners[i]) ? s : { ...s, inners }
}

// ── 시작값·텐트 ──────────────────────────────────────────────────────

/** R6: 이름 「내 텐트」(내 텐트 이름과 비교해 번호), 사각형 400×300, 이너 1개(§4.4-4 한 변, 뒤 벽). */
export function initialMakerState(opts: { myTentNames: readonly string[] }): MakerState {
  const base: MakerState = {
    name: uniqueName(opts.myTentNames, DEFAULT_TENT_NAME),
    kind: 'rect',
    rect: { w: 400, h: 300, square: false },
    trapezoid: { front: 400, back: 300, depth: 300, offset: 0 },
    ngon: { n: 6, sizeBy: 'diameter', size: 400 },
    circle: { d: 400 },
    free: [],
    inners: [],
  }
  const side = newInnerSide(outerShapeOf(base))
  const inner: MakerInner = { id: newId(), name: '이너 1', width: side, depth: side, side: 'back', x: 0, y: 0 }
  return reattachAll({ ...base, inners: [inner] })
}

/** 확정할 텐트: 이름 앞뒤 공백 정리(빈 이름이면 「내 텐트」), 외곽(템플릿 모양이면 outerTemplate 포함), 이너(사각 템플릿). */
export function makerTent(s: MakerState): Tent {
  const name = s.name.trim() === '' ? DEFAULT_TENT_NAME : s.name.trim()
  const tpl = outerTemplateOf(s)
  const tent: Tent = { name, outer: outerShapeOf(s), inners: s.inners.map((it) => toInner(it)) }
  if (tpl !== null) tent.outerTemplate = tpl
  return tent
}

/** 확정 가능 여부(§4.4-1): 자기교차·꼭짓점·넓이·이너 겹침 이슈가 있으면 불가(문구 = Issue.message). 이탈은 허용(목록만). */
export function checkMaker(s: MakerState): MakerCheck {
  const tent = makerTent(s)
  const issues = tentIssues(tent)
  return {
    canConfirm: issues.length === 0,
    problems: issues.map((issue) => issue.message),
    escapedInnerIds: buildZones(tent).innerEscapes,
  }
}

// ── 바꾸기 ───────────────────────────────────────────────────────────

/**
 * 모양을 바꿉니다. 자유로 바꾸면 지금 템플릿의 꼭짓점(사각형 4·사다리꼴 4·정N각형 n점, 원은 지름 크기 정사각형 4점)으로 free를 채웁니다.
 * 새 모양에 그 벽이 있는 이너는 다시 붙이고, 없으면 side null로 바꾸고 지금 자리를 유지합니다.
 */
export function setKind(s: MakerState, kind: MakerKind): MakerState {
  if (s.kind === kind) return s
  const free = kind === 'free' ? templatePoints(s) : s.free
  return reattachAll({ ...s, kind, free })
}

type TemplatePatch = Partial<MakerState['rect'] & MakerState['trapezoid'] & MakerState['ngon'] & MakerState['circle']>

/**
 * 템플릿 치수를 바꿉니다(키마다 그 모양의 칸에 씀). 값은 범위로 자르고 0.1cm 반올림, n은 정수 5~12.
 * 사각형 square면 w = h(세로만 바꾸면 가로가 따라감). 정N각형 sizeBy만 바꾸면 같은 도형이 되게 크기를 환산합니다.
 * 외곽 치수가 바뀌면 side가 있는 이너를 다시 붙입니다(§4.4-1, 이 화면에서만).
 */
export function setTemplateField(s: MakerState, patch: TemplatePatch): MakerState {
  const rect = { ...s.rect }
  if (patch.w !== undefined) rect.w = clampLength(patch.w)
  if (patch.h !== undefined) rect.h = clampLength(patch.h)
  if (patch.square !== undefined) rect.square = patch.square
  if (rect.square) {
    if (patch.h !== undefined && patch.w === undefined) rect.w = rect.h
    else rect.h = rect.w
  }

  const trapezoid = { ...s.trapezoid }
  if (patch.front !== undefined) trapezoid.front = clampLength(patch.front)
  if (patch.back !== undefined) trapezoid.back = clampLength(patch.back)
  if (patch.depth !== undefined) trapezoid.depth = clampLength(patch.depth)
  if (patch.offset !== undefined) trapezoid.offset = clampOffset(patch.offset)

  const ngon = { ...s.ngon }
  if (patch.n !== undefined) ngon.n = clampN(patch.n)
  if (patch.size !== undefined) ngon.size = clampLength(patch.size)
  if (patch.sizeBy !== undefined && patch.sizeBy !== ngon.sizeBy) {
    if (patch.size === undefined) {
      const converted = patch.sizeBy === 'side' ? ngonSideFromDiameter(ngon.n, ngon.size) : ngonDiameterFromSide(ngon.n, ngon.size)
      ngon.size = clampLength(converted)
    }
    ngon.sizeBy = patch.sizeBy
  }

  const circle = { ...s.circle }
  if (patch.d !== undefined) circle.d = clampLength(patch.d)

  return reattachAll({ ...s, rect, trapezoid, ngon, circle })
}

/**
 * R7 이너 추가. 붙일 벽이 있는 모양(사각형·사다리꼴)은 아직 안 쓴 벽을 뒤 → 앞 → 왼쪽 → 오른쪽(사다리꼴은 뒤 → 앞) 순으로,
 * 모두 썼으면 뒤. 그 밖 모양은 가장 큰 바닥 조각의 polylabel(§4.4-4). 크기는 §4.4-4 한 변.
 * 다른 이너와 겹치면 추가하지 않고 no-space.
 */
export function addMakerInner(s: MakerState): { ok: true; state: MakerState } | { ok: false; reason: 'no-space' } {
  const tpl = outerTemplateOf(s)
  const size = newInnerSide(outerShapeOf(s))
  const sides = attachSidesFor(tpl ?? undefined)
  let candidate: MakerInner
  const id = newId()
  const name = nextInnerName(s.inners)
  if (tpl !== null && sides.length > 0) {
    const used = new Set(s.inners.map((it) => it.side))
    const side = sides.find((sd) => !used.has(sd)) ?? 'back'
    const placed = attachedInner(tpl, side, size, size)
    if (placed === null) return { ok: false, reason: 'no-space' }
    candidate = { id, name, width: size, depth: size, side, x: placed.x, y: placed.y }
  } else {
    const piece = buildZones(makerTent(s)).pieces[0]
    if (piece === undefined) return { ok: false, reason: 'no-space' }
    candidate = { id, name, width: size, depth: size, side: null, x: clampCoordinate(piece.label[0]), y: clampCoordinate(piece.label[1]) }
  }
  const next = toInner(candidate)
  if (s.inners.some((it) => innersOverlap(next, toInner(it)))) return { ok: false, reason: 'no-space' }
  return { ok: true, state: { ...s, inners: [...s.inners, candidate] } }
}

/**
 * 이너 한 개의 이름·폭·깊이·붙일 위치를 바꿉니다. 폭·깊이는 범위로 자르고 0.1cm 반올림.
 * side는 그 모양의 선택지(attachSidesFor)에 있는 벽이나 null만 받고, 아니면 무시합니다.
 * side가 있으면 다시 붙이고, null이 되면 지금 자리에 남깁니다. 없는 id면 그대로.
 */
export function updateMakerInner(
  s: MakerState,
  id: string,
  patch: Partial<Pick<MakerInner, 'name' | 'width' | 'depth' | 'side'>>,
): MakerState {
  const index = s.inners.findIndex((it) => it.id === id)
  const current = s.inners[index]
  if (current === undefined) return s
  const next: MakerInner = { ...current }
  if (patch.name !== undefined) next.name = patch.name
  if (patch.width !== undefined) next.width = clampLength(patch.width)
  if (patch.depth !== undefined) next.depth = clampLength(patch.depth)
  const tpl = outerTemplateOf(s)
  if (patch.side !== undefined) {
    if (patch.side === null) next.side = null
    else if (attachSidesFor(tpl ?? undefined).includes(patch.side)) next.side = patch.side
  }
  const placed = reattachOne(tpl, next)
  const inners = s.inners.slice()
  inners[index] = placed
  return { ...s, inners }
}

export function removeMakerInner(s: MakerState, id: string): MakerState {
  if (!s.inners.some((it) => it.id === id)) return s
  return { ...s, inners: s.inners.filter((it) => it.id !== id) }
}

// ── 자유 모양 꼭짓점(R8: 좌표 표로 편집) ─────────────────────────────

/** 자유 모양 꼭짓점 하나를 옮깁니다(0.1cm 반올림, 좌표 범위로 자름). 없는 번호면 그대로. */
export function setFreePoint(s: MakerState, index: number, p: Pt): MakerState {
  if (!Number.isInteger(index) || index < 0 || index >= s.free.length) return s
  const free = s.free.slice()
  free[index] = roundPoint(p)
  return { ...s, free }
}

/** §4.4-7: afterIndex번 꼭짓점 다음 변(afterIndex → afterIndex+1)의 중점에 넣습니다. null이면 마지막 변(n → 1). */
export function insertFreePoint(s: MakerState, afterIndex: number | null): MakerState {
  const n = s.free.length
  const edge = afterIndex ?? n - 1
  if (!Number.isInteger(edge) || edge < 0 || edge >= n) return s
  const a = s.free[edge]
  const b = s.free[(edge + 1) % n]
  if (a === undefined || b === undefined) return s
  const free = s.free.slice()
  free.splice(edge + 1, 0, roundPoint([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]))
  return { ...s, free }
}

/** 꼭짓점을 지웁니다. 3개 이하면 그대로(§6.9). 없는 번호도 그대로. */
export function deleteFreePoint(s: MakerState, index: number): MakerState {
  if (s.free.length <= 3 || !Number.isInteger(index) || index < 0 || index >= s.free.length) return s
  return { ...s, free: s.free.filter((_, i) => i !== index) }
}

/** 바닥 면적 요약(§4.4-1): 외곽 넓이를 m² 소수 둘째 자리로. 예: '바닥 면적 18.24m²' */
export function floorAreaText(s: MakerState): string {
  const cm2 = area(region(outerRing({ outer: outerShapeOf(s) })))
  return `바닥 면적 ${(cm2 / 10000).toFixed(2)}m²`
}
