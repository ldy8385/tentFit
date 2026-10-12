// @vitest-environment happy-dom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Tent } from '../../core/model'
import type { TentfitTestHook } from '../../app/testHook'
import { installFakeMatchMedia, type FakeMedia } from '../shell/fakeMatchMedia'
import { DESKTOP_QUERY } from '../shell/useIsDesktop'
import { DRAWING_REASON, NEED_OUTER_REASON, TentMaker, type TentMakerMode } from './TentMaker'

// 캔버스(Konva)는 happy-dom에서 그리지 않습니다. 외곽·이너는 도구 줄 예시 버튼(DOM)으로 만듭니다.
vi.mock('../../view/canvas/Board', () => ({ Board: () => <div data-testid="board" /> }))

let media: FakeMedia
let baseLength: number

beforeEach(() => {
  window.history.replaceState(null, '', '/#/pick')
  baseLength = window.history.length
  media = installFakeMatchMedia({ [DESKTOP_QUERY]: true })
})

afterEach(() => {
  media.restore()
  vi.restoreAllMocks()
})

function renderMaker(mode: TentMakerMode = 'start', myTentNames: string[] = []) {
  const onConfirm = vi.fn<(tent: Tent) => void>()
  const onCancel = vi.fn<() => void>()
  const r = render(<TentMaker mode={mode} myTentNames={myTentNames} onConfirm={onConfirm} onCancel={onCancel} />)
  return { ...r, onConfirm, onCancel }
}

const maker = () => screen.getByTestId('tent-maker')
const button = (name: string) => within(maker()).getByRole('button', { name }) as HTMLButtonElement
const tools = () => within(screen.getByRole('toolbar', { name: '모양 도구' }))
const tool = (name: string) => tools().getByRole('button', { name }) as HTMLButtonElement
const reason = () => screen.getByTestId('tent-maker-reason')
const hook = () => (window as unknown as { __tentfitMaker?: TentfitTestHook }).__tentfitMaker
const doc = () => hook()!.getDoc()
const ui = () => hook()!.getUi()
const step = () => maker().dataset.step

function confirmedTent(onConfirm: ReturnType<typeof renderMaker>['onConfirm']): Tent {
  const tent = onConfirm.mock.calls[0]?.[0]
  if (tent === undefined) throw new Error('onConfirm이 불리지 않음')
  return tent
}

/** 단계 ①에서 사각형 외곽 → [다음] */
function toStep2(): void {
  fireEvent.click(tool('사각형'))
  fireEvent.click(button('다음'))
}

describe('TentMaker — 단계 ① 외곽', () => {
  it('처음에는 외곽 없음: 단계 ①, 이름 「내 텐트」, 도구 줄 예시 4종 + 자유 그리기, [다음]은 꺼짐과 사유', () => {
    renderMaker()
    expect(screen.getByRole('dialog', { name: '텐트 만들기' })).toBeTruthy()
    expect(step()).toBe('1')
    expect((within(maker()).getByLabelText('텐트 이름') as HTMLInputElement).value).toBe('내 텐트')
    expect(tools().getAllByRole('button').map((b) => b.textContent)).toEqual(['사각형', '사다리꼴', '육각형', '정N각형', '원', '자유 그리기'])
    expect(button('다음').disabled).toBe(true)
    expect(reason().textContent).toBe(NEED_OUTER_REASON)
    expect(button('다음').getAttribute('aria-describedby')).toBe(reason().id)
    expect(ui().outerPending).toBe(true)
    expect(ui().tentLock).toBe('inners')
    expect(ui().mode).toBe('tent')
  })

  it('예시를 고르면 외곽이 생기고 선택되며 [다음]이 켜진다. 다시 고르면 바꾸고 실행 취소 1칸', () => {
    renderMaker()
    fireEvent.click(tool('사다리꼴'))
    expect(doc().layout.tent.outerTemplate).toEqual({ kind: 'trapezoid', front: 400, back: 300, depth: 300, offset: 0 })
    expect(doc().canUndo).toBe(false)
    expect(ui().tentTarget).toBe('outer')
    expect(button('다음').disabled).toBe(false)
    expect(reason().textContent).toBe('')
    fireEvent.click(tool('원'))
    expect(doc().layout.tent.outer).toEqual({ kind: 'circle', d: 400 })
    fireEvent.click(button('실행 취소'))
    expect(doc().layout.tent.outerTemplate?.kind).toBe('trapezoid')
  })

  it('[자유 그리기]는 외곽 그리기를 시작하고, 그리는 중에는 [다음]·실행 취소가 꺼진다(사유)', () => {
    renderMaker()
    fireEvent.click(tool('사각형'))
    fireEvent.click(tool('자유 그리기'))
    expect(ui().drawing?.goal).toBe('outer')
    expect(button('다음').disabled).toBe(true)
    expect(reason().textContent).toBe(DRAWING_REASON)
    expect(button('실행 취소').disabled).toBe(true)
    expect(within(maker()).getByRole('toolbar', { name: '그리기' })).toBeTruthy()
    fireEvent.click(button('그리기 취소'))
    expect(ui().drawing).toBeNull()
    expect(button('다음').disabled).toBe(false)
  })

  it('Ctrl+Z는 만들기 화면 스토어를 되돌린다(자기 루트는 모달로 치지 않음)', () => {
    renderMaker()
    fireEvent.click(tool('사각형'))
    fireEvent.click(tool('원'))
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', key: 'z', ctrlKey: true, bubbles: true, cancelable: true }))
    })
    expect(doc().layout.tent.outer).toEqual({ kind: 'rect', w: 400, h: 300 })
  })
})

