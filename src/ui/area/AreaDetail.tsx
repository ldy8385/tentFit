import { useMemo } from 'react'
import type { ColorKey } from '../../core/model'
import { formatM2, itemZoneAreas, type ItemZoneArea, type StatRow } from '../../core/stats'
import { useStats, useZones } from '../../app/derived'
import { useDoc } from '../../app/stores'
import { ZoneStat, type ZoneTone } from './ZoneStat'
import './area.css'

function ZoneBlock(p: { row: StatRow; tone: ZoneTone; items: ItemZoneArea[]; colorOf: ReadonlyMap<string, ColorKey> }) {
  return (
    <div className="tf-area-detail__zone">
      <ZoneStat row={p.row} tone={p.tone} />
      {p.items.length > 0 && (
        <ul className="tf-area-detail__items" aria-label={`${p.row.name} 물건`}>
          {p.items.map((it) => {
            const color = p.colorOf.get(it.itemId) ?? 'gray'
            return (
              <li key={it.itemId} className="tf-area-detail__item">
                <span
                  className="tf-area-detail__swatch"
                  aria-hidden="true"
                  style={{ background: `var(--obj-${color}-fill)`, borderColor: `var(--obj-${color})` }}
                />
                <span className="tf-area-detail__iname">{it.name}</span>
                <span className="tf-area-detail__ival">{it.excluded ? '제외' : formatM2(it.area)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/**
 * 면적 상세(스펙 §6.4, D34): 이너 구역들 → 전실(바닥) 조각들 → 합계 3행. 구역마다 그 안의 물건 면적 area(P∩Z),
 * 점유 면적 제외 물건은 '제외'. itemZoneAreas는 이 화면이 열려 있을 때만, 배치가 바뀔 때만 계산합니다(§6.8).
 */
export function AreaDetail() {
  const layout = useDoc((s) => s.layout)
  const zones = useZones()
  const stats = useStats()
  const perZone = useMemo(() => itemZoneAreas(layout, zones), [layout, zones])
  const colorOf = useMemo(() => new Map(layout.items.map((it) => [it.id, it.color] as const)), [layout.items])

  return (
    <div className="tf-area-detail">
      {stats.inners.length > 0 && (
        <section className="tf-area-detail__section" aria-label="이너 구역">
          {stats.inners.map((row) => (
            <ZoneBlock key={row.key} row={row} tone="inner" items={perZone[row.key] ?? []} colorOf={colorOf} />
          ))}
        </section>
      )}
      <section className="tf-area-detail__section" aria-label={`${zones.floorLabel} 구역`}>
        <p className="tf-area-detail__count">
          {zones.floorLabel} 조각 {stats.pieces.length}개
        </p>
        {stats.pieces.map((row) => (
          <ZoneBlock key={row.key} row={row} tone="floor" items={perZone[row.key] ?? []} colorOf={colorOf} />
        ))}
      </section>
      <section className="tf-area-detail__section" aria-label="합계">
        <h3 className="tf-area-detail__h">합계</h3>
        <ZoneStat row={stats.totalInner} tone="inner" />
        <ZoneStat row={stats.totalFloor} tone="floor" />
        <ZoneStat row={stats.totalTent} tone="tent" />
      </section>
      <p className="tf-area-detail__note">겹친 부분은 한 번만 세서 합과 다를 수 있어요</p>
    </div>
  )
}
