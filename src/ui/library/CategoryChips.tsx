import { CATEGORY_FILTERS, type CategoryFilter } from './libraryUtils'

export function CategoryChips(p: { value: CategoryFilter; onChange(v: CategoryFilter): void; disabled?: boolean }) {
  return (
    <div className="tf-lib-chips" role="group" aria-label="카테고리">
      {CATEGORY_FILTERS.map((c) => (
        <button
          key={c.value}
          type="button"
          className="tf-lib-chip"
          aria-pressed={p.value === c.value}
          disabled={p.disabled}
          onClick={() => p.onChange(c.value)}
        >
          {c.label}
        </button>
      ))}
    </div>
  )
}
