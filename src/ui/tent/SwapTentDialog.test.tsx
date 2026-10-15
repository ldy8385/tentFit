// @vitest-environment happy-dom
// 텐트 바꾸기(Task 11). 목록 컴포넌트·만들기 화면·목록 불러오기는 계약(props)만 쓰도록 가짜로 바꿔 끼웁니다.
// 실제 목록·만들기 화면과의 연결은 Task 13 E2E가 확인합니다.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createStores, StoresProvider, type Stores } from '../../app/stores'
import type { TentCatalog } from '../../app/tentCatalog'
import { loadGenericTents } from '../../test/genericTents'
import type { Tent, TentPreset } from '../../core/model'
import { rectItem, tunnelLayout } from '../area/testLayouts'
import { openSwapTent, SWAP_TENT_LOAD_ERROR, SwapTentDialog } from './SwapTentDialog'

const catalogMock = vi.hoisted(() => ({
  calls: 0,
  next: null as null | (() => Promise<unknown>),
}))

vi.mock('../../app/tentCatalog', () => ({
  loadTentCatalog: () => {
    catalogMock.calls++
    if (catalogMock.next === null) throw new Error('catalogMock.next를 정하세요')
    return catalogMock.next()
  },
}))

vi.mock('../pick/TentPickerList', () => ({
  TentPickerList: (p: {
    catalog: TentCatalog | null
    error?: string
    onPick(preset: TentPreset): void
    onMake(): void
  }) => (
    <div data-testid="picker">
      {p.catalog === null ? (
        <p role="status">{p.error ?? '텐트 목록을 불러오는 중…'}</p>
      ) : (
        <>
          <button type="button" onClick={p.onMake}>
            직접 만들기
          </button>
          {p.catalog.generic.map((preset) => (
            <button key={preset.id} type="button" onClick={() => p.onPick(preset)}>
              {preset.tent.name}
            </button>
          ))}
        </>
      )}
    </div>
  ),
}))

vi.mock('../tentMaker/TentMaker', () => ({
  TentMaker: (p: { mode: 'start' | 'swap'; myTentNames: readonly string[]; onConfirm(tent: Tent): void; onCancel(): void }) => (
    <div data-testid="tent-maker" data-mode={p.mode} data-names={p.myTentNames.length}>
      <button type="button" onClick={() => p.onConfirm(MADE_TENT)}>
        이 텐트로 바꾸기
      </button>
      <button type="button" onClick={p.onCancel}>
        만들기 취소
      </button>
    </div>
  ),
}))

/** 만들기 화면에서 확정했다고 치는 텐트(사각형 500×300, 이너 없음) */
const MADE_TENT: Tent = {
  name: '내 텐트',
  outer: { kind: 'rect', w: 500, h: 300 },
  outerTemplate: { kind: 'rect', w: 500, h: 300 },
  inners: [],
}

function catalog(): TentCatalog {
  return { generic: loadGenericTents(), brands: [] }
}

/** 터널 4인 + 매트 2개, 텐트 편집 모드에서 외곽을 고른 상태 */
function setup(): Stores {
  const layout = { ...tunnelLayout([rectItem('m1', '매트', 0, 0), rectItem('m2', '매트 2', 100, 50)]), sourcePresetId: 'generic/tunnel-4p' }
  const stores = createStores(layout)
  stores.ui.getState().setSize({ width: 800, height: 600 })
  stores.ui.getState().setMode('tent')
  stores.ui.getState().selectTentTarget('outer', 1)
  render(
    <StoresProvider stores={stores}>
      <SwapTentDialog />
    </StoresProvider>,
  )
  return stores
}

async function openAndLoad(stores: Stores) {
  catalogMock.next = () => Promise.resolve(catalog())
  await act(async () => {
    openSwapTent(stores)
  })
}

beforeEach(() => {
  catalogMock.calls = 0
  catalogMock.next = null
})

