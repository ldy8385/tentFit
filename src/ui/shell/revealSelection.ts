// 시트가 열리면 선택한 물건이 시트 위쪽 영역에 보이도록 화면을 옮깁니다(스펙 §4.2 "시트와 화면 위치").
// 확대 배율은 바꾸지 않고 위치만 옮깁니다. 이미 보이면 null.
import { ringBBox, worldRing } from '../../core/geom'
import type { Layout } from '../../core/model'
import { worldToScreen, type BBox, type Insets, type Size, type View } from '../../view/viewport'

/** 보이는 영역 가장자리와 물건 사이에 남길 여백(px) */
export const REVEAL_MARGIN_PX = 16

/** 선택한 물건들의 월드 바운딩 박스. 선택이 비었거나 없는 id뿐이면 null */
export function selectionBBox(layout: Layout, ids: readonly string[]): BBox | null {
  const set = new Set(ids)
  let box: BBox | null = null
  for (const it of layout.items) {
    if (!set.has(it.id)) continue
    const b = ringBBox(worldRing(it))
    box =
      box === null
        ? { ...b }
        : {
            minX: Math.min(box.minX, b.minX),
            minY: Math.min(box.minY, b.minY),
            maxX: Math.max(box.maxX, b.maxX),
            maxY: Math.max(box.maxY, b.maxY),
          }
  }
  return box
}

/** 한 축에서 [a0,a1]을 [lo,hi] 안으로 넣는 이동량. 구간보다 크면 가운데를 맞춥니다. */
function axisShift(a0: number, a1: number, lo: number, hi: number): number {
  if (a1 - a0 > hi - lo) return (lo + hi) / 2 - (a0 + a1) / 2
  if (a0 < lo) return lo - a0
  if (a1 > hi) return hi - a1
  return 0
}

/** box(월드)가 시트·배너를 뺀 보이는 영역 안에 들도록 옮긴 보기. 옮길 필요가 없거나 영역이 없으면 null */
export function revealView(view: View, size: Size, insets: Insets, box: BBox, margin = REVEAL_MARGIN_PX): View | null {
  const left = margin
  const right = size.width - margin
  const top = insets.top + margin
  const bottom = size.height - insets.bottom - margin
  if (right <= left || bottom <= top) return null
  const [x0, y0] = worldToScreen(view, [box.minX, box.minY])
  const [x1, y1] = worldToScreen(view, [box.maxX, box.maxY])
  const dx = axisShift(x0, x1, left, right)
  const dy = axisShift(y0, y1, top, bottom)
  if (dx === 0 && dy === 0) return null
  return { zoom: view.zoom, panX: view.panX + dx, panY: view.panY + dy }
}
