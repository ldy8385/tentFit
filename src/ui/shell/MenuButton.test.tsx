// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MenuButton } from './MenuButton'

describe('MenuButton 넓힌 속성(Plan 4.1)', () => {
  it('placement up이면 목록이 위로 열린다는 표시(data-placement), 기본은 down', () => {
    const { unmount } = render(<MenuButton label="+ 이너" showLabel placement="up" items={[{ label: '사각형', onSelect: () => undefined }]} />)
    fireEvent.click(screen.getByRole('button', { name: '+ 이너' }))
    expect(screen.getByRole('menu').dataset.placement).toBe('up')
    unmount()
    render(<MenuButton label="보기" items={[{ label: '격자', onSelect: () => undefined }]} />)
    fireEvent.click(screen.getByRole('button', { name: '보기' }))
    expect(screen.getByRole('menu').dataset.placement).toBe('down')
  })

  it('buttonClassName으로 버튼 모양을 바꾸고, disabled면 열리지 않는다', () => {
    const onSelect = vi.fn()
    render(<MenuButton label="+ 이너" showLabel buttonClassName="tf-tent__add" disabled items={[{ label: '사각형', onSelect }]} />)
    const button = screen.getByRole('button', { name: '+ 이너' }) as HTMLButtonElement
    expect(button.className).toBe('tf-tent__add')
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
