import { describe, expect, it } from 'vitest'
import { createLayout } from '../core/model'
import {
  BACKDROP_DEFAULT_OPACITY,
  moveBackdrop,
  placeBackdrop,
  removeBackdrop,
  scaleBackdropAt,
  setBackdropAdjusting,
  setBackdropOpacity,
  setBackdropRotation,
  setBackdropWidth,
} from './backdropActions'
import { createStores, type Stores } from './stores'

function setup(): Stores {
  const s = createStores(createLayout({ name: 't', outer: { kind: 'rect', w: 600, h: 300 }, inners: [] }, { name: 'l', id: 'L', now: '2026-10-14T00:00:00.000Z' }))
  s.ui.getState().setSize({ width: 1000, height: 500 })
  s.ui.getState().setView({ zoom: 1, panX: 500, panY: 250 })
  return s
}

describe('배경 이미지', () => {
  it('보이는 영역 가운데에 80% 안으로 깔고, 문서·기록은 그대로', () => {
    const s = setup()
    placeBackdrop(s, 'x.png', 0.5)
    expect(s.ui.getState().backdrop).toEqual({ url: 'x.png', x: 0, y: 0, w: 800, aspect: 0.5, opacity: BACKDROP_DEFAULT_OPACITY, adjusting: false, rotation: 0 })
    placeBackdrop(s, 'tall.png', 2)
    expect(s.ui.getState().backdrop?.w).toBe(200) // 세로 400(=500×0.8)에 맞춤
    expect(s.doc.getState().canUndo).toBe(false)
  })

  it('투명도·크기·맞추기(옮기기·고정점 확대)·빼기', () => {
    const s = setup()
    placeBackdrop(s, 'x.png', 0.5)
    setBackdropOpacity(s, 0.3)
    setBackdropWidth(s, 400)
    setBackdropAdjusting(s, true)
    moveBackdrop(s, 10, -5)
    expect(s.ui.getState().backdrop).toMatchObject({ x: 10, y: -5, w: 400, opacity: 0.3, adjusting: true })
    scaleBackdropAt(s, 2, [10, -5])
    expect(s.ui.getState().backdrop).toMatchObject({ x: 10, y: -5, w: 800 })
    scaleBackdropAt(s, 0.5, [0, 0])
    expect(s.ui.getState().backdrop).toMatchObject({ x: 5, y: -2.5, w: 400 })
    setBackdropOpacity(s, 0)
    expect(s.ui.getState().backdrop?.opacity).toBe(0.05)
    setBackdropRotation(s, -90)
    expect(s.ui.getState().backdrop?.rotation).toBe(270)
    removeBackdrop(s)
    expect(s.ui.getState().backdrop).toBeNull()
  })

  it('이미지가 없으면 아무것도 하지 않음', () => {
    const s = setup()
    moveBackdrop(s, 1, 1)
    setBackdropOpacity(s, 0.4)
    expect(s.ui.getState().backdrop).toBeNull()
  })
})