describe('TentMaker — 단계 ② 이너', () => {
  it('[다음] → 단계 ②: 외곽 잠금·대상 해제, 이너 0개로도 확정 가능, ‹ 이름은 「외곽으로」', () => {
    renderMaker()
    toStep2()
    expect(step()).toBe('2')
    expect(ui().tentLock).toBe('outer')
    expect(ui().tentTarget).toBeNull()
    expect(button('이 텐트로 시작').disabled).toBe(false)
    expect(button('외곽으로')).toBeTruthy()
    expect(within(maker()).queryByRole('button', { name: '뒤로' })).toBeNull()
  })

  it('도구 줄 예시는 이너를 더하고 고른다. 「외곽으로」는 이너를 지닌 채 단계 ①로', () => {
    renderMaker()
    toStep2()
    fireEvent.click(tool('정N각형'))
    expect(doc().layout.tent.inners).toHaveLength(1)
    expect(doc().layout.tent.inners[0]!.template?.kind).toBe('ngon')
    expect(ui().tentTarget).toEqual({ innerId: doc().layout.tent.inners[0]!.id })
    fireEvent.click(button('외곽으로'))
    expect(step()).toBe('1')
    expect(ui().tentLock).toBe('inners')
    expect(doc().layout.tent.inners).toHaveLength(1)
    expect(ui().tentTarget).toBeNull()
  })

  it('[자유 그리기]는 새 이너 그리기, 그리는 중 확정은 꺼짐', () => {
    renderMaker()
    toStep2()
    fireEvent.click(tool('자유 그리기'))
    expect(ui().drawing?.goal).toBe('newInner')
    expect(button('이 텐트로 시작').disabled).toBe(true)
    expect(reason().textContent).toBe(DRAWING_REASON)
  })

  it('확정: 이름(앞뒤 공백 정리)·외곽·이너가 담긴 텐트로 onConfirm 한 번', async () => {
    const { onConfirm } = renderMaker()
    const name = within(maker()).getByLabelText('텐트 이름') as HTMLInputElement
    act(() => name.focus())
    fireEvent.change(name, { target: { value: '  쉘터 A  ' } })
    act(() => name.blur())
    toStep2()
    fireEvent.click(tool('사각형'))
    fireEvent.click(button('이 텐트로 시작'))
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
    const tent = confirmedTent(onConfirm)
    expect(tent.name).toBe('쉘터 A')
    expect(tent.outer).toEqual({ kind: 'rect', w: 400, h: 300 })
    expect(tent.outerTemplate).toEqual({ kind: 'rect', w: 400, h: 300 })
    expect(tent.inners).toHaveLength(1)
  })
})

