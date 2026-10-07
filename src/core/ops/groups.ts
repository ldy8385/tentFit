// 그룹 규칙(스펙 §4.9·§5.3-1·2). Task 7에서는 normalizeGroups와 groupBlocks만 둡니다(Task 8에서 전체를 다시 씀).
import type { Item, Layout } from '../model'
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
