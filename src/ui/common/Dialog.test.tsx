// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeMatchMedia, type FakeMedia } from '../shell/fakeMatchMedia'
import { DESKTOP_QUERY } from '../shell/useIsDesktop'
import { Dialog } from './Dialog'

let media: FakeMedia

beforeEach(() => {
  media = installFakeMatchMedia({ [DESKTOP_QUERY]: true })
})

afterEach(() => {
  media.restore()
})

/** [열기]로 여는 대화상자. 닫으면 open=false로 바꿉니다. */
function Harness(p: { onClose?(): void; withFooter?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        열기
      </button>
      <Dialog
        title="내 배치"
        open={open}
        testId="dlg"
        onClose={() => {
          p.onClose?.()
          setOpen(false)
        }}
        footer={p.withFooter === true ? <button type="button">아래 버튼</button> : undefined}
      >
        <button type="button">첫 버튼</button>
        <button type="button">둘째 버튼</button>
      </Dialog>
    </>
  )
}

function openHarness(p: { onClose?(): void; withFooter?: boolean } = {}): HTMLElement {
  render(<Harness {...p} />)
  const opener = screen.getByRole('button', { name: '열기' })
  opener.focus()
  fireEvent.click(opener)
  return opener
}

describe('Dialog', () => {
  it('open이 false면 아무것도 그리지 않는다', () => {
    render(
      <Dialog title="숨김" open={false} onClose={vi.fn()}>
        <p>본문</p>
      </Dialog>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('본문')).toBeNull()
  })

  it('role="dialog"·aria-modal, 제목이 이름이고 testId가 붙는다', () => {
    openHarness()
    const dialog = screen.getByRole('dialog', { name: '내 배치' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('data-testid')).toBe('dlg')
    expect(screen.getByRole('heading', { name: '내 배치' })).toBeTruthy()
  })

  it('열면 본문의 첫 컨트롤에 포커스한다', () => {
    openHarness()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '첫 버튼' }))
  })

  it('Esc는 onClose를 부르고, 닫히면 열기 전 포커스로 돌아간다', () => {
    const onClose = vi.fn()
    const opener = openHarness({ onClose })
    fireEvent.keyDown(screen.getByRole('button', { name: '둘째 버튼' }), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('[닫기]는 onClose', () => {
    const onClose = vi.fn()
    openHarness({ onClose })
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('배경을 누르면 닫히고, 대화상자 안을 누르거나 안에서 눌러 배경에서 떼면 닫히지 않는다', () => {
    const onClose = vi.fn()
    openHarness({ onClose })
    const dialog = screen.getByRole('dialog')
    const backdrop = dialog.parentElement!

    fireEvent.pointerDown(dialog)
    fireEvent.click(dialog)
    expect(onClose).not.toHaveBeenCalled()

    // 안에서 눌러 배경에서 뗌(글자 선택 끌기): click의 target은 배경이지만 닫지 않습니다.
    fireEvent.pointerDown(screen.getByRole('button', { name: '첫 버튼' }))
    fireEvent.click(backdrop)
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.pointerDown(backdrop)
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Tab은 대화상자 안에서만 돈다(마지막 → 처음, Shift+Tab 처음 → 마지막)', () => {
    openHarness({ withFooter: true })
    const close = screen.getByRole('button', { name: '닫기' })
    const last = screen.getByRole('button', { name: '아래 버튼' })
    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('대화상자 안의 키 입력은 window(편집기 단축키)까지 가지 않는다', () => {
    const onWindowKey = vi.fn()
    window.addEventListener('keydown', onWindowKey)
    try {
      openHarness()
      fireEvent.keyDown(screen.getByRole('button', { name: '첫 버튼' }), { key: 'Delete', code: 'Delete' })
      fireEvent.keyDown(screen.getByRole('button', { name: '첫 버튼' }), { key: 'z', code: 'KeyZ', ctrlKey: true })
      expect(onWindowKey).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', onWindowKey)
    }
  })

  it('footer가 있으면 아래 줄에 그린다', () => {
    openHarness({ withFooter: true })
    const footer = screen.getByRole('button', { name: '아래 버튼' }).closest('footer')
    expect(footer?.className).toBe('tf-dialog__footer')
  })

  it('PC는 가운데 상자, 휴대폰(DESKTOP_QUERY 아님)은 전체 화면', () => {
    openHarness()
    expect(screen.getByRole('dialog').parentElement!.getAttribute('data-fullscreen')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    media.set(DESKTOP_QUERY, false)
    fireEvent.click(screen.getByRole('button', { name: '열기' }))
    expect(screen.getByRole('dialog').parentElement!.getAttribute('data-fullscreen')).toBe('true')
  })
})
