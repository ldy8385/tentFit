import { describe, expect, it } from 'vitest'
import { createLayout, type Layout, type Tent } from '../core/model'
import { makeItem } from '../core/ops/items'
import { createDocStore } from '../store/doc'
import { createUiStore } from '../store/ui'
import { layoutBBox, screenToWorld, worldToScreen } from '../view/viewport'
import type { Stores } from './stores'
import { fitToLayout, visibleCenter, zoomByStep, ZOOM_STEP } from './viewActions'

const TENT: Tent = { name: '시험 텐트', outer: { kind: 'rect', w: 400, h: 300 }, inners: [] }

function makeStores(layout: Layout): Stores {
  return { doc: createDocStore(layout), ui: createUiStore() }
}

describe('visibleCenter', () => {
  it('시트·배너 높이를 뺀 영역의 가운데', () => {
    expect(visibleCenter({ width: 400, height: 800 }, { top: 0, bottom: 0 })).toEqual([200, 400])
    expect(visibleCenter({ width: 400, height: 800 }, { top: 40, bottom: 360 })).toEqual([200, 240])
  })

  it('크기 0이나 시트가 캔버스보다 커도 음수·NaN이 없다', () => {
    expect(visibleCenter({ width: 0, height: 0 }, { top: 0, bottom: 0 })).toEqual([0, 0])
    expect(visibleCenter({ width: 300, height: 100 }, { top: 0, bottom: 500 })).toEqual([150, 0])
  })
})

describe('fitToLayout', () => {
  it('밖으로 나간 물건까지 포함해 캔버스 가운데에 맞춘다', () => {
    const layout = createLayout(TENT, { name: '배치' })
    layout.items.push(makeItem({ name: '나간 의자', shape: { kind: 'rect', w: 50, h: 50 }, color: 'teal', category: 'CHAIR', countsArea: true }, [600, 0]))
    const stores = makeStores(layout)
    stores.ui.getState().setSize({ width: 800, height: 600 })
    fitToLayout(stores)
    const v = stores.ui.getState().view
    const b = layoutBBox(layout)
    expect(b.maxX).toBe(625)
    const [cx, cy] = worldToScreen(v, [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2])
    expect(cx).toBeCloseTo(400, 0)
    expect(cy).toBeCloseTo(300, 0)
    const [rightEdge] = worldToScreen(v, [b.maxX, 0])
    expect(rightEdge).toBeLessThanOrEqual(800)
  })
})

describe('zoomByStep', () => {
  it('보이는 영역 가운데의 월드 점을 고정하고 ZOOM_STEP배 확대·축소한다', () => {
    const stores = makeStores(createLayout(TENT, { name: '배치' }))
    const ui = stores.ui.getState()
    ui.setSize({ width: 400, height: 800 })
    ui.setInsets({ top: 0, bottom: 300 })
    ui.setView({ zoom: 1, panX: 10, panY: 20 })
    const anchor = screenToWorld(stores.ui.getState().view, [200, 250])
    zoomByStep(stores, ZOOM_STEP)
    const v = stores.ui.getState().view
    expect(v.zoom).toBeCloseTo(1.25, 10)
    const [sx, sy] = worldToScreen(v, anchor)
    expect(sx).toBeCloseTo(200, 6)
    expect(sy).toBeCloseTo(250, 6)
    zoomByStep(stores, 1 / ZOOM_STEP)
    expect(stores.ui.getState().view.zoom).toBeCloseTo(1, 10)
  })
})
