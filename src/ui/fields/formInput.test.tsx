// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useLayoutEffect, useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FormNumberInput,
  FormTextInput,
  checkInteger,
  formEnterKeyDown,
  syncEnterKeyHints,
  textFieldsIn,
} from './formInput'
import { ERROR_MS } from './numberInput'

afterEach(() => {
  vi.useRealTimers()
})

const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement

function EnterForm(p: { onSubmit(): void }) {
  return (
    <form
      aria-label="폼"
      onKeyDown={formEnterKeyDown}
      onSubmit={(e) => {
        e.preventDefault()
        p.onSubmit()
      }}
    >
      <label>
        가<input type="text" />
      </label>
      <label>
        꺼짐<input type="text" disabled />
      </label>
      <label>
        나<input type="text" />
      </label>
      <label>
        고르기
        <select defaultValue="a">
          <option value="a">a</option>
        </select>
      </label>
      <label>
        체크<input type="checkbox" />
      </label>
      <label>
        다<input type="text" />
      </label>
      <button type="submit">확정</button>
    </form>
  )
}

describe('formEnterKeyDown', () => {
  it('Enter는 제출하지 않고 다음 칸(비활성 칸은 건너뜀)으로, 마지막 칸이면 포커스를 푼다', () => {
    const onSubmit = vi.fn()
    render(<EnterForm onSubmit={onSubmit} />)
    input('가').focus()
    expect(fireEvent.keyDown(input('가'), { key: 'Enter' })).toBe(false)
    expect(document.activeElement).toBe(input('나'))
    expect(fireEvent.keyDown(input('나'), { key: 'Enter' })).toBe(false)
    expect(document.activeElement).toBe(input('다'))
    expect(fireEvent.keyDown(input('다'), { key: 'Enter' })).toBe(false)
    expect(document.activeElement).not.toBe(input('다'))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('한글 조합을 끝내는 Enter(isComposing·keyCode 229)는 칸을 옮기지 않는다', () => {
    render(<EnterForm onSubmit={vi.fn()} />)
    input('가').focus()
    expect(fireEvent.keyDown(input('가'), { key: 'Enter', isComposing: true })).toBe(false)
    expect(document.activeElement).toBe(input('가'))
    expect(fireEvent.keyDown(input('가'), { key: 'Enter', keyCode: 229 })).toBe(false)
    expect(document.activeElement).toBe(input('가'))
  })

  it('select·체크박스의 Enter는 막고 포커스도 그대로, 버튼의 Enter는 막지 않는다', () => {
    const onSubmit = vi.fn()
    render(<EnterForm onSubmit={onSubmit} />)
    const select = screen.getByLabelText('고르기') as HTMLSelectElement
    select.focus()
    expect(fireEvent.keyDown(select, { key: 'Enter' })).toBe(false)
    const check = input('체크')
    check.focus()
    expect(fireEvent.keyDown(check, { key: 'Enter' })).toBe(false)
    expect(document.activeElement).toBe(check)
    expect(fireEvent.keyDown(screen.getByRole('button', { name: '확정' }), { key: 'Enter' })).toBe(true)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('Enter가 아닌 키는 건드리지 않는다', () => {
    render(<EnterForm onSubmit={vi.fn()} />)
    input('가').focus()
    expect(fireEvent.keyDown(input('가'), { key: 'Tab' })).toBe(true)
    expect(document.activeElement).toBe(input('가'))
  })
})

function HintForm() {
  const [count, setCount] = useState(3)
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (ref.current !== null) syncEnterKeyHints(ref.current)
  })
  return (
    <div ref={ref}>
      {Array.from({ length: count }, (_, i) => (
        <input key={i} type="text" aria-label={`칸 ${i + 1}`} enterKeyHint="next" />
      ))}
      <button type="button" onClick={() => setCount((c) => c - 1)}>
        줄이기
      </button>
    </div>
  )
}

describe('syncEnterKeyHints', () => {
  it('마지막 칸만 done이고, 칸이 줄면 새 마지막 칸이 done이 된다', () => {
    render(<HintForm />)
    expect(input('칸 1').getAttribute('enterkeyhint')).toBe('next')
    expect(input('칸 2').getAttribute('enterkeyhint')).toBe('next')
    expect(input('칸 3').getAttribute('enterkeyhint')).toBe('done')
    fireEvent.click(screen.getByRole('button', { name: '줄이기' }))
    expect(input('칸 2').getAttribute('enterkeyhint')).toBe('done')
    expect(textFieldsIn(document.body)).toHaveLength(2)
  })
})

function NumberHarness(p: {
  initial: number
  min?: number
  max?: number
  allowNegative?: boolean
  integer?: boolean
  reject?: (v: number) => string | void
  onCommit?: (v: number) => void
}) {
  const [value, setValue] = useState(p.initial)
  return (
    <div onKeyDown={formEnterKeyDown}>
      <FormNumberInput
        label="가로"
        unit="cm"
        value={value}
        min={p.min ?? 1}
        max={p.max ?? 5000}
        allowNegative={p.allowNegative}
        integer={p.integer}
        onCommit={(v) => {
          const err = p.reject?.(v)
          if (typeof err === 'string') return err
          p.onCommit?.(v)
          setValue(v)
        }}
      />
      <label>
        다음<input type="text" />
      </label>
      <output data-testid="value">{value}</output>
    </div>
  )
}

describe('FormNumberInput', () => {
  it('입력하는 동안에는 오류를 보이지 않고, blur 때 범위 밖이면 마지막 유효값으로 되돌리고 오류를 보인다', () => {
    const onCommit = vi.fn()
    render(<NumberHarness initial={400} onCommit={onCommit} />)
    act(() => input('가로').focus())
    fireEvent.change(input('가로'), { target: { value: '0' } })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(input('가로').getAttribute('aria-invalid')).toBe('false')
    act(() => input('가로').blur())
    expect(input('가로').value).toBe('400')
    expect(screen.getByRole('alert').textContent).toBe('1~5,000 사이로 입력해 주세요')
    expect(input('가로').getAttribute('aria-invalid')).toBe('true')
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('오류는 ERROR_MS 뒤에 사라진다', () => {
    vi.useFakeTimers()
    render(<NumberHarness initial={400} />)
    act(() => input('가로').focus())
    fireEvent.change(input('가로'), { target: { value: 'abc' } })
    act(() => input('가로').blur())
    expect(screen.getByRole('alert').textContent).toBe('숫자를 입력해 주세요')
    act(() => vi.advanceTimersByTime(ERROR_MS))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('Enter는 한 번만 반영하고 다음 칸으로 옮긴다(이동으로 생긴 blur는 다시 반영하지 않음)', () => {
    const onCommit = vi.fn()
    render(<NumberHarness initial={400} onCommit={onCommit} />)
    act(() => input('가로').focus())
    fireEvent.change(input('가로'), { target: { value: '520.04' } })
    act(() => {
      fireEvent.keyDown(input('가로'), { key: 'Enter' })
    })
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith(520.04)
    expect(document.activeElement).toBe(input('다음'))
    expect(screen.getByTestId('value').textContent).toBe('520.04')
  })

  it('고치지 않고 blur하면 반영하지 않는다', () => {
    const onCommit = vi.fn()
    render(<NumberHarness initial={400} onCommit={onCommit} />)
    act(() => input('가로').focus())
    act(() => input('가로').blur())
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('Esc는 고치던 글자를 버리고 포커스를 놓는다(반영 없음)', () => {
    const onCommit = vi.fn()
    render(<NumberHarness initial={400} onCommit={onCommit} />)
    act(() => input('가로').focus())
    fireEvent.change(input('가로'), { target: { value: '999' } })
    act(() => {
      fireEvent.keyDown(input('가로'), { key: 'Escape' })
    })
    expect(document.activeElement).not.toBe(input('가로'))
    expect(input('가로').value).toBe('400')
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('onCommit이 문자열을 돌려주면 그 문구를 오류로 보이고 칸은 폼 값으로 되돌린다', () => {
    render(<NumberHarness initial={400} reject={(v) => (v > 1000 ? '이너끼리 겹쳐요' : undefined)} />)
    act(() => input('가로').focus())
    fireEvent.change(input('가로'), { target: { value: '1200' } })
    act(() => input('가로').blur())
    expect(screen.getByRole('alert').textContent).toBe('이너끼리 겹쳐요')
    expect(input('가로').value).toBe('400')
    expect(screen.getByTestId('value').textContent).toBe('400')
  })

  it('[±]는 부호를 바꿔 바로 반영하고, 입력칸 포커스를 빼앗지 않는다', () => {
    const onCommit = vi.fn()
    render(<NumberHarness initial={30} min={-5000} max={5000} allowNegative onCommit={onCommit} />)
    const sign = screen.getByRole('button', { name: '가로 부호 바꾸기' })
    expect(fireEvent.mouseDown(sign)).toBe(false)
    fireEvent.click(sign)
    expect(onCommit).toHaveBeenCalledWith(-30)
    expect(input('가로').value).toBe('-30')
  })

  it('정수 칸은 소수를 받지 않는다', () => {
    render(<NumberHarness initial={6} min={5} max={12} integer />)
    expect(input('가로').getAttribute('inputmode')).toBe('numeric')
    act(() => input('가로').focus())
    fireEvent.change(input('가로'), { target: { value: '6.5' } })
    act(() => input('가로').blur())
    expect(screen.getByRole('alert').textContent).toBe('정수로 입력해 주세요')
    expect(input('가로').value).toBe('6')
  })

  it('ariaLabel이 있으면 접근 이름은 그것 하나(보이는 라벨은 이름에 섞이지 않음)', () => {
    render(
      <>
        <FormNumberInput label="폭" ariaLabel="이너 1 폭" value={180} min={1} max={5000} onCommit={() => {}} />
        <FormNumberInput label="폭" ariaLabel="이너 2 폭" value={200} min={1} max={5000} onCommit={() => {}} />
      </>,
    )
    expect(input('이너 1 폭').value).toBe('180')
    expect(input('이너 2 폭').value).toBe('200')
    expect(screen.queryAllByLabelText('폭')).toHaveLength(0)
  })

  it('입력칸 글자는 16px, 소수 키패드', () => {
    render(<NumberHarness initial={400} />)
    expect(input('가로').style.fontSize).toBe('16px')
    expect(input('가로').getAttribute('inputmode')).toBe('decimal')
  })
})

function TextHarness(p: { onCommit(v: string): void }) {
  const [value, setValue] = useState('내 텐트')
  return (
    <FormTextInput
      label="텐트 이름"
      value={value}
      maxLength={40}
      onCommit={(v) => {
        p.onCommit(v)
        setValue(v)
      }}
    />
  )
}

describe('FormTextInput', () => {
  it('blur 때 앞뒤 공백을 떼고 반영하고, 비면 되돌린 뒤 오류를 보인다', () => {
    const onCommit = vi.fn()
    render(<TextHarness onCommit={onCommit} />)
    act(() => input('텐트 이름').focus())
    fireEvent.change(input('텐트 이름'), { target: { value: '  쉘터 A ' } })
    act(() => input('텐트 이름').blur())
    expect(onCommit).toHaveBeenCalledWith('쉘터 A')
    expect(input('텐트 이름').value).toBe('쉘터 A')
    act(() => input('텐트 이름').focus())
    fireEvent.change(input('텐트 이름'), { target: { value: '   ' } })
    expect(screen.queryByRole('alert')).toBeNull()
    act(() => input('텐트 이름').blur())
    expect(input('텐트 이름').value).toBe('쉘터 A')
    expect(screen.getByRole('alert').textContent).toBe('비워 둘 수 없어요')
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(input('텐트 이름').maxLength).toBe(40)
  })
})

describe('checkInteger', () => {
  it('범위·정수 검사', () => {
    expect(checkInteger('7', 5, 12)).toEqual({ ok: true, value: 7 })
    expect(checkInteger('4', 5, 12)).toEqual({ ok: false, error: '5~12 사이로 입력해 주세요' })
    expect(checkInteger('7.5', 5, 12)).toEqual({ ok: false, error: '정수로 입력해 주세요' })
    expect(checkInteger('x', 5, 12)).toEqual({ ok: false, error: '숫자를 입력해 주세요' })
  })
})