describe('SwapTentDialog', () => {
  it('닫혀 있으면 아무것도 그리지 않고 목록도 불러오지 않는다', () => {
    setup()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByTestId('swap-tent-host')).toBeNull()
    expect(catalogMock.calls).toBe(0)
  })

  it('열면 대화상자 「텐트 바꾸기」에 불러오는 중 상태를 보이고, 다 불러오면 목록을 보인다', async () => {
    const stores = setup()
    let resolve: (c: TentCatalog) => void = () => {}
    catalogMock.next = () => new Promise<TentCatalog>((r) => (resolve = r))
    act(() => openSwapTent(stores))
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('텐트 바꾸기')
    expect(within(dialog).getByRole('status').textContent).toBe('텐트 목록을 불러오는 중…')
    await act(async () => resolve(catalog()))
    expect(within(dialog).getByRole('button', { name: '벨텐트 4m 예시' })).toBeTruthy()
    expect(catalogMock.calls).toBe(1)
  })

  it('카드를 고르면 layout.tent만 바뀌고(물건 그대로) 실행 취소 1칸, 대화상자는 닫힌다', async () => {
    const stores = setup()
    const before = stores.doc.getState().layout
    await openAndLoad(stores)
    fireEvent.click(screen.getByRole('button', { name: '벨텐트 4m 예시' }))
    const after = stores.doc.getState().layout
    expect(after.tent.name).toBe('벨텐트 4m 예시')
    expect(after.tent.outer.kind).toBe('circle')
    expect(after.items).toEqual(before.items)
    expect(after.sourcePresetId).toBe('generic/bell-4m')
    expect(after.name).toBe(before.name)
    expect(stores.doc.getState().canUndo).toBe(true)
    expect(stores.ui.getState().editorDialog).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    // R9: 모드는 그대로, 편집 대상·꼭짓점 선택은 비움
    expect(stores.ui.getState().mode).toBe('tent')
    expect(stores.ui.getState().tentTarget).toBeNull()
    expect(stores.ui.getState().vertexIndex).toBeNull()

    act(() => {
      stores.doc.getState().undo()
    })
    expect(stores.doc.getState().layout.tent).toEqual(before.tent)
    expect(stores.doc.getState().layout.items).toEqual(before.items)
    expect(stores.doc.getState().canUndo).toBe(false)
    expect(stores.ui.getState().tentTarget).toBeNull()
  })

  it('같은 프리셋을 다시 골라도 이너 id가 같아 남아 있던 대상이 살아나지 않는다(R17)', async () => {
    const stores = setup()
    const innerId = stores.doc.getState().layout.tent.inners[0]!.id
    act(() => stores.ui.getState().selectTentTarget({ innerId }, 0))
    await openAndLoad(stores)
    fireEvent.click(screen.getByRole('button', { name: '터널 4인 예시' }))
    expect(stores.ui.getState().tentTarget).toBeNull()
    expect(stores.ui.getState().vertexIndex).toBeNull()
  })

  it('[직접 만들기] → 대화상자를 닫고 만들기 화면(swap), 확정하면 그 텐트로 바뀌고 실행 취소 1칸', async () => {
    const stores = setup()
    const before = stores.doc.getState().layout
    await openAndLoad(stores)
    fireEvent.click(screen.getByRole('button', { name: '직접 만들기' }))
    expect(stores.ui.getState().editorDialog).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    const maker = screen.getByTestId('tent-maker')
    expect(maker.getAttribute('data-mode')).toBe('swap')
    expect(maker.getAttribute('data-names')).toBe('0')
    expect(stores.doc.getState().canUndo).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: '이 텐트로 바꾸기' }))
    expect(screen.queryByTestId('tent-maker')).toBeNull()
    const after = stores.doc.getState().layout
    expect(after.tent).toEqual(MADE_TENT)
    expect(after.items).toEqual(before.items)
    expect(after.sourcePresetId).toBeUndefined()
    act(() => {
      stores.doc.getState().undo()
    })
    expect(stores.doc.getState().layout.tent).toEqual(before.tent)
    expect(stores.doc.getState().canUndo).toBe(false)
  })

  it('[직접 만들기] → 만들기 화면에서 취소하면 문서·실행 취소 기록이 그대로이고 편집기로 돌아온다', async () => {
    const stores = setup()
    const before = stores.doc.getState().layout
    await openAndLoad(stores)
    fireEvent.click(screen.getByRole('button', { name: '직접 만들기' }))
    fireEvent.click(screen.getByRole('button', { name: '만들기 취소' }))
    expect(screen.queryByTestId('tent-maker')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(stores.doc.getState().layout).toBe(before)
    expect(stores.doc.getState().canUndo).toBe(false)
    expect(stores.ui.getState().mode).toBe('tent')
  })

  it('[취소]는 대화상자만 닫고 문서는 그대로다', async () => {
    const stores = setup()
    const before = stores.doc.getState().layout
    await openAndLoad(stores)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '취소' }))
    expect(stores.ui.getState().editorDialog).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(stores.doc.getState().layout).toBe(before)
  })

  it('대화상자·만들기 화면이 열려 있는 동안 단축키 차단 표시(data-editor-modal)가 있다', async () => {
    const stores = setup()
    await openAndLoad(stores)
    expect(document.querySelector('[data-editor-modal]')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '직접 만들기' }))
    expect(document.querySelector('[data-editor-modal]')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '만들기 취소' }))
    expect(document.querySelector('[data-editor-modal]')).toBeNull()
  })

  it('측정 중(tentControlsEnabled false)에는 열지 않는다', () => {
    const stores = setup()
    act(() => stores.ui.getState().patch({ measuring: true }))
    catalogMock.next = () => Promise.resolve(catalog())
    act(() => openSwapTent(stores))
    expect(stores.ui.getState().editorDialog).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('불러오기에 실패하면 오류 문구와 [다시 시도], 다시 시도하면 목록이 나온다', async () => {
    const stores = setup()
    catalogMock.next = () => Promise.reject(new Error('청크 없음'))
    await act(async () => openSwapTent(stores))
    expect(screen.getByRole('status').textContent).toBe(SWAP_TENT_LOAD_ERROR)
    catalogMock.next = () => Promise.resolve(catalog())
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    })
    expect(screen.getByRole('button', { name: '벨텐트 4m 예시' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull()
    expect(catalogMock.calls).toBe(2)
  })
})
