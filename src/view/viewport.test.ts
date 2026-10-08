import { describe, expect, it } from 'vitest'
import { createLayout, type Item, type Layout, type Pt, type Shape } from '../core/model'
import {
  clampZoom,
  fitView,
  layoutBBox,
  screenToWorld,
  viewCenterWorld,
  wheelAction,
  worldToScreen,
  ZOOM_MAX,
  ZOOM_MIN,
  zoomAt,
  type BBox,
  type View,
} from './viewport'

const NOW = '2026-10-08T00:00:00.000Z'

function layoutOf(outer: Shape, items: Item[] = []): Layout {
  const layout = createLayout({ name: '시험 텐트', outer, inners: [] }, { name: '시험 배치', id: 'L1', now: NOW })
  layout.items = items
  return layout
}

function item(id: string, shape: Shape, x: number, y: number, rotation = 0): Item {
  return { id, name: id, shape, x, y, rotation, color: 'blue', category: 'MAT', countsArea: true }
}

/** NaN·Infinity가 없고 배율이 0.1~20 */
function expectSaneView(v: View): void {
  expect(Number.isFinite(v.zoom)).toBe(true)
  expect(Number.isFinite(v.panX)).toBe(true)
  expect(Number.isFinite(v.panY)).toBe(true)
  expect(v.zoom).toBeGreaterThanOrEqual(ZOOM_MIN)
  expect(v.zoom).toBeLessThanOrEqual(ZOOM_MAX)
}

const RECT_600x300: BBox = { minX: 0, minY: 0, maxX: 600, maxY: 300 }

describe('clampZoom', () => {
  it('0.1~20 안은 그대로, 밖은 경계로 자른다', () => {
    expect(clampZoom(0.65)).toBe(0.65)
    expect(clampZoom(0.05)).toBe(0.1)
    expect(clampZoom(0)).toBe(0.1)
    expect(clampZoom(-3)).toBe(0.1)
    expect(clampZoom(25)).toBe(20)
  })

  it('NaN·Infinity는 1로 본다', () => {
    expect(clampZoom(Number.NaN)).toBe(1)
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(1)
    expect(clampZoom(Number.NEGATIVE_INFINITY)).toBe(1)
  })
})

describe('좌표 변환', () => {
  it('screen = world × zoom + pan', () => {
    const v: View = { zoom: 0.5, panX: 100, panY: -20 }
    expect(worldToScreen(v, [200, 40])).toEqual([200, 0])
    expect(screenToWorld(v, [200, 0])).toEqual([200, 40])
  })

  it('왕복하면 제자리', () => {
    const views: View[] = [
      { zoom: 0.1, panX: 0, panY: 0 },
      { zoom: 0.65, panX: 195, panY: 422 },
      { zoom: 13.7, panX: -2500.5, panY: 3.25 },
    ]
    const points: Pt[] = [
      [0, 0],
      [-310, 160],
      [9999.9, -10000],
    ]
    for (const v of views) {
      for (const p of points) {
        const back = screenToWorld(v, worldToScreen(v, p))
        expect(back[0]).toBeCloseTo(p[0], 6)
        expect(back[1]).toBeCloseTo(p[1], 6)
      }
    }
  })

  it('-0을 돌려주지 않는다', () => {
    const [x] = screenToWorld({ zoom: 2, panX: 0, panY: 0 }, [-0, 0])
    expect(Object.is(x, -0)).toBe(false)
  })
})

describe('zoomAt', () => {
  it('화면 점을 고정하고 factor배 확대한다', () => {
    expect(zoomAt({ zoom: 1, panX: 0, panY: 0 }, 2, [100, 50])).toEqual({ zoom: 2, panX: -100, panY: -50 })
  })

  it('화면 점 아래의 월드 점이 그대로다', () => {
    const v: View = { zoom: 0.65, panX: 195, panY: 422 }
    const p: Pt = [295, 422]
    const before = screenToWorld(v, p)
    const next = zoomAt(v, 2, p)
    expect(next.zoom).toBeCloseTo(1.3, 12)
    const after = screenToWorld(next, p)
    expect(after[0]).toBeCloseTo(before[0], 9)
    expect(after[1]).toBeCloseTo(before[1], 9)
  })

  it('배율이 20에서 잘려도 화면 점은 고정된다', () => {
    const v: View = { zoom: 15, panX: -40, panY: 7 }
    const p: Pt = [10, 20]
    const next = zoomAt(v, 4, p)
    expect(next.zoom).toBe(20)
    const after = screenToWorld(next, p)
    const before = screenToWorld(v, p)
    expect(after[0]).toBeCloseTo(before[0], 9)
    expect(after[1]).toBeCloseTo(before[1], 9)
  })

  it('factor가 0 이하·NaN·Infinity면 보기를 바꾸지 않는다', () => {
    const v: View = { zoom: 0.65, panX: 195, panY: 422 }
    for (const f of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) expect(zoomAt(v, f, [10, 10])).toEqual(v)
  })
})

