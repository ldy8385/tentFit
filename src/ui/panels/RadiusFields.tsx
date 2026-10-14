// 모서리 둥글기 칸(소유자 요청 2026-10-14): 「모든 모서리」 한 칸 + 모서리마다 한 칸(사각형은 위치 이름). 물건 속성·텐트 편집 패널이 함께 씁니다.
// 모서리 칸에 들어가 있는 동안 캔버스가 그 모서리를 강조합니다(ui.polygonFocus). 캔버스의 「R」 숫자를 눌러도 고칠 수 있습니다.
// 문서 동작은 app/dimActions만 부릅니다.
// 칸 targetId는 '<대상>@r<번호|all>'라 포커스 뒤 대상이 바뀌어도 포커스 때 대상에 반영됩니다(useDraftField 규칙).
import type { JSX } from 'react'
import { applyAllRadii, applyDim, type DimSubject } from '../../app/dimActions'
import { useStores } from '../../app/stores'
import { cornerRing, effectiveRadii } from '../../core/geom'
import { LIMITS, round1, type Shape } from '../../core/model'
import { cornerLabel } from '../../view/dimLabels'
import { NumberField } from '../fields/NumberField'

export const RADIUS_ALL_LABEL = '모서리 둥글기'
export const RADIUS_HINT = '위 칸은 모든 모서리에 같은 값, 아래 칸은 그 모서리만 · 0이면 뾰족'



/** 대상 → 칸 id 앞부분 */
export function subjectFieldId(s: DimSubject, suffix: string): string {
  const head = s.kind === 'item' ? `item:${s.id}` : s.target === 'outer' ? 'tent:outer' : `tent:${s.target.innerId}`
  return `${head}@${suffix}`
}

/** 칸 id → 대상·뒷부분. 모양이 틀리면 null */
export function parseSubjectFieldId(id: string): { subject: DimSubject; suffix: string } | null {
  const at = id.lastIndexOf('@')
  if (at < 0) return null
  const head = id.slice(0, at)
  const suffix = id.slice(at + 1)
  if (head.startsWith('item:')) return { subject: { kind: 'item', id: head.slice(5) }, suffix }
  if (head === 'tent:outer') return { subject: { kind: 'tent', target: 'outer' }, suffix }
  if (head.startsWith('tent:')) return { subject: { kind: 'tent', target: { innerId: head.slice(5) } }, suffix }
  return null
}

export function RadiusFields(p: { subject: DimSubject; shape: Shape; enabled?: boolean }): JSX.Element | null {
  const stores = useStores()
  const { shape } = p
  if (shape.kind === 'circle') return null
  const eff = effectiveRadii(cornerRing(shape), shape.radii).map(round1)
  const first = eff[0] ?? 0
  const same = eff.every((r) => r === first)
  const disabled = p.enabled === false

  const commit = (id: string, value: number): string | void => {
    const f = parseSubjectFieldId(id)
    if (f === null) return
    if (f.suffix === 'rall') {
      const r = applyAllRadii(stores, f.subject, value)
      return r.ok ? undefined : r.error
    }
    const index = Number(f.suffix.slice(1))
    if (!Number.isInteger(index)) return
    const r = applyDim(stores, f.subject, { kind: 'radius', index }, value, false)
    return r.ok ? undefined : r.error
  }

  return (
    <div className="tf-radius">
      <NumberField
        label={RADIUS_ALL_LABEL}
        unit="cm"
        // 꼭짓점마다 다르면 빈칸(입력하면 모두 같은 값)
        value={same ? first : Number.NaN}
        targetId={subjectFieldId(p.subject, 'rall')}
        min={0}
        max={LIMITS.length[1]}
        disabled={disabled}
        onCommit={commit}
      />
      <div className="tf-radius__grid" role="group" aria-label="모서리마다 둥글기">
        {eff.map((r, i) => (
          <div
            key={i}
            onFocus={() => stores.ui.getState().setPolygonFocus({ kind: 'vertex', index: i })}
            onBlur={() => stores.ui.getState().setPolygonFocus(null)}
          >
            <NumberField
              label={cornerLabel(shape, i)}
              unit="cm"
              value={r}
              targetId={subjectFieldId(p.subject, `r${i}`)}
              min={0}
              max={LIMITS.length[1]}
              disabled={disabled}
              onCommit={commit}
            />
          </div>
        ))}
      </div>
      <p className="tf-hint">{same ? RADIUS_HINT : `꼭짓점마다 달라요 · ${RADIUS_HINT}`}</p>
    </div>
  )
}
