// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeMatchMedia, type FakeMedia } from '../ui/shell/fakeMatchMedia'
import { DESKTOP_QUERY } from '../ui/shell/useIsDesktop'
import App from './App'
import { clearMemoryLayouts, getMemoryLayout, listMemoryLayouts } from './memoryLayouts'
import { defaultTentPreset } from './presets'
import { editHash, parseHash, useRoute } from './router'
import type { TentfitTestHook } from './testHook'

// Board는 react-konva라 happy-dom에서 그리지 않습니다(캔버스 동작은 Task 13 Playwright).
vi.mock('../view/canvas/Board', () => ({ Board: () => <div data-testid="mock-board" /> }))

let media: FakeMedia

function hook(): TentfitTestHook | undefined {
  return (window as unknown as { __tentfit?: TentfitTestHook }).__tentfit
}

function currentEditId(): string {
  const route = parseHash(window.location.hash)
  if (route.name !== 'edit') throw new Error(`편집기 주소가 아님: ${window.location.hash}`)
  return route.layoutId
}

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  clearMemoryLayouts()
  media = installFakeMatchMedia({ [DESKTOP_QUERY]: true })
})

afterEach(() => {
  cleanup()
  media.restore()
})

describe('useRoute', () => {
  it('hashchange를 따라 Route가 바뀐다', async () => {
    const { result } = renderHook(() => useRoute())
    expect(result.current).toEqual({ name: 'start' })
    act(() => {
      window.location.hash = editHash('abc')
    })
    await waitFor(() => expect(result.current).toEqual({ name: 'edit', layoutId: 'abc' }))
  })
})

describe('App', () => {
  it('시작하면 기본 텐트로 새 배치를 만들고 #/edit/<id>로 바꾼 뒤 PC 셸을 연다', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('desktop-shell')).toBeTruthy())
    const id = currentEditId()
    const layout = getMemoryLayout(id)!
    const preset = defaultTentPreset()
    expect(layout.name).toBe(`${preset.tent.name} 배치`)
    expect(layout.tent.name).toBe(preset.tent.name)
    expect(layout.sourcePresetId).toBe(preset.id)
    expect(layout.items).toEqual([])
    expect(screen.getByTestId('mock-board')).toBeTruthy()
  })

  it('PC 기준(DESKTOP_QUERY)에 안 맞으면 모바일 셸, 창을 넓히면 PC 셸로 바뀐다', async () => {
    media.set(DESKTOP_QUERY, false)
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('mobile-shell')).toBeTruthy())
    expect(screen.queryByTestId('desktop-shell')).toBeNull()
    act(() => media.set(DESKTOP_QUERY, true))
    expect(screen.getByTestId('desktop-shell')).toBeTruthy()
  })

  it('StrictMode에서도 배치를 하나만 만든다', async () => {
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
    await waitFor(() => expect(screen.getByTestId('desktop-shell')).toBeTruthy())
    expect(listMemoryLayouts()).toHaveLength(1)
  })

  it('메모리에 없는 배치 주소면 새 배치를 만들어 그 주소로 바꾼다', async () => {
    window.history.replaceState(null, '', `/${editHash('없는-배치')}`)
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('desktop-shell')).toBeTruthy())
    expect(currentEditId()).not.toBe('없는-배치')
    expect(listMemoryLayouts()).toHaveLength(1)
  })

  it("다시 시작하면 같은 이름에 번호를 붙인다('<텐트 이름> 배치 2')", async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('desktop-shell')).toBeTruthy())
    const firstId = currentEditId()
    const name = `${defaultTentPreset().tent.name} 배치`
    act(() => {
      window.location.hash = '#/'
    })
    await waitFor(() => expect(currentEditId()).not.toBe(firstId))
    expect(getMemoryLayout(firstId)?.name).toBe(name)
    expect(getMemoryLayout(currentEditId())?.name).toBe(`${name} 2`)
  })

  it('다른 배치로 갔다가 돌아오면 고친 내용이 남아 있다(메모리 보관본이 최신)', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('desktop-shell')).toBeTruthy())
    const firstId = currentEditId()
    const input = screen.getByLabelText('배치 이름') as HTMLInputElement
    act(() => input.focus())
    fireEvent.change(input, { target: { value: '첫 배치' } })
    act(() => input.blur())
    expect(getMemoryLayout(firstId)?.name).toBe('첫 배치')

    act(() => {
      window.location.hash = '#/'
    })
    await waitFor(() => expect(currentEditId()).not.toBe(firstId))
    expect((screen.getByLabelText('배치 이름') as HTMLInputElement).value).toBe(`${defaultTentPreset().tent.name} 배치`)
    act(() => {
      window.location.hash = editHash(firstId)
    })
    await waitFor(() => expect((screen.getByLabelText('배치 이름') as HTMLInputElement).value).toBe('첫 배치'))
    expect(listMemoryLayouts()).toHaveLength(2)
  })

  it('리뷰 회귀: 캔버스 밖(시트·버튼)을 눌러도 마지막 포인터 종류를 기억한다', async () => {
    const view = render(<App />)
    await waitFor(() => expect(hook()).toBeDefined())
    expect(hook()!.getUi().pointer).toBe('mouse')
    fireEvent.pointerDown(document.body, { pointerType: 'touch' })
    expect(hook()!.getUi().pointer).toBe('touch')
    fireEvent.pointerDown(document.body, { pointerType: 'pen' })
    expect(hook()!.getUi().pointer).toBe('pen')
    view.unmount()
  })

  it('테스트 모드에서는 window.__tentfit을 설치하고, 언마운트하면 지운다', async () => {
    const view = render(<App />)
    await waitFor(() => expect(hook()).toBeDefined())
    const doc = hook()!.getDoc()
    expect(doc.layout.tent.name).toBe(defaultTentPreset().tent.name)
    expect(doc.canUndo).toBe(false)
    expect(hook()!.getUi().selection).toEqual([])
    expect(hook()!.ready).toBe(false)
    view.unmount()
    expect(hook()).toBeUndefined()
  })
})
