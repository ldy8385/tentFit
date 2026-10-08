import { formatPercent } from '../../core/stats'
import { useStats, useZones } from '../../app/derived'
import { useStores } from '../../app/stores'
import { DangerIcon } from './icons'
import './area.css'

/** 누름 영역 44px(스펙 §4.2 '⚠ 부분 44px 이상'). 보이는 칩은 CSS로 38px 높이처럼 보이게 둡니다. */
const HIT_44 = { minWidth: 44, minHeight: 44 } as const

/**
 * 모바일 캔버스 위 요약 칩(스펙 §4.2): '이너 55% · 전실 10%'를 누르면 면적 상세 시트, ⚠N(44px)을 누르면 경고 시트.
 * 캔버스 영역(position: relative) 위쪽 가운데에 스스로 붙습니다. 경고가 0건이면 ⚠ 부분을 숨깁니다.
 */
export function SummaryChip() {
  const { ui } = useStores()
  const stats = useStats()
  const { floorLabel } = useZones()
  const inner = formatPercent(stats.totalInner.percent)
  const floor = formatPercent(stats.totalFloor.percent)
  const n = stats.warningCount
  return (
    <div className="tf-summary-chip" role="group" aria-label="면적 요약">
      <button
        type="button"
        className="tf-summary-chip__main"
        style={HIT_44}
        aria-label={`면적 현황 열기, 이너 ${inner}, ${floorLabel} ${floor}`}
        onClick={() => ui.getState().patch({ mobileSheet: 'area' })}
      >
        <span>
          이너 <b>{inner}</b>
        </span>
        <span className="tf-summary-chip__sep" aria-hidden="true">
          ·
        </span>
        <span>
          {floorLabel} <b>{floor}</b>
        </span>
      </button>
      {n > 0 && (
        <button
          type="button"
          className="tf-summary-chip__warn"
          style={HIT_44}
          aria-label={`경고 ${n}건 보기`}
          onClick={() => ui.getState().patch({ mobileSheet: 'warnings' })}
        >
          <DangerIcon size={14} />
          <b>{n}</b>
        </button>
      )}
    </div>
  )
}
