// @vitest-environment happy-dom
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOAST_MS, ToastView } from './Toast'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ToastView', () => {
  it('토스트가 없어도 알림 영역(aria-live="polite")은 있고 글자는 없다', () => {
    const { container } = render(<ToastView toast={null} onDismiss={vi.fn()} />)
    const region = container.querySelector('[aria-live]')
    expect(region?.getAttribute('aria-live')).toBe('polite')
    expect(region?.textContent).toBe('')
    expect(screen.queryByTestId('toast')).toBeNull()
  })

  it('문구를 보여 주고 2500ms 뒤 onDismiss(id)를 한 번 부른다', () => {
    const onDismiss = vi.fn()
    render(<ToastView toast={{ id: 1, text: '빈 공간이 부족해요' }} onDismiss={onDismiss} />)
    expect(screen.getByTestId('toast').textContent).toBe('빈 공간이 부족해요')
    expect(TOAST_MS).toBe(2500)
    act(() => vi.advanceTimersByTime(2499))
    expect(onDismiss).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onDismiss).toHaveBeenCalledWith(1)
  })

  it('같은 문구라도 id가 새로우면 타이머를 다시 센다', () => {
    const onDismiss = vi.fn()
    const view = render(<ToastView toast={{ id: 1, text: '빈 공간이 부족해요' }} onDismiss={onDismiss} />)
    act(() => vi.advanceTimersByTime(2000))
    view.rerender(<ToastView toast={{ id: 2, text: '빈 공간이 부족해요' }} onDismiss={onDismiss} />)
    act(() => vi.advanceTimersByTime(2000))
    expect(onDismiss).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(500))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onDismiss).toHaveBeenCalledWith(2)
  })

  it('onDismiss 함수만 바뀌면 타이머를 다시 세지 않고 새 함수를 부른다', () => {
    const first = vi.fn()
    const second = vi.fn()
    const toast = { id: 7, text: '알림' }
    const view = render(<ToastView toast={toast} onDismiss={first} />)
    act(() => vi.advanceTimersByTime(2000))
    view.rerender(<ToastView toast={toast} onDismiss={second} />)
    act(() => vi.advanceTimersByTime(500))
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith(7)
  })

  it('토스트가 사라지면(null) 타이머도 멈춘다', () => {
    const onDismiss = vi.fn()
    const view = render(<ToastView toast={{ id: 3, text: '알림' }} onDismiss={onDismiss} />)
    view.rerender(<ToastView toast={null} onDismiss={onDismiss} />)
    act(() => vi.advanceTimersByTime(5000))
    expect(onDismiss).not.toHaveBeenCalled()
    expect(screen.queryByTestId('toast')).toBeNull()
  })
})
