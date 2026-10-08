// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NumberField } from './NumberField'
import { blurActiveInput } from './blurActive'

afterEach(cleanup)

describe('blurActiveInput', () => {
  it('포커스된 입력칸을 blur해 고치던 값을 포커스 시점 대상에 반영한다(캔버스 pointerdown 흐름)', () => {
    const onCommit = vi.fn()
    const { rerender } = render(
      <NumberField label="가로" value={90} targetId="a" min={1} max={5000} onCommit={onCommit} />,
    )
    const input = screen.getByLabelText('가로') as HTMLInputElement
    act(() => input.focus())
    fireEvent.change(input, { target: { value: '150' } })
    act(() => blurActiveInput())
    expect(onCommit).toHaveBeenCalledExactlyOnceWith('a', 150)
    expect(document.activeElement).toBe(document.body)
    // 그 뒤 선택이 바뀌어도 더 반영되지 않는다
    rerender(<NumberField label="가로" value={60} targetId="b" min={1} max={5000} onCommit={onCommit} />)
    act(() => blurActiveInput())
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('포커스가 없으면 아무것도 하지 않는다', () => {
    expect(document.activeElement).toBe(document.body)
    expect(() => blurActiveInput()).not.toThrow()
    expect(document.activeElement).toBe(document.body)
  })
})
