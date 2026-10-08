// 범위 선택(스펙 §4.5·§4.9-5)과 물건의 월드 bbox. 순수 함수입니다.
import { ringBBox, worldRing } from '../../core/geom'
import type { Layout, Shape } from '../../core/model'
import type { BBox } from '../viewport'

/** 물건(또는 이너)의 월드 bbox(cm). 원은 근사 다각형이 아니라 정확한 원의 bbox입니다. */
export function itemWorldBBox(item: { shape: Shape; x: number; y: number; rotation: number }): BBox {
  if (item.shape.kind === 'circle') {
    const r = item.shape.d / 2
    return { minX: item.x - r, minY: item.y - r, maxX: item.x + r, maxY: item.y + r }
  }
  return ringBBox(worldRing(item))
}

/** 두 모서리로 만든 bbox(어느 방향으로 끌어도 같음). */
export function rectFromCorners(x0: number, y0: number, x1: number, y1: number): BBox {
  return { minX: Math.min(x0, x1), minY: Math.min(y0, y1), maxX: Math.max(x0, x1), maxY: Math.max(y0, y1) }
}

function contains(outer: BBox, inner: BBox): boolean {
  return inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY
}

/**
 * rect(월드 cm) 안에 완전히 들어간 물건 id(배열 순서).
 * - 그룹 멤버는 그 그룹의 모든 멤버가 들어갈 때만 고릅니다(§4.9-5).
 * - 그룹 안 편집(scopeGroupId)이면 그 그룹 멤버만, 하나씩 고릅니다(그룹 밖은 흐려져 고를 수 없음).
 */
export function itemsInRect(layout: Layout, rect: BBox, scopeGroupId: string | null): string[] {
  const inside = new Set(layout.items.filter((it) => contains(rect, itemWorldBBox(it))).map((it) => it.id))
  if (scopeGroupId !== null) {
    return layout.items.filter((it) => it.groupId === scopeGroupId && inside.has(it.id)).map((it) => it.id)
  }
  const partialGroups = new Set<string>()
  for (const it of layout.items) {
    if (it.groupId !== undefined && !inside.has(it.id)) partialGroups.add(it.groupId)
  }
  return layout.items
    .filter((it) => inside.has(it.id) && (it.groupId === undefined || !partialGroups.has(it.groupId)))
    .map((it) => it.id)
}
