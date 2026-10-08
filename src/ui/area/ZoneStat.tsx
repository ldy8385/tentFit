import { formatM2, formatPercent, type StatRow } from '../../core/stats'

export type ZoneTone = 'inner' | 'floor' | 'tent'

/** 구역 한 줄: 이름·점유율(내림 정수 %, 넓이 0이면 '—')·막대·'6.60m² 중'·'남은 3.00m²'(스펙 §6.4) */
export function ZoneStat(p: { row: StatRow; tone: ZoneTone }) {
  const { row } = p
  return (
    <div className="tf-zone" data-zone={row.key}>
      <div className="tf-zone__head">
        <span className={`tf-zone__dot tf-zone__dot--${p.tone}`} aria-hidden="true" />
        <span className="tf-zone__name">{row.name}</span>
        <span className="tf-zone__pct">{formatPercent(row.percent)}</span>
      </div>
      <div className="tf-zone__bar" aria-hidden="true">
        <span className={`tf-zone__fill tf-zone__fill--${p.tone}`} style={{ width: `${row.percent ?? 0}%` }} />
      </div>
      <div className="tf-zone__foot">
        <span>{formatM2(row.area)} 중</span>
        <span>남은 {formatM2(row.free)}</span>
      </div>
    </div>
  )
}
