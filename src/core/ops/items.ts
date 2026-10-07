// 물건 조작(스펙 §4.7·§4.9-4·§7 규칙 2·3·§8).
// 바꾸는 함수는 모두 immer draft를 직접 고치는 레시피입니다: produce(layout, d => { fn(d, ...) }).
// 값을 돌려주는 레시피(duplicateItems)는 화살표 함수 본문을 중괄호로 감싸야 합니다(immer는 반환값을 새 상태로 봄).
import {
  COLOR_KEYS,
  LIMITS,
  newId,
  normAngle,
  type ColorKey,
  type Item,
  type ItemCategory,
  type ItemPreset,
  type Layout,
  type Pt,
  type Shape,
} from '../model'
import { labelPoint, outerRing, pointInRing, ringBBox, worldRing } from '../geom'
import { ringIssue } from '../validate'
import type { Zones } from '../zones'
import { groupBlocks, normalizeGroups } from './groups'
import { clampCoord, clampLen, itemList, normalizeShape, rotateAround, setItemOrder } from './util'

/** 복제와 연속 추가 때 비켜 놓는 거리(cm). §4.7-3·4 */
export const STEP_OFFSET = 20
/** 이 거리(cm) 안이면 "같은 자리"로 봅니다. 저장값이 0.1cm 단위라 그 절반입니다. */
const SAME_SPOT = 0.05

export type NewItemInput = {
  name: string
  shape: Shape
  color: ColorKey
  category: ItemCategory
  countsArea: boolean
  presetId?: string
}

export function makeItem(input: NewItemInput, at: Pt): Item {
  const item: Item = {
    id: newId(),
    name: input.name,
    shape: normalizeShape(input.shape),
    x: clampCoord(at[0]),
    y: clampCoord(at[1]),
    rotation: 0,
    color: input.color,
    category: input.category,
    countsArea: input.countsArea,
  }
  if (input.presetId !== undefined) item.presetId = input.presetId
  return item
}

export function itemFromPreset(p: ItemPreset, at: Pt): Item {
  return makeItem(
    { name: p.name, shape: p.shape, color: p.color, category: p.category, countsArea: p.countsArea, presetId: p.id },
    at,
  )
}

/** 팔레트를 COLOR_KEYS 순서(시안 obj-1~8, OD-2)대로 돌려 씁니다. */
export function nextColor(layout: Layout): ColorKey {
  return COLOR_KEYS[layout.items.length % COLOR_KEYS.length] ?? 'gray'
}

/** 이름 끝의 ' <n>'(1 이상 정수)을 떼어 기본 이름과 번호로 나눕니다. 번호가 없으면 1입니다. */
function splitNumbered(name: string): { base: string; n: number } {
  const m = /^(.+) ([1-9][0-9]*)$/.exec(name)
  if (m !== null && m[1] !== undefined && m[2] !== undefined) {
    const n = Number(m[2])
    if (Number.isSafeInteger(n)) return { base: m[1], n }
  }
  return { base: name, n: 1 }
}

/** names에 없으면 name 그대로, 있으면 `기본 이름 <같은 기본 이름의 가장 큰 번호 + 1>`. */
function numberedName(names: readonly string[], name: string): string {
  if (!names.includes(name)) return name
  const { base } = splitNumbered(name)
  let max = 1
  for (const other of names) {
    const s = splitNumbered(other)
    if (s.base === base && s.n > max) max = s.n
  }
  return `${base} ${max + 1}`
}

/**
 * 배치 안에서 겹치지 않는 물건 이름(OD-10, §4.7-7과 같은 규칙).
 * 다른 물건(excludeId 제외)이 같은 이름을 쓰지 않으면 그대로, 쓰고 있으면
 * 끝의 ' <n>'을 뗀 기본 이름에 "기본 이름 / 기본 이름 <n>" 중 가장 큰 번호 + 1을 붙입니다(번호 없는 이름은 1).
 * 예: '캠핑의자'만 있을 때 '캠핑의자' → '캠핑의자 2', '캠핑의자'·'캠핑의자 2'가 있을 때 '캠핑의자 2' → '캠핑의자 3'.
 */
