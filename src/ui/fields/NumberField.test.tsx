// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NumberField, type NumberFieldProps } from './NumberField'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function props(over: Partial<NumberFieldProps> = {}): NumberFieldProps {
  return { label: '가로', unit: 'cm', value: 90, targetId: 'a', min: 1, max: 5000, onCommit: vi.fn(), ...over }
}

function input(): HTMLInputElement {
  return screen.getByLabelText('가로') as HTMLInputElement
}

describe('NumberField 모양', () => {
  it('글자 16px, inputmode=decimal, 단위 표시(스펙 §4.2)', () => {
    render(<NumberField {...props()} />)
    expect(input().style.fontSize).toBe('16px')
    expect(input().getAttribute('inputmode')).toBe('decimal')
    expect(input().value).toBe('90')
    expect(screen.getByText('cm')).toBeTruthy()
  })

  it('allowNegative가 없으면 [±] 버튼도 없다', () => {
    render(<NumberField {...props()} />)
    expect(screen.queryByRole('button', { name: '가로 부호 바꾸기' })).toBeNull()
  })

  it('disabled면 입력칸이 잠긴다', () => {
    render(<NumberField {...props({ disabled: true })} />)
    expect(input().disabled).toBe(true)
  })
})

describe('NumberField 반영 시점', () => {
  it('Review Focus 2: 포커스 때 대상이 a였으면 b로 바뀐 뒤 blur해도 a에 반영한다', () => {
    const onCommit = vi.fn()
    const { rerender } = render(<NumberField {...props({ onCommit })} />)
    act(() => input().focus())
    fireEvent.change(input(), { target: { value: '120' } })
    rerender(<NumberField {...props({ onCommit, targetId: 'b', value: 60 })} />)
    expect(input().value).toBe('120') // 고치던 글자는 그대로
    act(() => input().blur())
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith('a', 120)
    expect(input().value).toBe('60') // blur 뒤에는 지금 대상(b)의 문서 값
  })

  it('Enter로 반영하고 포커스는 그대로, 반영 뒤에는 문서 값(반올림)을 보여 준다', () => {
    const onCommit = vi.fn()
    const { rerender } = render(<NumberField {...props({ onCommit })} />)
    act(() => input().focus())
    fireEvent.change(input(), { target: { value: '250.04' } })
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledWith('a', 250.04)
    expect(document.activeElement).toBe(input())
    rerender(<NumberField {...props({ onCommit, value: 250 })} />)
    expect(input().value).toBe('250')
  })

  it('한글 조합 중 Enter는 반영하지 않는다', () => {
    const onCommit = vi.fn()
    render(<NumberField {...props({ onCommit })} />)
    act(() => input().focus())
    fireEvent.change(input(), { target: { value: '100' } })
    fireEvent.keyDown(input(), { key: 'Enter', isComposing: true })
    fireEvent.keyDown(input(), { key: 'Enter', keyCode: 229 })
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('고치지 않고 blur·Enter하면 반영하지 않는다', () => {
    const onCommit = vi.fn()
    render(<NumberField {...props({ onCommit })} />)
    act(() => input().focus())
    fireEvent.keyDown(input(), { key: 'Enter' })
    act(() => input().blur())
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('Esc는 고치던 글자를 버리고 포커스를 놓는다(반영 없음)', () => {
    const onCommit = vi.fn()
    render(<NumberField {...props({ onCommit })} />)
    act(() => input().focus())
    fireEvent.change(input(), { target: { value: '300' } })
    fireEvent.keyDown(input(), { key: 'Escape' })
    expect(onCommit).not.toHaveBeenCalled()
    expect(input().value).toBe('90')
    expect(document.activeElement).not.toBe(input())
  })
})

describe('NumberField 범위 검사', () => {
  it('범위 밖이면 마지막 유효값으로 되돌리고 오류를 1.5초 보여 준다', () => {
    vi.useFakeTimers()
    const onCommit = vi.fn()
    render(<NumberField {...props({ onCommit })} />)
    act(() => input().focus())
    fireEvent.change(input(), { target: { value: '6000' } })
    act(() => input().blur())
    expect(onCommit).not.toHaveBeenCalled()
    expect(input().value).toBe('90')
    expect(screen.getByRole('alert').textContent).toBe('1~5,000 사이로 입력해 주세요')
    expect(input().getAttribute('aria-invalid')).toBe('true')
    act(() => {
      vi.advanceTimersByTime(1499)
    })
    expect(screen.queryByRole('alert')).not.toBeNull()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(input().getAttribute('aria-invalid')).toBe('false')
  })

  it('숫자가 아니면 되돌리고 숫자를 달라고 한다', () => {
    const onCommit = vi.fn()
    render(<NumberField {...props({ onCommit })} />)
    act(() => input().focus())
    fireEvent.change(input(), { target: { value: '12cm' } })
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(onCommit).not.toHaveBeenCalled()
    expect(input().value).toBe('90')
    expect(screen.getByRole('alert').textContent).toBe('숫자를 입력해 주세요')
  })

  it('다음 반영이 성공하면 오류를 지운다', () => {
    const onCommit = vi.fn()
    render(<NumberField {...props({ onCommit })} />)
    act(() => input().focus())
    fireEvent.change(input(), { target: { value: '0' } })
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(screen.queryByRole('alert')).not.toBeNull()
    fireEvent.change(input(), { target: { value: '80' } })
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledWith('a', 80)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('NumberField 버튼과 화살표', () => {
  it('[±]는 부호를 바꿔 바로 반영한다(포커스 없으면 지금 대상)', () => {
    const onCommit = vi.fn()
    render(<NumberField {...props({ label: '가로', value: 120, min: -5000, max: 5000, allowNegative: true, onCommit })} />)
    fireEvent.click(screen.getByRole('button', { name: '가로 부호 바꾸기' }))
    expect(onCommit).toHaveBeenCalledWith('a', -120)
  })

  it('[±]는 고치던 글자의 부호를 바꾸고, 포커스 때 기억한 대상에 반영한다', () => {
    const onCommit = vi.fn()
    const p = props({ value: 120, min: -5000, max: 5000, allowNegative: true, onCommit })
    const { rerender } = render(<NumberField {...p} />)
    act(() => input().focus())
    fireEvent.change(input(), { target: { value: '35' } })
    rerender(<NumberField {...p} targetId="b" />)
    fireEvent.click(screen.getByRole('button', { name: '가로 부호 바꾸기' }))
    expect(onCommit).toHaveBeenCalledWith('a', -35)
    expect(document.activeElement).toBe(input())
  })

  it('[±] 결과가 범위 밖이면 반영하지 않고 오류', () => {
    const onCommit = vi.fn()
    render(<NumberField {...props({ value: 120, min: 0, max: 5000, allowNegative: true, onCommit })} />)
    fireEvent.click(screen.getByRole('button', { name: '가로 부호 바꾸기' }))
    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe('0~5,000 사이로 입력해 주세요')
  })

  it('화살표 위·아래는 step만큼(Shift는 10배) 바꿔 바로 반영한다', () => {
    const onCommit = vi.fn()
    render(<NumberField {...props({ onCommit })} />)
    act(() => input().focus())
    fireEvent.keyDown(input(), { key: 'ArrowUp' })
    expect(onCommit).toHaveBeenLastCalledWith('a', 91)
    fireEvent.keyDown(input(), { key: 'ArrowDown', shiftKey: true })
    expect(onCommit).toHaveBeenLastCalledWith('a', 80)
  })
})
