import { describe, expect, it } from 'vitest'
import type { PointerKind } from '../store/ui'
import { GestureArbiter, TAP_SLOP, type GestureOutput, type PointerSample } from './gestures'
import { zoomAt, type View } from './viewport'

function touch(id: number, x: number, y: number): PointerSample {
  return { id, pointer: 'touch', x, y, button: 0 }
}

function mouse(x: number, y: number, extra: Partial<PointerSample> = {}): PointerSample {
  return { id: 1, pointer: 'mouse', x, y, button: 0, ...extra }
}

/** Board가 하듯 출력을 순서대로 보기에 적용합니다(zoom → ui.zoomAt, pan → ui.panBy). */
function applyView(v: View, outs: GestureOutput[]): View {
  let next = v
  for (const o of outs) {
    if (o.type === 'zoom') next = zoomAt(next, o.factor, [o.cx, o.cy])
    if (o.type === 'pan') next = { ...next, panX: next.panX + o.dx, panY: next.panY + o.dy }
  }
  return next
}

function count(outs: GestureOutput[], type: GestureOutput['type']): number {
  return outs.filter((o) => o.type === type).length
}

describe('TAP_SLOP', () => {
  it('터치 8px, 마우스·펜 3px', () => {
    const expected: Record<PointerKind, number> = { touch: 8, mouse: 3, pen: 3 }
    expect(TAP_SLOP).toEqual(expected)
  })
})

describe('터치 한 손가락', () => {
  it('빈 곳 끌기는 화면 이동. 8px을 넘는 순간 누른 곳부터의 이동량을 한 번에 낸다', () => {
    const g = new GestureArbiter()
    expect(g.down(touch(1, 100, 100), false)).toEqual([])
    expect(g.move(touch(1, 104, 100))).toEqual([])
    expect(g.move(touch(1, 112, 95))).toEqual([{ type: 'pan', dx: 12, dy: -5 }])
    expect(g.move(touch(1, 130, 90))).toEqual([{ type: 'pan', dx: 18, dy: -5 }])
    expect(g.up(touch(1, 130, 90))).toEqual([])
    expect(g.pointerCount).toBe(0)
  })

  it('가로·세로 7px까지는 탭(대각선 7,7도 탭 — Konva 끌기 판정과 같은 max(|dx|,|dy|))', () => {
    const g = new GestureArbiter()
    g.down(touch(1, 100, 100), false)
    expect(g.move(touch(1, 107, 93))).toEqual([])
    expect(g.up(touch(1, 107, 93))).toEqual([
      { type: 'tap', x: 107, y: 93, pointer: 'touch', shift: false, onNode: false },
    ])
  })

  it('한 축으로 8px 움직이면 탭이 아니다', () => {
    const g = new GestureArbiter()
    g.down(touch(1, 100, 100), false)
    expect(g.move(touch(1, 100, 108))).toEqual([{ type: 'pan', dx: 0, dy: 8 }])
    expect(g.up(touch(1, 100, 108))).toEqual([])
  })

  it('물건 위에서 누르면 Konva가 끄므로 화면 이동을 내지 않고, 제자리에서 떼면 물건 탭', () => {
    const g = new GestureArbiter()
    g.down(touch(1, 100, 100), true)
    expect(g.move(touch(1, 160, 100))).toEqual([])
    expect(g.up(touch(1, 160, 100))).toEqual([])

    g.down(touch(2, 50, 50), true)
    expect(g.up(touch(2, 52, 50))).toEqual([{ type: 'tap', x: 52, y: 50, pointer: 'touch', shift: false, onNode: true }])
  })
})