export function uniqueItemName(layout: Layout, name: string, excludeId?: string): string {
  const names = itemList(layout)
    .filter((it) => it.id !== excludeId)
    .map((it) => it.name)
  return numberedName(names, name)
}

/**
 * 새 물건을 놓을 위치(§4.7-3).
 * 화면 가운데가 외곽 안이면 그 점, 밖이면 외곽의 polylabel. 그 자리에 이미 물건 원점이 있으면 (+20,+20)씩 비켜 놓습니다.
 */
export function newItemPosition(layout: Layout, zones: Zones, viewCenter: Pt): Pt {
  const inside = pointInRing(viewCenter, outerRing(layout.tent))
  const base = inside ? viewCenter : labelPoint(zones.outer)
  let p: Pt = [clampCoord(base[0]), clampCoord(base[1])]
  // 물건 수 + 1번 비키면 반드시 빈자리가 나옵니다(자리 하나에 물건 하나 이상이 필요하므로).
  for (let i = 0; i <= layout.items.length; i++) {
    const q = p
    const taken = layout.items.some((it) => Math.abs(it.x - q[0]) < SAME_SPOT && Math.abs(it.y - q[1]) < SAME_SPOT)
    if (!taken) break
    p = [clampCoord(q[0] + STEP_OFFSET), clampCoord(q[1] + STEP_OFFSET)]
  }
  return p
}

function findItem(d: Layout, id: string): Item | undefined {
  return itemList(d).find((it) => it.id === id)
}

function selected(d: Layout, ids: string[]): Item[] {
  const set = new Set(ids)
  return itemList(d).filter((it) => set.has(it.id))
}

/** 맨 위(배열 끝)에 추가합니다. 같은 이름이 있으면 번호를 붙인 이름으로 저장합니다(OD-10). */
export function addItem(d: Layout, item: Item): void {
  const name = uniqueItemName(d, item.name, item.id)
  d.items.push(name === item.name ? item : { ...item, name })
}

/** 지운 뒤 그룹 불변식을 맞춥니다(멤버 1개 남은 그룹은 자동 해제). */
export function deleteItems(d: Layout, ids: string[]): void {
  const set = new Set(ids)
  let removed = false
  for (let i = d.items.length - 1; i >= 0; i--) {
    const it = d.items[i]
    if (it !== undefined && set.has(it.id)) {
      d.items.splice(i, 1)
      removed = true
    }
  }
  if (removed) normalizeGroups(d)
}

export function moveItems(d: Layout, ids: string[], dx: number, dy: number): void {
  for (const it of selected(d, ids)) {
    it.x = clampCoord(it.x + dx)
    it.y = clampCoord(it.y + dy)
  }
}

/** 각 물건의 원점을 pivot 기준으로 돌리고 rotation에 deltaDeg를 더합니다(§7 규칙 3). */
export function rotateItems(d: Layout, ids: string[], pivot: Pt, deltaDeg: number): void {
  for (const it of selected(d, ids)) {
    const [x, y] = rotateAround([it.x, it.y], pivot, deltaDeg)
    it.x = clampCoord(x)
    it.y = clampCoord(y)
    it.rotation = normAngle(it.rotation + deltaDeg)
  }
}

export function setItemProps(
  d: Layout,
  id: string,
  patch: Partial<Pick<Item, 'name' | 'color' | 'category' | 'countsArea'>>,
): void {
  const it = findItem(d, id)
  if (!it) return
  if (patch.name !== undefined) it.name = patch.name
  if (patch.color !== undefined) it.color = patch.color
  if (patch.category !== undefined) it.category = patch.category
  if (patch.countsArea !== undefined) it.countsArea = patch.countsArea
}

