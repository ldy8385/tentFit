// @vitest-environment happy-dom
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStores, StoresProvider } from '../../app/stores'
import { createLayout } from '../../core/model'

vi.mock('../../app/tentCatalog', () => ({
  loadTentCatalog: () => Promise.resolve({ generic: [], brands: [{ brand: 'Awesome Holiday', presets: [] }, { brand: '코베아', presets: [] }] }),
  registerTentPreset: () => undefined,
}))

const { TentPresetForm } = await import('./TentPresetForm')

afterEach(cleanup)

describe('[텐트 프리셋으로 저장] 제조사 칸(소유자 요청 2026-10-15)', () => {
  it('저장된 텐트 브랜드를 고를 수 있게(물건 프리셋 저장처럼 입력 + 목록), 파일 이름 칸은 없음', async () => {
    const stores = createStores(createLayout({ name: 't', outer: { kind: 'rect', w: 300, h: 200 }, inners: [] }, { name: 'l' }))
    const view = render(
      <StoresProvider stores={stores}>
        <TentPresetForm />
      </StoresProvider>,
    )
    const input = view.getByLabelText('제조사') as HTMLInputElement
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