describe('두 번째 손가락 규칙(스펙 §4.5, Review Focus 1)', () => {
  it('물건 끌기 중 두 번째 손가락 → cancelNodeGesture 1번, 두 손가락 확대+이동, 하나 남으면 이동만, 탭 없음', () => {
    const g = new GestureArbiter()
    const all: GestureOutput[] = []
    let view: View = { zoom: 1, panX: 0, panY: 0 }
    const feed = (outs: GestureOutput[]) => {
      all.push(...outs)
      view = applyView(view, outs)
      return outs
    }

    feed(g.down(touch(1, 100, 100), true))
    expect(feed(g.move(touch(1, 140, 100)))).toEqual([])
    expect(feed(g.down(touch(2, 300, 100), false))).toEqual([{ type: 'cancelNodeGesture' }])
    expect(g.pointerCount).toBe(2)

    // 거리 160 → 200(1.25배), 중심 (220,100) → (240,100)
    expect(feed(g.move(touch(2, 340, 100)))).toEqual([
      { type: 'zoom', factor: 1.25, cx: 220, cy: 100 },
      { type: 'pan', dx: 20, dy: 0 },
    ])
    // 스파이크 pinchView 결과와 같다
    expect(view).toEqual({ zoom: 1.25, panX: -35, panY: -25 })

    expect(feed(g.up(touch(2, 340, 100)))).toEqual([])
    expect(feed(g.move(touch(1, 150, 110)))).toEqual([{ type: 'pan', dx: 10, dy: 10 }])
    expect(view).toEqual({ zoom: 1.25, panX: -25, panY: -15 })

    expect(feed(g.up(touch(1, 150, 110)))).toEqual([])
    expect(count(all, 'cancelNodeGesture')).toBe(1)
    expect(count(all, 'tap')).toBe(0)
    expect(g.pointerCount).toBe(0)
  })

  it('끌기 판정 전(8px 안)에 두 번째 손가락이 와도 되돌린다', () => {
    const g = new GestureArbiter()
    g.down(touch(1, 100, 100), true)
    expect(g.down(touch(2, 300, 100), false)).toEqual([{ type: 'cancelNodeGesture' }])
  })

  it('두 손가락 중 하나를 뗐다가 다시 대도 되돌림은 한 번뿐', () => {
    const g = new GestureArbiter()
    const all: GestureOutput[] = []
    all.push(...g.down(touch(1, 100, 100), true))
    all.push(...g.down(touch(2, 300, 100), false))
    all.push(...g.up(touch(2, 300, 100)))
    all.push(...g.down(touch(3, 300, 120), false))
    all.push(...g.move(touch(3, 320, 120)))
    all.push(...g.up(touch(3, 320, 120)))
    all.push(...g.up(touch(1, 100, 100)))
    expect(count(all, 'cancelNodeGesture')).toBe(1)
    expect(count(all, 'tap')).toBe(0)
  })

  it('처음 손가락을 떼고 두 번째가 남아도 그 손가락으로 화면 이동', () => {
    const g = new GestureArbiter()
    g.down(touch(1, 100, 100), true)
    g.down(touch(2, 300, 100), false)
    expect(g.up(touch(1, 100, 100))).toEqual([])
    expect(g.move(touch(2, 290, 130))).toEqual([{ type: 'pan', dx: -10, dy: 30 }])
  })

  it('빈 곳에서 시작한 두 손가락은 되돌릴 것이 없고, 떼도 탭이 아니다', () => {
    const g = new GestureArbiter()
    const all = [
      ...g.down(touch(1, 100, 100), false),
      ...g.down(touch(2, 200, 100), false),
      ...g.up(touch(1, 100, 100)),
      ...g.up(touch(2, 200, 100)),
    ]
    expect(all).toEqual([])
  })

  it('거리가 그대로면 이동만, 거리가 반이 되면 0.5배 확대와 중심 이동', () => {
    const g = new GestureArbiter()
    g.down(touch(1, 100, 100), false)
    g.down(touch(2, 200, 100), false)
    // (200,100) → (160,180): 첫 손가락과의 거리는 100 그대로, 중심 (150,100) → (130,140)
    expect(g.move(touch(2, 160, 180))).toEqual([{ type: 'pan', dx: -20, dy: 40 }])
    const g2 = new GestureArbiter()
    g2.down(touch(1, 100, 100), false)
    g2.down(touch(2, 200, 100), false)
    expect(g2.move(touch(2, 150, 100))).toEqual([
      { type: 'zoom', factor: 0.5, cx: 150, cy: 100 },
      { type: 'pan', dx: -25, dy: 0 },
    ])
  })

  it('두 손가락이 한 점에 겹쳐 있으면 확대하지 않는다(0으로 나누지 않음)', () => {
    const g = new GestureArbiter()
    g.down(touch(1, 100, 100), false)
    g.down(touch(2, 100, 100), false)
    expect(g.move(touch(2, 150, 100))).toEqual([{ type: 'pan', dx: 25, dy: 0 }])
    expect(g.move(touch(2, 100, 100))).toEqual([{ type: 'pan', dx: -25, dy: 0 }])
  })

  it('세 번째 손가락은 계산에 쓰지 않는다', () => {
    const g = new GestureArbiter()
    g.down(touch(1, 100, 100), false)
    g.down(touch(2, 200, 100), false)
    g.down(touch(3, 500, 500), false)
    expect(g.move(touch(3, 600, 600))).toEqual([])
    expect(g.pointerCount).toBe(3)
  })

  it('마우스·펜 조작 중의 터치와, 터치 중의 마우스는 무시한다', () => {
    const g = new GestureArbiter()
    g.down({ id: 1, pointer: 'pen', x: 10, y: 10, button: 0 }, true)
    expect(g.down(touch(2, 300, 100), false)).toEqual([])
    expect(g.pointerCount).toBe(1)
    expect(g.up(touch(2, 300, 100))).toEqual([])

    const t = new GestureArbiter()
    t.down(touch(5, 10, 10), false)
    expect(t.down(mouse(300, 100), false)).toEqual([])
    expect(t.pointerCount).toBe(1)
  })
})