function scalePolygon(points: Pt[], sx: number, sy: number): Pt[] {
  return points.map((p) => [clampCoord(p[0] * sx), clampCoord(p[1] * sy)])
}

/**
 * 다각형을 축별로 늘리거나 줄인 결과를 돌려줍니다. 사각형·원과 같이 축마다 결과 폭이 최소 길이(1cm)
 * 아래로 내려가지 않게 배율을 제한하고, 그래도 §5.3-3(꼭짓점 3개 이상·자기교차 없음·넓이 1cm² 초과)을
 * 깨면 null을 돌려줍니다(호출한 쪽은 도형을 그대로 둡니다). 리뷰 Critical 2.
 */
function safeScalePolygon(points: Pt[], sx: number, sy: number): Pt[] | null {
  const b = ringBBox(points)
  const bw = b.maxX - b.minX
  const bh = b.maxY - b.minY
  const minLen = LIMITS.length[0]
  const limit = (s: number, size: number) => {
    if (size <= 0 || !Number.isFinite(s)) return 1
    const mag = Math.max(Math.abs(s), minLen / size)
    return s < 0 ? -mag : mag
  }
  const next = scalePolygon(points, limit(sx, bw), limit(sy, bh))
  return ringIssue(next) === null ? next : null
}

/** 숫자 입력으로 치수를 바꿉니다. 사각형은 w·h, 원은 d, 다각형은 로컬 바운딩 박스 가로·세로에 맞춰 원점 기준 축별 비례. */
export function resizeItem(d: Layout, id: string, dims: { w?: number; h?: number; d?: number }): void {
  const it = findItem(d, id)
  if (!it) return
  const s = it.shape
  if (s.kind === 'rect') {
    if (dims.w !== undefined) s.w = clampLen(dims.w)
    if (dims.h !== undefined) s.h = clampLen(dims.h)
  } else if (s.kind === 'circle') {
    if (dims.d !== undefined) s.d = clampLen(dims.d)
  } else {
    const b = ringBBox(s.points)
    const bw = b.maxX - b.minX
    const bh = b.maxY - b.minY
    const sx = dims.w !== undefined && bw > 0 ? clampLen(dims.w) / bw : 1
    const sy = dims.h !== undefined && bh > 0 ? clampLen(dims.h) / bh : 1
    if (sx === 1 && sy === 1) return
    const next = safeScalePolygon(s.points, sx, sy)
    if (next) it.shape = { kind: 'polygon', points: next }
  }
}

/**
 * Konva transformend 결과를 모델에 반영합니다(§7 규칙 2). scale은 치수로 바꾸고 모델에는 남기지 않습니다.
 * - 사각형: w·h에 |scale|을 곱함(뒤집힘은 사각형 모양을 바꾸지 않음)
 * - 원: 1에서 더 많이 벗어난 축의 |scale|을 지름에 곱함(옆 앵커로 한 축만 바뀌어도 반영)
 * - 다각형: 로컬 원점 기준으로 점마다 (x·scaleX, y·scaleY). 음수 scale은 거울 반전으로 그대로 반영
 */
export function applyTransform(
  d: Layout,
  id: string,
  t: { x: number; y: number; rotation: number; scaleX: number; scaleY: number },
): void {
  const it = findItem(d, id)
  if (!it) return
  it.x = clampCoord(t.x)
  it.y = clampCoord(t.y)
  it.rotation = normAngle(t.rotation)
  const s = it.shape
  if (s.kind === 'rect') {
    s.w = clampLen(s.w * Math.abs(t.scaleX))
    s.h = clampLen(s.h * Math.abs(t.scaleY))
  } else if (s.kind === 'circle') {
    const ax = Math.abs(t.scaleX)
    const ay = Math.abs(t.scaleY)
    const k = Math.abs(ax - 1) >= Math.abs(ay - 1) ? ax : ay
    s.d = clampLen(s.d * k)
  } else if (t.scaleX !== 1 || t.scaleY !== 1) {
    const next = safeScalePolygon(s.points, t.scaleX, t.scaleY)
    if (next) it.shape = { kind: 'polygon', points: next }
  }
}

