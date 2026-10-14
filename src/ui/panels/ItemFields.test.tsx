// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StoresProvider, createStores, type Stores } from '../../app/stores'
import { createLayout, type Item, type Tent } from '../../core/model'
import { PropertiesPanel } from './PropertiesPanel'

afterEach(cleanup)

const TENT: Tent = { name: '테스트 텐트', outer: { kind: 'rect', w: 600, h: 300 }, inners: [] }

function item(id: string, over: Partial<Item> = {}): Item {
  return {
    id,
    name: '롤테이블',
    shape: { kind: 'rect', w: 90, h: 60 },
    x: 0,
    y: 0,
    rotation: 0,
    color: 'green',
    category: 'TABLE',
    countsArea: true,
    ...over,
  }
}

function setup(items: Item[], selection: string[]): Stores {
  const layout = createLayout(TENT, { name: '배치', id: 'L1', now: '2026-10-08T00:00:00.000Z' })
  layout.items = items
  const stores = createStores(layout)
  stores.ui.getState().setSelection(selection)
  render(
    <StoresProvider stores={stores}>
      <PropertiesPanel />
    </StoresProvider>,
  )
  return stores
}

function docItem(stores: Stores, id: string): Item | undefined {
  return stores.doc.getState().layout.items.find((it) => it.id === id)
}

function input(label: string): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement
}

function typeAndEnter(label: string, text: string): void {
  const el = input(label)
  act(() => el.focus())
  fireEvent.change(el, { target: { value: text } })
  fireEvent.keyDown(el, { key: 'Enter' })
}

describe('PropertiesPanel 빈 상태', () => {
  it('선택이 없으면 빈 안내만 보인다', () => {
    setup([item('a')], [])
    expect(screen.getByText(/^캔버스에서 물건을 선택하면/)).toBeTruthy()
    expect(screen.queryByLabelText('이름')).toBeNull()
  })
})

describe('ItemFields 치수', () => {
  it('비율 유지(기본 켬): 가로를 바꾸면 세로도 같은 배율, 스위치로 끔', () => {
    const stores = setup([item('a')], ['a'])
    expect((screen.getByRole('switch', { name: '비율 유지' }) as HTMLInputElement).checked).toBe(true)
    typeAndEnter('가로', '180')
    expect(docItem(stores, 'a')?.shape).toEqual({ kind: 'rect', w: 180, h: 120 })
    fireEvent.click(screen.getByRole('switch', { name: '비율 유지' }))
    expect(stores.ui.getState().keepRatio).toBe(false)
  })

  it('비율 유지 끔: 사각형은 가로·세로, 가로 입력 → 그 축만 반영, 표시는 문서 값(0.1cm 반올림)', () => {
    const stores = setup([item('a')], ['a'])
    act(() => stores.ui.getState().patch({ keepRatio: false }))
    expect(screen.getByRole('heading', { name: '선택한 물건' })).toBeTruthy()
    expect(input('가로').value).toBe('90')
    expect(input('세로').value).toBe('60')
    typeAndEnter('가로', '250.04')
    expect(docItem(stores, 'a')?.shape).toEqual({ kind: 'rect', w: 250, h: 60 })
    expect(input('가로').value).toBe('250')
    expect(stores.doc.getState().canUndo).toBe(true)
  })

  it('원은 지름 칸만 있다', () => {
    const stores = setup([item('a', { name: '스툴', shape: { kind: 'circle', d: 35 } })], ['a'])
    expect(input('지름').value).toBe('35')
    expect(screen.queryByLabelText('가로')).toBeNull()
    expect(screen.queryByLabelText('세로')).toBeNull()
    typeAndEnter('지름', '40')
    expect(docItem(stores, 'a')?.shape).toEqual({ kind: 'circle', d: 40 })
  })

  it('비율 유지 끔: 다각형은 바운딩 박스 가로·세로를 보여 주고, 가로를 바꾸면 가운데 기준으로 그 축만 늘린다', () => {
    const tri = item('a', {
      shape: {
        kind: 'polygon',
        points: [
          [-50, -30],
          [50, -30],
          [0, 30],
        ],
      },
    })
    const stores = setup([tri], ['a'])
    act(() => stores.ui.getState().patch({ keepRatio: false }))
    expect(input('가로').value).toBe('100')
    expect(input('세로').value).toBe('60')
    typeAndEnter('가로', '200')
    expect(docItem(stores, 'a')?.shape).toEqual({
      kind: 'polygon',
      points: [
        [-100, -30],
        [100, -30],
        [0, 30],
      ],
    })
  })

  it('범위 밖(0)은 문서를 바꾸지 않고 되돌리며 오류를 보여 준다', () => {
    const stores = setup([item('a')], ['a'])
    typeAndEnter('가로', '0')
    expect(docItem(stores, 'a')?.shape).toEqual({ kind: 'rect', w: 90, h: 60 })
    expect(input('가로').value).toBe('90')
    expect(screen.getByRole('alert').textContent).toBe('1~5,000 사이로 입력해 주세요')
    expect(stores.doc.getState().canUndo).toBe(false)
  })
})

