// @vitest-environment happy-dom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { round1, type Tent } from '../../core/model'
import { attachedInner, ngonDiameterFromSide, ngonSideFromDiameter } from '../../core/templates'
import { floorAreaText, initialMakerState, setKind } from '../../app/tentMaker/makerState'
import { installFakeMatchMedia, type FakeMedia } from '../shell/fakeMatchMedia'
import { DESKTOP_QUERY } from '../shell/useIsDesktop'
import { formatNumber } from '../fields/numberInput'
import { previewHeightFor, PREVIEW_FOCUSED_PX } from './makerLayout'
import { TentMaker, type TentMakerMode } from './TentMaker'

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

function renderMaker(mode: TentMakerMode = 'start') {
  const onConfirm = vi.fn<(tent: Tent) => void>()
  const onCancel = vi.fn<() => void>()
  const r = render(<TentMaker mode={mode} myTentNames={[]} onConfirm={onConfirm} onCancel={onCancel} />)
  return { ...r, onConfirm, onCancel }
}

const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement
const confirmButton = () => button('이 텐트로 시작')
const reason = () => screen.getByTestId('tent-maker-reason')
/** 칸을 고치고 blur(반영 시점) */
function commit(label: string, value: string) {
  const el = input(label)
  act(() => el.focus())
  fireEvent.change(el, { target: { value } })
  act(() => el.blur())
}
function confirmedTent(onConfirm: ReturnType<typeof renderMaker>['onConfirm']): Tent {
  const tent = onConfirm.mock.calls[0]?.[0]
  if (tent === undefined) throw new Error('onConfirm이 불리지 않음')
  return tent
}

