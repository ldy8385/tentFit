// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ColorSwatches, CUSTOM_COLOR_LABEL, DEFAULT_COLOR_LABEL } from './ColorSwatches'

afterEach(cleanup)

describe('ColorSwatches — 직접 고르기(소유자 요청 2026-10-15)', () => {
  it('8색 뒤에 색상 선택기, 고른 색은 손을 뗄 때(change) 한 번만 보냄', () => {
    const onChange = vi.fn()
    render(<ColorSwatches value="green" onChange={onChange} />)
    const picker = screen.getByLabelText(CUSTOM_COLOR_LABEL) as HTMLInputElement
    expect(picker.type).toBe('color')
    expect(picker.value).toBe('#6f9636') // 지금 색에서 시작
    fireEvent.input(picker, { target: { value: '#123456' } })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.change(picker, { target: { value: '#12AB9F' } })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('#12ab9f')
  })

  it('지금 색이 #RRGGBB면 8색은 모두 눌리지 않고 직접 고르기가 선택됨', () => {
    const { container } = render(<ColorSwatches value="#12ab9f" onChange={() => undefined} />)
    expect(screen.getAllByRole('button').every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true)
    expect(container.querySelector('.tf-swatch--custom')?.getAttribute('data-selected')).toBe('true')
    expect((screen.getByLabelText(CUSTOM_COLOR_LABEL) as HTMLInputElement).value).toBe('#12ab9f')
  })

  it('「기본」 견본(텐트 색): 값이 없으면 선택, 누르면 onDefault', () => {
    const onDefault = vi.fn()
    render(<ColorSwatches value={undefined} onChange={() => undefined} onDefault={onDefault} defaultSwatch={{ fill: '#eee', stroke: '#999', hex: '#2e6e8e' }} />)
    const def = screen.getByRole('button', { name: DEFAULT_COLOR_LABEL })
    expect(def.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(def)
    expect(onDefault).toHaveBeenCalledTimes(1)
    expect((screen.getByLabelText(CUSTOM_COLOR_LABEL) as HTMLInputElement).value).toBe('#2e6e8e')
  })
})
