// @vitest-environment happy-dom
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createStores, StoresProvider, type Stores } from '../../app/stores'
import { createLayout, type Tent } from '../../core/model'
import { Toolbar } from './Toolbar'

const TENT: Tent = { name: '시험 텐트', outer: { kind: 'rect', w: 400, h: 300 }, inners: [] }
/** 이너가 외곽을 꽉 채워 새 이너를 둘 바닥 조각이 없는 텐트 */
const FULL_TENT: Tent = {
  name: '꽉 찬 텐트',
  outer: { kind: 'rect', w: 400, h: 300 },
  inners: [{ id: 'i-full', name: '이너 1', shape: { kind: 'rect', w: 400, h: 300 }, x: 0, y: 0, rotation: 0 }],
}

function renderToolbar(tent: Tent = TENT): Stores {
  const stores = createStores(createLayout(tent, { name: '배치' }))
  render(
    <StoresProvider stores={stores}>
      <Toolbar />
    </StoresProvider>,
  )
  return stores
}

const toolNames = () =>
  within(screen.getByTestId('toolbar'))
    .getAllByRole('button')
    .map((b) => b.getAttribute('aria-label') ?? b.textContent)

describe('Toolbar(모바일) — 배치 모드', () => {
  it('버튼은 [+물건]·[텐트]·[선택] 세 개다([측정]은 Plan 5)', () => {
    renderToolbar()
    expect(toolNames()).toEqual(['+물건', '텐트', '선택'])
  })

  it('[+물건]은 라이브러리 시트를 열고, 열려 있으면 닫는다', () => {
    const stores = renderToolbar()
    const add = screen.getByRole('button', { name: '+물건' })
    expect(add.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(add)
    expect(stores.ui.getState().mobileSheet).toBe('library')
    expect(add.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(add)
    expect(stores.ui.getState().mobileSheet).toBe('none')
  })

  it('[+물건]은 선택 시트가 열려 있어도 라이브러리 시트로 바꾼다', () => {
    const stores = renderToolbar()
    stores.ui.getState().patch({ mobileSheet: 'selection' })
    fireEvent.click(screen.getByRole('button', { name: '+물건' }))
    expect(stores.ui.getState().mobileSheet).toBe('library')
  })

  it('[선택]은 selectToggle을 켜고 끄며 켜짐을 aria-pressed로 보여 준다', () => {
    const stores = renderToolbar()
    const toggle = screen.getByRole('button', { name: '선택' })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(toggle)
    expect(stores.ui.getState().selectToggle).toBe(true)
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(toggle)
    expect(stores.ui.getState().selectToggle).toBe(false)
  })

  it('[텐트]는 텐트 편집 모드로 바꾸고, 열린 라이브러리 시트를 닫는다(setMode 정리 규칙)', () => {
    const stores = renderToolbar()
    stores.ui.getState().patch({ mobileSheet: 'library' })
    fireEvent.click(screen.getByRole('button', { name: '텐트' }))
    expect(stores.ui.getState().mode).toBe('tent')
    expect(stores.ui.getState().mobileSheet).toBe('none')
    expect(toolNames()).toEqual(['+이너', '완료'])
  })

  it('측정 중에는 [텐트]가 비활성이다', () => {
    const stores = renderToolbar()
    act(() => stores.ui.getState().patch({ measuring: true }))
    expect((screen.getByRole('button', { name: '텐트' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('Toolbar(모바일) — 텐트 편집 모드', () => {
  function tentMode(tent: Tent = TENT): Stores {
    const stores = renderToolbar(tent)
    act(() => stores.ui.getState().setMode('tent'))
    return stores
  }

  it('버튼은 [+이너]·[완료] 두 개다(R13, [측정]은 Plan 5)', () => {
    tentMode()
    expect(toolNames()).toEqual(['+이너', '완료'])
  })

  it('[+이너]는 이너를 하나 더하고 그 이너를 편집 대상으로 고른다(실행 취소 1칸)', () => {
    const stores = tentMode()
    fireEvent.click(screen.getByRole('button', { name: '+이너' }))
    const inners = stores.doc.getState().layout.tent.inners
    expect(inners).toHaveLength(1)
    expect(stores.ui.getState().tentTarget).toEqual({ innerId: inners[0]!.id })
    expect(stores.doc.getState().canUndo).toBe(true)
  })

  it('[+이너]: 빈 공간이 없으면 추가하지 않고 「빈 공간이 부족해요」 토스트(기록 없음)', () => {
    const stores = tentMode(FULL_TENT)
    fireEvent.click(screen.getByRole('button', { name: '+이너' }))
    expect(stores.doc.getState().layout.tent.inners).toHaveLength(1)
    expect(stores.ui.getState().toast?.text).toBe('빈 공간이 부족해요')
    expect(stores.doc.getState().canUndo).toBe(false)
  })

  it('[완료]는 배치 모드로 돌아가고 편집 대상·텐트 시트를 정리한다', () => {
    const stores = tentMode()
    act(() => {
      stores.ui.getState().selectTentTarget('outer', 1)
      stores.ui.getState().patch({ mobileSheet: 'tent' })
    })
    fireEvent.click(screen.getByRole('button', { name: '완료' }))
    expect(stores.ui.getState().mode).toBe('place')
    expect(stores.ui.getState().tentTarget).toBeNull()
    expect(stores.ui.getState().vertexIndex).toBeNull()
    expect(stores.ui.getState().mobileSheet).toBe('none')
    expect(toolNames()).toEqual(['+물건', '텐트', '선택'])
  })

  it('시트가 열려 있어도 툴바는 그대로 보이고 [완료]를 누를 수 있다(D29)', () => {
    const stores = tentMode()
    act(() => stores.ui.getState().patch({ mobileSheet: 'warnings' }))
    expect(toolNames()).toEqual(['+이너', '완료'])
    fireEvent.click(screen.getByRole('button', { name: '완료' }))
    expect(stores.ui.getState().mode).toBe('place')
  })

  it('측정 중에는 [+이너]·[완료]가 비활성이다(§4.3)', () => {
    const stores = tentMode()
    act(() => stores.ui.getState().patch({ measuring: true }))
    expect((screen.getByRole('button', { name: '+이너' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '완료' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