describe('마우스·펜', () => {
  it('빈 곳 끌기는 범위 선택. 3px을 넘으면 사각형을 내고, 떼면 done', () => {
    const g = new GestureArbiter()
    g.down(mouse(100, 100), false)
    expect(g.move(mouse(102, 102))).toEqual([])
    expect(g.move(mouse(150, 130))).toEqual([{ type: 'marquee', x0: 100, y0: 100, x1: 150, y1: 130, done: false }])
    expect(g.up(mouse(160, 140))).toEqual([{ type: 'marquee', x0: 100, y0: 100, x1: 160, y1: 140, done: true }])
  })

  it('2px까지는 탭, 3px이면 탭이 아니다', () => {
    const g = new GestureArbiter()
    g.down(mouse(100, 100), false)
    g.move(mouse(102, 102))
    expect(g.up(mouse(102, 102))).toEqual([{ type: 'tap', x: 102, y: 102, pointer: 'mouse', shift: false, onNode: false }])

    g.down(mouse(100, 100), false)
    const outs = [...g.move(mouse(103, 100)), ...g.up(mouse(103, 100))]
    expect(count(outs, 'tap')).toBe(0)
    expect(outs.at(-1)).toEqual({ type: 'marquee', x0: 100, y0: 100, x1: 103, y1: 100, done: true })
  })

  it('펜도 마우스와 같다(범위 선택, 3px)', () => {
    const g = new GestureArbiter()
    g.down({ id: 9, pointer: 'pen', x: 0, y: 0, button: 0 }, false)
    expect(g.move({ id: 9, pointer: 'pen', x: 2, y: 2, button: 0 })).toEqual([])
    expect(g.move({ id: 9, pointer: 'pen', x: 0, y: 3, button: 0 })).toEqual([
      { type: 'marquee', x0: 0, y0: 0, x1: 0, y1: 3, done: false },
    ])
  })

  it('Space를 누른 채 빈 곳 끌기는 화면 이동이고 탭을 내지 않는다', () => {
    const g = new GestureArbiter()
    g.down(mouse(100, 100, { space: true }), false)
    expect(g.move(mouse(120, 90, { space: true }))).toEqual([{ type: 'pan', dx: 20, dy: -10 }])
    expect(g.up(mouse(120, 90))).toEqual([])

    g.down(mouse(100, 100, { space: true }), false)
    expect(g.up(mouse(100, 100, { space: true }))).toEqual([])
  })

  it('가운데 버튼 끌기는 물건 위에서도 화면 이동이고 탭을 내지 않는다', () => {
    const g = new GestureArbiter()
    g.down(mouse(100, 100, { button: 1 }), true)
    expect(g.move(mouse(110, 100, { button: 1 }))).toEqual([{ type: 'pan', dx: 10, dy: 0 }])
    expect(g.up(mouse(110, 100, { button: 1 }))).toEqual([])

    g.down(mouse(100, 100, { button: 1 }), false)
    expect(g.up(mouse(100, 100, { button: 1 }))).toEqual([])
  })

  it('오른쪽 버튼은 판정하지 않는다', () => {
    const g = new GestureArbiter()
    expect(g.down(mouse(100, 100, { button: 2 }), false)).toEqual([])
    expect(g.pointerCount).toBe(0)
    expect(g.move(mouse(150, 100, { button: 2 }))).toEqual([])
    expect(g.up(mouse(150, 100, { button: 2 }))).toEqual([])
  })

  it('물건 클릭은 물건 탭, Shift는 누를 때나 뗄 때 중 하나만 눌려도 shift', () => {
    const g = new GestureArbiter()
    g.down(mouse(10, 10, { shift: true }), true)
    expect(g.up(mouse(11, 10))).toEqual([{ type: 'tap', x: 11, y: 10, pointer: 'mouse', shift: true, onNode: true }])
    g.down(mouse(10, 10), true)
    expect(g.up(mouse(10, 10, { shift: true }))).toEqual([
      { type: 'tap', x: 10, y: 10, pointer: 'mouse', shift: true, onNode: true },
    ])
  })

  it('물건을 3px 넘게 끌면(Konva가 끔) 아무것도 내지 않는다', () => {
    const g = new GestureArbiter()
    g.down(mouse(10, 10), true)
    expect(g.move(mouse(60, 10))).toEqual([])
    expect(g.up(mouse(60, 10))).toEqual([])
  })

  it('떼기를 놓친 마우스가 다시 눌리면 새 제스처로 본다(두 손가락으로 오인하지 않음)', () => {
    const g = new GestureArbiter()
    g.down(mouse(10, 10), true)
    g.move(mouse(60, 10))
    expect(g.down(mouse(200, 200), false)).toEqual([])
    expect(g.pointerCount).toBe(1)
    expect(g.up(mouse(200, 200))).toEqual([{ type: 'tap', x: 200, y: 200, pointer: 'mouse', shift: false, onNode: false }])
  })
})

