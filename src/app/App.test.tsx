// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Layout } from '../core/model'
import { installFakeMatchMedia, type FakeMedia } from '../ui/shell/fakeMatchMedia'
import { DESKTOP_QUERY } from '../ui/shell/useIsDesktop'
import App from './App'
import {
  clearLayoutRepo,
  createLayoutFromTent,
  getLastLayoutId,
  getLayout,
  layoutCount,
  listLayoutSummaries,
  setLastLayoutId,
} from './layoutRepo'
import { getPickReturn, setPickReturn } from './PickRoute'
import { defaultTentPreset } from './presets'
import { editHash, parseHash, useRoute } from './router'
import type { TentfitAppHook, TentfitTestHook } from './testHook'

// Board는 react-konva라 happy-dom에서 그리지 않습니다(캔버스 동작은 Playwright).
vi.mock('../view/canvas/Board', () => ({ Board: () => <div data-testid="mock-board" /> }))

let media: FakeMedia

function hook(): TentfitTestHook | undefined {
  return (window as unknown as { __tentfit?: TentfitTestHook }).__tentfit
}

function appHook(): TentfitAppHook | undefined {
  return (window as unknown as { __tentfitApp?: TentfitAppHook }).__tentfitApp
}

function currentEditId(): string {
  const route = parseHash(window.location.hash)
  if (route.name !== 'edit') throw new Error(`편집기 주소가 아님: ${window.location.hash}`)
  return route.layoutId
}

/** 고르기 화면을 거치지 않고 터널 4인 예시로 배치를 하나 보관소에 넣습니다. */
function seedLayout(): Layout {
  const preset = defaultTentPreset()
  return createLayoutFromTent(preset.tent, { sourcePresetId: preset.id })
}

function openAt(hash: string): void {
  window.history.replaceState(null, '', `/${hash}`)
}

async function findPickScreen(): Promise<HTMLElement> {
  return screen.findByTestId('pick-screen')
}

/** 고르기 화면에서 '터널 4인 예시' 카드를 고르고 편집기(PC 셸)가 뜰 때까지 기다립니다. */
async function pickTunnel(): Promise<string> {
  const pickScreen = await findPickScreen()
  fireEvent.click(await within(pickScreen).findByRole('button', { name: '터널 4인 예시' }))
  await screen.findByTestId('desktop-shell')
  return currentEditId()
}

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  clearLayoutRepo()
  setPickReturn(null)
  media = installFakeMatchMedia({ [DESKTOP_QUERY]: true })
})

afterEach(() => {
  cleanup()
  media.restore()
  vi.restoreAllMocks()
})

describe('useRoute', () => {
  it('hashchange를 따라 Route가 바뀐다', async () => {
    const { result } = renderHook(() => useRoute())
    expect(result.current).toEqual({ name: 'start' })
    act(() => {
      window.location.hash = '#/pick'
    })
    await waitFor(() => expect(result.current).toEqual({ name: 'pick' }))
    act(() => {
      window.location.hash = editHash('abc')
    })
    await waitFor(() => expect(result.current).toEqual({ name: 'edit', layoutId: 'abc' }))
  })
})

describe('App 시작 규칙(R16)', () => {
  it('배치가 0개면 #/pick으로 바꾸고(location.replace) 고르기 화면을 연다. 배치는 만들지 않는다', async () => {
    const replace = vi.spyOn(window.location, 'replace')
    render(<App />)
    await findPickScreen()
    expect(window.location.hash).toBe('#/pick')
    expect(replace).toHaveBeenCalledWith('#/pick')
    expect(layoutCount()).toBe(0)
    expect(screen.queryByTestId('desktop-shell')).toBeNull()
  })

  it('배치가 있으면 마지막으로 연 배치를 연다(가장 최근 수정보다 우선)', async () => {
    const a = seedLayout()
    seedLayout()
    setLastLayoutId(a.id)
    render(<App />)
    await screen.findByTestId('desktop-shell')
    expect(currentEditId()).toBe(a.id)
    expect(layoutCount()).toBe(2)
  })

  it("'#/'도 시작 규칙을 따른다", async () => {
    const a = seedLayout()
    setLastLayoutId(a.id)
    openAt('#/')
    render(<App />)
    await screen.findByTestId('desktop-shell')
    expect(currentEditId()).toBe(a.id)
  })

  it('메모리에 없는 #/edit/<id>는 새 배치를 만들지 않는다(배치 0개 → 고르기 화면)', async () => {
    openAt(editHash('없는-배치'))
    render(<App />)
    await findPickScreen()
    expect(window.location.hash).toBe('#/pick')
    expect(layoutCount()).toBe(0)
  })

  it('메모리에 없는 #/edit/<id>는 배치가 있으면 마지막 배치로 간다(새로 만들지 않음)', async () => {
    const a = seedLayout()
    setLastLayoutId(a.id)
    openAt(editHash('없는-배치'))
    render(<App />)
    await screen.findByTestId('desktop-shell')
    expect(currentEditId()).toBe(a.id)
    expect(layoutCount()).toBe(1)
  })

  it('StrictMode에서도 시작 이동은 배치를 만들지 않고, 카드를 한 번 고르면 배치는 하나다', async () => {
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
    await findPickScreen()
    expect(layoutCount()).toBe(0)
    await pickTunnel()
    expect(layoutCount()).toBe(1)
  })
})

