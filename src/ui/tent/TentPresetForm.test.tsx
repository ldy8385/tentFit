// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStores, StoresProvider, type Stores } from '../../app/stores'
import { createLayout, type TentPreset } from '../../core/model'

type Brand = { brand: string; presets: TentPreset[] }

// 고르기 화면 목록(메모리). registerTentPreset은 실제처럼 같은 id를 빼고 브랜드 묶음에 넣습니다.
const catalog = vi.hoisted(() => ({ brands: [] as Brand[] }))

vi.mock('../../app/tentCatalog', () => ({
  loadTentCatalog: () => Promise.resolve({ generic: [], brands: catalog.brands.map((b) => ({ brand: b.brand, presets: [...b.presets] })) }),
  registerTentPreset: (preset: TentPreset) => {
    const brand = preset.brand ?? ''
    for (const b of catalog.brands) b.presets = b.presets.filter((p) => p.id !== preset.id)
    const hit = catalog.brands.find((b) => b.brand === brand)
    if (hit !== undefined) hit.presets.push(preset)
    else catalog.brands.push({ brand, presets: [preset] })
  },
}))

const { TentPresetForm } = await import('./TentPresetForm')

const TENT = { name: 'Lito/Lito D', outer: { kind: 'rect' as const, w: 300, h: 200 }, inners: [] }
const LITO: TentPreset = { id: 'awesome-holiday/rito', brand: 'Awesome Holiday', model: 'Lito/Lito D', tent: TENT }

/** 보낸 본문(entry) 기록. 서버는 늘 성공으로 답합니다. */
let sent: { entry: { id: string; brand: string; model: string } }[] = []

