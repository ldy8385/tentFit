// PC 단축키(스펙 §4.5 "PC 단축키", §4.4-7). 판정은 event.code로 합니다(한글 자판이면 key가 'ㄱ'·'Process').
// 텐트 편집 모드(R5): Delete·Backspace = 선택한 꼭짓점 삭제, Esc = 꼭짓점 → 대상 → (기존 Esc) 순 해제,
// 실행 취소·다시 실행·맞춤 보기는 그대로, 화살표·R·Ctrl+D는 무시합니다.
// 메뉴([role="menu"])에 포커스가 있으면 Esc 말고 모두 무시하고(보류 Minor #9), 편집기 위 대화상자·오버레이가
// 열려 있으면 모두 무시합니다(대화상자가 자기 Esc를 처리).
// 그리는 중(Plan 4.1): Ctrl/Cmd+Z = 점 되돌리기, 다시 실행은 무시, Esc = 그리기 취소, Delete·화살표·R·Ctrl+D는 무시.
// 만들기 화면은 자기 스토어로 이 훅을 따로 걸고(modalRoot = 자기 루트), 자기 루트와 그 조상은 모달로 치지 않습니다.
// 그룹(Ctrl+G)·측정·Alt 스냅 반전은 Plan 5·6에서 더합니다.
import { cancelMeasureFirst, endMeasuring } from './measureActions'
import { useEffect, type RefObject } from 'react'
import { moveItems } from '../core/ops/items'
import { blurActiveInput } from '../ui/fields/blurActive'
import { deleteSelected, duplicateSelected, rotateSelected90 } from './actions'
import { useStores, type Stores } from './stores'
import { cancelDrawing, deleteTargetVertex, undoDrawPoint } from './tentActions'
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

/** 단축키 판정의 주변 상태. inMenu·modalOpen은 없으면 false입니다. */
export type ShortcutContext = {
  /** 포커스가 글자 입력칸(input·textarea·select·contenteditable)에 있음 */
  inInput: boolean
  /** 포커스가 메뉴([role="menu"]) 안에 있음 */
  inMenu?: boolean
  /** 편집기 위 대화상자·전체 화면 오버레이(텐트 바꾸기·텐트 만들기)가 열려 있음 */
  modalOpen?: boolean
}

/**
 * 키 이벤트 → 단축키 동작.
 * - 대화상자·오버레이가 열려 있으면 Esc까지 모두 null(대화상자가 Esc로 스스로 닫힘).
 * - 입력 중(isComposing, key 'Process', 입력칸 포커스)·메뉴 포커스면 Esc 말고 모두 null입니다.
 * 입력칸 안의 Ctrl+Z는 null이라 브라우저 기본(입력칸 실행 취소)이 그대로 동작합니다.
 */