describe('TentMaker — 포커스·history·확정 문구', () => {
  it('열면 오버레이 안으로 포커스가 들어가고, Tab은 오버레이 안에서만 돌며, 닫히면 원래 자리로', () => {
    const outside = document.createElement('button')
    outside.textContent = '뒤 화면 카드'
    document.body.appendChild(outside)
    outside.focus()
    const { unmount } = renderMaker()
    const root = maker()
    expect(root.contains(document.activeElement)).toBe(true)
    const items = Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)'))
    const first = items[0]
    const last = items[items.length - 1]
    if (first === undefined || last === undefined) throw new Error('컨트롤 없음')
    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
    unmount()
    expect(document.activeElement).toBe(outside)
    outside.remove()
  })

  it('열 때 history 항목 하나(해시 그대로)를 쌓는다', () => {
    renderMaker()
    expect(window.history.length).toBe(baseLength + 1)
    expect(window.location.hash).toBe('#/pick')
    expect((window.history.state as { tentMaker?: unknown } | null)?.tentMaker).toBeTruthy()
  })

  it('StrictMode에서도 항목은 하나만 쌓는다', () => {
    render(
      <StrictMode>
        <TentMaker mode="start" myTentNames={[]} onConfirm={vi.fn()} onCancel={vi.fn()} />
      </StrictMode>,
    )
    expect(window.history.length).toBe(baseLength + 1)
  })

  it('[취소]는 history.back()으로 항목을 지우고 onCancel만 부른다', async () => {
    const back = vi.spyOn(window.history, 'back')
    const { onConfirm, onCancel } = renderMaker()
    fireEvent.click(button('취소'))
    expect(back).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1))
    expect(onConfirm).not.toHaveBeenCalled()
    expect((window.history.state as { tentMaker?: unknown } | null)?.tentMaker).toBeUndefined()
  })

  it('단계 ①의 ‹(뒤로)는 취소와 같다', async () => {
    const { onCancel, onConfirm } = renderMaker()
    fireEvent.click(button('뒤로'))
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1))
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('브라우저 뒤로 가기는 단계 ②에서도 취소(onCancel 한 번)', async () => {
    const { onCancel } = renderMaker()
    toStep2()
    act(() => window.history.back())
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1))
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('확정은 항목을 먼저 지우고 onConfirm 한 번, onCancel은 부르지 않는다', async () => {
    const { onConfirm, onCancel } = renderMaker()
    toStep2()
    fireEvent.click(button('이 텐트로 시작'))
    fireEvent.click(button('이 텐트로 시작'))
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
    expect(onCancel).not.toHaveBeenCalled()
    expect(window.history.length).toBe(baseLength + 1)
    expect((window.history.state as { tentMaker?: unknown } | null)?.tentMaker).toBeUndefined()
  })

  it('텐트 바꾸기에서 열면 확정 문구가 「이 텐트로 바꾸기」, 편집기 훅은 덮지 않는다', () => {
    const editorHook = { marker: 'editor' }
    ;(window as unknown as { __tentfit?: unknown }).__tentfit = editorHook
    renderMaker('swap')
    toStep2()
    expect(button('이 텐트로 바꾸기')).toBeTruthy()
    expect(within(maker()).queryByRole('button', { name: '이 텐트로 시작' })).toBeNull()
    expect((window as unknown as { __tentfit?: unknown }).__tentfit).toBe(editorHook)
    delete (window as unknown as { __tentfit?: unknown }).__tentfit
  })

  it('PC 패널 제목은 단계 ① 「외곽」, 단계 ② 「이너」, [텐트 바꾸기]는 없다', () => {
    renderMaker()
    expect(within(maker()).getByRole('heading', { name: '외곽' })).toBeTruthy()
    toStep2()
    expect(within(maker()).getByRole('heading', { name: '이너' })).toBeTruthy()
    expect(within(maker()).queryByRole('button', { name: '텐트 바꾸기' })).toBeNull()
  })
})

describe('TentMaker — 휴대폰', () => {
  beforeEach(() => {
    media.set(DESKTOP_QUERY, false)
  })

  it('[취소] 없이 단계 ②의 짧은 [✓ 시작](접근 이름은 전체 문구), 늘 보이는 시트(이름 칸)', () => {
    renderMaker()
    expect(maker().getAttribute('data-layout')).toBe('mobile')
    expect(within(maker()).queryByRole('button', { name: '취소' })).toBeNull()
    const sheet = screen.getByTestId('tent-maker-sheet')
    expect(within(sheet).getByLabelText('텐트 이름')).toBeTruthy()
    toStep2()
    expect(button('이 텐트로 시작').textContent).toBe('✓ 시작')
  })

  it('그리는 중에는 시트를 숨기고 그리기 버튼 줄을 보인다', () => {
    renderMaker()
    fireEvent.click(tool('자유 그리기'))
    expect(screen.queryByTestId('tent-maker-sheet')).toBeNull()
    expect(within(maker()).getByRole('button', { name: '그리기 완료' })).toBeTruthy()
  })
})
