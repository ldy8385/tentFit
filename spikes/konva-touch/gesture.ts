// Konva 터치 스파이크의 제스처 규칙(버리는 코드). DOM·Konva를 모르는 순수 상태 기계.
// 스펙 §4.5 "두 번째 손가락 규칙":
//  - 두 번째 손가락이 닿으면 진행 중인 물건 끌기·핸들 변형을 시작 위치로 되돌리고 커밋하지 않는다.
//  - 그 뒤 두 손가락은 확대+화면 이동, 손가락이 하나 남으면 화면 이동만(물건 끌기는 다시 시작하지 않음).
//  - pointercancel·touchcancel·visibilitychange(hidden)도 되돌리고 커밋하지 않는다.

export type Pt = [number, number] // 화면 px(캔버스 컨테이너 기준)
export type View = { scale: number; x: number; y: number } // 화면 = 월드(cm) × scale + (x, y)

export const SCALE_MIN = 0.1
export const SCALE_MAX = 20
export const TAP_SLOP_TOUCH_PX = 8
export const TAP_SLOP_MOUSE_PX = 3

export function clampScale(s: number): number {
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, s))
}

export function screenToWorld(v: View, p: Pt): Pt {
  return [(p[0] - v.x) / v.scale, (p[1] - v.y) / v.scale]
}

export function panView(v: View, dx: number, dy: number): View {
  return { scale: v.scale, x: v.x + dx, y: v.y + dy }
}

/** 두 손가락의 이전 위치와 새 위치로 확대+이동. 이전 중심 아래의 월드 점이 새 중심으로 간다. */
export function pinchView(v: View, prev: readonly [Pt, Pt], next: readonly [Pt, Pt]): View {
  const c0: Pt = [(prev[0][0] + prev[1][0]) / 2, (prev[0][1] + prev[1][1]) / 2]
  const c1: Pt = [(next[0][0] + next[1][0]) / 2, (next[0][1] + next[1][1]) / 2]
  const d0 = Math.hypot(prev[1][0] - prev[0][0], prev[1][1] - prev[0][1])
  const d1 = Math.hypot(next[1][0] - next[0][0], next[1][1] - next[0][1])
  const scale = clampScale(d0 > 0 ? v.scale * (d1 / d0) : v.scale)
  const w = screenToWorld(v, c0)
  return { scale, x: c1[0] - w[0] * scale, y: c1[1] - w[1] * scale }
}

/** 한 점(휠 위치)을 고정하고 factor배 확대. */
export function zoomAt(v: View, p: Pt, factor: number): View {
  const scale = clampScale(v.scale * factor)
  const w = screenToWorld(v, p)
  return { scale, x: p[0] - w[0] * scale, y: p[1] - w[1] * scale }
}

export type DownTarget = 'item' | 'anchor' | 'empty'
export type GestureMode = 'idle' | 'shape' | 'pan' | 'pinch'
export type CancelReason = 'second-finger' | 'cancel'

export interface GestureHost {
  /** 첫 손가락이 닿은 곳. 'item'·'anchor'면 끌기·변형은 Konva가 한다. */
  hitTest(p: Pt): DownTarget
  /** 진행 중인 끌기·변형을 멈추고 시작 위치로 되돌린다. 커밋하지 않는다. */
  cancelActive(reason: CancelReason): void
  /** 두 손가락 이상인 동안 새 끌기·변형이 시작되지 않게 막는다. */
  lockShapes(): void
  unlockShapes(): void
  getView(): View
  setView(v: View): void
  /** 빈 곳 탭(선택 해제). */
  tap(p: Pt): void
  /** 모든 손가락이 떨어졌다. hadMulti = 이번 제스처에 두 손가락이 있었음. */
  allUp(hadMulti: boolean): void
}

export class TouchGesture {
  private readonly host: GestureHost
  private readonly pointers = new Map<number, Pt>()
  private current: GestureMode = 'idle'
  private panId: number | null = null
  private downAt: Pt = [0, 0]
  private slop = TAP_SLOP_TOUCH_PX
  private moved = false
  private locked = false
  private hadMulti = false

