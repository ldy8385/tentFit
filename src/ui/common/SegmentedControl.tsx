// 탭형 세그먼트(모드 토글 §4.1, 붙일 위치 §4.4-1, 정N각형 [지름│한 변] §4.8). 켜짐 = 흰 배경 + 진한 굵은 글자(시안 03·02).
// role="radiogroup" + 항목 role="radio"(aria-checked). 켜진 항목만 Tab으로 들어가고(roving tabindex),
// 화살표(←↑ 이전, →↓ 다음, 끝에서 처음으로)·Home·End로 옮기면 바로 고릅니다. 이미 켜진 항목을 누르면 onChange를 부르지 않습니다.
import { useRef, type JSX, type KeyboardEvent } from 'react'
import './common.css'

export type SegmentOption<T extends string> = { value: T; label: string }

export function SegmentedControl<T extends string>(p: {
  label: string
  options: readonly SegmentOption<T>[]
  value: T
  onChange(v: T): void
  disabled?: boolean
}): JSX.Element {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const selected = p.options.findIndex((o) => o.value === p.value)
  const count = p.options.length

  const choose = (index: number) => {
    const option = p.options[index]
    if (option === undefined) return
    buttons.current[index]?.focus()
    if (option.value !== p.value) p.onChange(option.value)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % count
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + count) % count
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = count - 1
    if (next === null) return
    e.preventDefault()
    choose(next)
  }

  return (
    <div role="radiogroup" aria-label={p.label} aria-disabled={p.disabled === true ? true : undefined} className="tf-seg">
      {p.options.map((o, i) => {
        const checked = i === selected
        const tabbable = checked || (selected === -1 && i === 0)
        return (
          <button
            key={o.value}
            ref={(el) => {
              buttons.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={tabbable ? 0 : -1}
            disabled={p.disabled}
            className="tf-seg__item"
            onClick={() => choose(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
