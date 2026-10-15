// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadGenericTents } from '../../test/genericTents'
import type { TentCatalog } from '../../app/tentCatalog'
import { installFakeMatchMedia, type FakeMedia } from '../shell/fakeMatchMedia'
import { DESKTOP_QUERY } from '../shell/useIsDesktop'
import { PickScreen } from './PickScreen'

let media: FakeMedia

beforeEach(() => {
  media = installFakeMatchMedia({ [DESKTOP_QUERY]: true })
})

afterEach(() => {
  media.restore()
})

const CATALOG: TentCatalog = { generic: loadGenericTents(), brands: [] }

type Props = Parameters<typeof PickScreen>[0]

function renderPick(over: Partial<Props> = {}) {
  const props: Props = {
    catalog: CATALOG,
    layoutCount: 0,
    showCancel: false,
    onPick: vi.fn(),
    onMake: vi.fn(),
    onOpenMyLayouts: vi.fn(),
    onCancel: vi.fn(),
    ...over,
  }
  const view = render(<PickScreen {...props} />)
  return { props, view }
}

describe('PickScreen', () => {
  it('로고 tentFit과 부제, 제목·부제 문구', () => {
    renderPick()
    expect(screen.getByTestId('pick-screen').textContent).toContain('tentFit')
    expect(screen.getByText('텐트 배치 시뮬레이터')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: '어떤 텐트로 시작할까요?' })).toBeTruthy()
    expect(screen.getByText('텐트를 고르면 바닥 평면이 만들어져요. 모든 데이터는 이 브라우저에만 저장됩니다.')).toBeTruthy()
  })

  it('"내 배치"는 배치가 1개 이상일 때만 보이고, 누르면 onOpenMyLayouts', () => {
    const { props, view } = renderPick({ layoutCount: 0 })
    expect(screen.queryByRole('button', { name: '내 배치' })).toBeNull()
    view.rerender(<PickScreen {...props} layoutCount={1} />)
    fireEvent.click(screen.getByRole('button', { name: '내 배치' }))
    expect(props.onOpenMyLayouts).toHaveBeenCalledTimes(1)
  })

  it('[취소]는 showCancel일 때만 보이고, 누르면 onCancel', () => {
    const { props, view } = renderPick({ layoutCount: 2 })
    expect(screen.queryByRole('button', { name: '취소' })).toBeNull()
    view.rerender(<PickScreen {...props} showCancel />)
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    expect(props.onCancel).toHaveBeenCalledTimes(1)
  })

  it('도움말 `?` 버튼은 없다(D25)', () => {
    renderPick({ layoutCount: 3, showCancel: true })
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent ?? '')
    expect(names.some((n) => n.includes('?') || n.includes('도움말'))).toBe(false)
  })

  it('불러오는 중·오류 상태를 목록에 넘긴다(오류면 [다시 시도] → onRetry)', () => {
    const onRetry = vi.fn()
    const { props, view } = renderPick({ catalog: null })
    expect(screen.getByRole('status').textContent).toBe('텐트 목록을 불러오는 중…')
    view.rerender(<PickScreen {...props} catalog={null} error="텐트 목록을 불러오지 못했어요" onRetry={onRetry} />)
    expect(screen.getByRole('alert').textContent).toContain('텐트 목록을 불러오지 못했어요')
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('카드는 onPick, [직접 만들기]는 onMake', () => {
    const { props } = renderPick()
    fireEvent.click(screen.getByRole('button', { name: '돔 2인 예시' }))
    expect(props.onPick).toHaveBeenCalledWith(CATALOG.generic.find((t) => t.id === 'generic/dome-2p'))
    fireEvent.click(screen.getByTestId('make-tent-card'))
    expect(props.onMake).toHaveBeenCalledTimes(1)
  })

  it('휴대폰은 data-layout mobile이고 "내 배치"는 아이콘 아래 글자(이름은 글자)', () => {
    media.set(DESKTOP_QUERY, false)
    renderPick({ layoutCount: 1 })
    expect(screen.getByTestId('pick-screen').getAttribute('data-layout')).toBe('mobile')
    const mine = screen.getByRole('button', { name: '내 배치' })
    expect(mine.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    expect(mine.lastElementChild?.textContent).toBe('내 배치')
  })
})
