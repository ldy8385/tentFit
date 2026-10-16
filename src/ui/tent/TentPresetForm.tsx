// 로컬 개발 서버 전용 [텐트 프리셋으로 저장](소유자 요청 2026-10-15): 지금 텐트를 presets/tents.json에 넣어 코드로 남깁니다.
// 배포본에는 없습니다(import.meta.env.DEV로만 그림). id = <제조사>/<모델>(글자·숫자 조각)이라 같은 제조사·모델로 다시 저장하면 고쳐집니다.
// 이 배치가 프리셋에서 왔고(sourcePresetId) 그 프리셋이 있으면 제조사·모델명을 미리 채우고 [프리셋 고치기](원래 id로 덮어씀,
// 이름을 바꿔도 같은 항목) 옆에 [새 프리셋으로 저장](이름으로 만든 새 id)을 둡니다. 저장하면 배치를 그 프리셋에 연결합니다(2026-10-16).
import { useEffect, useId, useState, type JSX } from 'react'
import { useDoc, useStores } from '../../app/stores'
import { loadTentCatalog, registerTentPreset } from '../../app/tentCatalog'
import { resolveTentEntry } from '../../core/presets'
import type { TentFileEntry, TentPreset } from '../../core/model'
import { entryFromTent } from '../../../scripts/tentPresetFile'
import { INPUT_FONT_PX } from '../fields/numberInput'

const ENDPOINT = '/__tentfit/tent-presets'

export function TentPresetForm(p: { disabled?: boolean }): JSX.Element {
  const stores = useStores()
  const sourceId = useDoc((s) => s.layout.sourcePresetId)
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState(() => stores.doc.getState().layout.tent.name)
  const [busy, setBusy] = useState(false)
  // 저장된 텐트 프리셋(브랜드 묶음): 제조사 칸 목록(소유자 요청 2026-10-15)·고칠 프리셋 찾기·새 id 겹침 검사
  const listId = useId()
  const [brands, setBrands] = useState<string[]>([])
  const [presets, setPresets] = useState<TentPreset[]>([])
  const refreshCatalog = () => {
    loadTentCatalog()
      .then((c) => {
        setBrands(c.brands.map((b) => b.brand))
        setPresets(c.brands.flatMap((b) => b.presets))
      })
      .catch(() => undefined)
  }
  useEffect(refreshCatalog, [])

  const existing = sourceId === undefined ? undefined : presets.find((x) => x.id === sourceId)
  // 고칠 프리셋이 정해지거나 바뀌면(목록을 불러온 뒤·저장해 연결한 뒤·텐트 바꾸기) 그 제조사·모델명으로 채웁니다.
  // effect 대신 렌더 중에 맞춥니다(이전에 채운 프리셋 id를 기억).
  const [filledFor, setFilledFor] = useState<string | undefined>(undefined)
  if (existing !== undefined && existing.id !== filledFor) {
    setFilledFor(existing.id)
    setBrand(existing.brand ?? '')
    setModel(existing.model)
  }

  const save = async (asNew: boolean) => {
    const target = asNew ? undefined : existing
    const b = brand.trim()
    const m = model.trim()
    if (b === '' || m === '') {
      stores.ui.getState().showToast('제조사·모델명을 적어 주세요')
      return
    }
    const entry: TentFileEntry = entryFromTent(stores.doc.getState().layout.tent, { brand: b, model: m, ...(target !== undefined ? { id: target.id } : {}) })
    // [새 프리셋으로 저장]이 이미 있는 프리셋(고치던 원본 포함)을 덮어쓰지 않게
    if (asNew && presets.some((x) => x.id === entry.id)) {
      stores.ui.getState().showToast(`같은 제조사·모델의 프리셋이 이미 있어요(${entry.id}) · 모델명을 바꾸거나 [프리셋 고치기]를 써 주세요`)
      return
    }
    setBusy(true)
    try {
      const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entry }) })
      const body = (await res.json()) as { ok?: boolean; error?: string; file?: string }
      if (!res.ok || body.ok !== true) throw new Error(body.error ?? res.statusText)
      registerTentPreset(resolveTentEntry(entry).preset)
      stores.doc.getState().setSourcePresetId(entry.id)
      refreshCatalog()
      stores.ui.getState().showToast(target !== undefined ? `프리셋을 고쳤어요(${entry.id})` : `텐트 프리셋에 넣었어요(${body.file ?? ''}) · 텐트 고르기 「브랜드」에 보여요`)
    } catch (e) {
      stores.ui.getState().showToast(`저장하지 못했어요: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const off = busy || p.disabled === true
  return (
    <fieldset className="tf-preset-save" data-testid="save-tent-preset" disabled={p.disabled === true}>
      <legend>텐트 프리셋으로 저장(로컬 전용)</legend>
      <label className="tf-field__label">
        제조사
        <input
          className="tf-select"
          list={listId}
          disabled={p.disabled === true}
          value={brand}
          style={{ fontSize: INPUT_FONT_PX }}
          onChange={(e) => setBrand(e.target.value)}
        />
      </label>
      <datalist id={listId}>
        {brands.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
      <label className="tf-field__label">
        모델명
        <input className="tf-select" disabled={p.disabled === true} value={model} style={{ fontSize: INPUT_FONT_PX }} onChange={(e) => setModel(e.target.value)} />
      </label>
      {existing !== undefined ? (
        <>
          <p className="tf-hint">{`고칠 프리셋: ${existing.id}`}</p>
          <div className="tf-row2">
            <button type="button" className="tf-btn tf-btn--primary" disabled={off} onClick={() => void save(false)}>
              프리셋 고치기
            </button>
            <button type="button" className="tf-btn" disabled={off} onClick={() => void save(true)}>
              새 프리셋으로 저장
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="tf-btn tf-btn--primary" disabled={off} onClick={() => void save(false)}>
          텐트 프리셋으로 저장
        </button>
      )}
    </fieldset>
  )
}
