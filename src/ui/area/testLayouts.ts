// 면적·경고 컴포넌트 테스트용 배치(테스트에서만 import).
import { createLayout, type Item, type Layout, type Tent } from '../../core/model'
import { loadGenericTents } from '../../app/presets'

function tentOf(id: string): Tent {
  const preset = loadGenericTents().find((t) => t.id === id)
  if (preset === undefined) throw new Error(`프리셋 없음: ${id}`)
  return preset.tent
}

/** 터널 4인 예시: 외곽 620×320(x −310~310, y −160~160), 이너 220×300 @(−200,0)(x −310~−90, y −150~150) */
export function tunnelLayout(items: Item[] = []): Layout {
  return { ...createLayout(tentOf('generic/tunnel-4p'), { name: '터널 배치', id: 'L-tunnel', now: '2026-10-08T00:00:00.000Z' }), items }
}

/** 티피 6각 예시: 이너 없음 → 바닥 구역 하나 */
export function tipiLayout(items: Item[] = []): Layout {
  return { ...createLayout(tentOf('generic/tipi-hex'), { name: '티피 배치', id: 'L-tipi', now: '2026-10-08T00:00:00.000Z' }), items }
}

export function rectItem(
  id: string,
  name: string,
  x: number,
  y: number,
  opts: { w?: number; h?: number; countsArea?: boolean; groupId?: string } = {},
): Item {
  const item: Item = {
    id,
    name,
    shape: { kind: 'rect', w: opts.w ?? 200, h: opts.h ?? 60 },
    x,
    y,
    rotation: 0,
    color: 'green',
    category: 'MAT',
    countsArea: opts.countsArea ?? true,
  }
  if (opts.groupId !== undefined) item.groupId = opts.groupId
  return item
}
