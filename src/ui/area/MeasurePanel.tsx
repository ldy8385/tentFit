// 거리 재기 목록(Plan 5, 스펙 §6.7 측정 목록, 2026-10-15). PC는 오른쪽 위 패널, 휴대폰은 캔버스 아래 막대.
// 행 = 거리와 「A → B」, 개별 ×, 아래에 [모두 지우기]·[끝내기]. 첫 대상을 고른 동안에는 [취소].
import type { JSX } from 'react'
import { cancelMeasureFirst, clearMeasurements, endMeasuring, measurementRows, removeMeasurement } from '../../app/measureActions'
import { useDoc, useStores, useUi } from '../../app/stores'
import '../panels/panels.css'
import './measure.css'

export const MEASURE_GUIDE = '대상 두 개를 누르면 가장 가까운 거리가 나와요(벽·물건·꼭짓점·빈 곳)'

export function MeasurePanel(p: { variant: 'panel' | 'bar' }): JSX.Element {
  const stores = useStores()
  const layout = useDoc((s) => s.layout)
  const list = useUi((s) => s.measurements)
  const first = useUi((s) => s.measureFirst)
  const rows = measurementRows(layout, list)
  return (
    <section className={p.variant === 'panel' ? 'tf-panel tf-measure' : 'tf-measure tf-measure--bar'} aria-label="거리 재기" data-testid="measure-panel">
      <h2 className="tf-panel__title">{rows.length === 0 ? '거리 재기' : `측정 ${rows.length}개`}</h2>
      <p className="tf-hint">{first !== null ? '둘째 대상을 누르세요' : MEASURE_GUIDE}</p>
      {rows.length > 0 && (
        <ul className="tf-measure__list">
          {rows.map((r) => (
            <li key={r.id} className="tf-measure__row">
              <span className="tf-measure__dist">{r.label}</span>
              <span className="tf-measure__pair">
                {r.aName} → {r.bName}
              </span>
              <button
                type="button"
                className="tf-measure__del"
                aria-label={`${r.aName} → ${r.bName} 지우기`}
                onClick={() => removeMeasurement(stores, r.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="tf-row2">
        {first !== null ? (
          <button type="button" className="tf-btn" onClick={() => cancelMeasureFirst(stores)}>
            취소
          </button>
        ) : (
          <button type="button" className="tf-btn" disabled={rows.length === 0} onClick={() => clearMeasurements(stores)}>
            모두 지우기
          </button>
        )}
        <button type="button" className="tf-btn tf-btn--primary" onClick={() => endMeasuring(stores)}>
          끝내기
        </button>
      </div>
    </section>
  )
}
