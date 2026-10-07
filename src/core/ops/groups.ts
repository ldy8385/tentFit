// 그룹 규칙(스펙 §4.9·§5.3-1·2). 그룹은 한 단계까지만이고 위치·회전값이 없습니다(D9).
// 바꾸는 함수는 immer draft를 직접 고치는 레시피입니다. groupItems는 값을 돌려주므로 produce 본문을 중괄호로 감쌉니다.
import { newId, type Item, type Layout } from '../model'
import { itemList, setItemOrder } from './util'

export type GroupBlock = { groupId: string | null; ids: string[] }

/** 배열 순서대로 블록을 나눕니다. 같은 groupId가 이어진 구간이 블록 하나, 그룹 없는 물건은 1개짜리 블록입니다. */
export function groupBlocks(layout: Layout): GroupBlock[] {
  const blocks: GroupBlock[] = []
  let cur: GroupBlock | null = null
  for (const it of itemList(layout)) {
    const gid = it.groupId ?? null
    if (gid !== null && cur !== null && cur.groupId === gid) {
      cur.ids.push(it.id)
    } else {
      cur = { groupId: gid, ids: [it.id] }
      blocks.push(cur)
    }
  }
  return blocks
}

/**
 * 선택을 그룹 단위로 넓힙니다(§4.9-1). 결과는 배열 순서이고 중복·없는 id는 빠집니다.
 * scopeGroupId(그룹 안 편집)가 있으면 넓히지 않고, 그 그룹 멤버인 id만 남깁니다.
 */
export function expandSelection(layout: Layout, ids: string[], scopeGroupId?: string): string[] {
  const set = new Set(ids)
  const items = itemList(layout)
  if (scopeGroupId !== undefined) {
    return items.filter((it) => it.groupId === scopeGroupId && set.has(it.id)).map((it) => it.id)
  }
  const groups = new Set<string>()
  for (const it of items) {
    if (set.has(it.id) && it.groupId !== undefined) groups.add(it.groupId)
  }
  return items
    .filter((it) => set.has(it.id) || (it.groupId !== undefined && groups.has(it.groupId)))
    .map((it) => it.id)
}

/** 그룹마다 멤버를 가장 위(배열 뒤쪽) 멤버 자리로 모읍니다. 상대 순서와 다른 물건의 순서는 그대로입니다. */
function gatherGroups(d: Layout): void {
  const items = itemList(d)
  const top = new Map<string, number>()
  const members = new Map<string, Item[]>()
  items.forEach((it, i) => {
    if (it.groupId === undefined) return
    top.set(it.groupId, i)
    const list = members.get(it.groupId)
    if (list) list.push(it)
    else members.set(it.groupId, [it])
  })
  const next: Item[] = []
  items.forEach((it, i) => {
    if (it.groupId === undefined) next.push(it)
    else if (top.get(it.groupId) === i) next.push(...(members.get(it.groupId) ?? []))
  })
  setItemOrder(d, next)
}

/**
 * 묶기(§4.9-2). 고른 물건이 속한 기존 그룹은 통째로 흡수해 새 그룹 1개로 만들고,
 * 멤버를 가장 위 멤버 자리로 모읍니다(상대 순서 유지). 새 group id를 돌려줍니다.
 * 넓힌 뒤 물건이 2개 미만이면 아무것도 바꾸지 않고 ''를 돌려줍니다.
 */
export function groupItems(d: Layout, ids: string[]): string {
  const members = new Set(expandSelection(d, ids))
  if (members.size < 2) return ''
  const chosen = itemList(d).filter((it) => members.has(it.id))
  const already = chosen[0]?.groupId
  if (already !== undefined && chosen.every((it) => it.groupId === already)) return already // 이미 그 그룹 하나
  const absorbed = new Set<string>()
  const gid = newId()
  for (const it of itemList(d)) {
    if (!members.has(it.id)) continue
    if (it.groupId !== undefined) absorbed.add(it.groupId)
    it.groupId = gid
  }
  for (let i = d.groups.length - 1; i >= 0; i--) {
    const g = d.groups[i]
    if (g !== undefined && absorbed.has(g.id)) d.groups.splice(i, 1)
  }
  d.groups.push({ id: gid })
  gatherGroups(d)
  return gid
}

/** 그룹 해제. 멤버의 배열 위치는 그대로입니다. */
export function ungroup(d: Layout, groupId: string): void {
  for (const it of itemList(d)) {
    if (it.groupId === groupId) delete it.groupId
  }
  for (let i = d.groups.length - 1; i >= 0; i--) {
    if (d.groups[i]?.id === groupId) d.groups.splice(i, 1)
  }
}

/**
 * 그룹 불변식을 맞춥니다.
 * 1) 그룹 목록의 중복 id를 하나로 2) 목록에 없는 groupId 참조 제거 3) 멤버 1개 그룹 해제
 * 4) 멤버 0개 그룹 삭제 5) 흩어진 멤버를 가장 위 멤버 자리로 모음.
 * 고칠 것이 없으면 draft를 건드리지 않습니다.
 */
export function normalizeGroups(d: Layout): void {
  const known = new Set<string>()
  for (let i = 0; i < d.groups.length; ) {
    const g = d.groups[i]
    if (g === undefined || known.has(g.id)) {
      d.groups.splice(i, 1)
    } else {
      known.add(g.id)
      i++
    }
  }

  const items = itemList(d)
  for (const it of items) {
    if (it.groupId !== undefined && !known.has(it.groupId)) delete it.groupId
  }

  const count = new Map<string, number>()
  for (const it of items) {
    if (it.groupId !== undefined) count.set(it.groupId, (count.get(it.groupId) ?? 0) + 1)
  }
  for (const it of items) {
    if (it.groupId !== undefined && (count.get(it.groupId) ?? 0) < 2) delete it.groupId
  }
  for (let i = d.groups.length - 1; i >= 0; i--) {
    const g = d.groups[i]
    if (g !== undefined && (count.get(g.id) ?? 0) < 2) d.groups.splice(i, 1)
  }

  gatherGroups(d)
}
