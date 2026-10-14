// @vitest-environment happy-dom
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLayout } from '../../core/model'
import { defaultTentPreset } from '../../app/presets'

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
import { LibraryPanel } from './LibraryPanel'

let stores: Stores

beforeEach(() => {
  stores = createStores(createLayout(defaultTentPreset().tent, { name: '테스트 배치', id: 'L1' }))
  stores.ui.getState().setSize({ width: 800, height: 600 })
  stores.ui.getState().setView({ zoom: 1, panX: 400, panY: 300 })
})
function renderPanel() {
  return render(
    <StoresProvider stores={stores}>
      <LibraryPanel />
    </StoresProvider>,
  )
}

const rows = () => within(screen.getByRole('list')).getAllByRole('button')

describe('접기 버튼', () => {
  it('onCollapse가 있으면 제목 옆 [‹]가 부르고, 없으면 버튼 없음', () => {
    const onCollapse = vi.fn()
    const stores = createStores(createLayout({ name: 't', outer: { kind: 'rect', w: 600, h: 300 }, inners: [] }, { name: 'l', id: 'L', now: '2026-10-14T00:00:00.000Z' }))
    const { unmount } = render(
      <StoresProvider stores={stores}>
        <LibraryPanel onCollapse={onCollapse} />
      </StoresProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: '라이브러리 접기' }))
    expect(onCollapse).toHaveBeenCalledTimes(1)
    unmount()
    render(
      <StoresProvider stores={stores}>
        <LibraryPanel />
      </StoresProvider>,
    )
    expect(screen.queryByRole('button', { name: '라이브러리 접기' })).toBeNull()
  })
})

describe('LibraryPanel', () => {
  it('기본 프리셋 20개를 행(이름·치수)으로 보여 주고 [내 도형] 탭은 없다', () => {
    renderPanel()
    expect(rows()).toHaveLength(20)
    const mat = screen.getByRole('button', { name: '캠핑 매트 1인 추가' })
    expect(mat.textContent).toContain('200×60')
    expect(screen.getByRole('button', { name: '원형 스툴 추가' }).textContent).toContain('⌀35')
    expect(screen.queryByRole('tab')).toBeNull()
    expect(screen.queryByText('내 도형')).toBeNull()
  })

  it("카테고리 칩('전체'+6개)으로 거른다", () => {
    renderPanel()
    const chips = within(screen.getByRole('group', { name: '카테고리' })).getAllByRole('button')
    expect(chips.map((c) => c.textContent)).toEqual(['전체', '매트', '의자', '테이블', '수납·가구', '깔개', '기타'])
    fireEvent.click(screen.getByRole('button', { name: '의자' }))
    expect(rows().map((r) => r.getAttribute('aria-label'))).toEqual([
      // 이름순(소유자 요청 2026-10-14)
      '로우 체어 추가',
      '릴렉스 체어 추가',
      '벤치 추가',
      '원형 스툴 추가',
    ])
    expect(screen.getByRole('button', { name: '의자' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '전체' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('원형 물건 견본은 원으로, 깔개는 긴 대시로 그린다', () => {
    renderPanel()
    const stool = screen.getByRole('button', { name: '원형 스툴 추가' })
    expect(stool.querySelector('[data-shape="circle"]')).not.toBeNull()
    const rug = screen.getByRole('button', { name: '러그 추가' })
    const shape = rug.querySelector('[data-shape="rect"]') as SVGElement | null
    expect(shape?.style.strokeDasharray).toBe('6 4')
  })

  it('행을 누르면 화면 가운데에 놓고 선택한 뒤 속성 패널 자리로 돌린다', () => {
    renderPanel()
    act(() => stores.ui.getState().patch({ desktopPanel: 'newShape' }))
    fireEvent.click(screen.getByRole('button', { name: '원형 스툴 추가' }))
    const items = stores.doc.getState().layout.items
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ name: '원형 스툴', x: 0, y: 0, shape: { kind: 'circle', d: 35 } })
    expect(stores.ui.getState().selection).toEqual([items[0]?.id])
    expect(stores.ui.getState().desktopPanel).toBe('auto')
  })

  it('+ 새 도형은 오른쪽 위 자리에 새 도형 폼을 연다', () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: '+ 새 도형' }))
    expect(stores.ui.getState().desktopPanel).toBe('newShape')
  })

  it('텐트 편집 모드와 측정 중에는 흐리게 하고 입력을 막는다', () => {
    renderPanel()
    act(() => stores.ui.getState().patch({ mode: 'tent' }))
    expect(screen.getByRole('complementary', { name: '라이브러리' }).getAttribute('data-locked')).toBe('true')
    expect(rows().every((r) => (r as HTMLButtonElement).disabled)).toBe(true)
    expect((screen.getByRole('button', { name: '+ 새 도형' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '벤치 추가' }))
    expect(stores.doc.getState().layout.items).toHaveLength(0)

    act(() => stores.ui.getState().patch({ mode: 'place', measuring: true }))
    expect(rows().every((r) => (r as HTMLButtonElement).disabled)).toBe(true)
    act(() => stores.ui.getState().patch({ measuring: false }))
    expect(rows().some((r) => (r as HTMLButtonElement).disabled)).toBe(false)
  })
})

describe('LibraryPanel 제조사 필터', () => {
  it('제조사 칸(전체 + 가나다순)으로 거르고 카테고리와 함께 걸린다, 목록에 제조사를 적는다', () => {
    renderPanel()
    const select = screen.getByRole('combobox', { name: '제조사' }) as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['제조사 전체', '니모', '써머레스트'])
    fireEvent.change(select, { target: { value: '써머레스트' } })
    expect(rows().map((r) => r.getAttribute('aria-label'))).toEqual(['캠핑 매트 1인 추가'])
    expect(rows()[0]!.textContent).toContain('써머레스트')
    fireEvent.click(screen.getByRole('button', { name: '의자' }))
    expect(screen.getByText('아직 등록된 의자가 없어요 · [새 도형]으로 직접 만들 수 있어요')).toBeTruthy()
  })
})