describe('TentMaker — 초기값과 칸 구성', () => {
  it('R6: 이름 「내 텐트」, 사각형 400×300, 이너 1(180×180, 뒤), 바닥 면적, [이 텐트로 시작] 켜짐', () => {
    renderMaker()
    expect(screen.getByRole('dialog', { name: '텐트 만들기' })).toBeTruthy()
    expect(input('텐트 이름').value).toBe('내 텐트')
    expect(button('사각형').getAttribute('aria-pressed')).toBe('true')
    expect(input('가로').value).toBe('400')
    expect(input('세로').value).toBe('300')
    expect(input('이너 1 폭').value).toBe('180')
    expect(input('이너 1 깊이').value).toBe('180')
    const sides = screen.getByRole('radiogroup', { name: '이너 1 붙일 위치' })
    expect(within(sides).getAllByRole('radio').map((r) => r.textContent)).toEqual(['뒤', '앞', '왼쪽', '오른쪽'])
    expect(within(sides).getByRole('radio', { name: '뒤' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText(floorAreaText(initialMakerState({ myTentNames: [] })))).toBeTruthy()
    expect(confirmButton().disabled).toBe(false)
    expect(reason().textContent).toBe('')
  })

  it('R1·R13: 내 텐트 저장 체크·아직 없는 기능 버튼은 없다', () => {
    renderMaker()
    expect(screen.queryByText('내 텐트에도 저장')).toBeNull()
    expect(screen.queryByRole('button', { name: /측정/ })).toBeNull()
  })

  it('모양 전환: 사다리꼴 4칸(치우침 [±]·도움말)·붙일 위치 앞·뒤 2칸, 정N각형·원은 선택기 숨김, 자유는 좌표 표', () => {
    const s0 = initialMakerState({ myTentNames: [] })
    const { container } = renderMaker()

    fireEvent.click(button('사다리꼴'))
    const trap = setKind(s0, 'trapezoid').trapezoid
    expect(input('앞변').value).toBe(formatNumber(trap.front))
    expect(input('뒷변').value).toBe(formatNumber(trap.back))
    expect(input('깊이').value).toBe(formatNumber(trap.depth))
    expect(input('치우침').value).toBe(formatNumber(trap.offset))
    expect(button('치우침 부호 바꾸기')).toBeTruthy()
    expect(screen.getByText('+면 뒷변이 오른쪽으로')).toBeTruthy()
    const sides = screen.getByRole('radiogroup', { name: '이너 1 붙일 위치' })
    expect(within(sides).getAllByRole('radio').map((r) => r.textContent)).toEqual(['뒤', '앞'])
    expect(screen.queryByLabelText('가로')).toBeNull()

    fireEvent.click(button('정N각형'))
    expect(input('변 수').value).toBe(formatNumber(setKind(s0, 'ngon').ngon.n))
    expect(screen.getByRole('radiogroup', { name: '크기 기준' })).toBeTruthy()
    expect(screen.queryByRole('radiogroup', { name: '이너 1 붙일 위치' })).toBeNull()

    fireEvent.click(button('원'))
    expect(input('지름').value).toBe(formatNumber(setKind(s0, 'circle').circle.d))
    expect(screen.queryByRole('radiogroup', { name: '이너 1 붙일 위치' })).toBeNull()
    expect(container.querySelectorAll('.tf-tp__vertex')).toHaveLength(0)

    fireEvent.click(button('사각형'))
    fireEvent.click(button('자유'))
    expect(button('자유').getAttribute('aria-pressed')).toBe('true')
    expect(within(screen.getByRole('group', { name: '꼭짓점 좌표' })).getAllByRole('listitem')).toHaveLength(4)
    expect(container.querySelectorAll('.tf-tp__vertex')).toHaveLength(4)
    expect(screen.queryByRole('radiogroup', { name: '이너 1 붙일 위치' })).toBeNull()
  })

  it('정사각형을 켜면 세로가 가로를 따르고, 가로를 바꾸면 둘 다 바뀐다', () => {
    renderMaker()
    fireEvent.click(screen.getByRole('checkbox', { name: '정사각형' }))
    expect(input('세로').value).toBe('400')
    commit('가로', '500')
    expect(input('세로').value).toBe('500')
  })

  it('정N각형 크기 기준을 바꾸면 같은 도형이 되도록 값을 환산한다', () => {
    const s0 = initialMakerState({ myTentNames: [] })
    const ngon = setKind(s0, 'ngon').ngon
    renderMaker()
    fireEvent.click(button('정N각형'))
    const group = screen.getByRole('radiogroup', { name: '크기 기준' })
    if (ngon.sizeBy === 'diameter') {
      fireEvent.click(within(group).getByRole('radio', { name: '한 변' }))
      expect(input('한 변').value).toBe(formatNumber(round1(ngonSideFromDiameter(ngon.n, ngon.size))))
    } else {
      fireEvent.click(within(group).getByRole('radio', { name: '지름' }))
      expect(input('지름').value).toBe(formatNumber(round1(ngonDiameterFromSide(ngon.n, ngon.size))))
    }
  })
})

describe('TentMaker — 입력 규칙', () => {
  it('Enter는 다음 칸으로, 마지막 칸(마지막 이너 깊이)이면 blur. 휴대폰 Enter 표시는 next/done', () => {
    const { onConfirm } = renderMaker()
    const order = ['텐트 이름', '가로', '세로', '이너 1 폭', '이너 1 깊이']
    act(() => input(order[0]!).focus())
    for (let i = 0; i < order.length - 1; i++) {
      expect(fireEvent.keyDown(input(order[i]!), { key: 'Enter' })).toBe(false)
      expect(document.activeElement).toBe(input(order[i + 1]!))
    }
    act(() => {
      fireEvent.keyDown(input('이너 1 깊이'), { key: 'Enter' })
    })
    expect(document.activeElement).not.toBe(input('이너 1 깊이'))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(input('텐트 이름').getAttribute('enterkeyhint')).toBe('next')
    expect(input('세로').getAttribute('enterkeyhint')).toBe('next')
    expect(input('이너 1 깊이').getAttribute('enterkeyhint')).toBe('done')
  })

  it('이너를 지우면 마지막 치수 칸이 done이 된다', () => {
    renderMaker()
    fireEvent.click(button('이너 1 삭제'))
    expect(screen.queryByRole('group', { name: '이너 1' })).toBeNull()
    expect(screen.getByText('0개')).toBeTruthy()
    expect(input('세로').getAttribute('enterkeyhint')).toBe('done')
  })

  it('한글 조합을 끝내는 Enter는 칸을 옮기지 않는다', () => {
    renderMaker()
    act(() => input('텐트 이름').focus())
    fireEvent.keyDown(input('텐트 이름'), { key: 'Enter', isComposing: true })
    expect(document.activeElement).toBe(input('텐트 이름'))
  })

  it('정사각형 체크박스의 Enter는 아무것도 확정하지 않는다', () => {
    const { onConfirm } = renderMaker()
    const box = screen.getByRole('checkbox', { name: '정사각형' })
    act(() => box.focus())
    expect(fireEvent.keyDown(box, { key: 'Enter' })).toBe(false)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('입력하는 동안엔 오류를 읽지 않고, 범위 밖으로 blur하면 마지막 유효값으로 되돌리고 칸 아래 오류', () => {
    renderMaker()
    act(() => input('가로').focus())
    fireEvent.change(input('가로'), { target: { value: '0' } })
    expect(screen.queryByRole('alert')).toBeNull()
    act(() => input('가로').blur())
    expect(input('가로').value).toBe('400')
    expect(screen.getByRole('alert').textContent).toBe('1~5,000 사이로 입력해 주세요')
    expect(confirmButton().disabled).toBe(false)
  })

  it('입력칸 글자는 모두 16px', () => {
    const { container } = renderMaker()
    for (const el of container.querySelectorAll<HTMLInputElement>('input[type="text"]')) expect(el.style.fontSize).toBe('16px')
  })
})

describe('TentMaker — 이너와 확정 조건', () => {
  it('외곽 치수를 바꾸면 붙인 이너가 다시 붙고, 확정하면 그 텐트가 나간다', async () => {
    const { onConfirm } = renderMaker()
    commit('세로', '400')
    commit('텐트 이름', '  쉘터 A ')
    fireEvent.click(confirmButton())
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
    const tent = confirmedTent(onConfirm)
    expect(tent.name).toBe('쉘터 A')
    expect(tent.outer).toEqual({ kind: 'rect', w: 400, h: 400 })
    const expected = attachedInner({ kind: 'rect', w: 400, h: 400 }, 'back', 180, 180)
    expect(tent.inners).toHaveLength(1)
    expect(tent.inners[0]).toMatchObject({ x: expected?.x, y: expected?.y, rotation: 0, shape: { kind: 'rect', w: 180, h: 180 } })
  })

  it('붙일 위치를 왼쪽으로 바꾸면 회전 0으로 w = 깊이, h = 폭', async () => {
    const { onConfirm } = renderMaker()
    commit('이너 1 폭', '200')
    fireEvent.click(within(screen.getByRole('radiogroup', { name: '이너 1 붙일 위치' })).getByRole('radio', { name: '왼쪽' }))
    fireEvent.click(confirmButton())
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
    const expected = attachedInner({ kind: 'rect', w: 400, h: 300 }, 'left', 200, 180)
    expect(confirmedTent(onConfirm).inners[0]).toMatchObject({ x: expected?.x, y: expected?.y, rotation: 0, shape: { kind: 'rect', w: 180, h: 200 } })
  })

  it('이너 추가가 겹치면 추가하지 않고 「빈 공간이 부족해요」 토스트', () => {
    renderMaker()
    // 소유자 확인 1: 기본 상태에서는 깊이를 줄여 붙으므로, 이너 1이 외곽 전체를 덮게 해 어느 벽에도 안 들어가게 합니다.
    commit('이너 1 폭', '400')
    commit('이너 1 깊이', '300')
    fireEvent.click(button('+ 이너 추가'))
    expect(screen.getByText('빈 공간이 부족해요')).toBeTruthy()
    expect(screen.getByText('1개')).toBeTruthy()
    expect(screen.queryByRole('group', { name: '이너 2' })).toBeNull()
  })

  it('이너끼리 겹치게 바꾸면 확정이 꺼지고 사유를 보이며, 고치면 다시 켜진다', () => {
    renderMaker()
    commit('세로', '600')
    fireEvent.click(button('+ 이너 추가'))
    expect(screen.getByRole('group', { name: '이너 2' })).toBeTruthy()
    expect(confirmButton().disabled).toBe(false)
    commit('이너 2 깊이', '500')
    expect(confirmButton().disabled).toBe(true)
    expect(reason().textContent).toBe('이너 1과(와) 이너 2이(가) 5mm 넘게 겹쳐요')
    expect(confirmButton().getAttribute('aria-describedby')).toBe(reason().id)
    commit('이너 2 깊이', '100')
    expect(confirmButton().disabled).toBe(false)
    expect(reason().textContent).toBe('')
  })

  it('이너 이탈은 확정할 수 있고, 미리보기와 카드에 경고를 보인다', async () => {
    const { container, onConfirm } = renderMaker()
    commit('이너 1 폭', '500')
    expect(confirmButton().disabled).toBe(false)
    expect(screen.getByText('이너 1이 외곽 밖으로 나감')).toBeTruthy()
    expect(container.querySelector('.tf-tp__inner--escape')).not.toBeNull()
    fireEvent.click(confirmButton())
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
  })

  it('자유 모양: 좌표 표는 외곽 왼쪽 위 기준이고, 표에 포커스가 있는 동안 기준점이 고정된다', async () => {
    const { onConfirm } = renderMaker()
    fireEvent.click(button('자유'))
    expect(input('1번 꼭짓점 X').value).toBe('0')
    expect(input('2번 꼭짓점 X').value).toBe('400')
    act(() => input('1번 꼭짓점 X').focus())
    fireEvent.change(input('1번 꼭짓점 X'), { target: { value: '-50' } })
    act(() => {
      fireEvent.keyDown(input('1번 꼭짓점 X'), { key: 'Enter' })
    })
    // 아직 표 안(1번 Y)에 포커스 → 기준점 고정, 다른 행 표시값 그대로
    expect(document.activeElement).toBe(input('1번 꼭짓점 Y'))
    expect(input('1번 꼭짓점 X').value).toBe('-50')
    expect(input('2번 꼭짓점 X').value).toBe('400')
    // 표 밖으로 나가면 기준점을 다시 계산(새 왼쪽 위 = 1번 꼭짓점)
    act(() => input('텐트 이름').focus())
    expect(input('1번 꼭짓점 X').value).toBe('0')
    expect(input('2번 꼭짓점 X').value).toBe('450')
    fireEvent.click(confirmButton())
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
    const outer = confirmedTent(onConfirm).outer
    expect(outer.kind).toBe('polygon')
    if (outer.kind === 'polygon') expect(outer.points[0]).toEqual([-250, -150])
  })
})

describe('TentMaker — history와 확정·취소', () => {
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

  it('‹(뒤로)도 취소와 같다', async () => {
    const { onCancel, onConfirm } = renderMaker()
    fireEvent.click(button('뒤로'))
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1))
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('브라우저 뒤로 가기(popstate)로 항목이 빠지면 onCancel 한 번', async () => {
    const { onCancel } = renderMaker()
    act(() => window.history.back())
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1))
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('확정은 항목을 먼저 지우고 onConfirm 한 번, onCancel은 부르지 않는다', async () => {
    const { onConfirm, onCancel } = renderMaker()
    fireEvent.click(confirmButton())
    fireEvent.click(confirmButton())
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
    expect(onCancel).not.toHaveBeenCalled()
    expect(window.history.length).toBe(baseLength + 1)
    expect((window.history.state as { tentMaker?: unknown } | null)?.tentMaker).toBeUndefined()
  })

  it('텐트 바꾸기에서 열면 확정 문구가 「이 텐트로 바꾸기」', () => {
    renderMaker('swap')
    expect(button('이 텐트로 바꾸기')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '이 텐트로 시작' })).toBeNull()
  })
})

describe('TentMaker — 휴대폰', () => {
  beforeEach(() => {
    media.set(DESKTOP_QUERY, false)
  })

  it('[취소] 없이 짧은 [✓ 시작](접근 이름은 전체 문구), 미리보기가 위에 있다', () => {
    renderMaker()
    expect(screen.queryByRole('button', { name: '취소' })).toBeNull()
    expect(confirmButton().textContent).toBe('✓ 시작')
    expect(screen.getByTestId('tent-maker').getAttribute('data-layout')).toBe('mobile')
    expect(screen.getByTestId('tent-maker-preview').style.height).toBe(`${previewHeightFor(window.innerHeight, false)}px`)
  })

  it('입력에 포커스가 있는 동안 미리보기를 140px로 줄이고 포커스 칸을 scrollIntoView', () => {
    const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {})
    renderMaker()
    act(() => input('이너 1 깊이').focus())
    expect(screen.getByTestId('tent-maker-preview').style.height).toBe(`${PREVIEW_FOCUSED_PX}px`)
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' })
    expect(scroll.mock.contexts.at(-1)).toBe(input('이너 1 깊이'))
    act(() => input('이너 1 깊이').blur())
    expect(screen.getByTestId('tent-maker-preview').style.height).toBe(`${previewHeightFor(window.innerHeight, false)}px`)
  })

  it('PC에서는 포커스해도 미리보기 높이를 건드리지 않는다', () => {
    media.set(DESKTOP_QUERY, true)
    renderMaker()
    act(() => input('가로').focus())
    expect(screen.getByTestId('tent-maker-preview').style.height).toBe('')
  })
})
