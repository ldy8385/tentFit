// 라이브러리 제조사 필터(소유자 요청 2026-10-14). 제조사가 적힌 프리셋이 하나도 없으면 그리지 않습니다.
import { useId } from 'react'
import type { ItemPreset } from '../../core/model'
import { brandOptions } from './libraryUtils'

export function BrandSelect(p: { presets: readonly ItemPreset[]; value: string | null; onChange(v: string | null): void; disabled?: boolean }) {
  const id = useId()
  const brands = brandOptions(p.presets)
  if (brands.length === 0) return null
  return (
    <div className="tf-lib-brand">
      <label htmlFor={id} className="tf-lib-brand__label">
        제조사
      </label>
      <select
        id={id}
        className="tf-lib-brand__select"
        value={p.value ?? ''}
        disabled={p.disabled}
        onChange={(e) => p.onChange(e.target.value === '' ? null : e.target.value)}
      >
        <option value="">제조사 전체</option>
        {brands.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>
    </div>
  )
}
