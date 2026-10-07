import {
  area,
  inflate,
  intersect,
  labelPoint,
  outerRing,
  pieces,
  region,
  subtract,
  worldRing,
  type Piece,
  type Region,
} from './geom'
import { EPS_AREA, MIN_PIECE_AREA, TOL_CM, type Pt, type Tent } from './model'

/** 이너 구역 Iₖ := (inner_k ∩ O) − ∪_{j<k} Iⱼ (스펙 §6.3) */
export type InnerZone = {
  innerId: string
  /** inner.name 그대로 */
  name: string
  /** Iₖ */
  region: Region
  /** Iₖ⁺ = offset(Iₖ, +0.5cm) — 벽 걸침 판정용(§6.5) */
  plus: Region
  /** Iₖ⁻ = offset(Iₖ, −0.5cm) — 벽 걸침 판정용(§6.5) */
  minus: Region
  /** 이 이너가 차지한 넓이(cm²). 구역 넓이 합 + floorArea = outerArea가 되도록 센 값 */
  area: number
  /** polylabel 위치(cm) */
  label: Pt
}

/** 전실(이너가 없으면 바닥) 조각 하나. MIN_PIECE_AREA 이상인 조각만 만든다. */
export type FloorPiece = { key: string; name: string; region: Region; area: number; label: Pt }

export type Zones = {
  outer: Region
  outerPlus: Region
  outerArea: number
  /** 외곽과 안 겹치는 이너 제외, 배열 순서로 앞 이너가 겹친 부분을 가짐 */
  inners: InnerZone[]
  /** 외곽 − 이너들 */
  floor: Region
  /** area(floor). 100cm² 미만 조각도 포함 */
  floorArea: number
  /** MIN_PIECE_AREA 이상만, 넓이 내림차순, 동률은 centroid y→x 오름차순 */
  pieces: FloorPiece[]
  /** 유효 이너 0개면 '바닥' */
  floorLabel: '전실' | '바닥'
  /** area(inner − outerPlus) > EPS_AREA 인 이너 id (배열 순서) */
  innerEscapes: string[]
}

/** 넓이 내림차순 → 무게중심 y 오름차순 → x 오름차순. 넓이는 정수 연산 결과라 같은 모양이면 정확히 같다. */
function comparePieces(a: Piece, b: Piece): number {
  if (a.area !== b.area) return b.area - a.area
  if (a.centroid[1] !== b.centroid[1]) return a.centroid[1] - b.centroid[1]
  return a.centroid[0] - b.centroid[0]
}

export function buildZones(tent: Tent): Zones {
  const outer = region(outerRing(tent))
  const outerPlus = inflate(outer, TOL_CM)
  const outerArea = area(outer)

  const inners: InnerZone[] = []
  const innerEscapes: string[] = []
  // rest = 외곽 − (지금까지 본 이너들). 처음엔 외곽 전체이고, 마지막에 남은 것이 전실 V다.
  let rest: Region = outer
  let restArea = outerArea

  for (const inner of tent.inners) {
    const raw = region(worldRing(inner))
    if (area(subtract(raw, outerPlus)) > EPS_AREA) innerEscapes.push(inner.id)

    // 외곽과 전혀 겹치지 않는 이너는 구역에서 뺀다(이탈 경고로만 남음).
    if (area(intersect(raw, outer)) <= EPS_AREA) continue

    // Iₖ = (inner_k ∩ O) − ∪_{j<k} Iⱼ = inner_k ∩ rest
    const own = intersect(raw, rest)
    const nextRest = subtract(rest, raw)
    const nextRestArea = area(nextRest)
    // 넓이는 rest가 줄어든 만큼으로 센다. 구역 넓이 합 + 전실 넓이 = 외곽 넓이가 반올림과 상관없이 맞는다
    // (기울어진 벽에서는 교차점 반올림 때문에 area(own)과 수 cm² 다를 수 있음).
    const ownArea = Math.max(0, restArea - nextRestArea)
    inners.push({
      innerId: inner.id,
      name: inner.name,
      region: own,
      plus: inflate(own, TOL_CM),
      minus: inflate(own, -TOL_CM),
      area: ownArea,
      // 앞 이너가 전부 가져가 넓이가 0이면 polylabel 대신 이너 원점을 쓴다.
      label: ownArea > EPS_AREA ? labelPoint(own) : [inner.x, inner.y],
    })
    rest = nextRest
    restArea = nextRestArea
  }

  const floor = rest
  const floorArea = restArea
  const floorLabel: Zones['floorLabel'] = inners.length === 0 ? '바닥' : '전실'

  const floorPieces: FloorPiece[] = pieces(floor)
    .filter((p) => p.area >= MIN_PIECE_AREA)
    .sort(comparePieces)
    .map((p, i) => ({
      key: `piece-${i}`,
      name: `${floorLabel} ${i + 1}`,
      region: p.region,
      area: p.area,
      label: labelPoint(p.region),
    }))

  return { outer, outerPlus, outerArea, inners, floor, floorArea, pieces: floorPieces, floorLabel, innerEscapes }
}
