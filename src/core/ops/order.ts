// 순서 바꾸기(스펙 §4.9-3). 배열 뒤쪽이 위(앞)입니다.
import type { Item, Layout } from '../model'
import { groupBlocks } from './groups'
import { itemList, setItemOrder } from './util'

export type OrderOp = 'front' | 'forward' | 'backward' | 'back'

type Unit = { items: Item[]; selected: boolean }

function moveUnits(units: Unit[], op: OrderOp): Unit[] {
  const u = units.slice()
  switch (op) {
    case 'front':
      // 떨어져 있는 여러 개를 맨 앞으로: 상대 순서를 유지하며 모읍니다.
      return [...u.filter((x) => !x.selected), ...u.filter((x) => x.selected)]
    case 'back':
      return [...u.filter((x) => x.selected), ...u.filter((x) => !x.selected)]
    case 'forward':
      // 위에서부터 훑어 고른 단위를 바로 위의 고르지 않은 단위와 맞바꿉니다. 이어 붙은 단위는 함께 한 칸 오릅니다.
      for (let i = u.length - 2; i >= 0; i--) {
        const a = u[i]
        const b = u[i + 1]
        if (a !== undefined && b !== undefined && a.selected && !b.selected) {
          u[i] = b
          u[i + 1] = a
        }
      }
      return u
    case 'backward':
      for (let i = 1; i < u.length; i++) {
        const a = u[i]
        const b = u[i - 1]
        if (a !== undefined && b !== undefined && a.selected && !b.selected) {
          u[i] = b
          u[i - 1] = a
        }
      }
      return u
  }
}

/**
 * - scopeGroupId 없음: 그룹 블록이 한 단위입니다. 고른 id가 든 블록이 움직이고, 이웃 그룹 블록은 통째로 건너뜁니다.
 * - scopeGroupId 있음(그룹 안 편집): 그 그룹 멤버끼리만 자리를 바꿉니다. 블록 밖은 그대로입니다.
 * 결과가 같으면 draft를 건드리지 않습니다.
 */
export function reorder(d: Layout, ids: string[], op: OrderOp, scopeGroupId?: string): void {
  const set = new Set(ids)
  const items = itemList(d)

  if (scopeGroupId !== undefined) {
    const slots: number[] = []
    items.forEach((it, i) => {
      if (it.groupId === scopeGroupId) slots.push(i)
    })
    const units = slots.flatMap((i) => {
      const it = items[i]
      return it === undefined ? [] : [{ items: [it], selected: set.has(it.id) }]
    })
    const moved = moveUnits(units, op).flatMap((x) => x.items)
    const next = items.slice()
    slots.forEach((slot, k) => {
      const it = moved[k]
      if (it !== undefined) next[slot] = it
    })
    setItemOrder(d, next)
    return
  }

  const byId = new Map(items.map((it) => [it.id, it] as const))
  const units: Unit[] = groupBlocks(d).map((b) => ({
    items: b.ids.map((id) => byId.get(id)).filter((it): it is Item => it !== undefined),
    selected: b.ids.some((id) => set.has(id)),
  }))
  setItemOrder(d, moveUnits(units, op).flatMap((x) => x.items))
}
