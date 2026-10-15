// @vitest-environment happy-dom
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLayout } from '../../core/model'
import { defaultTentPreset } from '../../test/genericTents'

// 실제 presets/items.json은 소유자가 실제 매트를 넣기 전까지 비어 있어, 화면 동작은 예전 예시 20개(테스트 고정 데이터)로 봅니다.
vi.mock('../../app/presets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../app/presets')>()
  const legacy = (await import('../../test/fixtures/legacy-items.json')).default
  // 제조사 필터 시험용으로 매트 두 개에 제조사를 붙입니다.
  const items = actual.itemPresetsFrom(legacy).map((it) =>
    it.id === 'items/mat-single-200x60' ? { ...it, brand: '써머레스트' } : it.id === 'items/mat-wide-200x76' ? { ...it, brand: '니모' } : it,
  )
  return { ...actual, loadItemPresets: () => items, useItemPresets: () => items }
})
import { createStores, StoresProvider, type Stores } from '../../app/stores'
import { LibrarySheet } from './LibrarySheet'

let stores: Stores

beforeEach(() => {
  stores = createStores(createLayout(defaultTentPreset().tent, { name: '테스트 배치', id: 'L1' }))
  stores.ui.getState().setSize({ width: 390, height: 600 })
  stores.ui.getState().setView({ zoom: 1, panX: 195, panY: 300 })
  stores.ui.getState().patch({ mobileSheet: 'library' })
})
function renderSheet() {
  return render(
    <StoresProvider stores={stores}>
      <LibrarySheet />
    </StoresProvider>,
  )
}

const cards = () => within(screen.getByRole('list')).getAllByRole('button')

describe('LibrarySheet', () => {
  it('기본 프리셋 20개를 카드(이름·치수)로 보여 준다', () => {
    renderSheet()
    expect(cards()).toHaveLength(20)
    expect(screen.getByRole('button', { name: '롤 테이블 추가' }).textContent).toContain('90×60')
  })

  it('카드를 누르면 화면 가운데에 놓고 선택하고, 이 시트를 닫고 선택 시트를 연다', () => {
    renderSheet()
    fireEvent.click(screen.getByRole('button', { name: '롤 테이블 추가' }))
    const items = stores.doc.getState().layout.items
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ name: '롤 테이블', x: 0, y: 0 })
    expect(stores.ui.getState().selection).toEqual([items[0]?.id])
    expect(stores.ui.getState().mobileSheet).toBe('selection')
  })

  it('카테고리 칩으로 거른다', () => {
    renderSheet()
    fireEvent.click(screen.getByRole('button', { name: '깔개' }))
    expect(cards().map((c) => c.getAttribute('aria-label'))).toEqual(['러그 추가', '원형 러그 추가'])
  })

  it('[새 도형 만들기]는 새 도형 시트로 바꾼다', () => {
    renderSheet()
    fireEvent.click(screen.getByRole('button', { name: '+ 새 도형 만들기' }))
    expect(stores.ui.getState().mobileSheet).toBe('newShape')
    expect(stores.doc.getState().layout.items).toHaveLength(0)
  })

  it('이미 있는 물건과 같은 이름이면 번호를 붙인다', () => {
    renderSheet()
    fireEvent.click(screen.getByRole('button', { name: '벤치 추가' }))
    act(() => stores.ui.getState().patch({ mobileSheet: 'library' }))
    fireEvent.click(screen.getByRole('button', { name: '벤치 추가' }))
    expect(stores.doc.getState().layout.items.map((it) => it.name)).toEqual(['벤치', '벤치 2'])
  })
})

describe('LibrarySheet 제조사 필터', () => {
  it('휴대폰 시트에도 제조사 칸이 있고 거른다', () => {
    renderSheet()
    fireEvent.change(screen.getByRole('combobox', { name: '제조사' }), { target: { value: '니모' } })
    expect(cards().map((c) => c.getAttribute('aria-label'))).toEqual(['와이드 매트 추가'])
  })
})