export function shortcutFor(e: ShortcutKeyEvent, ctx: ShortcutContext): ShortcutAction | null {
  if (ctx.modalOpen === true) return null
  if (e.code === 'Escape') return { type: 'escape' }
  if (e.isComposing || e.key === 'Process' || ctx.inInput || ctx.inMenu === true) return null

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
 * 텐트 편집 모드의 동작(R5). 처리했으면 true.
 * - delete: 편집 대상과 선택한 꼭짓점이 있을 때만 deleteTargetVertex. 거부(꼭짓점 3개 등)면 그 문구를 토스트로 알리고 true
 * - escape: 선택한 꼭짓점 해제 → 편집 대상 해제 → 기존 Esc(선택·그룹 안 편집 끝내기)
 * - nudge·rotate90·duplicate: 무시(false). 이너를 키보드로 옮기거나 지우는 실수를 막습니다.
 */
function runTentShortcut(a: ShortcutAction, stores: Stores): boolean | null {
  const ui = stores.ui.getState()
  switch (a.type) {
    case 'delete': {
      if (ui.tentTarget === null || ui.vertexIndex === null) return false
      const result = deleteTargetVertex(stores, ui.tentTarget, ui.vertexIndex)
      if (!result.ok) stores.ui.getState().showToast(result.error)
      return true
    }
    case 'escape':
      if (ui.tentTarget !== null && ui.vertexIndex !== null) {
        ui.selectTentTarget(ui.tentTarget, null)
        return true
      }
      if (ui.tentTarget !== null) {
        ui.selectTentTarget(null)
        return true
      }
      return null
    case 'nudge':
    case 'rotate90':
    case 'duplicate':
      return false
    default:
      return null
  }
}

/** 그리는 중의 동작(Plan 4.1 판단 Q5). 처리했으면 true, 무시는 false, 공통 처리(맞춤 보기)로 넘기면 null. */
function runDrawShortcut(a: ShortcutAction, stores: Stores): boolean | null {
  switch (a.type) {
    case 'undo':
      undoDrawPoint(stores)
      return true
    case 'redo':
      return true
    case 'escape':
      cancelDrawing(stores)
      return true
    case 'fit':
      return null
    default:
      return false
  }
}

/**
 * 동작을 실행하고, 처리했으면 true를 돌려줍니다(preventDefault 판단용).
 * - 제스처(끌기·변형) 중이면 아무것도 하지 않고 false
 * - 텐트 편집 모드면 runTentShortcut이 먼저 봅니다(null이면 아래 공통 처리)
 * - 선택이 없으면 delete·nudge·rotate90·duplicate는 false
 * - nudge는 coalesceKey 'nudge:<선택 id들>'로 커밋해, 같은 선택을 500ms 안에 연달아 옮기면 실행 취소 1칸(스펙 §8)
 * - escape는 선택과 그룹 안 편집을 끝냅니다. 끝낼 것이 없으면 false
 */
export function runShortcut(a: ShortcutAction, stores: Stores): boolean {
  const doc = stores.doc.getState()
  const ui = stores.ui.getState()
  if (doc.inGesture) return false
  // 거리 재기 중(§4.3): Esc = 첫 대상 취소 또는 끝내기, 실행 취소·편집 단축키는 막음
  if (ui.measuring) {
    if (a.type === 'escape') {
      if (ui.measureFirst !== null) cancelMeasureFirst(stores)
      else endMeasuring(stores)
      return true
    }
    if (a.type === 'fit') {
      fitToLayout(stores)
      return true
    }
    return false
  }
  if (ui.mode === 'tent' && ui.drawing !== null) {
    const handled = runDrawShortcut(a, stores)
    if (handled !== null) return handled
  }
  if (ui.mode === 'tent') {
    const handled = runTentShortcut(a, stores)
    if (handled !== null) return handled
  }
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

/** 메뉴([role="menu"]) 안의 요소인지 */
export function isInMenu(el: Element | null): boolean {
  return el !== null && el.closest('[role="menu"]') !== null
}

/**
 * 편집기 위에 대화상자(aria-modal)나 텐트 만들기 오버레이(data-editor-modal)가 열려 있는지.
 * 열려 있으면 뒤의 편집기를 단축키로 바꾸지 않습니다. exclude(만들기 화면 루트)와 그 조상은 빼고 봅니다.
 */
export function isEditorModalOpen(doc: Document, exclude?: Element | null): boolean {
  for (const el of doc.querySelectorAll('[aria-modal="true"], [data-editor-modal]')) {
    if (exclude !== undefined && exclude !== null && el.contains(exclude)) continue
    return true
  }
  return false
}

/**
 * window keydown에 단축키를 연결합니다. 편집기(StoresProvider 안)에서 한 번만 부릅니다.
 * 만들기 화면은 자기 StoresProvider 안에서 modalRoot(자기 루트)를 넘겨 부릅니다(판단 Q17).
 */
export function useShortcuts(opts?: { modalRoot?: RefObject<HTMLElement | null> }): void {
  const stores = useStores()
  const modalRoot = opts?.modalRoot
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      const active = document.activeElement
      const inInput = isTextEntry(active)
      const modalOpen = isEditorModalOpen(document, modalRoot?.current ?? null)
      const action = shortcutFor(e, { inInput, inMenu: isInMenu(active), modalOpen })
      if (action === null) return
      // 입력 중 Esc: 먼저 blur해서 입력값을 반영한 뒤(§4.2) 선택을 해제합니다.
      if (action.type === 'escape' && inInput) blurActiveInput()
      const handled = runShortcut(action, stores)
      if (handled || MOD_ACTIONS.has(action.type)) e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [stores, modalRoot])
}
