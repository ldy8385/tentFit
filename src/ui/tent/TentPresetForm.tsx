// 로컬 개발 서버 전용 [텐트 프리셋으로 저장](소유자 요청 2026-10-15): 지금 텐트를 presets/tents/<파일 이름>.json에 넣어 코드로 남깁니다.
// 배포본에는 없습니다(import.meta.env.DEV로만 그림). 같은 제조사는 같은 파일(파일 이름 = 제조사 영문), id = <파일 이름>/<모델 영문>.
import { useState, type JSX } from 'react'
import { useStores } from '../../app/stores'
import { registerTentPreset } from '../../app/tentCatalog'
import { resolveTentEntry } from '../../core/presets'
import type { TentFileEntry } from '../../core/model'
import { entryFromTent, slugify } from '../../../scripts/tentPresetFile'
import { INPUT_FONT_PX } from '../fields/numberInput'

const ENDPOINT = '/__tentfit/tent-presets'

export function TentPresetForm(p: { disabled?: boolean }): JSX.Element {
  const stores = useStores()
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState(() => stores.doc.getState().layout.tent.name)
  const [slug, setSlug] = useState('')
  const [busy, setBusy] = useState(false)
  const fileSlug = slug.trim() === '' ? slugify(brand) : slug.trim()

  const save = async () => {
    const b = brand.trim()
    const m = model.trim()
    if (b === '' || m === '' || fileSlug === '') {
      stores.ui.getState().showToast('제조사·모델명·파일 이름(영문)을 적어 주세요')
      return
    }
    const entry: TentFileEntry = entryFromTent(stores.doc.getState().layout.tent, { slug: fileSlug, brand: b, model: m })
    setBusy(true)
    try {
      const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug: fileSlug, entry }) })
      const body = (await res.json()) as { ok?: boolean; error?: string; file?: string }
      if (!res.ok || body.ok !== true) throw new Error(body.error ?? res.statusText)
      registerTentPreset(resolveTentEntry(entry).preset)
      stores.ui.getState().showToast(`텐트 프리셋에 넣었어요(${body.file ?? ''}) · 텐트 고르기 「브랜드」에 보여요`)
    } catch (e) {
      stores.ui.getState().showToast(`저장하지 못했어요: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <fieldset className="tf-preset-save" data-testid="save-tent-preset" disabled={p.disabled === true}>
      <legend>텐트 프리셋으로 저장(로컬 전용)</legend>
      <label className="tf-field__label">
        제조사
        <input className="tf-select" disabled={p.disabled === true} value={brand} style={{ fontSize: INPUT_FONT_PX }} onChange={(e) => setBrand(e.target.value)} />
      </label>
      <label className="tf-field__label">
        모델명
        <input className="tf-select" disabled={p.disabled === true} value={model} style={{ fontSize: INPUT_FONT_PX }} onChange={(e) => setModel(e.target.value)} />
      </label>
      <label className="tf-field__label">
        파일 이름(영문)
        <input
          className="tf-select"
          disabled={p.disabled === true}
          value={slug}
          placeholder={slugify(brand) || '예: snow-peak'}
          style={{ fontSize: INPUT_FONT_PX }}
          onChange={(e) => setSlug(e.target.value)}
        />
      </label>
      <button type="button" className="tf-btn tf-btn--primary" disabled={busy || p.disabled === true} onClick={() => void save()}>
        텐트 프리셋으로 저장
      </button>
    </fieldset>
  )
}
