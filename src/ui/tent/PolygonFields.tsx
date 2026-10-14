// 자유 다각형 대상의 cm 칸(설계 2026-10-12 §2.3, Plan 4.1). 문서 동작은 app/tentActions·app/dimActions만 부릅니다.
// - 전체 크기(가로·세로): 「비율 유지」(ui.keepRatio, 기본 켬)면 전체를 같은 배율로, 끄면 그 축만(소유자 요청 2026-10-14).
// - 변 길이 표(접힘, 2026-10-14부터 캔버스 변 숫자가 주): 「변 1」…「변 n」 모두 입력, 비율 유지를 따릅니다(끄면 닫는 변이, 닫는 변은 앞 변이 흡수).
// - 꼭짓점 각도(접힘): 「꼭짓점 2」…「꼭짓점 n−1」 입력, 1·n은 계산값.
// 계산은 대상의 로컬 좌표(이너는 회전 전)라 표시 길이·각도는 회전과 무관합니다. UI 번호는 1부터, 코드 번호는 0부터.
// 칸 targetId는 '<대상>@<종류><번호>'라 포커스 뒤 대상이 바뀌어도 포커스 때 대상에 반영됩니다(useDraftField 규칙).
import { useState, type JSX } from 'react'
import { useStores } from '../../app/stores'
import type { PolygonFocus } from '../../store/ui'
import { applyDim } from '../../app/dimActions'
import { setTargetVertexAngle, type EditResult } from '../../app/tentActions'
import { dimValue } from '../../core/dimEdit'
import { LIMITS, round1, type Pt, type Shape } from '../../core/model'
import type { TentTarget } from '../../core/ops/tent'
import { edgeLengths, interiorAngles } from '../../core/polygonEdit'
import { KeepRatioToggle } from '../common/KeepRatioToggle'
import { NumberField } from '../fields/NumberField'
import { formatNumber } from '../fields/numberInput'
import { parsePolygonFieldId, polygonFieldId } from './tentEditorModel'

/** 접힌 칸 버튼 문구 */
export const ANGLES_LABEL = '꼭짓점 각도'
export const COORDS_LABEL = '좌표로 고치기'
export const EDGES_LABEL = '변 길이 표'
/** 계산값 표시 */
export const AUTO_TEXT = '자동'
/** 변 표 안내: 캔버스 변 숫자가 주 입력(소유자 요청 2026-10-14) */
export const EDGE_HINT = '캔버스에서 변 옆 숫자를 눌러 고칠 수도 있어요 · 칸을 누르면 그 변이 강조돼요'

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

export function PolygonFields(p: { target: TentTarget; shape: Shape; points: readonly Pt[]; enabled: boolean }): JSX.Element {
  const stores = useStores()
  const { target, points, enabled } = p
  const [anglesOpen, setAnglesOpen] = useState(false)
  const [edgesOpen, setEdgesOpen] = useState(false)
  const n = points.length
  const lens = edgeLengths(points)
  const angles = interiorAngles(points)
  const anglesId = `${polygonFieldId(target, 'a')}-list`
  const edgesId = `${polygonFieldId(target, 'e')}-list`

  /** 포커스 때의 대상(id)에 반영합니다. 변·가로·세로는 「비율 유지」를 따릅니다. */
  const commit = (id: string, value: number): string | void => {
    const f = parsePolygonFieldId(id)
    if (f === null) return
    if (f.kind === 'a') return errorOf(setTargetVertexAngle(stores, f.target, f.index, value))
    const keep = stores.ui.getState().keepRatio
    const subject = { kind: 'tent' as const, target: f.target }
    if (f.kind === 'e') return errorOf(applyDim(stores, subject, { kind: 'edge', index: f.index }, value, keep))
    return errorOf(applyDim(stores, subject, { kind: f.kind }, value, keep))
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
        {lenField('가로', polygonFieldId(target, 'w'), dimValue(p.shape, { kind: 'w' }) ?? 0)}
        {lenField('세로', polygonFieldId(target, 'h'), dimValue(p.shape, { kind: 'h' }) ?? 0)}
      </div>
      <KeepRatioToggle />
      <Disclosure label={EDGES_LABEL} open={edgesOpen} controls={edgesId} onToggle={() => setEdgesOpen((o) => !o)} />
      {edgesOpen && (
        <div id={edgesId} className="tf-tent__edges" role="group" aria-label="변 길이">
          <p className="tf-hint">{EDGE_HINT}</p>
          {lens.map((len, i) => (
            <div key={i} {...focusProps({ kind: 'edge', index: i })}>
              {lenField(`변 ${i + 1}`, polygonFieldId(target, 'e', i), len)}
            </div>
          ))}
        </div>
      )}
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
