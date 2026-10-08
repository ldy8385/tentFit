import { describe, expect, it } from 'vitest'
import { createLayout, type Inner, type Item, type Layout, type Shape, type Tent } from '../core/model'
import { computeStats } from '../core/stats'
import { buildZones } from '../core/zones'
import { objColor } from '../ui/theme'
import {
  buildScene,
  GRID_MIN_SPACING_PX,
  gridLevels,
  gridLines,
  itemLabel,
  LABEL_MIN_SCREEN_PX,
  pieceLabel,
  type SceneInput,
} from './scene'
import type { View } from './viewport'

const NOW = '2026-10-08T00:00:00.000Z'

function inner(id: string, w: number, h: number, x: number, y: number): Inner {
  return { id, name: `이너 ${id}`, shape: { kind: 'rect', w, h }, x, y, rotation: 0 }
}

function item(id: string, shape: Shape, x: number, y: number, extra: Partial<Item> = {}): Item {
  return {
    id,
    name: extra.name ?? id,
    shape,
    x,
    y,
    rotation: 0,
    color: 'blue',
    category: 'MAT',
    countsArea: true,
    ...extra,
  }
}

/** 골든 공통 조건(스펙 §13.2): 외곽 600×300, 이너 300×300 @(150,0) */
function goldenTent(): Tent {
  return { name: '테스트 텐트', outer: { kind: 'rect', w: 600, h: 300 }, inners: [inner('1', 300, 300, 150, 0)] }
}

function layoutWith(tent: Tent, items: Item[]): Layout {
  const l = createLayout(tent, { name: '배치', id: 'L', now: NOW })
  l.items = items
  return l
}

function input(layout: Layout, over: Partial<SceneInput> = {}): SceneInput {
  const zones = buildZones(layout.tent)
  return {
    layout,
    zones,
    stats: computeStats(layout, zones),
    view: { zoom: 1, panX: 0, panY: 0 },
    mode: 'place',
    scopeGroupId: null,
    gridVisible: true,
    ...over,
  }
}

describe('gridLevels', () => {
  it('화면 간격이 6px 이상인 단계만 촘촘한 것부터 돌려준다', () => {
    expect(GRID_MIN_SPACING_PX).toBe(6)
    expect(gridLevels(1)).toEqual([10, 50, 100])
    expect(gridLevels(0.2)).toEqual([50, 100])
    expect(gridLevels(0.1)).toEqual([100])
  })

  it('10cm 단계는 0.6px/cm(간격 정확히 6px)까지 보이고 그보다 작으면 숨긴다', () => {
    expect(gridLevels(0.6)).toEqual([10, 50, 100])
    expect(gridLevels(0.59)).toEqual([50, 100])
    expect(gridLevels(0.12)).toEqual([50, 100])
    expect(gridLevels(0.119)).toEqual([100])
  })

  it('zoom이 0·음수·NaN·Infinity면 빈 배열', () => {
    expect(gridLevels(0)).toEqual([])
    expect(gridLevels(-1)).toEqual([])
    expect(gridLevels(Number.NaN)).toEqual([])
    expect(gridLevels(Number.POSITIVE_INFINITY)).toEqual([])
  })
})

