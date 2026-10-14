// 로컬 개발 서버 전용 [프리셋으로 저장](소유자 요청 2026-10-14): 고른 물건을 presets/items.json에 넣어 코드로 남깁니다.
// 배포본에는 없습니다(import.meta.env.DEV로만 그림). 제조사·이름을 적고 저장하면 서버가 파일을 쓰고, 라이브러리에 바로 보입니다.
// 이 물건이 프리셋에서 온 것(presetId)이고 그 프리셋이 있으면 [프리셋 고치기](같은 id로 덮어씀) 옆에 [새 프리셋으로 저장](새 id).
import { useId, useState, type JSX } from 'react'
import { registerItemPreset, useItemPresets } from '../../app/presets'
import { useStores } from '../../app/stores'
import { centerPolygon } from '../../core/polygonEdit'
import { withRadii } from '../../core/radii'
import type { Item, ItemPreset, Shape } from '../../core/model'
import { brandOptions } from '../library/libraryUtils'
import { INPUT_FONT_PX } from '../fields/numberInput'

const ENDPOINT = '/__tentfit/item-presets'

function centered(shape: Shape): Shape {
  if (shape.kind !== 'polygon') return shape
  return withRadii({ kind: 'polygon', points: centerPolygon(shape.points).points }, shape.radii)
}

/** 새 id: items/<분류>-<시각 36진수> */
function newPresetId(item: Item): string {
  return `items/${item.category.toLowerCase()}-${Date.now().toString(36)}`
}

export function presetFromItem(item: Item, name: string, brand: string, id: string): ItemPreset {
  const p: ItemPreset = { id, name, category: item.category, shape: centered(item.shape), color: item.color, countsArea: item.countsArea }
  return brand === '' ? p : { id, name, brand, category: p.category, shape: p.shape, color: p.color, countsArea: p.countsArea }
}

export function SavePresetForm(p: { item: Item }): JSX.Element {
  const stores = useStores()
  const presets = useItemPresets()
  const listId = useId()
  const existing = p.item.presetId === undefined ? undefined : presets.find((x) => x.id === p.item.presetId)
  const [brand, setBrand] = useState(existing?.brand ?? '')
  const [name, setName] = useState(existing?.name ?? p.item.name)
  const [busy, setBusy] = useState(false)

  const save = async (asNew: boolean) => {
    const target = asNew ? undefined : existing
    const n = name.trim()
    if (n === '') {
      stores.ui.getState().showToast('이름을 적어 주세요')
      return
    }
    const preset = presetFromItem(p.item, n, brand.trim(), target?.id ?? newPresetId(p.item))
    setBusy(true)
    try {
      const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ preset }) })
      const body = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || body.ok !== true) throw new Error(body.error ?? res.statusText)
      registerItemPreset(preset)
      stores.doc.getState().commit((d) => {
        const it = d.items.find((x) => x.id === p.item.id)
        if (it !== undefined && it.presetId !== preset.id) it.presetId = preset.id
      })
      stores.ui.getState().showToast(target ? '프리셋을 고쳤어요(presets/items.json)' : '프리셋에 넣었어요(presets/items.json)')
    } catch (e) {
      stores.ui.getState().showToast(`저장하지 못했어요: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <fieldset className="tf-preset-save" data-testid="save-preset">
      <legend>프리셋으로 저장(로컬 전용)</legend>
      <label className="tf-field__label">
        제조사
        <input className="tf-select" list={listId} value={brand} style={{ fontSize: INPUT_FONT_PX }} onChange={(e) => setBrand(e.target.value)} />
      </label>
      <datalist id={listId}>
        {brandOptions(presets).map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
      <label className="tf-field__label">
        프리셋 이름
        <input className="tf-select" value={name} style={{ fontSize: INPUT_FONT_PX }} onChange={(e) => setName(e.target.value)} />
      </label>
      {existing ? (
        <div className="tf-row2">
          <button type="button" className="tf-btn tf-btn--primary" disabled={busy} onClick={() => void save(false)}>
            프리셋 고치기
          </button>
          <button type="button" className="tf-btn" disabled={busy} onClick={() => void save(true)}>
            새 프리셋으로 저장
          </button>
        </div>
      ) : (
        <button type="button" className="tf-btn tf-btn--primary" disabled={busy} onClick={() => void save(false)}>
          프리셋으로 저장
        </button>
      )}
    </fieldset>
  )
}
