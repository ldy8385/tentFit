// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TextField } from './TextField'

afterEach(cleanup)

function input(): HTMLInputElement {
  return screen.getByLabelText('이름') as HTMLInputElement
}

describe('TextField', () => {
  it('글자 16px, maxLength를 그대로 넘긴다', () => {
    render(<TextField label="이름" value="롤테이블" targetId="a" maxLength={30} onCommit={vi.fn()} />)
    expect(input().style.fontSize).toBe('16px')
    expect(input().maxLength).toBe(30)
    expect(input().value).toBe('롤테이블')
  })

  it('Enter로 앞뒤 공백을 뗀 이름을 반영한다(번호는 붙이지 않음)', () => {
    const onCommit = vi.fn()
    render(<TextField label="이름" value="롤테이블" targetId="a" onCommit={onCommit} />)
    act(() => input().focus())
    fireEvent.change(input(), { target: { value: '  캠핑의자  ' } })
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledWith('a', '캠핑의자')
  })

  it('빈 이름은 되돌리고 오류를 보여 준다', () => {
    const onCommit = vi.fn()
    render(<TextField label="이름" value="롤테이블" targetId="a" onCommit={onCommit} />)
    act(() => input().focus())
    fireEvent.change(input(), { target: { value: '   ' } })
    act(() => input().blur())
    expect(onCommit).not.toHaveBeenCalled()
    expect(input().value).toBe('롤테이블')
    expect(screen.getByRole('alert').textContent).toBe('비워 둘 수 없어요')
  })

  it('한글 조합을 끝내는 Enter는 반영하지 않고, 이어지는 blur에서 반영한다', () => {
    const onCommit = vi.fn()
    render(<TextField label="이름" value="의자" targetId="a" onCommit={onCommit} />)
    act(() => input().focus())
    fireEvent.change(input(), { target: { value: '캠핑의자' } })
    fireEvent.keyDown(input(), { key: 'Enter', isComposing: true })
    fireEvent.keyDown(input(), { key: 'Process' })
    expect(onCommit).not.toHaveBeenCalled()
    act(() => input().blur())
    expect(onCommit).toHaveBeenCalledExactlyOnceWith('a', '캠핑의자')
  })

  it('포커스 때 대상(a)을 기억해, 선택이 b로 바뀐 뒤 blur해도 a에 반영한다', () => {
    const onCommit = vi.fn()
    const { rerender } = render(<TextField label="이름" value="롤테이블" targetId="a" onCommit={onCommit} />)
    act(() => input().focus())
    fireEvent.change(input(), { target: { value: '작은 테이블' } })
    rerender(<TextField label="이름" value="자충매트" targetId="b" onCommit={onCommit} />)
    act(() => input().blur())
    expect(onCommit).toHaveBeenCalledExactlyOnceWith('a', '작은 테이블')
    expect(input().value).toBe('자충매트')
  })
})