describe('ItemFields 회전', () => {
  it('400을 넣으면 40으로 정규화한다(위치는 그대로)', () => {
    const stores = setup([item('a', { x: 30, y: -20 })], ['a'])
    typeAndEnter('회전', '400')
    expect(docItem(stores, 'a')).toMatchObject({ rotation: 40, x: 30, y: -20 })
    expect(input('회전').value).toBe('40')
  })

  it('[90도] 두 번이면 180, 피벗은 그 물건의 원점', () => {
    const stores = setup([item('a', { x: 30, y: -20 })], ['a'])
    const btn = screen.getByRole('button', { name: '90도' })
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(docItem(stores, 'a')).toMatchObject({ rotation: 180, x: 30, y: -20 })
    expect(input('회전').value).toBe('180')
  })
})

describe('ItemFields 이름·색·카테고리·점유 면적', () => {
  it('이름을 바꾸면 번호 없이 그대로 저장되고 실행 취소 1칸', () => {
    const stores = setup([item('a'), item('b', { name: '캠핑의자' })], ['a'])
    typeAndEnter('이름', '캠핑의자')
    expect(docItem(stores, 'a')?.name).toBe('캠핑의자')
    act(() => {
      stores.doc.getState().undo()
    })
    expect(docItem(stores, 'a')?.name).toBe('롤테이블')
  })

  it('색 견본 8개(44px 누름), 누르면 그 색이 되고 선택 표시가 옮겨 간다', () => {
    const stores = setup([item('a')], ['a'])
    const group = screen.getByRole('group', { name: '색' })
    const swatches = group.querySelectorAll('button')
    expect([...swatches].map((b) => b.getAttribute('aria-label'))).toEqual([
      '파랑',
      '청록',
      '초록',
      '보라',
      '분홍',
      '회색',
      '하늘',
      '갈색',
    ])
    expect(screen.getByRole('button', { name: '초록' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '하늘' }))
    expect(docItem(stores, 'a')?.color).toBe('sky')
    expect(screen.getByRole('button', { name: '하늘' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '초록' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('카테고리 select는 바꾸는 즉시 반영하고 글자는 16px', () => {
    const stores = setup([item('a')], ['a'])
    const select = screen.getByLabelText('카테고리') as HTMLSelectElement
    expect(select.style.fontSize).toBe('16px')
    expect([...select.options].map((o) => o.textContent)).toEqual(['매트', '의자', '테이블', '수납·가구', '깔개', '기타'])
    fireEvent.change(select, { target: { value: 'FURNITURE' } })
    expect(docItem(stores, 'a')?.category).toBe('FURNITURE')
  })

  it("'점유 면적에 포함' 토글", () => {
    const stores = setup([item('a')], ['a'])
    const toggle = screen.getByRole('switch', { name: '점유 면적에 포함' }) as HTMLInputElement
    expect(toggle.checked).toBe(true)
    fireEvent.click(toggle)
    expect(docItem(stores, 'a')?.countsArea).toBe(false)
  })
})

describe('ItemFields 복제·삭제', () => {
  it('[복제]하면 (+20,+20)에 번호 붙은 복제본이 생기고 그것이 선택된다', () => {
    const stores = setup([item('a', { x: 10, y: 10 })], ['a'])
    fireEvent.click(screen.getByRole('button', { name: '복제' }))
    const items = stores.doc.getState().layout.items
    expect(items).toHaveLength(2)
    const copy = items[1]
    expect(copy).toMatchObject({ name: '롤테이블 2', x: 30, y: 30 })
    expect(stores.ui.getState().selection).toEqual([copy?.id])
    expect(input('이름').value).toBe('롤테이블 2')
  })

  it('[삭제]하면 물건이 사라지고 선택이 비며 빈 안내로 바뀐다', () => {
    const stores = setup([item('a')], ['a'])
    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
    expect(stores.doc.getState().layout.items).toHaveLength(0)
    expect(stores.ui.getState().selection).toEqual([])
    expect(screen.getByText(/^캔버스에서 물건을 선택하면/)).toBeTruthy()
  })
})

describe('모서리 둥글기(소유자 요청 2026-10-14)', () => {
  it('모든 모서리 같은 값, 너무 크면 되는 값까지, 0이면 뾰족', () => {
    const stores = setup([item('a', { shape: { kind: 'rect', w: 200, h: 60 } })], ['a'])
    expect(input('모서리 둥글기').value).toBe('0')
    typeAndEnter('모서리 둥글기', '10')
    expect(docItem(stores, 'a')?.shape).toEqual({ kind: 'rect', w: 200, h: 60, radii: [10, 10, 10, 10] })
    act(() => input('모서리 둥글기').blur())
    typeAndEnter('모서리 둥글기', '100')
    expect(docItem(stores, 'a')?.shape).toEqual({ kind: 'rect', w: 200, h: 60, radii: [30, 30, 30, 30] })
    act(() => input('모서리 둥글기').blur())
    typeAndEnter('모서리 둥글기', '0')
    expect(docItem(stores, 'a')?.shape).toEqual({ kind: 'rect', w: 200, h: 60 })
  })

  it('모서리마다 칸(사각형은 위치 이름): 그 모서리만 바뀌고, 칸에 들어가면 캔버스가 그 모서리를 강조', () => {
    const stores = setup([item('a', { shape: { kind: 'rect', w: 200, h: 60 } })], ['a'])
    expect(['모서리 1(왼쪽 위)', '모서리 2(오른쪽 위)', '모서리 3(오른쪽 아래)', '모서리 4(왼쪽 아래)'].map((l) => input(l).value)).toEqual(['0', '0', '0', '0'])
    act(() => input('모서리 3(오른쪽 아래)').focus())
    expect(stores.ui.getState().polygonFocus).toEqual({ kind: 'vertex', index: 2 })
    typeAndEnter('모서리 3(오른쪽 아래)', '12')
    expect(docItem(stores, 'a')?.shape).toEqual({ kind: 'rect', w: 200, h: 60, radii: [0, 0, 12, 0] })
    act(() => input('모서리 3(오른쪽 아래)').blur())
    expect(stores.ui.getState().polygonFocus).toBeNull()
  })

  it('꼭짓점마다 다르면 빈칸과 안내, 원은 칸이 없다', () => {
    setup([item('a', { shape: { kind: 'rect', w: 200, h: 60, radii: [5, 0, 0, 0] } })], ['a'])
    expect(input('모서리 둥글기').value).toBe('')
    expect(screen.getByText(/꼭짓점마다 달라요/)).toBeTruthy()
    cleanup()
    setup([item('b', { shape: { kind: 'circle', d: 40 } })], ['b'])
    expect(screen.queryByLabelText('모서리 둥글기')).toBeNull()
  })
})

describe('Review Focus 2: 입력 중 다른 물건을 고름', () => {
  it('가로를 고치다 선택이 b로 바뀐 뒤 blur돼도 값은 a에 들어가고, 칸은 b의 값을 보여 준다', () => {
    const stores = setup([item('a'), item('b', { name: '자충매트', shape: { kind: 'rect', w: 200, h: 60 } })], ['a'])
    act(() => stores.ui.getState().patch({ keepRatio: false }))
    const el = input('가로')
    act(() => el.focus())
    fireEvent.change(el, { target: { value: '120' } })
    act(() => stores.ui.getState().setSelection(['b']))
    act(() => el.blur())
    expect(docItem(stores, 'a')?.shape).toEqual({ kind: 'rect', w: 120, h: 60 })
    expect(docItem(stores, 'b')?.shape).toEqual({ kind: 'rect', w: 200, h: 60 })
    expect(input('가로').value).toBe('200')
    expect(input('이름').value).toBe('자충매트')
  })
})