describe('fitView', () => {
  it('800×600: 여백은 핸들 14 + 16 = 30px(5%인 30px와 같음)', () => {
    const v = fitView(RECT_600x300, { width: 800, height: 600 }, { top: 0, bottom: 0 })
    expect(v.zoom).toBeCloseTo(740 / 600, 12)
    expect(v.panX).toBeCloseTo(30, 9)
    expect(v.panY).toBeCloseTo(115, 9)
    // 왼쪽 위 모서리가 여백 30px 자리에 온다
    expect(worldToScreen(v, [0, 0])[0]).toBeCloseTo(30, 9)
  })

  it('1000×1000: 짧은 변의 5%(50px)가 더 크면 그것을 여백으로 쓴다', () => {
    expect(fitView({ minX: 0, minY: 0, maxX: 900, maxY: 450 }, { width: 1000, height: 1000 }, { top: 0, bottom: 0 })).toEqual({
      zoom: 1,
      panX: 50,
      panY: 275,
    })
  })

  it('handlePx를 주면 여백 최소값이 handlePx + 16', () => {
    expect(fitView({ minX: 0, minY: 0, maxX: 700, maxY: 100 }, { width: 800, height: 600 }, { top: 0, bottom: 0 }, 34)).toEqual({
      zoom: 1,
      panX: 50,
      panY: 250,
    })
  })

  it('아래 시트 높이(insets.bottom)를 빼고 남은 영역에 맞춘다', () => {
    const v = fitView(RECT_600x300, { width: 390, height: 844 }, { top: 0, bottom: 300 })
    expect(v.zoom).toBeCloseTo(0.55, 12)
    expect(v.panX).toBeCloseTo(30, 9)
    expect(v.panY).toBeCloseTo(189.5, 9)
    // 아래쪽 끝이 시트(544px부터) 위 여백 안에 있다
    expect(worldToScreen(v, [600, 300])[1]).toBeLessThanOrEqual(544 - 30 + 1e-9)
  })

  it('위 배너 높이(insets.top)만큼 가운데가 내려간다', () => {
    const v = fitView(RECT_600x300, { width: 800, height: 600 }, { top: 40, bottom: 0 })
    const [, cy] = worldToScreen(v, [300, 150])
    expect(cy).toBeCloseTo(40 + 560 / 2, 9)
  })

  it('insets가 캔버스를 다 덮으면 insets를 무시한다', () => {
    const size = { width: 800, height: 600 }
    expect(fitView(RECT_600x300, size, { top: 400, bottom: 300 })).toEqual(fitView(RECT_600x300, size, { top: 0, bottom: 0 }))
  })

  it('캔버스 크기가 0(숨김)이거나 유한하지 않으면 { zoom: 1, pan 0 }', () => {
    const zero = { zoom: 1, panX: 0, panY: 0 }
    expect(fitView(RECT_600x300, { width: 0, height: 0 }, { top: 0, bottom: 0 })).toEqual(zero)
    expect(fitView(RECT_600x300, { width: 800, height: 0 }, { top: 0, bottom: 0 })).toEqual(zero)
    expect(fitView(RECT_600x300, { width: Number.NaN, height: 600 }, { top: 0, bottom: 0 })).toEqual(zero)
  })

  it('50m 외곽은 0.1로, 1cm 외곽은 20으로 잘리고 NaN이 없다', () => {
    const big = fitView({ minX: -2500, minY: -2500, maxX: 2500, maxY: 2500 }, { width: 390, height: 844 }, { top: 0, bottom: 0 })
    expectSaneView(big)
    expect(big.zoom).toBe(0.1)
    expect(worldToScreen(big, [0, 0])).toEqual([195, 422])

    const tiny = fitView({ minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5 }, { width: 800, height: 600 }, { top: 0, bottom: 0 })
    expectSaneView(tiny)
    expect(tiny.zoom).toBe(20)
    expect(worldToScreen(tiny, [0, 0])).toEqual([400, 300])
  })

  it('점 하나짜리 bbox는 배율 1로 가운데에 둔다', () => {
    const v = fitView({ minX: 10, minY: 20, maxX: 10, maxY: 20 }, { width: 800, height: 600 }, { top: 0, bottom: 0 })
    expect(v).toEqual({ zoom: 1, panX: 390, panY: 280 })
  })

  it('높이 0인 bbox는 가로만으로 맞춘다', () => {
    const v = fitView({ minX: 0, minY: 50, maxX: 600, maxY: 50 }, { width: 800, height: 600 }, { top: 0, bottom: 0 })
    expect(v.zoom).toBeCloseTo(740 / 600, 12)
  })

  it('캔버스가 여백보다 작아도(40×40) NaN 없이 잘린다', () => {
    expectSaneView(fitView(RECT_600x300, { width: 40, height: 40 }, { top: 0, bottom: 0 }))
  })

  it('bbox에 NaN·Infinity가 있어도 유한한 보기', () => {
    const v = fitView(
      { minX: Number.NaN, minY: Number.NEGATIVE_INFINITY, maxX: Number.POSITIVE_INFINITY, maxY: 3 },
      { width: 800, height: 600 },
      { top: 0, bottom: 0 },
    )
    expectSaneView(v)
  })
})

