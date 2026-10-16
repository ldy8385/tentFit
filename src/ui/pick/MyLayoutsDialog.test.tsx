// @vitest-environment happy-dom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LayoutSummary } from '../../app/layoutRepo'
import { installFakeMatchMedia, type FakeMedia } from '../shell/fakeMatchMedia'
import { DESKTOP_QUERY } from '../shell/useIsDesktop'
import { MyLayoutsDialog } from './MyLayoutsDialog'
import { layoutMetaText } from './pickSections'

let media: FakeMedia

beforeEach(() => {
  media = installFakeMatchMedia({ [DESKTOP_QUERY]: true })
})

afterEach(() => {
  media.restore()
  vi.unstubAllGlobals()
})

const SUMMARIES: LayoutSummary[] = [
  { id: 'b', name: '터널 4인 예시 배치 2', updatedAt: new Date(2026, 9, 8, 14, 7).toISOString(), itemCount: 0 },
  { id: 'a', name: '터널 4인 예시 배치', updatedAt: new Date(2026, 9, 8, 9, 30).toISOString(), itemCount: 4 },
]

function renderDialog(over: Partial<Parameters<typeof MyLayoutsDialog>[0]> = {}) {
  const props = { open: true, summaries: SUMMARIES, onOpen: vi.fn(), onNew: vi.fn(), onClose: vi.fn(), ...over }
  render(<MyLayoutsDialog {...props} />)
  return props
}

describe('MyLayoutsDialog', () => {
  it('open이 false면 그리지 않는다', () => {
    renderDialog({ open: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it("제목 '내 배치', 맨 위 [+ 새 배치](처음 포커스), 행은 받은 순서 그대로 이름 · '수정 HH:MM · 물건 N개'", () => {
    renderDialog()
    const dialog = screen.getByRole('dialog', { name: '내 배치' })
    const buttons = within(dialog).getAllByRole('button')
    expect(buttons[1]!.textContent).toBe('+ 새 배치')
    expect(document.activeElement).toBe(buttons[1])
    const rows = Array.from(dialog.querySelectorAll('.tf-mylayouts__row'))
    expect(rows.map((r) => r.getAttribute('data-layout-id'))).toEqual(['b', 'a'])
    expect(rows.map((r) => r.querySelector('.tf-mylayouts__meta')?.textContent)).toEqual([
      '수정 14:07 · 물건 0개',
      '수정 09:30 · 물건 4개',
    ])
    expect(layoutMetaText(SUMMARIES[1]!)).toBe('수정 09:30 · 물건 4개')
  })

  it('행 이름은 배치 이름이고, 누르면 onOpen(id)', () => {
    const props = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: '터널 4인 예시 배치' }))
    expect(props.onOpen).toHaveBeenCalledWith('a')
  })

  it('[전체 지우기]는 확인(배치 N개)하면 onDeleteAll, 확인을 취소하면 아무것도 안 함(2026-10-16)', () => {
    // 이 환경(happy-dom)에는 window.confirm이 없어 심어 둡니다.
    const confirm = vi.fn<(message?: string) => boolean>().mockReturnValueOnce(false).mockReturnValueOnce(true)
    vi.stubGlobal('confirm', confirm)
    const props = renderDialog({ onDeleteAll: vi.fn() })
    const button = screen.getByRole('button', { name: '전체 지우기' })
    fireEvent.click(button)
    expect(props.onDeleteAll).not.toHaveBeenCalled()
    fireEvent.click(button)
    expect(props.onDeleteAll).toHaveBeenCalledTimes(1)
    expect(confirm).toHaveBeenCalledWith('내 배치 2개를 모두 지울까요? 되돌릴 수 없어요.')
  })

  it('onDeleteAll이 없으면 [전체 지우기]가 없다', () => {
    renderDialog()
    expect(screen.queryByRole('button', { name: '전체 지우기' })).toBeNull()
  })

  it('배치가 없으면 [전체 지우기]가 없다', () => {
    renderDialog({ summaries: [], onDeleteAll: vi.fn() })
    expect(screen.queryByRole('button', { name: '전체 지우기' })).toBeNull()
  })

  it('[+ 새 배치]는 onNew, Esc·[닫기]는 onClose', () => {
    const props = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: '+ 새 배치' }))
    expect(props.onNew).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(screen.getByRole('button', { name: '+ 새 배치' }), { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(props.onClose).toHaveBeenCalledTimes(2)
  })
})
