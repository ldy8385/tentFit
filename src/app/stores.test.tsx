// @vitest-environment happy-dom
import { act, render, renderHook, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createLayout, type Item, type Layout } from '../core/model'
import { addItem, deleteItems, moveItems } from '../core/ops/items'
import { addInner, deleteInner, deleteVertex } from '../core/ops/tent'
import { installFakeMatchMedia } from '../ui/shell/fakeMatchMedia'
import { getZones, useStats, useZones } from './derived'
import { createStores, initialPointer, StoresProvider, useDoc, useStores, useUi, type Stores } from './stores'

const NOW = '2026-10-08T00:00:00.000Z'

function tunnelLayout(): Layout {
  return createLayout(
    {
      name: '터널 4인 예시',
      outer: { kind: 'rect', w: 620, h: 320 },
      inners: [{ id: 'in1', name: '이너 1', shape: { kind: 'rect', w: 220, h: 300 }, x: -200, y: 0, rotation: 0 }],
    },
    { name: '터널 4인 예시 배치', id: 'L1', now: NOW },
  )
}

function mat(id: string, x: number): Item {
  return {
    id,
    name: '매트',
    shape: { kind: 'rect', w: 200, h: 60 },
    x,
    y: 0,
    rotation: 0,
    color: 'blue',
    category: 'MAT',
    countsArea: true,
  }
}

function wrapperFor(stores: Stores) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <StoresProvider stores={stores}>{children}</StoresProvider>
  }
}

describe('useStores', () => {
  it('StoresProvider 밖에서 부르면 오류', () => {
    // React가 렌더 오류를 console.error로도 알리므로 출력만 막는다
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => renderHook(() => useStores())).toThrow('useStores는 StoresProvider 안에서만 쓸 수 있어요')
    spy.mockRestore()
  })

  it('StoresProvider 안에서는 넘긴 묶음을 그대로 돌려준다', () => {
    const stores = createStores(tunnelLayout())
    const { result } = renderHook(() => useStores(), { wrapper: wrapperFor(stores) })
    expect(result.current).toBe(stores)
  })
})

describe('useDoc·useUi', () => {
  it('스토어가 바뀌면 다시 그린다', () => {
    const stores = createStores(tunnelLayout())
    const { result } = renderHook(
      () => ({ count: useDoc((s) => s.layout.items.length), selection: useUi((s) => s.selection) }),
      { wrapper: wrapperFor(stores) },
    )
    expect(result.current.count).toBe(0)
    act(() => {
      stores.doc.getState().commit((d) => addItem(d, mat('m1', -200)))
      stores.ui.getState().setSelection(['m1'])
    })
    expect(result.current.count).toBe(1)
    expect(result.current.selection).toEqual(['m1'])
  })

  it('컴포넌트에서 쓸 수 있다', () => {
    const stores = createStores(tunnelLayout())
    function Name() {
      return <p>{useDoc((s) => s.layout.name)}</p>
    }
    render(
      <StoresProvider stores={stores}>
        <Name />
      </StoresProvider>,
    )
    expect(screen.getByText('터널 4인 예시 배치')).toBeTruthy()
    act(() => stores.doc.getState().rename('캠핑 첫날'))
    expect(screen.getByText('캠핑 첫날')).toBeTruthy()
  })
})

describe('리뷰 회귀: 첫 포인터 추정(initialPointer)', () => {
  it('주 입력이 터치(pointer: coarse)면 touch, 아니면 mouse', () => {
    const media = installFakeMatchMedia({ '(pointer: coarse)': true })
    try {
      expect(initialPointer()).toBe('touch')
      media.set('(pointer: coarse)', false)
      expect(initialPointer()).toBe('mouse')
    } finally {
      media.restore()
    }
  })

  it('createStores는 첫 포인터를 기기에 맞춰 둔다(시트로 추가한 물건에 마우스용 핸들이 붙지 않게)', () => {
    const media = installFakeMatchMedia({ '(pointer: coarse)': true })
    try {
      expect(createStores(tunnelLayout()).ui.getState().pointer).toBe('touch')
    } finally {
      media.restore()
    }
  })
})

