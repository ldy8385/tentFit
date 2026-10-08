// @vitest-environment happy-dom
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createLayout } from '../../core/model'
import { defaultTentPreset } from '../../app/presets'
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