describe('layoutBBox', () => {
  it('물건이 없으면 외곽 bbox(외곽 사각형은 원점 가운데)', () => {
    expect(layoutBBox(layoutOf({ kind: 'rect', w: 600, h: 300 }))).toEqual({ minX: -300, minY: -150, maxX: 300, maxY: 150 })
  })

  it('밖으로 나간 물건과 회전한 물건을 포함한다', () => {
    const layout = layoutOf({ kind: 'rect', w: 600, h: 300 }, [
      item('out-right', { kind: 'rect', w: 100, h: 50 }, 500, 0),
      item('out-top', { kind: 'rect', w: 20, h: 20 }, 0, -200),
      item('rotated', { kind: 'rect', w: 20, h: 400 }, 0, 0, 90),
    ])
    // rotated: 20×400을 90° 돌리면 가로 400(-200~200), 세로 20
    expect(layoutBBox(layout)).toEqual({ minX: -300, minY: -210, maxX: 550, maxY: 150 })
  })

  it('원 물건은 원 근사 다각형의 bbox(지름 40이면 반지름 약 20)', () => {
    const b = layoutBBox(layoutOf({ kind: 'rect', w: 600, h: 300 }, [item('stool', { kind: 'circle', d: 40 }, -320, 0)]))
    expect(b.minX).toBeCloseTo(-340, 0)
    expect(b.maxX).toBe(300)
  })
})

describe('viewCenterWorld', () => {
  const v: View = { zoom: 2, panX: 100, panY: 50 }

  it('insets가 없으면 캔버스 가운데', () => {
    expect(viewCenterWorld(v, { width: 800, height: 600 }, { top: 0, bottom: 0 })).toEqual([150, 125])
  })

  it('아래 시트를 뺀 영역의 가운데', () => {
    expect(viewCenterWorld(v, { width: 800, height: 600 }, { top: 0, bottom: 200 })).toEqual([150, 75])
  })

  it('위아래가 같으면 가운데 그대로', () => {
    expect(viewCenterWorld(v, { width: 800, height: 600 }, { top: 100, bottom: 100 })).toEqual([150, 125])
  })
})

describe('wheelAction', () => {
  const base = { deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, metaKey: false }

  it('그냥 휠은 화면 이동(스크롤 반대 방향)', () => {
    const a = wheelAction({ ...base, deltaY: 100 })
    expect(a).toEqual({ type: 'pan', dx: 0, dy: -100 })
    if (a.type === 'pan') expect(Object.is(a.dx, -0)).toBe(false)
    expect(wheelAction({ ...base, deltaX: 30, deltaY: -12 })).toEqual({ type: 'pan', dx: -30, dy: 12 })
  })

  it('deltaMode 1(줄)은 16px, 2(쪽)는 800px로 센다', () => {
    expect(wheelAction({ ...base, deltaY: 3, deltaMode: 1 })).toEqual({ type: 'pan', dx: 0, dy: -48 })
    expect(wheelAction({ ...base, deltaY: 1, deltaMode: 2 })).toEqual({ type: 'pan', dx: 0, dy: -800 })
  })

  it('Ctrl+휠: 아래로 굴리면 축소, 위로 굴리면 확대(한 번에 ±20px까지)', () => {
    const down = wheelAction({ ...base, deltaY: 100, ctrlKey: true })
    expect(down.type).toBe('zoom')
    if (down.type === 'zoom') expect(down.factor).toBeCloseTo(Math.exp(-0.2), 12)
    const up = wheelAction({ ...base, deltaY: -100, ctrlKey: true })
    if (up.type === 'zoom') expect(up.factor).toBeCloseTo(Math.exp(0.2), 12)
    expect(up.type).toBe('zoom')
  })

  it('트랙패드 핀치(ctrlKey + 작은 deltaY)는 작은 단계로 확대', () => {
    const a = wheelAction({ ...base, deltaY: -2.5, ctrlKey: true })
    expect(a.type).toBe('zoom')
    if (a.type === 'zoom') expect(a.factor).toBeCloseTo(Math.exp(0.025), 12)
  })

  it('Cmd(metaKey)+휠도 확대·축소', () => {
    expect(wheelAction({ ...base, deltaY: 10, metaKey: true }).type).toBe('zoom')
  })

  it('NaN delta는 움직이지 않는다', () => {
    expect(wheelAction({ ...base, deltaX: Number.NaN, deltaY: Number.NaN })).toEqual({ type: 'pan', dx: 0, dy: 0 })
    expect(wheelAction({ ...base, deltaY: Number.NaN, ctrlKey: true })).toEqual({ type: 'zoom', factor: 1 })
  })
})
