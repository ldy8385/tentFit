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
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (e.target instanceof Node && wrapRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    wrapRef.current?.querySelector<HTMLButtonElement>('[role="menu"] button:not(:disabled)')?.focus()
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open])

  return (
    <div
      className="shell-menu"
      ref={wrapRef}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || !open) return
        e.stopPropagation()
        setOpen(false)
        buttonRef.current?.focus()
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className={p.showLabel === true ? 'shell-btn' : 'shell-icon-btn'}
        aria-label={p.showLabel === true ? undefined : p.label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        {p.icon}
        {p.showLabel === true && <span>{p.label}</span>}
      </button>
      {open && (
        <div role="menu" id={menuId} aria-label={p.label} className="shell-menu__list" data-align={p.align ?? 'right'}>
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
