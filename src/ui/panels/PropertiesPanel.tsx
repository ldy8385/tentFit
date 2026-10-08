// PC 오른쪽 위 선택 속성(스펙 §4.1): 선택 0개면 빈 안내, 1개면 ItemFields, 2개 이상이면 MultiFields.
import type { JSX } from 'react'
import { useMemo } from 'react'
import { useDoc, useUi } from '../../app/stores'
import { ItemFields } from './ItemFields'
import { MultiFields } from './MultiFields'
import './panels.css'

export function PropertiesPanel(): JSX.Element {
  const layout = useDoc((s) => s.layout)
  const selection = useUi((s) => s.selection)
  const items = useMemo(() => {
    const set = new Set(selection)
    return layout.items.filter((it) => set.has(it.id))
  }, [layout, selection])
  const first = items[0]

  return (
    <section className="tf-panel" aria-label="선택한 물건" data-testid="properties-panel">
      <h2 className="tf-panel__title">{items.length >= 2 ? `선택한 물건 ${items.length}개` : '선택한 물건'}</h2>
      {first === undefined ? (
        <p className="tf-panel__empty">캔버스에서 물건을 선택하면 여기에서 이름·크기·회전·색을 바꿀 수 있어요.</p>
      ) : items.length === 1 ? (
        <ItemFields item={first} />
      ) : (
        <MultiFields />
      )}
    </section>
  )
}
