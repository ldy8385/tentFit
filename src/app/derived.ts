// 문서에서 계산하는 값의 메모(스펙 §6.8). immer는 바뀌지 않은 부분의 참조를 그대로 두므로,
// 같은 참조면 같은 결과 객체를 돌려줍니다(React 구독이 같은 값을 받아 다시 그리지 않음).
import type { Item, Layout, Tent } from '../core/model'
import { computeStats, type Stats } from '../core/stats'
import { buildZones, type Zones } from '../core/zones'
import { useDoc } from './stores'

const zonesByTent = new WeakMap<Tent, Zones>()
// 통계는 tent와 items에만 의존합니다(computeStats). 이름·updatedAt만 바뀐 배치에서는 다시 계산하지 않도록
// items 배열 → tent 순서의 두 단계 WeakMap에 둡니다.
const statsByItems = new WeakMap<Item[], WeakMap<Tent, Stats>>()

/** layout.tent 참조가 같으면 같은 Zones 객체 */
export function getZones(layout: Layout): Zones {
  let z = zonesByTent.get(layout.tent)
  if (z === undefined) {
    z = buildZones(layout.tent)
    zonesByTent.set(layout.tent, z)
  }
  return z
}

/** layout.items와 layout.tent 참조가 같으면 같은 Stats 객체. 구역은 getZones를 씁니다. */
export function getStats(layout: Layout): Stats {
  let byTent = statsByItems.get(layout.items)
  if (byTent === undefined) {
    byTent = new WeakMap()
    statsByItems.set(layout.items, byTent)
  }
  let s = byTent.get(layout.tent)
  if (s === undefined) {
    s = computeStats(layout, getZones(layout))
    byTent.set(layout.tent, s)
  }
  return s
}

export function useZones(): Zones {
  return useDoc((s) => getZones(s.layout))
}

export function useStats(): Stats {
  return useDoc((s) => getStats(s.layout))
}