describe('고르기 화면 → 편집기', () => {
  it("카드를 고르면 확인 없이 '#/edit/<새 id>'로 push, 이름 '<텐트 이름> 배치'·빈 기록·sourcePresetId", async () => {
    const replace = vi.spyOn(window.location, 'replace')
    render(<App />)
    await findPickScreen()
    const replacesBefore = replace.mock.calls.length
    const id = await pickTunnel()
    // 고르기 → 편집기는 replace가 아니라 push(location.hash 대입)
    expect(replace.mock.calls.length).toBe(replacesBefore)
    const layout = getLayout(id)!
    const preset = defaultTentPreset()
    expect(layout.name).toBe('터널 4인 예시 배치')
    expect(layout.tent.name).toBe(preset.tent.name)
    expect(layout.sourcePresetId).toBe(preset.id)
    expect(layout.items).toEqual([])
    await waitFor(() => expect(hook()).toBeDefined())
    expect(hook()!.getDoc().canUndo).toBe(false)
    expect(getLastLayoutId()).toBe(id)
    expect(screen.getByTestId('mock-board')).toBeTruthy()
  })

  it("같은 텐트를 두 번 고르면 이름에 번호를 붙인다('<텐트 이름> 배치 2')", async () => {
    render(<App />)
    const first = await pickTunnel()
    act(() => {
      window.location.hash = '#/pick'
    })
    const second = await pickTunnel()
    expect(second).not.toBe(first)
    expect(getLayout(first)?.name).toBe('터널 4인 예시 배치')
    expect(getLayout(second)?.name).toBe('터널 4인 예시 배치 2')
  })

  it('편집기에서 뒤로 가면 고르기 화면이고, 배치가 있어도 편집기로 되돌아가지 않는다', async () => {
    render(<App />)
    await pickTunnel()
    act(() => window.history.back())
    await findPickScreen()
    expect(window.location.hash).toBe('#/pick')
    expect(screen.getByRole('button', { name: '내 배치' })).toBeTruthy()
    expect(screen.queryByTestId('desktop-shell')).toBeNull()
  })

  it('내 배치 → [+ 새 배치] → [취소]면 원래 배치로 돌아간다(R3)', async () => {
    render(<App />)
    const original = await pickTunnel()
    act(() => window.history.back())
    const pickScreen = await findPickScreen()
    expect(within(pickScreen).queryByRole('button', { name: '취소' })).toBeNull()

    fireEvent.click(within(pickScreen).getByRole('button', { name: '내 배치' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: '내 배치' })).getByRole('button', { name: '+ 새 배치' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(getPickReturn()).toEqual({ layoutId: original })

    fireEvent.click(within(pickScreen).getByRole('button', { name: '취소' }))
    await screen.findByTestId('desktop-shell')
    expect(currentEditId()).toBe(original)
    expect(getPickReturn()).toBeNull()
    expect(layoutCount()).toBe(1)
  })

  it('내 배치 목록의 행을 누르면 그 배치를 연다', async () => {
    const a = seedLayout()
    const b = seedLayout()
    openAt('#/pick')
    render(<App />)
    const pickScreen = await findPickScreen()
    fireEvent.click(within(pickScreen).getByRole('button', { name: '내 배치' }))
    const dialog = screen.getByRole('dialog', { name: '내 배치' })
    expect(within(dialog).getAllByRole('button', { name: /터널 4인 예시 배치/ })).toHaveLength(2)
    fireEvent.click(within(dialog).getByRole('button', { name: a.name }))
    await screen.findByTestId('desktop-shell')
    expect(currentEditId()).toBe(a.id)
    expect(b.id).not.toBe(a.id)
  })
})

describe('편집기', () => {
  it('PC 기준(DESKTOP_QUERY)에 안 맞으면 모바일 셸, 창을 넓히면 PC 셸로 바뀐다', async () => {
    const a = seedLayout()
    openAt(editHash(a.id))
    media.set(DESKTOP_QUERY, false)
    render(<App />)
    await screen.findByTestId('mobile-shell')
    expect(screen.queryByTestId('desktop-shell')).toBeNull()
    act(() => media.set(DESKTOP_QUERY, true))
    expect(screen.getByTestId('desktop-shell')).toBeTruthy()
  })

  it('편집기를 열면 마지막으로 연 배치로 기억한다', async () => {
    const a = seedLayout()
    const b = seedLayout()
    setLastLayoutId(a.id)
    openAt(editHash(b.id))
    render(<App />)
    await screen.findByTestId('desktop-shell')
    await waitFor(() => expect(getLastLayoutId()).toBe(b.id))
  })

  it('다른 배치로 갔다가 돌아오면 고친 내용이 남아 있다(보관본이 최신)', async () => {
    const a = seedLayout()
    const b = seedLayout()
    openAt(editHash(a.id))
    render(<App />)
    await screen.findByTestId('desktop-shell')
    const input = screen.getByLabelText('배치 이름') as HTMLInputElement
    act(() => input.focus())
    fireEvent.change(input, { target: { value: '첫 배치' } })
    act(() => input.blur())
    expect(getLayout(a.id)?.name).toBe('첫 배치')

    act(() => {
      window.location.hash = editHash(b.id)
    })
    await waitFor(() => expect((screen.getByLabelText('배치 이름') as HTMLInputElement).value).toBe(b.name))
    act(() => {
      window.location.hash = editHash(a.id)
    })
    await waitFor(() => expect((screen.getByLabelText('배치 이름') as HTMLInputElement).value).toBe('첫 배치'))
    expect(listLayoutSummaries().map((s) => s.name).sort()).toEqual(['첫 배치', b.name].sort())
  })

  it('리뷰 회귀: 캔버스 밖(시트·버튼)을 눌러도 마지막 포인터 종류를 기억한다', async () => {
    const a = seedLayout()
    openAt(editHash(a.id))
    const view = render(<App />)
    await waitFor(() => expect(hook()).toBeDefined())
    expect(hook()!.getUi().pointer).toBe('mouse')
    fireEvent.pointerDown(document.body, { pointerType: 'touch' })
    expect(hook()!.getUi().pointer).toBe('touch')
    fireEvent.pointerDown(document.body, { pointerType: 'pen' })
    expect(hook()!.getUi().pointer).toBe('pen')
    view.unmount()
  })

  it('테스트 모드에서는 편집기 훅 window.__tentfit을 설치하고, 언마운트하면 지운다', async () => {
    const a = seedLayout()
    openAt(editHash(a.id))
    const view = render(<App />)
    await waitFor(() => expect(hook()).toBeDefined())
    const doc = hook()!.getDoc()
    expect(doc.layout.id).toBe(a.id)
    expect(doc.layout.tent.name).toBe(defaultTentPreset().tent.name)
    expect(doc.canUndo).toBe(false)
    expect(hook()!.getUi().selection).toEqual([])
    expect(hook()!.ready).toBe(false)
    view.unmount()
    expect(hook()).toBeUndefined()
  })
})

describe('앱 수준 테스트 훅', () => {
  it('고르기 화면에서도 window.__tentfitApp.layouts()로 배치 목록(데이터)을 읽고, 언마운트하면 지운다', async () => {
    const view = render(<App />)
    await findPickScreen()
    expect(hook()).toBeUndefined()
    expect(appHook()!.layouts()).toEqual([])
    const id = await pickTunnel()
    const layouts = appHook()!.layouts()
    expect(layouts).toEqual([{ id, name: '터널 4인 예시 배치', updatedAt: getLayout(id)!.updatedAt, itemCount: 0 }])
    expect(JSON.parse(JSON.stringify(layouts))).toEqual(layouts)
    view.unmount()
    expect(appHook()).toBeUndefined()
  })
})