describe('gridLines', () => {
  it('원점(외곽 bbox 왼쪽 위)에서 level의 정수배 자리에만 세로선·가로선을 긋는다', () => {
    const lines = gridLines({ minX: -320, minY: -160, maxX: 20, maxY: 0 }, [-300, -150], 100)
    expect(lines).toEqual([
      [-300, -160, -300, 0],
      [-200, -160, -200, 0],
      [-100, -160, -100, 0],
      [0, -160, 0, 0],
      [-320, -150, 20, -150],
      [-320, -50, 20, -50],
    ])
  })

  it('원점이 소수여도 원점에 맞춘다(원점 −287.5에서 50cm 간격)', () => {
    const lines = gridLines({ minX: -300, minY: 0, maxX: -150, maxY: 0 }, [-287.5, 0], 50)
    const xs = lines.filter((l) => l[0] === l[2]).map((l) => l[0])
    expect(xs).toEqual([-287.5, -237.5, -187.5])
  })

  it('bbox 경계에 정확히 걸린 선도 넣고, -0을 만들지 않는다', () => {
    const lines = gridLines({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, [0, 0], 10)
    expect(lines).toHaveLength(4)
    for (const l of lines) for (const v of l) expect(Object.is(v, -0)).toBe(false)
  })

  it('뒤집힌 bbox나 유한하지 않은 값이면 빈 배열', () => {
    expect(gridLines({ minX: 10, minY: 0, maxX: 0, maxY: 10 }, [0, 0], 10)).toEqual([])
    expect(gridLines({ minX: 0, minY: 0, maxX: Number.NaN, maxY: 10 }, [0, 0], 10)).toEqual([])
  })
})

describe('itemLabel·pieceLabel', () => {
  it('사각형은 이름 가로×세로, 원은 이름 ⌀지름, 다각형은 bbox 가로×세로', () => {
    expect(itemLabel(item('a', { kind: 'rect', w: 200, h: 60 }, 0, 0, { name: '매트' }))).toBe('매트 200×60')
    expect(itemLabel(item('b', { kind: 'circle', d: 35 }, 0, 0, { name: '스툴' }))).toBe('스툴 ⌀35')
    const tri: Shape = { kind: 'polygon', points: [[-40, -20], [45.5, -20], [0, 30]] }
    expect(itemLabel(item('c', tri, 0, 0, { name: '삼각' }))).toBe('삼각 85.5×50')
    expect(itemLabel(item('d', { kind: 'rect', w: 90.25, h: 60 }, 0, 0, { name: '롤테이블' }))).toBe('롤테이블 90.3×60')
  })

  it('전실 라벨은 m² 소수 첫째 자리', () => {
    expect(pieceLabel('전실 1', 132_400)).toBe('전실 1 · 13.2m²')
    expect(pieceLabel('전실 2', 4_400)).toBe('전실 2 · 0.4m²')
    expect(pieceLabel('바닥 1', 180_000)).toBe('바닥 1 · 18.0m²')
    expect(pieceLabel('전실 1', 0)).toBe('전실 1 · 0.0m²')
    expect(pieceLabel('전실 1', Number.NaN)).toBe('전실 1 · 0.0m²')
  })
})

describe('buildScene — 물건', () => {
  it('색은 theme의 obj-<키>, 기본은 1.5px 실선', () => {
    const l = layoutWith(goldenTent(), [item('m', { kind: 'rect', w: 200, h: 60 }, -150, 0, { color: 'teal' })])
    const [m] = buildScene(input(l)).items
    expect(m).toMatchObject({ id: 'm', x: -150, y: 0, rotation: 0, dash: null, strokeWidth: 1.5, warn: 'none', dimmed: false })
    expect(m?.stroke).toBe(objColor('teal').stroke)
    expect(m?.fill).toBe(objColor('teal').fill)
    expect(m?.label).toBe('m 200×60')
  })

  it('countsArea=false 물건은 자기 색 1.5px 긴 대시(6-4)', () => {
    const rug = item('r', { kind: 'rect', w: 100, h: 50 }, -150, -80, { countsArea: false, category: 'RUG', color: 'brown' })
    const [n] = buildScene(input(layoutWith(goldenTent(), [rug]))).items
    expect(n?.dash).toEqual([6, 4])
    expect(n?.strokeWidth).toBe(1.5)
    expect(n?.stroke).toBe(objColor('brown').stroke)
  })

  it('라벨은 화면에서 짧은 쪽이 40px 이상일 때만 보인다(경계 포함)', () => {
    expect(LABEL_MIN_SCREEN_PX).toBe(40)
    const l = layoutWith(goldenTent(), [
      item('r', { kind: 'rect', w: 200, h: 40 }, -150, 0),
      item('c', { kind: 'circle', d: 40 }, -200, 80),
    ])
    const at = (zoom: number) => buildScene(input(l, { view: { zoom, panX: 0, panY: 0 } })).items.map((n) => n.labelVisible)
    expect(at(1)).toEqual([true, true])
    expect(at(0.99)).toEqual([false, false])
    expect(at(2)).toEqual([true, true])
  })

  it('경고: 나감과 걸침이 함께면 outside가 우선, 걸침만이면 straddle', () => {
    const l = layoutWith(goldenTent(), [
      item('both', { kind: 'rect', w: 200, h: 60 }, 0, 150), // 아래 벽 밖으로 30cm + 이너 벽(x=0) 걸침
      item('straddle', { kind: 'rect', w: 200, h: 60 }, 0, 0), // G2
      item('out', { kind: 'rect', w: 200, h: 60 }, -300, 0), // 왼쪽 벽 밖으로
      item('ok', { kind: 'rect', w: 200, h: 60 }, -150, -80),
    ])
    const s = input(l)
    expect(s.stats.warnings['both']).toMatchObject({ outside: true })
    expect(s.stats.warnings['both']?.straddles).toEqual(['1'])
    expect(buildScene(s).items.map((n) => [n.id, n.warn])).toEqual([
      ['both', 'outside'],
      ['straddle', 'straddle'],
      ['out', 'outside'],
      ['ok', 'none'],
    ])
  })

  it('텐트 편집 모드면 모든 물건이 흐려진다', () => {
    const l = layoutWith(goldenTent(), [item('a', { kind: 'rect', w: 50, h: 50 }, -150, 0)])
    expect(buildScene(input(l, { mode: 'tent' })).items[0]?.dimmed).toBe(true)
    expect(buildScene(input(l, { mode: 'place' })).items[0]?.dimmed).toBe(false)
  })

  it('그룹 안 편집이면 그 그룹 밖 물건만 흐려진다', () => {
    const l = layoutWith(goldenTent(), [
      item('a', { kind: 'rect', w: 50, h: 50 }, -200, 0, { groupId: 'g1' }),
      item('b', { kind: 'rect', w: 50, h: 50 }, -100, 0, { groupId: 'g1' }),
      item('c', { kind: 'rect', w: 50, h: 50 }, -150, 100),
    ])
    l.groups = [{ id: 'g1' }]
    const dimmed = buildScene(input(l, { scopeGroupId: 'g1' })).items.map((n) => n.dimmed)
    expect(dimmed).toEqual([false, false, true])
  })

  it('물건 순서와 도형 참조는 문서 그대로', () => {
    const items = [item('a', { kind: 'circle', d: 35 }, 0, 0), item('b', { kind: 'rect', w: 10, h: 10 }, 5, 5)]
    const l = layoutWith(goldenTent(), items)
    const nodes = buildScene(input(l)).items
    expect(nodes.map((n) => n.id)).toEqual(['a', 'b'])
    expect(nodes[0]?.shape).toBe(l.items[0]?.shape)
  })
})

describe('buildScene — 텐트', () => {
  it('외곽 도형과 전실 조각·라벨(polylabel 위치, m² 소수 첫째 자리)', () => {
    const l = layoutWith(goldenTent(), [])
    const s = input(l)
    const scene = buildScene(s)
    expect(scene.outer).toBe(l.tent.outer)
    expect(scene.pieces).toHaveLength(1)
    const piece = scene.pieces[0]
    expect(piece?.key).toBe(s.zones.pieces[0]?.key)
    expect(piece?.label.text).toBe('전실 1 · 9.0m²')
    expect(piece?.label.x).toBe(s.zones.pieces[0]?.label[0])
    expect(piece?.label.y).toBe(s.zones.pieces[0]?.label[1])
    expect(piece?.label.visible).toBe(true)
    expect(piece?.rings.length).toBeGreaterThan(0)
  })

  it('전실 라벨 상자(글자 수×7px × 16px)가 조각 bbox를 넘으면 숨긴다', () => {
    const l = layoutWith(goldenTent(), [])
    // '전실 1 · 9.0m²' = 12글자 → 84px. 조각은 300×300cm
    expect(buildScene(input(l, { view: { zoom: 0.25, panX: 0, panY: 0 } })).pieces[0]?.label.visible).toBe(false)
    expect(buildScene(input(l, { view: { zoom: 0.5, panX: 0, panY: 0 } })).pieces[0]?.label.visible).toBe(true)
  })

  it('이너 0개 텐트는 바닥 조각 하나에 「바닥 1」 라벨', () => {
    const tent: Tent = { name: '티피', outer: { kind: 'rect', w: 600, h: 300 }, inners: [] }
    const scene = buildScene(input(layoutWith(tent, [])))
    expect(scene.inners).toEqual([])
    expect(scene.pieces).toHaveLength(1)
    expect(scene.pieces[0]?.label.text).toBe('바닥 1 · 18.0m²')
    expect(scene.pieces[0]?.label.visible).toBe(true)
  })

  it('이너 노드: 도형·위치 그대로, 라벨은 이름이고 구역 bbox에 안 들어가면 숨김', () => {
    const tent: Tent = { name: 't', outer: { kind: 'rect', w: 600, h: 300 }, inners: [inner('s', 50, 50, 0, 0)] }
    const l = layoutWith(tent, [])
    const at = (zoom: number) => buildScene(input(l, { view: { zoom, panX: 0, panY: 0 } })).inners[0]
    // '이너 s' = 4글자 → 28px. 구역은 50×50cm
    expect(at(1)).toMatchObject({ id: 's', name: '이너 s', x: 0, y: 0, rotation: 0, escape: false })
    expect(at(1)?.shape).toBe(l.tent.inners[0]?.shape)
    expect(at(1)?.label).toMatchObject({ text: '이너 s', visible: true })
    expect(at(0.5)?.label.visible).toBe(false)
  })

  it('외곽 밖으로 나간 이너는 escape, 구역이 없으면 라벨은 자기 bbox 가운데', () => {
    const tent: Tent = {
      name: 't',
      outer: { kind: 'rect', w: 600, h: 300 },
      inners: [inner('a', 300, 300, 200, 0), inner('far', 100, 100, 1000, 0)],
    }
    const scene = buildScene(input(layoutWith(tent, [])))
    expect(scene.inners.map((n) => n.escape)).toEqual([true, true])
    expect(scene.inners[1]?.label).toMatchObject({ x: 1000, y: 0 })
  })
})

describe('buildScene — 격자', () => {
  const view: View = { zoom: 1, panX: 400, panY: 300 }
  const size = { width: 800, height: 600 }

  it('보이는 영역 전체에 깔고, 선은 외곽 bbox 왼쪽 위(−300,−150)에 맞춘다', () => {
    const scene = buildScene(input(layoutWith(goldenTent(), []), { view, size }))
    expect(scene.grid.map((g) => g.level)).toEqual([10, 50, 100])
    const meter = scene.grid.find((g) => g.level === 100)?.lines ?? []
    const xs = meter.filter((l) => l[0] === l[2]).map((l) => l[0])
    const ys = meter.filter((l) => l[1] === l[3]).map((l) => l[1])
    expect(xs).toEqual([-400, -300, -200, -100, 0, 100, 200, 300, 400])
    expect(ys).toEqual([-250, -150, -50, 50, 150, 250])
    // 세로선은 보이는 높이 전체(월드 −300..300)
    expect(meter[0]).toEqual([-400, -300, -400, 300])
  })

  it('확대 배율에 따라 단계를 고른다(0.3px/cm면 10cm 숨김)', () => {
    const scene = buildScene(input(layoutWith(goldenTent(), []), { view: { zoom: 0.3, panX: 0, panY: 0 }, size }))
    expect(scene.grid.map((g) => g.level)).toEqual([50, 100])
  })

  it('크기가 없거나 0이면 외곽 bbox 안에만 깐다', () => {
    const noSize = buildScene(input(layoutWith(goldenTent(), []), { view }))
    const zero = buildScene(input(layoutWith(goldenTent(), []), { view, size: { width: 0, height: 0 } }))
    for (const scene of [noSize, zero]) {
      const meter = scene.grid.find((g) => g.level === 100)?.lines ?? []
      expect(meter.filter((l) => l[0] === l[2]).map((l) => l[0])).toEqual([-300, -200, -100, 0, 100, 200, 300])
    }
  })

  it('격자 끄면 빈 배열', () => {
    expect(buildScene(input(layoutWith(goldenTent(), []), { gridVisible: false, view, size })).grid).toEqual([])
  })

  it('zoom이 0이어도 NaN 없이 격자·라벨이 비어 있다', () => {
    const l = layoutWith(goldenTent(), [item('a', { kind: 'rect', w: 200, h: 60 }, 0, 0)])
    const scene = buildScene(input(l, { view: { zoom: 0, panX: 0, panY: 0 }, size }))
    expect(scene.grid).toEqual([])
    expect(scene.items[0]?.labelVisible).toBe(false)
    expect(scene.pieces[0]?.label.visible).toBe(false)
  })
})