describe('createStores — 실행 취소 뒤 선택 정리(§8, Review Focus 4)', () => {
  it('추가를 실행 취소하면 그 물건이 선택에서 빠진다', () => {
    const stores = createStores(tunnelLayout())
    stores.doc.getState().commit((d) => addItem(d, mat('m1', -200)))
    stores.ui.getState().setSelection(['m1'])
    expect(stores.doc.getState().undo()).toBe(true)
    expect(stores.doc.getState().layout.items).toHaveLength(0)
    expect(stores.ui.getState().selection).toEqual([])
  })

  it('삭제를 실행 취소하면 물건이 돌아오고, 다시 실행하면 선택에 없는 id가 남지 않는다', () => {
    const stores = createStores(tunnelLayout())
    stores.doc.getState().commit((d) => {
      addItem(d, mat('m1', -200))
      addItem(d, mat('m2', 150))
    })
    stores.doc.getState().commit((d) => deleteItems(d, ['m1']))
    stores.doc.getState().undo()
    expect(stores.doc.getState().layout.items.map((it) => it.id)).toEqual(['m1', 'm2'])
    stores.ui.getState().setSelection(['m1', 'm2'])
    stores.doc.getState().redo()
    expect(stores.ui.getState().selection).toEqual(['m2'])
  })

  it('있는 물건만 바뀐 실행 취소는 선택을 그대로 둔다', () => {
    const stores = createStores(tunnelLayout())
    stores.doc.getState().commit((d) => addItem(d, mat('m1', -200)))
    stores.doc.getState().commit((d) => moveItems(d, ['m1'], 50, 0))
    stores.ui.getState().setSelection(['m1'])
    stores.doc.getState().undo()
    expect(stores.doc.getState().layout.items[0]?.x).toBe(-200)
    expect(stores.ui.getState().selection).toEqual(['m1'])
  })

  it('load로 다른 배치를 열면 없는 id를 뺀다', () => {
    const stores = createStores(tunnelLayout())
    stores.doc.getState().commit((d) => addItem(d, mat('m1', -200)))
    stores.ui.getState().setSelection(['m1'])
    stores.doc.getState().load(tunnelLayout())
    expect(stores.ui.getState().selection).toEqual([])
  })
})

describe('createStores — 실행 취소 뒤 텐트 편집 대상 정리(Review Focus 3)', () => {
  it('이너 추가 → 대상 선택 → 실행 취소하면 대상이 풀리고, 다시 실행해도 없는 id를 가리키지 않는다', () => {
    const stores = createStores(tunnelLayout())
    stores.ui.getState().setMode('tent')
    let id = null as string | null
    stores.doc.getState().commit((d) => {
      const r = addInner(d, getZones(stores.doc.getState().layout))
      if (r.ok) id = r.id
    })
    if (id === null) throw new Error('이너를 추가하지 못함')
    stores.ui.getState().selectTentTarget({ innerId: id }, 1)
    expect(stores.doc.getState().undo()).toBe(true)
    expect(stores.ui.getState().tentTarget).toBeNull()
    expect(stores.ui.getState().vertexIndex).toBeNull()
    expect(stores.doc.getState().redo()).toBe(true)
    // 다시 실행으로 이너는 돌아오지만 대상은 저절로 되살아나지 않는다(없는 id도 가리키지 않음)
    expect(stores.doc.getState().layout.tent.inners.map((it) => it.id)).toContain(id)
    expect(stores.ui.getState().tentTarget).toBeNull()
  })

  it('선택한 이너를 지웠다가 실행 취소하면 이너는 돌아오고 대상은 없다(dangling 없음)', () => {
    const stores = createStores(tunnelLayout())
    stores.ui.getState().setMode('tent')
    stores.ui.getState().selectTentTarget({ innerId: 'in1' })
    stores.doc.getState().commit((d) => deleteInner(d, 'in1'))
    expect(stores.ui.getState().tentTarget).toBeNull()
    stores.doc.getState().undo()
    expect(stores.doc.getState().layout.tent.inners.map((it) => it.id)).toEqual(['in1'])
    expect(stores.ui.getState().tentTarget).toBeNull()
    stores.ui.getState().selectTentTarget({ innerId: 'in1' })
    stores.doc.getState().redo()
    expect(stores.ui.getState().tentTarget).toBeNull()
  })

  it('꼭짓점을 지워 번호가 범위를 넘으면 vertexIndex만 풀린다', () => {
    const stores = createStores(tunnelLayout())
    stores.ui.getState().setMode('tent')
    stores.ui.getState().selectTentTarget('outer', 3)
    stores.doc.getState().commit((d) => {
      deleteVertex(d, 'outer', 0)
    })
    expect(stores.ui.getState().tentTarget).toBe('outer')
    expect(stores.ui.getState().vertexIndex).toBeNull()
    stores.ui.getState().selectTentTarget('outer', 2)
    stores.doc.getState().undo()
    expect(stores.ui.getState().vertexIndex).toBe(2)
  })

  it('load로 다른 배치를 열면 없는 이너 대상을 푼다', () => {
    const stores = createStores(tunnelLayout())
    stores.ui.getState().setMode('tent')
    stores.ui.getState().selectTentTarget({ innerId: 'in1' })
    const other = tunnelLayout()
    other.tent.inners = []
    stores.doc.getState().load(other)
    expect(stores.ui.getState().tentTarget).toBeNull()
  })
})

describe('useZones·useStats', () => {
  it('물건을 옮기면 통계가 바뀌고 구역은 같은 객체로 남는다', () => {
    const stores = createStores(tunnelLayout())
    stores.doc.getState().commit((d) => addItem(d, mat('m1', -200)))
    const { result } = renderHook(() => ({ zones: useZones(), stats: useStats() }), { wrapper: wrapperFor(stores) })
    const zonesBefore = result.current.zones
    expect(result.current.stats.totalInner.occupied).toBe(12000)
    act(() => {
      stores.doc.getState().commit((d) => moveItems(d, ['m1'], 400, 0))
    })
    expect(result.current.stats.totalInner.occupied).toBe(0)
    expect(result.current.stats.totalFloor.occupied).toBe(12000)
    expect(result.current.zones).toBe(zonesBefore)
  })
})