  constructor(host: GestureHost) {
    this.host = host
  }

  get mode(): GestureMode {
    return this.current
  }

  get pointerCount(): number {
    return this.pointers.size
  }

  down(id: number, p: Pt, pointerType: string): void {
    this.pointers.set(id, p)
    if (this.pointers.size === 1) {
      this.slop = pointerType === 'touch' ? TAP_SLOP_TOUCH_PX : TAP_SLOP_MOUSE_PX
      this.downAt = p
      this.moved = false
      this.hadMulti = false
      if (this.host.hitTest(p) === 'empty') {
        this.current = 'pan'
        this.panId = id
      } else {
        this.current = 'shape'
        this.panId = null
      }
      return
    }
    this.enterPinch()
  }

  /** touchstart(touches ≥ 2)가 두 번째 pointerdown보다 먼저 온 경우. */
  multiTouchHint(): void {
    if (this.current === 'shape' || this.current === 'pan') this.enterPinch()
  }

  move(id: number, p: Pt): void {
    const prev = this.pointers.get(id)
    if (!prev) return
    if (this.current === 'pinch') {
      const ids = [...this.pointers.keys()]
      const i = ids.indexOf(id)
      const otherId = i === 0 ? ids[1] : i === 1 ? ids[0] : undefined
      const other = otherId === undefined ? undefined : this.pointers.get(otherId)
      this.pointers.set(id, p)
      if (!other) return // 세 번째 손가락 이후는 확대 계산에 쓰지 않는다
      const prevPair: [Pt, Pt] = i === 0 ? [prev, other] : [other, prev]
      const nextPair: [Pt, Pt] = i === 0 ? [p, other] : [other, p]
      this.host.setView(pinchView(this.host.getView(), prevPair, nextPair))
      return
    }
    this.pointers.set(id, p)
    if (this.current === 'pan' && id === this.panId) {
      if (Math.hypot(p[0] - this.downAt[0], p[1] - this.downAt[1]) > this.slop) this.moved = true
      this.host.setView(panView(this.host.getView(), p[0] - prev[0], p[1] - prev[1]))
    }
  }

  up(id: number, p: Pt): void {
    if (!this.pointers.delete(id)) return
    if (this.current === 'pinch') {
      this.afterPinchPointerLeft()
    } else if (this.current === 'pan' && id === this.panId && this.pointers.size === 0 && !this.moved) {
      this.host.tap(p)
    }
    if (this.pointers.size === 0) this.finish()
  }

  cancel(id: number): void {
    if (!this.pointers.has(id)) return
    if (this.current === 'shape') this.host.cancelActive('cancel')
    this.pointers.delete(id)
    this.moved = true
    if (this.current === 'pinch') this.afterPinchPointerLeft()
    if (this.pointers.size === 0) this.finish()
  }

  /** visibilitychange(hidden)·touchcancel: 모든 손가락을 잊고 되돌린다. */
  reset(): void {
    if (this.current === 'idle' && this.pointers.size === 0) return
    if (this.current === 'shape') this.host.cancelActive('cancel')
    this.pointers.clear()
    this.finish()
  }

  private enterPinch(): void {
    if (this.current === 'pinch') return
    if (this.current === 'shape') this.host.cancelActive('second-finger')
    if (!this.locked) {
      this.host.lockShapes()
      this.locked = true
    }
    this.current = 'pinch'
    this.panId = null
    this.moved = true
    this.hadMulti = true
  }

  private afterPinchPointerLeft(): void {
    if (this.pointers.size !== 1) return
    const [rest] = this.pointers.keys()
    this.current = 'pan'
    this.panId = rest ?? null
  }

  private finish(): void {
    const hadMulti = this.hadMulti
    if (this.locked) {
      this.host.unlockShapes()
      this.locked = false
    }
    this.current = 'idle'
    this.panId = null
    this.hadMulti = false
    this.host.allUp(hadMulti)
  }
}
