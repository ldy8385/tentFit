// 상단 바의 [보기]·☰ 메뉴. 항목을 고르면 닫히고, 바깥 누름·Esc로도 닫힙니다.
// Esc는 여기서 멈춰서(stopPropagation) 선택 해제 단축키까지 가지 않게 합니다.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { CheckIcon } from './icons'
import './shell.css'

export type MenuItem = {
  label: string
  onSelect(): void
  disabled?: boolean
  /** 켜고 끄는 항목이면 지금 상태(menuitemcheckbox) */
  checked?: boolean
}

export function MenuButton(p: {
  label: string
  items: MenuItem[]
  icon?: ReactNode
  /** true면 버튼에 글자를 보이고, false면 아이콘만(이름은 aria-label) */
  showLabel?: boolean
  /** 보이는 글자를 이름과 다르게(휴대폰 툴바 「이너」 — 이름은 label, aria-label) */
  text?: string
  align?: 'left' | 'right'
  /** 목록을 버튼 아래(기본) 또는 위로 엽니다(화면 아래 툴바는 'up') */
  placement?: 'down' | 'up'
  /** 버튼 class(기본: 글자면 shell-btn, 아이콘이면 shell-icon-btn) */
  buttonClassName?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  // 비활성이 되면(측정 시작 등) 열린 목록을 보이지 않습니다.
  const shown = open && p.disabled !== true

  useEffect(() => {
    if (!shown) return
    const onPointerDown = (e: PointerEvent) => {
      if (e.target instanceof Node && wrapRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    wrapRef.current?.querySelector<HTMLButtonElement>('[role="menu"] button:not(:disabled)')?.focus()
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [shown])

  return (
    <div
      className="shell-menu"
      ref={wrapRef}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || !shown) return
        e.stopPropagation()
        setOpen(false)
        buttonRef.current?.focus()
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className={p.buttonClassName ?? (p.showLabel === true ? 'shell-btn' : 'shell-icon-btn')}
        disabled={p.disabled}
        aria-label={p.showLabel === true && p.text === undefined ? undefined : p.label}
        aria-haspopup="menu"
        aria-expanded={shown}
        aria-controls={shown ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        {p.icon}
        {p.text !== undefined ? <span>{p.text}</span> : p.showLabel === true && <span>{p.label}</span>}
      </button>
      {shown && (
        <div
          role="menu"
          id={menuId}
          aria-label={p.label}
          className="shell-menu__list"
          data-align={p.align ?? 'right'}
          data-placement={p.placement ?? 'down'}
        >
          {p.items.map((item) => (
            <button
              key={item.label}
              type="button"
              role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
              aria-checked={item.checked}
              disabled={item.disabled}
              className="shell-menu__item"
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
            >
              <span className="shell-menu__check">{item.checked === true && <CheckIcon size={16} />}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