beforeEach(() => {
  sent = []
  catalog.brands = [{ brand: 'Awesome Holiday', presets: [LITO] }, { brand: '코베아', presets: [] }]
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { body: string }) => {
      sent.push(JSON.parse(init.body))
      return { ok: true, statusText: 'OK', json: async () => ({ ok: true, file: 'presets/tents.json' }) }
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function setup(sourcePresetId?: string): { stores: Stores; view: ReturnType<typeof render> } {
  const stores = createStores(createLayout(TENT, { name: 'l', ...(sourcePresetId !== undefined ? { sourcePresetId } : {}) }))
  const view = render(
    <StoresProvider stores={stores}>
      <TentPresetForm />
    </StoresProvider>,
  )
  return { stores, view }
}

const field = (view: ReturnType<typeof render>, label: string) => view.getByLabelText(label) as HTMLInputElement

describe('[텐트 프리셋으로 저장] 제조사 칸(소유자 요청 2026-10-15)', () => {
  it('저장된 텐트 브랜드를 고를 수 있게(물건 프리셋 저장처럼 입력 + 목록), 파일 이름 칸은 없음', async () => {
    const { view } = setup()
    const input = field(view, '제조사')
    const listId = input.getAttribute('list')
    expect(listId).toBeTruthy()
    await waitFor(() => {
      const options = Array.from(view.container.querySelectorAll(`datalist option`), (o) => o.getAttribute('value'))
      expect(options).toEqual(['Awesome Holiday', '코베아'])
    })
    expect(view.container.querySelector('datalist')?.id).toBe(listId)
    expect(view.queryByLabelText('파일 이름(영문)')).toBeNull()
  })
})

describe('[프리셋 고치기] — 저장한 텐트 프리셋을 다시 고치기(소유자 요청 2026-10-16)', () => {
  it('프리셋에서 연 배치면 제조사·모델명을 미리 채우고 고칠 프리셋 id를 보이며, [프리셋 고치기]·[새 프리셋으로 저장] 두 버튼', async () => {
    const { view } = setup(LITO.id)
    await waitFor(() => expect(field(view, '제조사').value).toBe('Awesome Holiday'))
    expect(field(view, '모델명').value).toBe('Lito/Lito D')
    expect(view.getByText('고칠 프리셋: awesome-holiday/rito')).toBeTruthy()
    expect(view.getByRole('button', { name: '프리셋 고치기' })).toBeTruthy()
    expect(view.getByRole('button', { name: '새 프리셋으로 저장' })).toBeTruthy()
    expect(view.queryByRole('button', { name: '텐트 프리셋으로 저장' })).toBeNull()
  })

  // Lito/Lito D 는 id 가 awesome-holiday/rito 라 이름으로 계산한 id(lito-lito-d)로는 원본을 못 고쳤다.
  it('[프리셋 고치기]는 제조사·모델명을 바꿔도 원래 id로 보낸다', async () => {
    const { stores, view } = setup(LITO.id)
    await waitFor(() => expect(view.getByRole('button', { name: '프리셋 고치기' })).toBeTruthy())
    fireEvent.change(field(view, '모델명'), { target: { value: 'Lito D' } })
    fireEvent.click(view.getByRole('button', { name: '프리셋 고치기' }))
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]!.entry).toMatchObject({ id: 'awesome-holiday/rito', brand: 'Awesome Holiday', model: 'Lito D' })
    await waitFor(() => expect(stores.ui.getState().toast?.text).toBe('프리셋을 고쳤어요(awesome-holiday/rito)'))
    expect(stores.doc.getState().layout.sourcePresetId).toBe('awesome-holiday/rito')
  })

  it('[새 프리셋으로 저장]은 이름으로 만든 새 id로 보내고, 배치는 새 프리셋에 연결된다', async () => {
    const { stores, view } = setup(LITO.id)
    await waitFor(() => expect(view.getByRole('button', { name: '새 프리셋으로 저장' })).toBeTruthy())
    fireEvent.change(field(view, '모델명'), { target: { value: 'Lito Air' } })
    fireEvent.click(view.getByRole('button', { name: '새 프리셋으로 저장' }))
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]!.entry.id).toBe('awesome-holiday/lito-air')
    await waitFor(() => expect(stores.doc.getState().layout.sourcePresetId).toBe('awesome-holiday/lito-air'))
    await waitFor(() => expect(view.getByText('고칠 프리셋: awesome-holiday/lito-air')).toBeTruthy())
  })

  it('[새 프리셋으로 저장]인데 같은 id의 프리셋이 이미 있으면 보내지 않고 알린다(덮어쓰지 않게)', async () => {
    catalog.brands[0]!.presets.push({ id: 'awesome-holiday/ethos', brand: 'Awesome Holiday', model: 'Ethos', tent: TENT })
    const { stores, view } = setup(LITO.id)
    await waitFor(() => expect(view.getByRole('button', { name: '새 프리셋으로 저장' })).toBeTruthy())
    fireEvent.change(field(view, '모델명'), { target: { value: 'Ethos' } })
    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: '새 프리셋으로 저장' }))
    })
    expect(sent).toHaveLength(0)
    expect(stores.ui.getState().toast?.text).toBe('같은 제조사·모델의 프리셋이 이미 있어요(awesome-holiday/ethos) · 모델명을 바꾸거나 [프리셋 고치기]를 써 주세요')
  })

  it('직접 만든 텐트는 버튼 하나, 처음 저장하면 그 프리셋에 연결돼 다음부터 [프리셋 고치기]', async () => {
    const { stores, view } = setup()
    expect(view.queryByRole('button', { name: '프리셋 고치기' })).toBeNull()
    fireEvent.change(field(view, '제조사'), { target: { value: 'Snow Peak' } })
    fireEvent.change(field(view, '모델명'), { target: { value: 'Land Lock' } })
    fireEvent.click(view.getByRole('button', { name: '텐트 프리셋으로 저장' }))
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]!.entry.id).toBe('snow-peak/land-lock')
    await waitFor(() => expect(stores.doc.getState().layout.sourcePresetId).toBe('snow-peak/land-lock'))
    await waitFor(() => expect(view.getByRole('button', { name: '프리셋 고치기' })).toBeTruthy())
    expect(stores.doc.getState().canUndo).toBe(false)
  })

  it('텐트 바꾸기로 출처 프리셋이 바뀌면 그 프리셋의 제조사·모델명으로 다시 채운다', async () => {
    catalog.brands[0]!.presets.push({ id: 'awesome-holiday/ethos', brand: 'Awesome Holiday', model: 'Ethos', tent: TENT })
    const { stores, view } = setup(LITO.id)
    await waitFor(() => expect(field(view, '모델명').value).toBe('Lito/Lito D'))
    act(() => stores.doc.getState().setSourcePresetId('awesome-holiday/ethos'))
    expect(field(view, '모델명').value).toBe('Ethos')
    expect(view.getByText('고칠 프리셋: awesome-holiday/ethos')).toBeTruthy()
  })

  it('연결된 프리셋이 목록에 없으면(지운 프리셋 등) 직접 만든 텐트처럼 버튼 하나', async () => {
    const { view } = setup('awesome-holiday/gone')
    await waitFor(() => {
      const options = view.container.querySelectorAll('datalist option')
      expect(options.length).toBe(2)
    })
    expect(view.getByRole('button', { name: '텐트 프리셋으로 저장' })).toBeTruthy()
    expect(view.queryByRole('button', { name: '프리셋 고치기' })).toBeNull()
  })
})
