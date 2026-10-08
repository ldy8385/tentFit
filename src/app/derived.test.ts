import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { createLayout, type Item, type Layout } from '../core/model'
import { moveItems } from '../core/ops/items'
import { computeStats } from '../core/stats'
import { buildZones } from '../core/zones'
import { getStats, getZones } from './derived'

const NOW = '2026-10-08T00:00:00.000Z'

/** 터널 4인 예시와 같은 모양: 외곽 620×320, 왼쪽 이너 220×300 */
function tunnel(items: Item[] = []): Layout {
  const layout = createLayout(
    {
      name: '터널 4인 예시',
      outer: { kind: 'rect', w: 620, h: 320 },
      inners: [{ id: 'in1', name: '이너 1', shape: { kind: 'rect', w: 220, h: 300 }, x: -200, y: 0, rotation: 0 }],
    },
    { name: '터널 4인 예시 배치', id: 'L1', now: NOW },
  )
  layout.items = items
  return layout
}

const MAT: Item = {
  id: 'mat',
  name: '매트',
  shape: { kind: 'rect', w: 200, h: 60 },
  x: -200,
  y: 0,
  rotation: 0,
  color: 'blue',
  category: 'MAT',
  countsArea: true,
}

describe('getZones', () => {
  it('같은 tent 참조면 같은 Zones 객체를 돌려준다', () => {
    const a = tunnel([MAT])
    const moved = produce(a, (d) => {
      moveItems(d, ['mat'], 10, 0)
    })
    expect(moved).not.toBe(a)
    expect(moved.tent).toBe(a.tent)
    expect(getZones(moved)).toBe(getZones(a))
  })

  it('tent가 바뀌면 새로 계산한다', () => {
    const a = tunnel()
    const b = produce(a, (d) => {
      d.tent.inners = []
    })
    const za = getZones(a)
    const zb = getZones(b)
    expect(zb).not.toBe(za)
    expect(za.floorLabel).toBe('전실')
    expect(zb.floorLabel).toBe('바닥')
  })

  it('값은 buildZones와 같다', () => {
    const a = tunnel()
    const z = getZones(a)
    const fresh = buildZones(a.tent)
    expect(z.outerArea).toBe(fresh.outerArea)
    expect(z.inners.map((i) => i.area)).toEqual(fresh.inners.map((i) => i.area))
    expect(z.pieces.map((p) => p.area)).toEqual(fresh.pieces.map((p) => p.area))
  })
})

describe('getStats', () => {
  it('같은 배치면 같은 Stats 객체, 값은 computeStats와 같다', () => {
    const a = tunnel([MAT])
    const s = getStats(a)
    expect(getStats(a)).toBe(s)
    const fresh = computeStats(a)
    expect(s.totalInner).toEqual(fresh.totalInner)
    expect(s.totalFloor).toEqual(fresh.totalFloor)
    expect(s.warningCount).toBe(fresh.warningCount)
  })

  it('이름·updatedAt만 바뀌면(items·tent 참조 같음) 다시 계산하지 않는다', () => {
    const a = tunnel([MAT])
    const renamed = produce(a, (d) => {
      d.name = '새 이름'
      d.updatedAt = '2026-10-08T01:00:00.000Z'
    })
    expect(renamed.items).toBe(a.items)
    expect(getStats(renamed)).toBe(getStats(a))
  })

  it('물건이 바뀌면 새로 계산하고 구역은 그대로 쓴다', () => {
    const a = tunnel([MAT])
    const moved = produce(a, (d) => {
      moveItems(d, ['mat'], 400, 0)
    })
    const sa = getStats(a)
    const sb = getStats(moved)
    expect(sb).not.toBe(sa)
    expect(getZones(moved)).toBe(getZones(a))
    // 매트가 이너(왼쪽)에서 전실(오른쪽)로 옮겨 감
    expect(sa.totalInner.occupied).toBe(12000)
    expect(sb.totalInner.occupied).toBe(0)
    expect(sb.totalFloor.occupied).toBe(12000)
  })
})
