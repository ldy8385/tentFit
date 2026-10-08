import { useEffect } from 'react'
import { useStats } from '../../app/derived'
import { useStores, useUi } from '../../app/stores'
import { AreaDetail } from './AreaDetail'
import { DangerIcon } from './icons'
import { ZoneStat } from './ZoneStat'
import './area.css'

/**
 * PC 오른쪽 아래 면적 현황(스펙 §4.1). 접힌 상태: 이너 전체·전실(바닥) 전체 + '경고 N건 [보기]'.
 * 펼치면(ui.areaExpanded) 그 자리에 AreaDetail. 펼친 채로 선택이 생기면 자동으로 접습니다.
 */
export function AreaSummary() {
  const { ui } = useStores()
  const stats = useStats()
  const expanded = useUi((s) => s.areaExpanded)

  useEffect(
    () =>
      ui.subscribe((s, prev) => {
        if (s.selection !== prev.selection && s.selection.length > 0 && s.areaExpanded) s.patch({ areaExpanded: false })
      }),
    [ui],
  )

  const n = stats.warningCount
  return (
    <section className="tf-area" aria-label="면적 현황" data-expanded={expanded ? 'true' : 'false'}>
      <header className="tf-area__head">
        <h2 className="tf-area__title">면적 현황</h2>
        <button
          type="button"
          className="tf-area__toggle"
          aria-expanded={expanded}
          onClick={() => ui.getState().patch({ areaExpanded: !expanded })}
        >
          {expanded ? '접기' : '자세히'}
        </button>
      </header>
      <div className="tf-area__body">
        {expanded ? (
          <AreaDetail />
        ) : (
          <>
            <ZoneStat row={stats.totalInner} tone="inner" />
            <ZoneStat row={stats.totalFloor} tone="floor" />
          </>
        )}
      </div>
      {n > 0 ? (
        <button type="button" className="tf-area__warn" onClick={() => ui.getState().patch({ desktopPanel: 'warnings' })}>
          <DangerIcon />
          <span className="tf-area__warn-text">경고 {n}건</span>
          <span className="tf-area__warn-go">보기</span>
        </button>
      ) : (
        <p className="tf-area__ok">경고 없음</p>
      )}
    </section>
  )
}
