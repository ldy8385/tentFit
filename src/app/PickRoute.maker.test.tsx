// @vitest-environment happy-dom
// Task 7: 고르기 화면의 [직접 만들기] → 텐트 만들기 오버레이 연결(PickRoute.test.tsx는 Task 5 몫이라 파일을 나눔).
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { installFakeMatchMedia, type FakeMedia } from '../ui/shell/fakeMatchMedia'
import { DESKTOP_QUERY } from '../ui/shell/useIsDesktop'
import { clearLayoutRepo, getLayout, listLayoutSummaries } from './layoutRepo'
import { clearPickReturn, PickRoute } from './PickRoute'
import { parseHash } from './router'

let media: FakeMedia

beforeEach(() => {
  window.history.replaceState(null, '', '/#/pick')
  clearLayoutRepo()
  clearPickReturn()
  media = installFakeMatchMedia({ [DESKTOP_QUERY]: true })
})

afterEach(() => {
  media.restore()
})

const maker = () => screen.queryByTestId('tent-maker')
const overlayMark = () => (window.history.state as { tentMaker?: unknown } | null)?.tentMaker

async function openMaker() {
  render(<PickRoute />)
  fireEvent.click(await screen.findByRole('button', { name: /직접 만들기/ }))
  expect(maker()).not.toBeNull()
}

describe('PickRoute — 직접 만들기', () => {
  it('확정하면 새 배치(sourcePresetId 없음, 빈 물건)를 만들고 편집기로 push한다. 뒤로 가면 바로 고르기 화면', async () => {
    await openMaker()
    fireEvent.click(screen.getByRole('button', { name: '이 텐트로 시작' }))
    await waitFor(() => expect(parseHash(window.location.hash).name).toBe('edit'))
    const route = parseHash(window.location.hash)
    if (route.name !== 'edit') throw new Error('편집기 주소가 아님')
    const layout = getLayout(route.layoutId)
    expect(layout?.name).toBe('내 텐트 배치')
    expect(layout?.tent.name).toBe('내 텐트')
    expect(layout?.tent.outer).toEqual({ kind: 'rect', w: 400, h: 300 })
    expect(layout?.tent.inners).toHaveLength(1)
    expect(layout?.sourcePresetId).toBeUndefined()
    expect(layout?.items).toEqual([])
    expect(maker()).toBeNull()
    expect(overlayMark()).toBeUndefined()
    // 오버레이 항목이 남지 않았으므로 뒤로 가기 한 번이면 고르기 화면
    act(() => window.history.back())
    await waitFor(() => expect(window.location.hash).toBe('#/pick'))
    expect(overlayMark()).toBeUndefined()
  })

  it('[취소]는 배치를 만들지 않고 고르기 화면으로 돌아간다', async () => {
    await openMaker()
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    await waitFor(() => expect(maker()).toBeNull())
    expect(listLayoutSummaries()).toHaveLength(0)
    expect(window.location.hash).toBe('#/pick')
    expect(overlayMark()).toBeUndefined()
  })

  it('브라우저 뒤로 가기도 배치를 만들지 않고 오버레이만 닫는다', async () => {
    await openMaker()
    act(() => window.history.back())
    await waitFor(() => expect(maker()).toBeNull())
    expect(listLayoutSummaries()).toHaveLength(0)
    expect(window.location.hash).toBe('#/pick')
  })

  it('다시 열어도 처음 값(R6)으로 시작한다', async () => {
    await openMaker()
    const name = screen.getByLabelText('텐트 이름') as HTMLInputElement
    act(() => name.focus())
    fireEvent.change(name, { target: { value: '쉘터' } })
    act(() => name.blur())
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    await waitFor(() => expect(maker()).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: /직접 만들기/ }))
    expect((screen.getByLabelText('텐트 이름') as HTMLInputElement).value).toBe('내 텐트')
  })
})
