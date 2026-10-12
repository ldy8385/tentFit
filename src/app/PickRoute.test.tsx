// @vitest-environment happy-dom
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeMatchMedia, type FakeMedia } from '../ui/shell/fakeMatchMedia'
import { DESKTOP_QUERY } from '../ui/shell/useIsDesktop'
import { clearLayoutRepo, createLayoutFromTent, getLayout, layoutCount, listLayoutSummaries, setLastLayoutId } from './layoutRepo'
import { CATALOG_ERROR_TEXT, getPickReturn, PickRoute, setPickReturn } from './PickRoute'
import { defaultTentPreset, loadGenericTents } from './presets'
import { editHash, parseHash } from './router'
import type { TentCatalog } from './tentCatalog'

// 텐트 목록 불러오기(동적 import)는 테스트마다 결과를 정합니다.
const load = vi.hoisted(() => vi.fn<() => Promise<TentCatalog>>())
vi.mock('./tentCatalog', () => ({ loadTentCatalog: load }))

const CATALOG: TentCatalog = { generic: loadGenericTents(), brands: [] }

let media: FakeMedia

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function seedLayout() {
  const preset = defaultTentPreset()
  return createLayoutFromTent(preset.tent, { sourcePresetId: preset.id })
}

beforeEach(() => {
  window.history.replaceState(null, '', '/#/pick')
  clearLayoutRepo()
  setPickReturn(null)
  load.mockReset()
  load.mockResolvedValue(CATALOG)
  media = installFakeMatchMedia({ [DESKTOP_QUERY]: true })
})

afterEach(() => {
  media.restore()
  vi.restoreAllMocks()
})

describe('PickRoute', () => {
  it('불러오는 동안은 「텐트 목록을 불러오는 중…」, 다 불러오면 목록', async () => {
    const d = deferred<TentCatalog>()
    load.mockReturnValueOnce(d.promise)
    render(<PickRoute />)
    expect(screen.getByRole('status').textContent).toBe('텐트 목록을 불러오는 중…')
    await act(async () => d.resolve(CATALOG))
    expect(screen.getByRole('heading', { level: 2, name: '일반 예시' })).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('불러오기에 실패하면 오류 문구와 [다시 시도], 다시 시도하면 다시 불러온다', async () => {
    load.mockRejectedValueOnce(new Error('청크를 못 받음'))
    render(<PickRoute />)
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain(CATALOG_ERROR_TEXT)
    const d = deferred<TentCatalog>()
    load.mockReturnValueOnce(d.promise)
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('텐트 목록을 불러오는 중…')
    await act(async () => d.resolve(CATALOG))
    expect(screen.getByRole('heading', { level: 2, name: '일반 예시' })).toBeTruthy()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('카드를 고르면 확인 없이 새 배치를 만들어 편집기 주소로 push한다(두 번 눌러도 하나)', async () => {
    const replace = vi.spyOn(window.location, 'replace')
    render(<PickRoute />)
    const card = await screen.findByRole('button', { name: '터널 4인 예시' })
    fireEvent.click(card)
    fireEvent.click(card)
    expect(layoutCount()).toBe(1)
    const route = parseHash(window.location.hash)
    expect(route.name).toBe('edit')
    const layout = getLayout(route.name === 'edit' ? route.layoutId : '')!
    expect(layout.name).toBe('터널 4인 예시 배치')
    expect(layout.sourcePresetId).toBe('generic/tunnel-4p')
    expect(replace).not.toHaveBeenCalled()
  })

  it('배치가 0개면 "내 배치"가 없고, 있으면 목록 대화상자를 열어 행으로 그 배치를 연다', async () => {
    const first = render(<PickRoute />)
    await screen.findByRole('heading', { level: 2, name: '일반 예시' })
    expect(screen.queryByRole('button', { name: '내 배치' })).toBeNull()
    first.unmount()

    const a = seedLayout()
    render(<PickRoute />)
    fireEvent.click(await screen.findByRole('button', { name: '내 배치' }))
    const dialog = screen.getByRole('dialog', { name: '내 배치' })
    fireEvent.click(within(dialog).getByRole('button', { name: a.name }))
    expect(window.location.hash).toBe(editHash(a.id))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(layoutCount()).toBe(1)
  })

  it('[+ 새 배치]는 대화상자만 닫고 [취소]를 보이며, [취소]는 마지막으로 연 배치로 돌아간다(R3)', async () => {
    const a = seedLayout()
    const b = seedLayout()
    setLastLayoutId(a.id)
    render(<PickRoute />)
    expect(screen.queryByRole('button', { name: '취소' })).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: '내 배치' }))
    fireEvent.click(screen.getByRole('button', { name: '+ 새 배치' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(window.location.hash).toBe('#/pick')
    expect(getPickReturn()).toEqual({ layoutId: a.id })

    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    expect(window.location.hash).toBe(editHash(a.id))
    expect(getPickReturn()).toBeNull()
    expect(listLayoutSummaries().map((s) => s.id).sort()).toEqual([a.id, b.id].sort())
  })

  it('[+ 새 배치] 뒤 카드를 고르면 돌아갈 배치 표시를 비운다', async () => {
    const a = seedLayout()
    setLastLayoutId(a.id)
    render(<PickRoute />)
    fireEvent.click(await screen.findByRole('button', { name: '내 배치' }))
    fireEvent.click(screen.getByRole('button', { name: '+ 새 배치' }))
    fireEvent.click(await screen.findByRole('button', { name: '돔 2인 예시' }))
    expect(getPickReturn()).toBeNull()
    expect(layoutCount()).toBe(2)
  })

  it('밖에서 돌아갈 배치를 넣어 두면(Plan 7 편집기 "새 배치") 처음부터 [취소]가 보인다', async () => {
    const a = seedLayout()
    setPickReturn(a.id)
    render(<PickRoute />)
    fireEvent.click(await screen.findByRole('button', { name: '취소' }))
    expect(window.location.hash).toBe(editHash(a.id))
  })

  it('[직접 만들기]는 이 작업에서는 아무것도 만들지 않는다(Task 7이 연결)', async () => {
    render(<PickRoute />)
    fireEvent.click(await screen.findByTestId('make-tent-card'))
    expect(layoutCount()).toBe(0)
    expect(window.location.hash).toBe('#/pick')
  })
})
