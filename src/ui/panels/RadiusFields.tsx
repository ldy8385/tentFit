// 모서리 둥글기 칸(소유자 요청 2026-10-14): 「모든 모서리」 한 칸 + 고른 꼭짓점이 있으면 그 꼭짓점 칸. 물건 속성·텐트 편집 패널이 함께 씁니다.
// 꼭짓점마다 다른 값은 캔버스의 「R」 숫자를 눌러도 고칠 수 있습니다. 문서 동작은 app/dimActions만 부릅니다.
// 칸 targetId는 '<대상>@r<번호|all>'라 포커스 뒤 대상이 바뀌어도 포커스 때 대상에 반영됩니다(useDraftField 규칙).
import type { JSX } from 'react'
import { applyAllRadii, applyDim, type DimSubject } from '../../app/dimActions'
import { useStores } from '../../app/stores'
import { cornerRing, effectiveRadii } from '../../core/geom'
import { LIMITS, round1, type Shape } from '../../core/model'
import { NumberField } from '../fields/NumberField'

export const RADIUS_ALL_LABEL = '모서리 둥글기'
export const RADIUS_HINT = '모든 모서리에 같은 값 · 0이면 뾰족 · 캔버스의 R 숫자로 꼭짓점마다 고칠 수 있어요'

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

export function RadiusFields(p: { subject: DimSubject; shape: Shape; vertexIndex?: number | null; enabled?: boolean }): JSX.Element | null {
  const stores = useStores()
  const { shape } = p
  if (shape.kind === 'circle') return null
  const eff = effectiveRadii(cornerRing(shape), shape.radii).map(round1)
  const first = eff[0] ?? 0
  const same = eff.every((r) => r === first)
  const v = p.vertexIndex ?? null
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
      {v !== null && v < eff.length && (
        <NumberField
          label={`${v + 1}번 꼭짓점 둥글기`}
          unit="cm"
          value={eff[v] ?? 0}
          targetId={subjectFieldId(p.subject, `r${v}`)}
          min={0}
          max={LIMITS.length[1]}
          disabled={disabled}
          onCommit={commit}
        />
      )}
      <p className="tf-hint">{same ? RADIUS_HINT : `꼭짓점마다 달라요 · ${RADIUS_HINT}`}</p>
    </div>
  )
}
