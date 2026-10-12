// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SegmentedControl } from './SegmentedControl'

type Side = 'back' | 'front' | 'left' | 'right'
const OPTIONS = [
  { value: 'back', label: '뒤' },
  { value: 'front', label: '앞' },
  { value: 'left', label: '왼쪽' },
  { value: 'right', label: '오른쪽' },
] as const

function Controlled(p: { onChange?(v: Side): void; disabled?: boolean }) {
  const [value, setValue] = useState<Side>('back')
  return (
    <SegmentedControl<Side>
      label="붙일 위치"
      options={OPTIONS}
      value={value}
      disabled={p.disabled}
      onChange={(v) => {
        p.onChange?.(v)
        setValue(v)
      }}
    />
  )
}

function radio(name: string): HTMLElement {
  return screen.getByRole('radio', { name })
}

describe('SegmentedControl', () => {
  it('radiogroup 이름과 항목 radio, 켜진 항목만 aria-checked·Tab 대상', () => {
    render(<Controlled />)
    expect(screen.getByRole('radiogroup', { name: '붙일 위치' })).toBeTruthy()
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual(['뒤', '앞', '왼쪽', '오른쪽'])
    expect(radio('뒤').getAttribute('aria-checked')).toBe('true')
    expect(radio('앞').getAttribute('aria-checked')).toBe('false')
    expect(radio('뒤').tabIndex).toBe(0)
    expect(radio('앞').tabIndex).toBe(-1)
  })

  it('다른 항목을 누르면 onChange, 이미 켜진 항목을 누르면 부르지 않는다', () => {
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)
    fireEvent.click(radio('뒤'))
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(radio('왼쪽'))
    expect(onChange).toHaveBeenCalledWith('left')
    expect(radio('왼쪽').getAttribute('aria-checked')).toBe('true')
    expect(radio('왼쪽').tabIndex).toBe(0)
    expect(radio('뒤').tabIndex).toBe(-1)
  })

  it('→·↓는 다음, ←·↑는 이전(끝에서 처음으로), Home·End. 옮기면 고르고 포커스도 옮긴다', () => {
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)
    radio('뒤').focus()
    fireEvent.keyDown(radio('뒤'), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith('front')
    expect(document.activeElement).toBe(radio('앞'))
    fireEvent.keyDown(radio('앞'), { key: 'ArrowDown' })
    expect(onChange).toHaveBeenLastCalledWith('left')
    fireEvent.keyDown(radio('왼쪽'), { key: 'End' })
    expect(onChange).toHaveBeenLastCalledWith('right')
    fireEvent.keyDown(radio('오른쪽'), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith('back')
    expect(document.activeElement).toBe(radio('뒤'))
    fireEvent.keyDown(radio('뒤'), { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenLastCalledWith('right')
    fireEvent.keyDown(radio('오른쪽'), { key: 'ArrowUp' })
    expect(onChange).toHaveBeenLastCalledWith('left')
    fireEvent.keyDown(radio('왼쪽'), { key: 'Home' })
    expect(onChange).toHaveBeenLastCalledWith('back')
    expect(onChange).toHaveBeenCalledTimes(7)
  })

  it('다른 키(Enter 등)는 고르지 않는다', () => {
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)
    fireEvent.keyDown(radio('뒤'), { key: 'Enter' })
    fireEvent.keyDown(radio('뒤'), { key: 'a' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('disabled면 모든 항목이 비활성이고 radiogroup에 aria-disabled', () => {
    render(<Controlled disabled />)
    expect(screen.getByRole('radiogroup').getAttribute('aria-disabled')).toBe('true')
    for (const r of screen.getAllByRole('radio')) expect((r as HTMLButtonElement).disabled).toBe(true)
  })

  it('value가 선택지에 없으면 첫 항목이 Tab 대상이고 아무것도 켜지지 않는다', () => {
    render(<SegmentedControl label="모양" options={OPTIONS} value={'up' as Side} onChange={vi.fn()} />)
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false', 'false'])
    expect(radio('뒤').tabIndex).toBe(0)
  })
})
