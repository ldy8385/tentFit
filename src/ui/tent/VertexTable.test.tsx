// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Pt } from '../../core/model'
import { VertexTable } from './VertexTable'

const SQUARE: Pt[] = [
  [0, 0],
  [400, 0],
  [400, 300],
  [0, 300],
]

function Harness(p: {
  initial: Pt[]
  reject?: (index: number, pt: Pt) => string | void
  onChange?: (index: number, pt: Pt) => void
  onAdd?: () => void
  onDelete?: (index: number) => void
  disabled?: boolean
}) {
  const [points, setPoints] = useState<Pt[]>(p.initial)
  const [selected, setSelected] = useState<number | null>(null)
  return (
    <VertexTable
      points={points}
      selectedIndex={selected}
      disabled={p.disabled}
      onSelect={setSelected}
      onChange={(i, pt) => {
        const err = p.reject?.(i, pt)
        if (typeof err === 'string') return err
        p.onChange?.(i, pt)
        setPoints((ps) => ps.map((q, k) => (k === i ? pt : q)))
      }}
      onDelete={(i) => {
        p.onDelete?.(i)
        setPoints((ps) => ps.filter((_, k) => k !== i))
      }}
      onAdd={() => p.onAdd?.()}
    />
  )
}

const cell = (n: number, axis: 'X' | 'Y') => screen.getByLabelText(`${n}번 꼭짓점 ${axis}`) as HTMLInputElement
const del = (n: number) => screen.getByRole('button', { name: `${n}번 꼭짓점 삭제` }) as HTMLButtonElement
const rows = () => screen.getAllByRole('listitem')

describe('VertexTable', () => {
  it('머리 # / X (cm) / Y (cm)와 꼭짓점마다 한 행, 칸은 16px', () => {
    render(<Harness initial={SQUARE} />)
    expect(screen.getByRole('group', { name: '꼭짓점 좌표' }).textContent).toContain('#X (cm)Y (cm)')
    expect(rows()).toHaveLength(4)
    expect(cell(2, 'X').value).toBe('400')
    expect(cell(3, 'Y').value).toBe('300')
    expect(cell(1, 'X').style.fontSize).toBe('16px')
  })

  it('꼭짓점이 4개면 ×가 켜져 있고, 지워서 3개가 되면 모든 ×가 꺼진다', () => {
    const onDelete = vi.fn()
    render(<Harness initial={SQUARE} onDelete={onDelete} />)
    expect(del(1).disabled).toBe(false)
    fireEvent.click(del(4))
    expect(onDelete).toHaveBeenCalledWith(3)
    expect(rows()).toHaveLength(3)
    for (const n of [1, 2, 3]) expect(del(n).disabled).toBe(true)
  })

  it('칸을 고치고 blur하면 그 행의 점으로 onChange, 같은 값이면 부르지 않는다', () => {
    const onChange = vi.fn()
    render(<Harness initial={SQUARE} onChange={onChange} />)
    act(() => cell(2, 'Y').focus())
    fireEvent.change(cell(2, 'Y'), { target: { value: '-50' } })
    act(() => cell(2, 'Y').blur())
    expect(onChange).toHaveBeenCalledWith(1, [400, -50])
    act(() => cell(2, 'Y').focus())
    fireEvent.change(cell(2, 'Y'), { target: { value: '-50.0' } })
    act(() => cell(2, 'Y').blur())
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('onChange가 문자열을 돌려주면 그 행 아래 오류를 보이고 값은 되돌린다', () => {
    render(<Harness initial={SQUARE} reject={() => '외곽: 변끼리 교차해요'} />)
    act(() => cell(3, 'X').focus())
    fireEvent.change(cell(3, 'X'), { target: { value: '-100' } })
    act(() => cell(3, 'X').blur())
    expect(screen.getByRole('alert').textContent).toBe('외곽: 변끼리 교차해요')
    expect(rows()[2]?.contains(screen.getByRole('alert'))).toBe(true)
    expect(cell(3, 'X').value).toBe('400')
  })

  it('범위(−10,000~10,000) 밖이면 되돌리고 오류', () => {
    const onChange = vi.fn()
    render(<Harness initial={SQUARE} onChange={onChange} />)
    act(() => cell(1, 'X').focus())
    fireEvent.change(cell(1, 'X'), { target: { value: '10001' } })
    expect(screen.queryByRole('alert')).toBeNull()
    act(() => cell(1, 'X').blur())
    expect(screen.getByRole('alert').textContent).toBe('-10,000~10,000 사이로 입력해 주세요')
    expect(cell(1, 'X').value).toBe('0')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('[±]는 칸마다 있고 부호를 바꿔 바로 반영한다', () => {
    const onChange = vi.fn()
    render(<Harness initial={SQUARE} onChange={onChange} />)
    expect(screen.getAllByRole('button', { name: /부호 바꾸기$/ })).toHaveLength(8)
    fireEvent.click(screen.getByRole('button', { name: '2번 꼭짓점 X 부호 바꾸기' }))
    expect(onChange).toHaveBeenCalledWith(1, [-400, 0])
    expect(cell(2, 'X').value).toBe('-400')
  })

  it('칸에 포커스하거나 번호를 누르면 그 행을 선택하고 강조한다', () => {
    render(<Harness initial={SQUARE} />)
    act(() => cell(3, 'Y').focus())
    expect(rows()[2]?.getAttribute('data-selected')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '1번 꼭짓점 선택' }))
    expect(rows()[0]?.getAttribute('data-selected')).toBe('true')
    expect(rows()[2]?.getAttribute('data-selected')).toBe('false')
    expect(screen.getByRole('button', { name: '1번 꼭짓점 선택' }).getAttribute('aria-pressed')).toBe('true')
  })

  it("'+ 꼭짓점 추가'는 onAdd", () => {
    const onAdd = vi.fn()
    render(<Harness initial={SQUARE} onAdd={onAdd} />)
    fireEvent.click(screen.getByRole('button', { name: '+ 꼭짓점 추가' }))
    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  it('disabled면 칸·±·×·추가가 모두 꺼진다', () => {
    render(<Harness initial={SQUARE} disabled />)
    expect(cell(1, 'X').disabled).toBe(true)
    expect(del(1).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '1번 꼭짓점 X 부호 바꾸기' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '+ 꼭짓점 추가' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
