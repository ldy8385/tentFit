// Stage 수준 포인터 제스처 판정(스펙 §4.5). DOM·Konva를 모르는 순수 상태 기계입니다.
// Konva 터치 스파이크(커밋 67fcf75, spikes/konva-touch/gesture.ts)의 "두 번째 손가락 규칙"을 옮겼습니다.
// 그 규칙은 iPhone 13 사파리 22/22, 갤럭시 Z 폴드7 24/24로 실기기 검증했습니다(docs/plans/spike-results.md).
//
// 쓰는 쪽(Board)과의 약속
// - 물건 끌기·핸들 변형은 Konva(draggable·Transformer)가 합니다. 이 모듈은 빈 곳 끌기, 두 손가락, 탭만 판정합니다.
// - 모든 pointerdown/move/up을 순서대로 넣고, 돌려받은 출력을 배열 순서대로 적용합니다.
//   두 손가락 출력은 [zoom(이전 중심 고정), pan(중심 이동)] 순서라 그대로 적용하면 스파이크의 pinchView와 같습니다.
// - pointerCount ≥ 2인 동안에는 물건 끌기·Transformer를 잠그세요(두 번째 손가락이 다른 물건을 끌기 시작하지 않게).
//   모든 포인터가 떨어져 pointerCount가 0이 되면 풉니다.
// - Konva 설정: Konva.dragButtons = [0](기본값 [0, 1]이면 가운데 버튼이 물건을 끕니다. 가운데 버튼은 화면 이동),
//   pointerdown마다 stage.dragDistance(TAP_SLOP[pointer]). 거리 판정이 Konva와 같아서(아래 movedFrom)
//   물건 탭과 Konva 끌기가 겹치거나 둘 다 빠지는 일이 없습니다.
// - pointercancel·touchcancel·visibilitychange(hidden)에는 cancel()을 부릅니다.
// - 범위 선택이 취소되면 크기 0인 done 사각형(x1 = x0, y1 = y0)을 냅니다. 완전히 포함되는 물건이 없습니다.
import type { PointerKind } from '../store/ui'

/** 탭과 끌기의 경계(화면 px, §4.5). 가로·세로 중 큰 이동이 이 값 미만으로 끝나면 탭입니다. */
export const TAP_SLOP: Record<PointerKind, number> = { touch: 8, mouse: 3, pen: 3 }

export type PointerSample = {
  id: number
  pointer: PointerKind
  x: number
  y: number
  button?: number
  shift?: boolean
  space?: boolean
}

export type GestureOutput =
  | { type: 'tap'; x: number; y: number; pointer: PointerKind; shift: boolean; onNode: boolean }
  | { type: 'pan'; dx: number; dy: number }
  | { type: 'zoom'; factor: number; cx: number; cy: number }
  | { type: 'marquee'; x0: number; y0: number; x1: number; y1: number; done: boolean }
  | { type: 'cancelNodeGesture' } // 진행 중인 물건 끌기·핸들 변형을 시작 위치로 되돌리고 커밋하지 않음

/** 첫 포인터를 끌 때 하는 일. node = Konva가 물건·핸들을 끎(이 모듈은 출력 없음) */
type Action = 'node' | 'pan' | 'marquee'

type XY = { x: number; y: number }

type First = {
  id: number
  pointer: PointerKind
  action: Action
  onNode: boolean
  button: number
  shift: boolean
  space: boolean
  x0: number
  y0: number
}

const PRIMARY_BUTTON = 0
const MIDDLE_BUTTON = 1

function dist(a: XY, b: XY): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/** 끌기 시작 판정. Konva DragAndDrop과 같은 식: max(|dx|, |dy|) ≥ slop */
function movedFrom(a: XY, b: XY, slop: number): boolean {
  return Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) >= slop
}

