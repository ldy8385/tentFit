// PC 단축키(스펙 §4.5 "PC 단축키" 중 Plan 3 범위). 판정은 event.code로 합니다(한글 자판이면 key가 'ㄱ'·'Process').
// 그룹(Ctrl+G)·측정·Alt 스냅 반전은 Plan 5·6에서 더합니다.
import { useEffect } from 'react'
import { moveItems } from '../core/ops/items'
import { blurActiveInput } from '../ui/fields/blurActive'
import { deleteSelected, duplicateSelected, rotateSelected90 } from './actions'
import { useStores, type Stores } from './stores'
import { fitToLayout } from './viewActions'

export type ShortcutAction =
  | { type: 'delete' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'duplicate' }
  | { type: 'nudge'; dx: number; dy: number }
  | { type: 'rotate90' }
  | { type: 'fit' }
  | { type: 'escape' }

export type ShortcutKeyEvent = {
  code: string
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
  isComposing: boolean
}

/** 화살표 한 번에 옮기는 거리(cm) */
export const NUDGE_STEP = 1
/** Shift+화살표 한 번에 옮기는 거리(cm) */
export const NUDGE_STEP_BIG = 10

const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

/** Ctrl/Cmd 조합. 처리하지 못해도(선택 없음, 기록 없음) 브라우저 기본 동작(북마크 등)을 막습니다. */
const MOD_ACTIONS: ReadonlySet<ShortcutAction['type']> = new Set(['undo', 'redo', 'duplicate'])

/**
 * 키 이벤트 → 단축키 동작. 입력 중(isComposing, key 'Process', 입력칸 포커스)이면 Esc 말고 모두 null입니다.
 * 입력칸 안의 Ctrl+Z는 null이라 브라우저 기본(입력칸 실행 취소)이 그대로 동작합니다.
 */
export function shortcutFor(e: ShortcutKeyEvent, ctx: { inInput: boolean }): ShortcutAction | null {
  if (e.code === 'Escape') return { type: 'escape' }
  if (e.isComposing || e.key === 'Process' || ctx.inInput) return null

  if (e.ctrlKey || e.metaKey) {
    if (e.altKey) return null
    if (e.code === 'KeyZ') return e.shiftKey ? { type: 'redo' } : { type: 'undo' }
    if (e.code === 'KeyY' && e.ctrlKey && !e.metaKey && !e.shiftKey) return { type: 'redo' }
    if (e.code === 'KeyD' && !e.shiftKey) return { type: 'duplicate' }
    return null
  }
  if (e.altKey) return null

  if (e.code === 'Delete' || e.code === 'Backspace') return { type: 'delete' }
  const arrow = ARROWS[e.code]
  if (arrow !== undefined) {
    const step = e.shiftKey ? NUDGE_STEP_BIG : NUDGE_STEP
    return { type: 'nudge', dx: arrow[0] * step, dy: arrow[1] * step }
  }
  if (e.code === 'KeyR' && !e.shiftKey) return { type: 'rotate90' }
  if (e.code === 'Digit1' && e.shiftKey) return { type: 'fit' }
  return null
}

/**
 * 동작을 실행하고, 처리했으면 true를 돌려줍니다(preventDefault 판단용).
 * - 제스처(끌기·변형) 중이면 아무것도 하지 않고 false
 * - 선택이 없으면 delete·nudge·rotate90·duplicate는 false
 * - nudge는 coalesceKey 'nudge:<선택 id들>'로 커밋해, 같은 선택을 500ms 안에 연달아 옮기면 실행 취소 1칸(스펙 §8)
 * - escape는 선택과 그룹 안 편집을 끝냅니다. 끝낼 것이 없으면 false
 */
export function runShortcut(a: ShortcutAction, stores: Stores): boolean {
  const doc = stores.doc.getState()
  const ui = stores.ui.getState()
  if (doc.inGesture) return false
  const ids = ui.selection

  switch (a.type) {
    case 'undo':
      return doc.undo()
    case 'redo':
      return doc.redo()
    case 'fit':
      fitToLayout(stores)
      return true
    case 'escape': {
      if (ids.length === 0 && ui.scopeGroupId === null) return false
      ui.clearSelection()
      if (ui.scopeGroupId !== null) ui.patch({ scopeGroupId: null })
      return true
    }
    case 'delete':
      if (ids.length === 0) return false
      deleteSelected(stores)
      return true
    case 'duplicate':
      if (ids.length === 0) return false
      duplicateSelected(stores)
      return true
    case 'rotate90':
      if (ids.length === 0) return false
      rotateSelected90(stores)
      return true
    case 'nudge': {
      if (ids.length === 0) return false
      const target = [...ids]
      doc.commit((d) => moveItems(d, target, a.dx, a.dy), { coalesceKey: `nudge:${target.join(',')}` })
      return true
    }
  }
}

const NON_TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'reset',
  'submit',
])

/** 글자 입력을 받는 요소인지(input·textarea·select·contenteditable). 체크박스·버튼 모양 input은 빼서 Delete가 물건을 지웁니다. */
export function isTextEntry(el: Element | null): boolean {
  if (el === null) return false
  if (el instanceof HTMLElement && el.isContentEditable) return true
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true
  if (el instanceof HTMLInputElement) return !NON_TEXT_INPUT_TYPES.has(el.type)
  return false
}

/** window keydown에 단축키를 연결합니다. 편집기(StoresProvider 안)에서 한 번만 부릅니다. */
export function useShortcuts(): void {
  const stores = useStores()
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      const inInput = isTextEntry(document.activeElement)
      const action = shortcutFor(e, { inInput })
      if (action === null) return
      // 입력 중 Esc: 먼저 blur해서 입력값을 반영한 뒤(§4.2) 선택을 해제합니다.
      if (action.type === 'escape' && inInput) blurActiveInput()
      const handled = runShortcut(action, stores)
      if (handled || MOD_ACTIONS.has(action.type)) e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [stores])
}
