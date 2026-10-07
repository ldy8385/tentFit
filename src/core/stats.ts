import { area, intersect, region, subtract, unionAll, worldRing, type Region } from './geom'
import { EPS_AREA, type Layout, type Pt } from './model'
import { buildZones, type Zones } from './zones'

/** straddles = 벽에 걸친 이너 id(zones.inners 순서) */
export type ItemWarning = { outside: boolean; straddles: string[] }

/**
 * 물건 하나의 경고(스펙 §6.5, 5mm 허용).
 * - 밖으로 나감: area(P − O⁺) > ε (모든 물건)
 * - 이너 k 벽 걸침: area(P ∩ Iₖ⁻) > ε 그리고 area((P ∩ O) − Iₖ⁺) > ε (countsArea=true 물건만, O1)
 * 끄는 동안 매 프레임 부르므로 zones는 호출하는 쪽이 메모해 둔다.
 */
export function itemWarnings(ring: Pt[], countsArea: boolean, zones: Zones): ItemWarning {
  const p = region(ring)
  const outside = area(subtract(p, zones.outerPlus)) > EPS_AREA
  const straddles: string[] = []
  if (countsArea && zones.inners.length > 0) {
    // 텐트 밖으로 나간 부분은 걸침 판정에서 뺀다(외곽과 벽을 공유하는 곳에서는 "나감"만 뜸).
    const inside = intersect(p, zones.outer)
    for (const z of zones.inners) {
      if (area(intersect(p, z.minus)) > EPS_AREA && area(subtract(inside, z.plus)) > EPS_AREA) {
        straddles.push(z.innerId)
      }
    }
  }
  return { outside, straddles }
}

export type StatRow = { key: string; name: string; area: number; occupied: number; free: number; percent: number | null }

export type Stats = {
  inners: StatRow[]
  pieces: StatRow[]
  /** 이름: '이너 전체', `${floorLabel} 전체`, '텐트 전체'. key: 'total-inner', 'total-floor', 'total-tent' */
  totalInner: StatRow
  totalFloor: StatRow
  totalTent: StatRow
  /** 경고가 1개 이상인 물건만 */
  warnings: Record<string, ItemWarning>
  innerEscapes: string[]
  /** 경고 물건 수 + 이탈 이너 수 */
  warningCount: number
}

/** 점유율(정수 %, 내림). area ≤ ε → null, 남은 넓이 ≤ ε → 100, 그 외 floor(0~99). */
export function percentOf(occupied: number, area: number): number | null {
  if (!(area > EPS_AREA)) return null
  if (area - occupied <= EPS_AREA) return 100
  const p = Math.floor((occupied / area) * 100)
  return Math.min(99, Math.max(0, p))
}

/** null → '—', 그 외 `${p}%` */
export function formatPercent(p: number | null): string {
  return p === null ? '—' : `${p}%`
}

/** cm² → m² 소수 둘째 자리. 예: 12000 → '1.20m²'. '-0.00'은 만들지 않는다. */
export function formatM2(cm2: number): string {
  const m2 = Math.round(cm2 / 100) / 100
  return `${(m2 === 0 ? 0 : m2).toFixed(2)}m²`
}

function row(key: string, name: string, zoneArea: number, occupiedRaw: number): StatRow {
  const a = Math.max(0, zoneArea)
  // 정수 반올림 때문에 아주 조금 넘칠 수 있어 [0, a]로 자른다.
  const occupied = Math.min(a, Math.max(0, occupiedRaw))
  return { key, name, area: a, occupied, free: a - occupied, percent: percentOf(occupied, a) }
}

function sum(values: number[]): number {
  return values.reduce((s, v) => s + v, 0)
}

/**
 * 구역별 점유율·남은 넓이·경고(스펙 §6.4·§6.5).
 * 점유 영역 F = ∪{ countsArea 물건 }(겹친 곳은 한 번), 구역 Z의 점유 = area(F ∩ Z).
 * 텐트 밖으로 나간 부분은 어느 구역에도 들어가지 않는다.
 */
export function computeStats(layout: Layout, zones: Zones = buildZones(layout.tent)): Stats {
  const warnings: Record<string, ItemWarning> = {}
  const occupiedRegions: Region[] = []
  for (const item of layout.items) {
    const ring = worldRing(item)
    if (item.countsArea) occupiedRegions.push(region(ring))
    const w = itemWarnings(ring, item.countsArea, zones)
    if (w.outside || w.straddles.length > 0) warnings[item.id] = w
  }

  const filled = unionAll(occupiedRegions)
  const occupiedIn = (z: Region): number => area(intersect(filled, z))

  const inners = zones.inners.map((z) => row(z.innerId, z.name, z.area, occupiedIn(z.region)))
  const pieces = zones.pieces.map((p) => row(p.key, p.name, p.area, occupiedIn(p.region)))
  // 이너 구역들은 서로 겹치지 않으므로 합이 곧 합집합이다.
  const totalInner = row(
    'total-inner',
    '이너 전체',
    sum(inners.map((r) => r.area)),
    sum(inners.map((r) => r.occupied)),
  )
  const totalFloor = row('total-floor', `${zones.floorLabel} 전체`, zones.floorArea, occupiedIn(zones.floor))
  const totalTent = row('total-tent', '텐트 전체', zones.outerArea, occupiedIn(zones.outer))
  const innerEscapes = [...zones.innerEscapes]

  return {
    inners,
    pieces,
    totalInner,
    totalFloor,
    totalTent,
    warnings,
    innerEscapes,
    warningCount: Object.keys(warnings).length + innerEscapes.length,
  }
}

/** 면적 상세의 물건 행 하나(OD-16). area = area(물건 ∩ 구역), cm² */
export type ItemZoneArea = { itemId: string; name: string; area: number; excluded: boolean }

/**
 * 구역별 물건 면적(OD-16). key는 이너 행(innerId)·조각 행(FloorPiece.key)의 StatRow.key와 같습니다.
 * - 이너 벽에 걸친 물건은 두 구역에 나뉘어 나오고, 텐트 밖으로 나간 부분은 어디에도 없습니다.
 * - 넓이가 EPS_AREA 이하인 구역에는 넣지 않습니다. 물건이 없는 구역은 빈 배열입니다.
 * - countsArea=false 물건도 넓이를 계산해 excluded: true로 넣습니다(화면은 「제외」).
 * - 물건끼리 겹친 부분은 행마다 따로 세므로, 물건 행의 합은 구역 점유(합집합)와 다를 수 있습니다.
 * 각 목록은 넓이 내림차순이고, 같으면 배열 순서입니다.
 */
export function itemZoneAreas(layout: Layout, zones: Zones = buildZones(layout.tent)): Record<string, ItemZoneArea[]> {
  const targets: Array<{ key: string; region: Region; rows: ItemZoneArea[] }> = [
    ...zones.inners.map((z) => ({ key: z.innerId, region: z.region, rows: [] as ItemZoneArea[] })),
    ...zones.pieces.map((p) => ({ key: p.key, region: p.region, rows: [] as ItemZoneArea[] })),
  ]
  for (const item of layout.items) {
    const p = region(worldRing(item))
    for (const t of targets) {
      const a = area(intersect(p, t.region))
      if (a > EPS_AREA) t.rows.push({ itemId: item.id, name: item.name, area: a, excluded: !item.countsArea })
    }
  }
  const out: Record<string, ItemZoneArea[]> = {}
  // Array.prototype.sort는 안정 정렬이라 넓이가 같으면 배열 순서가 유지됩니다.
  for (const t of targets) out[t.key] = t.rows.sort((a, b) => b.area - a.area)
  return out
}