function mid(a: XY, b: XY): XY {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

export class GestureArbiter {
  /** 추적 중인 포인터의 마지막 위치(누른 순서) */
  private readonly pointers = new Map<number, XY>()
  private first: First | null = null
  /** 첫 포인터가 TAP_SLOP 밖으로 나갔음 */
  private moved = false
  /** 이번 제스처에 두 포인터 이상이 있었음(탭 아님, 노드 끌기 재시작 없음) */
  private multi = false
  /** 물건 끌기·핸들 변형이 진행 중이고 아직 되돌리지 않았음 */
  private nodeLive = false
  /** 범위 선택 사각형을 내보내는 중 */
  private marqueeLive = false
  /** 한 포인터 화면 이동: 이동량을 재는 기준점 */
  private panAnchor: XY = { x: 0, y: 0 }

  get pointerCount(): number {
    return this.pointers.size
  }

  down(s: PointerSample, onNode: boolean): GestureOutput[] {
    // 같은 id가 또 눌렸으면 앞의 떼기를 놓친 것(창 밖에서 뗌 등). 남은 상태를 조용히 버리고 새로 시작합니다.
    if (this.pointers.has(s.id)) this.reset()

    if (this.first === null) {
      const button = s.button ?? PRIMARY_BUTTON
      // 오른쪽·뒤로·앞으로 버튼, 펜 지우개 등은 판정하지 않습니다(겹친 물건 목록은 Plan 6).
      if (button !== PRIMARY_BUTTON && button !== MIDDLE_BUTTON) return []
      const space = s.space ?? false
      let action: Action
      if (button === MIDDLE_BUTTON) action = 'pan' // 노드 위여도 화면 이동(Board가 Konva.dragButtons = [0]으로 둠)
      else if (onNode) action = 'node'
      else if (s.pointer === 'touch' || space) action = 'pan'
      else action = 'marquee'
      this.first = {
        id: s.id,
        pointer: s.pointer,
        action,
        onNode,
        button,
        shift: s.shift ?? false,
        space,
        x0: s.x,
        y0: s.y,
      }
      this.pointers.set(s.id, { x: s.x, y: s.y })
      this.nodeLive = action === 'node'
      this.panAnchor = { x: s.x, y: s.y }
      return []
    }

    // 두 번째 이후 포인터: 손가락끼리만 두 손가락 제스처가 됩니다.
    // 마우스·펜 조작 중의 터치(손바닥 등)와 터치 중의 마우스·펜은 무시합니다.
    if (s.pointer !== 'touch' || this.first.pointer !== 'touch') return []
    this.pointers.set(s.id, { x: s.x, y: s.y })
    if (this.multi) return []
    this.multi = true
    this.moved = true
    if (this.nodeLive) {
      this.nodeLive = false
      return [{ type: 'cancelNodeGesture' }]
    }
    return []
  }

  move(s: PointerSample): GestureOutput[] {
    const prev = this.pointers.get(s.id)
    if (prev === undefined || this.first === null) return []
    const cur: XY = { x: s.x, y: s.y }

    if (this.pointers.size >= 2) {
      const ids = [...this.pointers.keys()]
      const i = ids.indexOf(s.id)
      this.pointers.set(s.id, cur)
      if (i > 1) return [] // 세 번째 손가락부터는 계산에 쓰지 않습니다
      const other = this.pointers.get(ids[1 - i] as number)
      if (other === undefined) return []
      return pinchOutputs([prev, other], [cur, other])
    }

    this.pointers.set(s.id, cur)
    if (this.multi) return this.panTo(cur) // 두 손가락 뒤 남은 한 손가락: 화면 이동만

    const f = this.first
    if (!this.moved && movedFrom({ x: f.x0, y: f.y0 }, cur, TAP_SLOP[f.pointer])) this.moved = true
    if (!this.moved) return []
    if (f.action === 'pan') return this.panTo(cur)
    if (f.action === 'marquee') {
      this.marqueeLive = true
      return [{ type: 'marquee', x0: f.x0, y0: f.y0, x1: cur.x, y1: cur.y, done: false }]
    }
    return [] // node: Konva가 끕니다
  }

  up(s: PointerSample): GestureOutput[] {
    if (!this.pointers.has(s.id) || this.first === null) return []
    this.pointers.delete(s.id)

    if (this.multi) {
      if (this.pointers.size === 1) {
        // 남은 한 손가락으로 화면 이동을 이어 갑니다(물건 끌기는 다시 시작하지 않음).
        const [rest] = this.pointers.values()
        if (rest !== undefined) this.panAnchor = { ...rest }
      } else if (this.pointers.size === 0) {
        this.reset()
      }
      return []
    }

    const f = this.first
    const out: GestureOutput[] = []
    const end: XY = { x: s.x, y: s.y }
    // 끌기 판정은 move에서만 합니다(Konva도 move에서만 끌기를 시작). 떼는 위치는 결과 좌표로만 씁니다.
    if (this.marqueeLive) {
      out.push({ type: 'marquee', x0: f.x0, y0: f.y0, x1: end.x, y1: end.y, done: true })
    } else if (!this.moved && f.button === PRIMARY_BUTTON && !f.space) {
      out.push({ type: 'tap', x: end.x, y: end.y, pointer: f.pointer, shift: s.shift ?? f.shift, onNode: f.onNode })
    }
    this.reset()
    return out
  }

  cancel(): GestureOutput[] {
    const f = this.first
    if (f === null) return []
    const out: GestureOutput[] = []
    if (this.nodeLive) out.push({ type: 'cancelNodeGesture' })
    if (this.marqueeLive) out.push({ type: 'marquee', x0: f.x0, y0: f.y0, x1: f.x0, y1: f.y0, done: true })
    this.reset()
    return out
  }

  private panTo(cur: XY): GestureOutput[] {
    const dx = cur.x - this.panAnchor.x
    const dy = cur.y - this.panAnchor.y
    this.panAnchor = cur
    return dx === 0 && dy === 0 ? [] : [{ type: 'pan', dx, dy }]
  }

  private reset(): void {
    this.pointers.clear()
    this.first = null
    this.moved = false
    this.multi = false
    this.nodeLive = false
    this.marqueeLive = false
  }
}

/** 두 손가락의 이전·새 위치 → [확대(이전 중심 고정), 이동(중심 이동)]. 거리가 0이면 확대는 내지 않습니다. */
function pinchOutputs(prev: readonly [XY, XY], next: readonly [XY, XY]): GestureOutput[] {
  const out: GestureOutput[] = []
  const d0 = dist(prev[0], prev[1])
  const d1 = dist(next[0], next[1])
  const c0 = mid(prev[0], prev[1])
  const c1 = mid(next[0], next[1])
  if (d0 > 0 && d1 > 0 && d1 !== d0) out.push({ type: 'zoom', factor: d1 / d0, cx: c0.x, cy: c0.y })
  const dx = c1.x - c0.x
  const dy = c1.y - c0.y
  if (dx !== 0 || dy !== 0) out.push({ type: 'pan', dx, dy })
  return out
}