function copyOf(src: Item, groupId: string | undefined, name: string): Item {
  const c: Item = {
    id: newId(),
    name,
    shape: normalizeShape(src.shape),
    x: clampCoord(src.x + STEP_OFFSET),
    y: clampCoord(src.y + STEP_OFFSET),
    rotation: src.rotation,
    color: src.color,
    category: src.category,
    countsArea: src.countsArea,
  }
  if (src.presetId !== undefined) c.presetId = src.presetId
  if (groupId !== undefined) c.groupId = groupId
  return c
}

/**
 * 복제(§4.7-4·§4.9-4). 복제본은 (+20,+20) 비켜 놓고, 새 id 목록을 배열 순서로 돌려줍니다.
 * 복제본 이름은 언제나 다음 번호입니다(OD-10). 같은 조작에서 먼저 만든 복제본 이름도 셉니다.
 * - scopeGroupId 없음: 블록 단위. 고른 id가 하나라도 든 블록을 통째로 복제해 그 블록 바로 위에 넣습니다.
 *   그룹 블록이면 복제본에 새 groupId를 주고 groups에 추가합니다.
 * - scopeGroupId 있음(그룹 안 편집): 그 그룹 멤버 중 고른 것만, 각 원본 바로 위에 같은 groupId로 넣습니다.
 */
export function duplicateItems(d: Layout, ids: string[], scopeGroupId?: string): string[] {
  const set = new Set(ids)
  const items = itemList(d)
  const next: Item[] = []
  const created: string[] = []
  const names = items.map((it) => it.name)
  const copyName = (src: Item): string => {
    const name = numberedName(names, src.name)
    names.push(name)
    return name
  }

  if (scopeGroupId !== undefined) {
    for (const it of items) {
      next.push(it)
      if (it.groupId === scopeGroupId && set.has(it.id)) {
        const c = copyOf(it, scopeGroupId, copyName(it))
        next.push(c)
        created.push(c.id)
      }
    }
  } else {
    const byId = new Map(items.map((it) => [it.id, it] as const))
    for (const block of groupBlocks(d)) {
      const members = block.ids.map((id) => byId.get(id)).filter((it): it is Item => it !== undefined)
      next.push(...members)
      if (!block.ids.some((id) => set.has(id))) continue
      let gid: string | undefined
      if (block.groupId !== null && members.length >= 2) {
        gid = newId()
        d.groups.push({ id: gid })
      }
      for (const m of members) {
        const c = copyOf(m, gid, copyName(m))
        next.push(c)
        created.push(c.id)
      }
    }
  }

  if (created.length > 0) setItemOrder(d, next)
  return created
}

/** 회전 기준점(§4.6): 1개면 그 물건의 원점, 여러 개면 월드 바운딩 박스 중심. 없으면 [0,0]. */
export function selectionPivot(layout: Layout, ids: string[]): Pt {
  const items = selected(layout, ids)
  const first = items[0]
  if (first === undefined) return [0, 0]
  if (items.length === 1) return [first.x, first.y]
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const it of items) {
    let b: { minX: number; minY: number; maxX: number; maxY: number }
    if (it.shape.kind === 'circle') {
      const r = it.shape.d / 2
      b = { minX: it.x - r, minY: it.y - r, maxX: it.x + r, maxY: it.y + r }
    } else {
      b = ringBBox(worldRing(it))
    }
    minX = Math.min(minX, b.minX)
    minY = Math.min(minY, b.minY)
    maxX = Math.max(maxX, b.maxX)
    maxY = Math.max(maxY, b.maxY)
  }
  return [(minX + maxX) / 2, (minY + maxY) / 2]
}