describe('cancel(pointercancel·touchcancel·visibilitychange hidden)', () => {
  it('물건 끌기 중이면 cancelNodeGesture를 내고 모든 포인터를 잊는다', () => {
    const g = new GestureArbiter()
    g.down(touch(1, 100, 100), true)
    g.move(touch(1, 140, 100))
    expect(g.cancel()).toEqual([{ type: 'cancelNodeGesture' }])
    expect(g.pointerCount).toBe(0)
    expect(g.up(touch(1, 140, 100))).toEqual([])
    expect(g.move(touch(1, 150, 100))).toEqual([])
  })

  it('두 번째 손가락으로 이미 되돌렸으면 다시 내지 않는다', () => {
    const g = new GestureArbiter()
    g.down(touch(1, 100, 100), true)
    g.down(touch(2, 300, 100), false)
    expect(g.cancel()).toEqual([])
  })

  it('범위 선택 중이면 크기 0인 done 사각형으로 끝낸다', () => {
    const g = new GestureArbiter()
    g.down(mouse(100, 100), false)
    g.move(mouse(150, 130))
    expect(g.cancel()).toEqual([{ type: 'marquee', x0: 100, y0: 100, x1: 100, y1: 100, done: true }])
  })

  it('아무것도 없거나 빈 곳 화면 이동 중이면 빈 배열', () => {
    const g = new GestureArbiter()
    expect(g.cancel()).toEqual([])
    g.down(touch(1, 0, 0), false)
    g.move(touch(1, 50, 0))
    expect(g.cancel()).toEqual([])
  })

  it('취소 뒤 새 탭은 정상', () => {
    const g = new GestureArbiter()
    g.down(touch(1, 100, 100), true)
    g.cancel()
    g.down(touch(2, 10, 10), false)
    expect(g.up(touch(2, 10, 10))).toEqual([{ type: 'tap', x: 10, y: 10, pointer: 'touch', shift: false, onNode: false }])
  })
})

describe('잡지 않은 포인터', () => {
  it('누르지 않은 포인터의 move·up(마우스 호버 등)은 무시한다', () => {
    const g = new GestureArbiter()
    expect(g.move(mouse(10, 10))).toEqual([])
    expect(g.up(mouse(10, 10))).toEqual([])
    expect(g.pointerCount).toBe(0)
  })
})
