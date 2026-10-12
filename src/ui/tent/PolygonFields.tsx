// 자유 다각형 대상의 cm 칸(설계 2026-10-12 §2.3, Plan 4.1). 문서 동작은 app/tentActions만 부릅니다.
// - 전체 크기(가로·세로): 그 축만 bbox 가운데 기준 비율로.
// - 변 길이 표: 「변 1」…「변 n−1」 입력, 「변 n」(닫는 변)은 계산값(읽기 전용 「자동」).
// - 꼭짓점 각도(접힘): 「꼭짓점 2」…「꼭짓점 n−1」 입력, 1·n은 계산값.
// 계산은 대상의 로컬 좌표(이너는 회전 전)라 표시 길이·각도는 회전과 무관합니다. UI 번호는 1부터, 코드 번호는 0부터.
// 칸 targetId는 '<대상>@<종류><번호>'라 포커스 뒤 대상이 바뀌어도 포커스 때 대상에 반영됩니다(useDraftField 규칙).
import { useState, type JSX } from 'react'
import { useStores } from '../../app/stores'
import type { PolygonFocus } from '../../store/ui'
import { setTargetEdgeLength, setTargetSize, setTargetVertexAngle, type EditResult } from '../../app/tentActions'
import { ringBBox } from '../../core/geom'
import { LIMITS, round1, type Pt } from '../../core/model'
import type { TentTarget } from '../../core/ops/tent'
import { edgeLengths, interiorAngles } from '../../core/polygonEdit'
import { NumberField } from '../fields/NumberField'
import { formatNumber } from '../fields/numberInput'
import { parsePolygonFieldId, polygonFieldId } from './tentEditorModel'

/** 접힌 칸 버튼 문구 */
export const ANGLES_LABEL = '꼭짓점 각도'
export const COORDS_LABEL = '좌표로 고치기'
/** 계산값 표시 */
export const AUTO_TEXT = '자동'
/** 변 번호 안내(소유자 피드백: 「변 1·2·3이 어디인지」) */
export const EDGE_HINT = '번호는 캔버스의 변 옆 숫자예요 · 칸을 누르면 그 변이 강조돼요'

const [LEN_MIN, LEN_MAX] = LIMITS.length

function errorOf(r: EditResult): string | undefined {
  return r.ok ? undefined : r.error
}

/** 각도 표시값(0.1°) */
function round01(v: number): number {
  const r = Math.round(v * 10) / 10
  return r === 0 ? 0 : r
}

/** 접었다 펴는 칸 버튼(aria-expanded) */
export function Disclosure(p: { label: string; open: boolean; onToggle(): void; controls: string }): JSX.Element {
  return (
    <button type="button" className="tf-tent__disclosure" aria-expanded={p.open} aria-controls={p.controls} onClick={p.onToggle}>
      <span>{p.label}</span>
      <span aria-hidden="true">{p.open ? '▴' : '▾'}</span>
    </button>
  )
}

function ReadOnlyRow(p: { label: string; value: string; testId?: string }): JSX.Element {
  return (
    <div className="tf-tent__auto" data-testid={p.testId}>
      <span className="tf-tent__auto-label">{p.label}</span>
      <span className="tf-tent__auto-value">{p.value}</span>
      <span className="tf-tent__auto-tag">{AUTO_TEXT}</span>
    </div>
  )
}

export function PolygonFields(p: { target: TentTarget; points: readonly Pt[]; enabled: boolean }): JSX.Element {
  const stores = useStores()
  const { target, points, enabled } = p
  const [anglesOpen, setAnglesOpen] = useState(false)
  const n = points.length
  const lens = edgeLengths(points)
  const angles = interiorAngles(points)
  const bb = ringBBox([...points])
  const anglesId = `${polygonFieldId(target, 'a')}-list`

  /** 포커스 때의 대상(id)에 반영합니다. */
  const commit = (id: string, value: number): string | void => {
    const f = parsePolygonFieldId(id)
    if (f === null) return
    if (f.kind === 'e') return errorOf(setTargetEdgeLength(stores, f.target, f.index, value))
    if (f.kind === 'a') return errorOf(setTargetVertexAngle(stores, f.target, f.index, value))
    return errorOf(setTargetSize(stores, f.target, f.kind, value))
  }

  const lenField = (label: string, id: string, value: number) => (
    <NumberField key={id} label={label} unit="cm" value={round1(value)} targetId={id} min={LEN_MIN} max={LEN_MAX} disabled={!enabled} onCommit={commit} />
  )
  /** 칸에 포커스하는 동안 캔버스가 그 변·꼭짓점을 강조하게 알립니다(focus·blur는 버블링). */
  const focusProps = (focus: PolygonFocus) => ({
    onFocus: () => stores.ui.getState().setPolygonFocus(focus),
    onBlur: () => stores.ui.getState().setPolygonFocus(null),
  })

  return (
    <div className="tf-tent__poly" data-testid="tent-polygon-fields">
      <div className="tf-row2">
        {lenField('가로', polygonFieldId(target, 'w'), bb.maxX - bb.minX)}
        {lenField('세로', polygonFieldId(target, 'h'), bb.maxY - bb.minY)}
      </div>
      <div className="tf-tent__edges" role="group" aria-label="변 길이">
        <p className="tf-hint">{EDGE_HINT}</p>
        {lens.map((len, i) =>
          i < n - 1 ? (
            <div key={i} {...focusProps({ kind: 'edge', index: i })}>
              {lenField(`변 ${i + 1}`, polygonFieldId(target, 'e', i), len)}
            </div>
          ) : (
            <ReadOnlyRow key="closing" label={`변 ${i + 1}`} value={`${formatNumber(round1(len))} cm`} testId="tent-edge-closing" />
          ),
        )}
      </div>
      <Disclosure label={ANGLES_LABEL} open={anglesOpen} controls={anglesId} onToggle={() => setAnglesOpen((o) => !o)} />
      {anglesOpen && (
        <div id={anglesId} className="tf-tent__edges" role="group" aria-label={ANGLES_LABEL}>
          {angles.map((deg, i) =>
            i >= 1 && i <= n - 2 ? (
              <div key={i} {...focusProps({ kind: 'vertex', index: i })}>
              <NumberField
                label={`꼭짓점 ${i + 1}`}
                unit="°"
                value={round01(deg)}
                targetId={polygonFieldId(target, 'a', i)}
                min={1}
                max={359}
                disabled={!enabled}
                onCommit={commit}
              />
              </div>
            ) : (
              <ReadOnlyRow key={i} label={`꼭짓점 ${i + 1}`} value={`${formatNumber(round01(deg))}°`} />
            ),
          )}
        </div>
      )}
    </div>
  )
}
