import { describe, expect, it } from 'vitest'
import { enablePatches, produce, produceWithPatches } from 'immer'
import { createLayout, round1, type Inner, type Item, type Layout, type Pt, type Tent } from '../model'
import { area, region, ringArea, ringBBox, subtract, worldRing } from '../geom'
import { newInnerSide, shapeFromTemplate } from '../templates'
import { buildZones, type Zones } from '../zones'
import {
  addInner,
  addInnerFromPolygon,
  addInnerFromTemplate,
  deleteInner,
  deleteVertex,
  edgeEndRates,
  edgeMoves,
  insertVertex,
  targetFlipped,
  moveInner,
  moveInnerTo,
  renameInner,
  rotateInner,
  setCircleDiameter,
  setInnerTemplate,
  setOuterTemplate,
  setTargetPolygon,
  setTargetShapeTemplate,
  setVertex,
  swapTent,
  targetLocalRing,
  targetWorldRing,
  tentIssues,
} from './tent'

enablePatches()

const NOW = '2026-10-07T00:00:00.000Z'

function rectInner(id: string, w: number, h: number, x: number, y: number, extra: Partial<Inner> = {}): Inner {
  return {
    id,
    name: `이너 ${id}`,
    shape: { kind: 'rect', w, h },
    template: { kind: 'rect', w, h },
    x,
    y,
    rotation: 0,
    ...extra,
  }
}

// 골든 공통 조건(스펙 §13.2): 외곽 rect 600×300 @원점, 이너 rect 300×300 @(150,0)
function goldenTent(inners: Inner[] = [rectInner('in1', 300, 300, 150, 0, { name: '이너 1' })]): Tent {
  return {
    name: '테스트 텐트',
    outer: { kind: 'rect', w: 600, h: 300 },
    outerTemplate: { kind: 'rect', w: 600, h: 300 },
    inners,
  }
}

const MAT: Item = {
  id: 'mat',
  name: '매트',
  shape: { kind: 'rect', w: 200, h: 60 },
  x: 100,
  y: 50,
  rotation: 0,
  color: 'green',
  category: 'MAT',
  countsArea: true,
}

function layoutOf(tent: Tent = goldenTent(), sourcePresetId?: string): Layout {
  const base = createLayout(tent, { name: '텐트', id: 'L1', now: NOW })
  const layout: Layout = { ...base, items: [{ ...MAT, shape: { kind: 'rect', w: 200, h: 60 } }] }
  if (sourcePresetId !== undefined) layout.sourcePresetId = sourcePresetId
  return layout
}

function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i]
  if (v === undefined) throw new Error(`인덱스 ${i} 없음`)
  return v
}

function innerOf(l: Layout, id: string): Inner {
  const found = l.tent.inners.find((it) => it.id === id)
  if (!found) throw new Error(`이너 ${id} 없음`)
  return found
}

// 값을 돌려주는 레시피도 있으므로 본문을 항상 중괄호로 감쌉니다(immer는 반환값을 새 상태로 봄).
function run(l: Layout, fn: (d: Layout) => unknown): Layout {
  return produce(l, (d) => {
    fn(d)
  })
}

type AddResult = ReturnType<typeof addInner>

function runAdd(l: Layout, zones: Zones): { next: Layout; res: AddResult } {
  const box: { res?: AddResult } = {}
  const next = produce(l, (d) => {
    box.res = addInner(d, zones)
  })
  if (box.res === undefined) throw new Error('addInner 결과 없음')
  return { next, res: box.res }
}

describe('템플릿', () => {
  it('G12: 외곽 템플릿 치수를 바꿔도 이너와 물건의 월드 좌표는 그대로다', () => {
    const l = layoutOf()
    const innerBefore = targetWorldRing(l, { innerId: 'in1' })
    const next = run(l, (d) => setOuterTemplate(d, { kind: 'rect', w: 800, h: 400 }))
    expect(next.tent.outer).toEqual({ kind: 'rect', w: 800, h: 400 })
    expect(next.tent.outerTemplate).toEqual({ kind: 'rect', w: 800, h: 400 })
    expect(ringBBox(targetWorldRing(next, 'outer'))).toEqual({ minX: -400, minY: -200, maxX: 400, maxY: 200 })
    expect(innerOf(next, 'in1')).toMatchObject({ x: 150, y: 0, rotation: 0 })
    expect(targetWorldRing(next, { innerId: 'in1' })).toEqual(innerBefore)
    expect(next.items).toBe(l.items)
    expect(at(next.items, 0)).toMatchObject({ x: 100, y: 50 })
  })

  it('사다리꼴 템플릿은 입력값을 반올림해 저장하고, 도형은 넓이 62,500cm²의 꼭짓점 4개 다각형이 된다', () => {
    const l = layoutOf()
    const next = run(l, (d) => setOuterTemplate(d, { kind: 'trapezoid', front: 300, back: 200, depth: 250.04, offset: 0 }))
    expect(next.tent.outerTemplate).toEqual({ kind: 'trapezoid', front: 300, back: 200, depth: 250, offset: 0 })
    expect(next.tent.outer.kind).toBe('polygon')
    const ring = targetWorldRing(next, 'outer')
    expect(ring).toHaveLength(4)
    expect(ringArea(ring)).toBeCloseTo(62500, 2)
  })

  it('setInnerTemplate은 이너 도형과 템플릿만 바꾸고 위치·회전은 그대로 둔다', () => {
    const l = layoutOf()
    const next = run(l, (d) => setInnerTemplate(d, 'in1', { kind: 'circle', d: 250 }))
    expect(innerOf(next, 'in1')).toMatchObject({
      x: 150,
      y: 0,
      rotation: 0,
      shape: { kind: 'circle', d: 250 },
      template: { kind: 'circle', d: 250 },
    })
    expect(next.tent.outer).toBe(l.tent.outer)
    expect(run(l, (d) => setInnerTemplate(d, 'zz', { kind: 'circle', d: 250 }))).toBe(l)
  })
})

describe('꼭짓점 편집', () => {
  it('사각형 외곽의 꼭짓점을 끌면 자유 다각형이 되고 템플릿을 버린다', () => {
    const l = layoutOf()
    const before = targetWorldRing(l, 'outer')
    const idx = before.findIndex((p) => p[0] === 300 && p[1] === -150)
    expect(idx).toBeGreaterThanOrEqual(0)
    const next = run(l, (d) => setVertex(d, 'outer', idx, [320.04, -150]))
    expect(next.tent.outer.kind).toBe('polygon')
    expect('outerTemplate' in next.tent).toBe(false)
    const after = targetWorldRing(next, 'outer')
    expect(after).toHaveLength(4)
    expect(at(after, idx)).toEqual([320, -150])
    after.forEach((p, i) => {
      if (i !== idx) expect(p).toEqual(at(before, i))
    })
  })

  it('30° 돌린 이너: 월드 좌표로 넣은 꼭짓점이 반올림 단위(0.1cm) 안에서 그대로 돌아온다', () => {
    const l = layoutOf(goldenTent([rectInner('in1', 300, 300, 150, 0, { rotation: 30 })]))
    const target: Pt = [210.3, 160.7]
    const next = run(l, (d) => setVertex(d, { innerId: 'in1' }, 2, target))
    const inner = innerOf(next, 'in1')
    expect(inner.shape.kind).toBe('polygon')
    expect('template' in inner).toBe(false)
    expect(inner).toMatchObject({ x: 150, y: 0, rotation: 30 })
    const p = at(targetWorldRing(next, { innerId: 'in1' }), 2)
    expect(Math.abs(p[0] - target[0])).toBeLessThan(0.1)
    expect(Math.abs(p[1] - target[1])).toBeLessThan(0.1)
  })

  it('90° 돌린 이너: 0.1cm 격자 위의 점은 정확히 왕복한다', () => {
    const l = layoutOf(goldenTent([rectInner('in1', 300, 300, 150, 0, { rotation: 90 })]))
    const next = run(l, (d) => setVertex(d, { innerId: 'in1' }, 0, [100.5, -120.5]))
    const p = at(targetWorldRing(next, { innerId: 'in1' }), 0)
    expect(p[0]).toBeCloseTo(100.5, 6)
    expect(p[1]).toBeCloseTo(-120.5, 6)
  })

  it('insertVertex는 변의 중점에 꼭짓점을 넣고 새 번호는 edgeIndex+1이다', () => {
    const l = layoutOf()
    const before = targetWorldRing(l, 'outer')
    const next = run(l, (d) => insertVertex(d, 'outer', 0))
    const after = targetWorldRing(next, 'outer')
    expect(after).toHaveLength(5)
    const a = at(before, 0)
    const b = at(before, 1)
    expect(at(after, 0)).toEqual(a)
    expect(at(after, 1)).toEqual([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])
    expect(at(after, 2)).toEqual(b)
    expect('outerTemplate' in next.tent).toBe(false)
  })

  it('deleteVertex: 꼭짓점 3개면 지우지 않고 false, 사각형은 지우면 3개가 된다', () => {
    const tri = rectInner('tri', 1, 1, -150, 0)
    tri.shape = {
      kind: 'polygon',
      points: [
        [0, -50],
        [50, 50],
        [-50, 50],
      ],
    }
    delete tri.template
    const l = layoutOf(goldenTent([tri]))
    let ok = true
    const same = run(l, (d) => {
      ok = deleteVertex(d, { innerId: 'tri' }, 0)
    })
    expect(ok).toBe(false)
    expect(same).toBe(l)

    let removed = false
    const next = run(l, (d) => {
      removed = deleteVertex(d, 'outer', 0)
    })
    expect(removed).toBe(true)
    expect(targetWorldRing(next, 'outer')).toHaveLength(3)
    expect(next.tent.outer.kind).toBe('polygon')
    expect('outerTemplate' in next.tent).toBe(false)
  })

  it('원 대상은 꼭짓점 편집을 무시한다', () => {
    const l = layoutOf({ name: '벨텐트', outer: { kind: 'circle', d: 400 }, outerTemplate: { kind: 'circle', d: 400 }, inners: [] })
    expect(run(l, (d) => setVertex(d, 'outer', 0, [0, 0]))).toBe(l)
    expect(run(l, (d) => insertVertex(d, 'outer', 0))).toBe(l)
    let ok = true
    run(l, (d) => {
      ok = deleteVertex(d, 'outer', 0)
    })
    expect(ok).toBe(false)
  })
})

describe('setCircleDiameter', () => {
  it('원 외곽은 도형과 원 템플릿의 지름을 함께 바꾼다', () => {
    const l = layoutOf({ name: '벨텐트', outer: { kind: 'circle', d: 400 }, outerTemplate: { kind: 'circle', d: 400 }, inners: [] })
    const next = run(l, (d) => setCircleDiameter(d, 'outer', 500.04))
    expect(next.tent.outer).toEqual({ kind: 'circle', d: 500 })
    expect(next.tent.outerTemplate).toEqual({ kind: 'circle', d: 500 })
  })

  it('원 이너도 바꾸고, 원이 아닌 대상은 무시한다', () => {
    const circle = rectInner('c1', 1, 1, -150, 0)
    circle.shape = { kind: 'circle', d: 200 }
    circle.template = { kind: 'circle', d: 200 }
    const l = layoutOf(goldenTent([circle]))
    const next = run(l, (d) => setCircleDiameter(d, { innerId: 'c1' }, 150))
    expect(innerOf(next, 'c1')).toMatchObject({ shape: { kind: 'circle', d: 150 }, template: { kind: 'circle', d: 150 } })
    expect(run(l, (d) => setCircleDiameter(d, 'outer', 150))).toBe(l)
  })
})

describe('addInner (§4.4-4)', () => {
  it('외곽 600×300: 한 변 180cm 정사각형을 가장 큰 전실 조각의 polylabel(-150,0)에 놓는다', () => {
    const l = layoutOf()
    const zones = buildZones(l.tent)
    expect(at(zones.pieces, 0).area).toBeCloseTo(90000, 2)
    const { next, res } = runAdd(l, zones)
    const added = at(next.tent.inners, 1)
    expect(res).toEqual({ ok: true, id: added.id })
    expect(added).toMatchObject({
      name: '이너 2',
      rotation: 0,
      shape: { kind: 'rect', w: 180, h: 180 },
      template: { kind: 'rect', w: 180, h: 180 },
    })
    expect(Math.abs(added.x - -150)).toBeLessThan(0.5)
    expect(Math.abs(added.y)).toBeLessThan(0.5)
  })

  it('이너가 없으면 바닥 전체가 한 조각이고, 새 이너("이너 1")는 외곽 안에 들어간다', () => {
    const l = layoutOf(goldenTent([]))
    const zones = buildZones(l.tent)
    const label = at(zones.pieces, 0).label
    const { next, res } = runAdd(l, zones)
    expect(res.ok).toBe(true)
    const added = at(next.tent.inners, 0)
    expect(added.name).toBe('이너 1')
    expect(added.x).toBe(round1(label[0]))
    expect(added.y).toBe(round1(label[1]))
    expect(area(subtract(region(worldRing(added)), zones.outer))).toBe(0)
  })

  it('한 변은 짧은 변 × 0.6을 10cm 단위로 반올림하고 200cm를 넘지 않는다', () => {
    const sideFor = (tent: Tent) => {
      const l = layoutOf(tent)
      const { next } = runAdd(l, buildZones(l.tent))
      const s = at(next.tent.inners, 0).shape
      return s.kind === 'rect' ? s.w : NaN
    }
    expect(sideFor({ name: '좁은', outer: { kind: 'rect', w: 500, h: 210 }, inners: [] })).toBe(130) // 126 → 130
    expect(sideFor({ name: '넓은', outer: { kind: 'rect', w: 1000, h: 800 }, inners: [] })).toBe(200) // 480 → 200
    expect(sideFor({ name: '원', outer: { kind: 'circle', d: 300 }, inners: [] })).toBe(180)
  })

  it('빈 틈이 좁아 다른 이너와 겹치면 추가하지 않고 no-space', () => {
    const l = layoutOf(goldenTent([rectInner('a', 250, 300, -175, 0), rectInner('b', 250, 300, 175, 0)]))
    const zones = buildZones(l.tent)
    expect(at(zones.pieces, 0).area).toBeCloseTo(30000, 2) // 가운데 100×300
    const { next, res } = runAdd(l, zones)
    expect(res).toEqual({ ok: false, reason: 'no-space' })
    expect(next).toBe(l)
  })

  it('이너가 외곽을 꽉 채워 바닥 조각이 없으면 no-space', () => {
    const l = layoutOf(goldenTent([rectInner('full', 600, 300, 0, 0)]))
    const zones = buildZones(l.tent)
    expect(zones.pieces).toEqual([])
    const { next, res } = runAdd(l, zones)
    expect(res).toEqual({ ok: false, reason: 'no-space' })
    expect(next).toBe(l)
  })
})

describe('이너 이동·회전·삭제·이름', () => {
  it('moveInner는 0.1cm로 반올림하고, rotateInner는 [0,360)으로 정규화한다', () => {
    const l = layoutOf(goldenTent([rectInner('in1', 300, 300, 150, 0, { rotation: 350 })]))
    const moved = run(l, (d) => moveInner(d, 'in1', 10.04, -0.04))
    expect(innerOf(moved, 'in1')).toMatchObject({ x: 160, y: 0 })
    expect(Object.is(innerOf(moved, 'in1').y, -0)).toBe(false)
    expect(innerOf(run(l, (d) => rotateInner(d, 'in1', 20)), 'in1').rotation).toBe(10)
    expect(innerOf(run(l, (d) => rotateInner(d, 'in1', -440)), 'in1').rotation).toBe(270)
  })

  it('deleteInner와 renameInner', () => {
    const l = layoutOf()
    expect(run(l, (d) => deleteInner(d, 'in1')).tent.inners).toEqual([])
    expect(innerOf(run(l, (d) => renameInner(d, 'in1', '침실')), 'in1').name).toBe('침실')
    expect(run(l, (d) => deleteInner(d, 'zz'))).toBe(l)
  })
})

describe('swapTent (§4.7-8)', () => {
  const bell: Tent = {
    name: '벨텐트 4m 예시',
    outer: { kind: 'circle', d: 400 },
    outerTemplate: { kind: 'circle', d: 400 },
    inners: [rectInner('b1', 260, 150, 0, -50, { name: '이너 1' })],
  }

  it('텐트만 복사본으로 바꾸고 물건 좌표는 그대로 둔다', () => {
    const l = layoutOf()
    const next = run(l, (d) => swapTent(d, bell, 'generic/bell-4m'))
    expect(next.tent).toEqual(bell)
    expect(next.tent).not.toBe(bell)
    expect(next.tent.inners).not.toBe(bell.inners)
    expect(next.items).toBe(l.items)
    expect(next.sourcePresetId).toBe('generic/bell-4m')
  })

  it('sourcePresetId를 주지 않으면 지운다', () => {
    const l = layoutOf(goldenTent(), 'generic/tunnel-4')
    expect(l.sourcePresetId).toBe('generic/tunnel-4')
    const next = run(l, (d) => swapTent(d, bell))
    expect('sourcePresetId' in next).toBe(false)
  })
})

describe('tentIssues', () => {
  it('정상 텐트는 이슈가 없다', () => {
    expect(tentIssues(goldenTent())).toEqual([])
  })

  it('나비 모양 외곽은 self-intersect, 1cm 넘게 파고든 이너 둘은 inner-overlap', () => {
    const butterfly: Tent = {
      name: '나비',
      outer: {
        kind: 'polygon',
        points: [
          [-100, -100],
          [100, 100],
          [100, -100],
          [-100, 100],
        ],
      },
      inners: [],
    }
    expect(tentIssues(butterfly).map((i) => i.code)).toContain('self-intersect')
    const overlapped = goldenTent([rectInner('a', 300, 300, -149, 0), rectInner('b', 300, 300, 150, 0)])
    expect(tentIssues(overlapped).map((i) => i.code)).toContain('inner-overlap')
  })
})

describe('같은 값이면 쓰지 않음(Review Focus 3, P2 보류 Minor)', () => {
  /** 레시피가 만든 패치 수. 0이면 doc.commit이 false를 돌려주고 기록이 남지 않습니다. */
  function patchCount(l: Layout, fn: (d: Layout) => unknown): number {
    const [, patches] = produceWithPatches(l, (d) => {
      fn(d)
    })
    return patches.length
  }

  const bellInner = (): Inner => {
    const c = rectInner('c1', 1, 1, -150, 0, { name: '원 이너' })
    c.shape = { kind: 'circle', d: 200 }
    c.template = { kind: 'circle', d: 200 }
    return c
  }

  it('setOuterTemplate: 정규화하면 같은 템플릿·같은 도형이면 패치 0, 다르면 패치 있음', () => {
    const l = layoutOf()
    expect(patchCount(l, (d) => setOuterTemplate(d, { kind: 'rect', w: 600, h: 300 }))).toBe(0)
    expect(patchCount(l, (d) => setOuterTemplate(d, { kind: 'rect', w: 600.04, h: 299.96 }))).toBe(0)
    expect(patchCount(l, (d) => setOuterTemplate(d, { kind: 'rect', w: 600, h: 300, square: false }))).toBe(0)
    expect(patchCount(l, (d) => setOuterTemplate(d, { kind: 'rect', w: 610, h: 300 }))).toBeGreaterThan(0)
    // 정사각형 체크를 켜는 것은 다른 값(도형도 바뀜)
    expect(patchCount(l, (d) => setOuterTemplate(d, { kind: 'rect', w: 600, h: 300, square: true }))).toBeGreaterThan(0)
  })

  it('setOuterTemplate: 템플릿이 같아도 도형이 템플릿과 어긋나 있으면 다시 쓴다', () => {
    const tent = goldenTent()
    tent.outer = { kind: 'polygon', points: [[-300, -150], [320, -150], [300, 150], [-300, 150]] }
    const l = layoutOf(tent)
    expect(patchCount(l, (d) => setOuterTemplate(d, { kind: 'rect', w: 600, h: 300 }))).toBeGreaterThan(0)
  })

  it('setOuterTemplate: 템플릿이 없던 외곽에 템플릿을 주면 쓴다', () => {
    const tent = goldenTent()
    delete tent.outerTemplate
    const l = layoutOf(tent)
    expect(patchCount(l, (d) => setOuterTemplate(d, { kind: 'rect', w: 600, h: 300 }))).toBeGreaterThan(0)
  })

  it('setOuterTemplate: 사다리꼴·정N각형도 같은 값이면 패치 0', () => {
    const trap = run(layoutOf(), (d) => setOuterTemplate(d, { kind: 'trapezoid', front: 300, back: 200, depth: 250, offset: 0 }))
    expect(patchCount(trap, (d) => setOuterTemplate(d, { kind: 'trapezoid', front: 300, back: 200, depth: 250, offset: 0 }))).toBe(0)
    expect(patchCount(trap, (d) => setOuterTemplate(d, { kind: 'trapezoid', front: 300, back: 200, depth: 250, offset: 10 }))).toBeGreaterThan(0)
    const ngon = run(layoutOf(), (d) => setOuterTemplate(d, { kind: 'ngon', n: 6, sizeBy: 'diameter', size: 400 }))
    expect(patchCount(ngon, (d) => setOuterTemplate(d, { kind: 'ngon', n: 6.2, sizeBy: 'diameter', size: 400 }))).toBe(0)
    // 같은 도형이라도 sizeBy가 다르면 입력값이 다르므로 쓴다(§4.8: 입력값을 그대로 저장)
    expect(patchCount(ngon, (d) => setOuterTemplate(d, { kind: 'ngon', n: 6, sizeBy: 'side', size: 200 }))).toBeGreaterThan(0)
  })

  it('setOuterTemplate: 육각형도 같은 값이면 패치 0, 범위로 자른다', () => {
    const hex = run(layoutOf(), (d) => setOuterTemplate(d, { kind: 'hexagon', w: 260, h: 225, edge: 130 }))
    expect(hex.tent.outerTemplate).toEqual({ kind: 'hexagon', w: 260, h: 225, edge: 130 })
    expect(patchCount(hex, (d) => setOuterTemplate(d, { kind: 'hexagon', w: 260.04, h: 225, edge: 130 }))).toBe(0)
    expect(patchCount(hex, (d) => setOuterTemplate(d, { kind: 'hexagon', w: 260, h: 225, edge: 120 }))).toBeGreaterThan(0)
  })

  it('setInnerTemplate: 같은 값이면 패치 0, 다르면 패치 있음, 없는 이너는 0', () => {
    const l = layoutOf()
    expect(patchCount(l, (d) => setInnerTemplate(d, 'in1', { kind: 'rect', w: 300, h: 300 }))).toBe(0)
    expect(patchCount(l, (d) => setInnerTemplate(d, 'in1', { kind: 'rect', w: 300, h: 280 }))).toBeGreaterThan(0)
    expect(patchCount(l, (d) => setInnerTemplate(d, 'zz', { kind: 'rect', w: 10, h: 10 }))).toBe(0)
  })

  it('setCircleDiameter: 같은 지름이면 패치 0(외곽·이너), 다르면 패치 있음', () => {
    const bell = layoutOf({ name: '벨텐트', outer: { kind: 'circle', d: 400 }, outerTemplate: { kind: 'circle', d: 400 }, inners: [bellInner()] })
    expect(patchCount(bell, (d) => setCircleDiameter(d, 'outer', 400))).toBe(0)
    expect(patchCount(bell, (d) => setCircleDiameter(d, 'outer', 400.04))).toBe(0)
    expect(patchCount(bell, (d) => setCircleDiameter(d, { innerId: 'c1' }, 200))).toBe(0)
    expect(patchCount(bell, (d) => setCircleDiameter(d, 'outer', 410))).toBeGreaterThan(0)
    expect(patchCount(bell, (d) => setCircleDiameter(d, { innerId: 'c1' }, 150))).toBeGreaterThan(0)
  })

  it('setCircleDiameter: 도형 지름은 같아도 원 템플릿 지름이 다르면 템플릿만 맞춘다', () => {
    const bell = layoutOf({ name: '벨텐트', outer: { kind: 'circle', d: 400 }, outerTemplate: { kind: 'circle', d: 390 }, inners: [] })
    const [next, patches] = produceWithPatches(bell, (d) => {
      setCircleDiameter(d, 'outer', 400)
    })
    expect(patches).toHaveLength(1)
    expect(next.tent.outerTemplate).toEqual({ kind: 'circle', d: 400 })
  })

  it('renameInner: 같은 이름이면 패치 0', () => {
    const l = layoutOf()
    expect(patchCount(l, (d) => renameInner(d, 'in1', '이너 1'))).toBe(0)
    expect(patchCount(l, (d) => renameInner(d, 'in1', '침실'))).toBeGreaterThan(0)
  })

  it('moveInner: dx = dy = 0이면 패치 0(저장된 좌표가 반올림 전 값이어도 건드리지 않음)', () => {
    const l = layoutOf(goldenTent([rectInner('in1', 300, 300, 150.04, 0)]))
    expect(patchCount(l, (d) => moveInner(d, 'in1', 0, 0))).toBe(0)
    expect(patchCount(l, (d) => moveInner(d, 'in1', 0, 10))).toBeGreaterThan(0)
  })

  it('rotateInner: delta가 0 또는 360의 배수면 패치 0', () => {
    const l = layoutOf(goldenTent([rectInner('in1', 300, 300, 150, 0, { rotation: 30 })]))
    expect(patchCount(l, (d) => rotateInner(d, 'in1', 0))).toBe(0)
    expect(patchCount(l, (d) => rotateInner(d, 'in1', 360))).toBe(0)
    expect(patchCount(l, (d) => rotateInner(d, 'in1', -720))).toBe(0)
    expect(patchCount(l, (d) => rotateInner(d, 'in1', 359.996))).toBe(0)
    expect(patchCount(l, (d) => rotateInner(d, 'in1', 90))).toBeGreaterThan(0)
  })

  it('addInner의 한 변은 templates.newInnerSide와 같다', () => {
    const l = layoutOf(goldenTent([]))
    const { next } = runAdd(l, buildZones(l.tent))
    expect(at(next.tent.inners, 0).shape).toEqual({ kind: 'rect', w: newInnerSide(l.tent.outer), h: newInnerSide(l.tent.outer) })
  })
})

describe('예시·그린 이너, 대상 다각형, 모양 바꾸기, 절대 이동(Plan 4.1)', () => {
  function patchCount(l: Layout, fn: (d: Layout) => unknown): number {
    const [, patches] = produceWithPatches(l, (d) => {
      fn(d)
    })
    return patches.length
  }

  function polyInner(id: string, points: Pt[], x: number, y: number, rotation = 0): Inner {
    return { id, name: `이너 ${id}`, shape: { kind: 'polygon', points }, x, y, rotation }
  }

  it('addInnerFromTemplate: 템플릿 도형을 가장 큰 바닥 조각 라벨에, 받은 id로', () => {
    const l = layoutOf(goldenTent([]))
    const zones = buildZones(l.tent)
    const label = at(zones.pieces, 0).label
    const tpl = { kind: 'trapezoid', front: 180, back: 130, depth: 180, offset: 0 } as const
    let res: ReturnType<typeof addInnerFromTemplate> | undefined
    const next = produce(l, (d) => {
      res = addInnerFromTemplate(d, zones, tpl, 'new-1')
    })
    expect(res).toEqual({ ok: true, id: 'new-1' })
    expect(at(next.tent.inners, 0)).toEqual({
      id: 'new-1',
      name: '이너 1',
      template: tpl,
      shape: shapeFromTemplate(tpl),
      x: round1(label[0]),
      y: round1(label[1]),
      rotation: 0,
    })
  })

  it('addInnerFromTemplate: 다른 이너와 겹치면 no-space, 아무것도 쓰지 않음', () => {
    const l = layoutOf(goldenTent([rectInner('a', 250, 300, -175, 0), rectInner('b', 250, 300, 175, 0)]))
    const zones = buildZones(l.tent)
    let res: ReturnType<typeof addInnerFromTemplate> | undefined
    const next = produce(l, (d) => {
      res = addInnerFromTemplate(d, zones, { kind: 'circle', d: 180 }, 'x')
    })
    expect(res).toEqual({ ok: false, reason: 'no-space' })
    expect(next).toBe(l)
  })

  it('addInnerFromPolygon: x·y = 월드 bbox 가운데, 로컬 다각형, 회전 0, 템플릿 없음', () => {
    const world: Pt[] = [[100, -100], [250, -100], [250, 50], [100, 50]]
    const next = run(layoutOf(), (d) => addInnerFromPolygon(d, world, 'drawn'))
    const added = innerOf(next, 'drawn')
    expect(added).toEqual({
      id: 'drawn',
      name: '이너 2',
      shape: { kind: 'polygon', points: [[-75, -75], [75, -75], [75, 75], [-75, 75]] },
      x: 175,
      y: -25,
      rotation: 0,
    })
    expect(worldRing(added)).toEqual(world)
  })

  it('setTargetPolygon world: 돌린 이너도 월드 점 그대로 보이게 로컬로 바꾸고 템플릿을 버린다', () => {
    const l = layoutOf(goldenTent([rectInner('in1', 300, 300, 150, 0, { rotation: 90 })]))
    const world: Pt[] = [[100, -100], [250, -100], [250, 50], [100, 50]]
    const next = run(l, (d) => setTargetPolygon(d, { innerId: 'in1' }, world, 'world'))
    const inner = innerOf(next, 'in1')
    expect(inner.template).toBeUndefined()
    expect(inner).toMatchObject({ x: 150, y: 0, rotation: 90 })
    worldRing(inner).forEach((p, i) => {
      expect(Math.abs(p[0] - world[i]![0])).toBeLessThanOrEqual(0.1)
      expect(Math.abs(p[1] - world[i]![1])).toBeLessThanOrEqual(0.1)
    })
  })

  it('setTargetPolygon: 외곽은 월드 그대로, outerTemplate 버림. 원 이너도 다각형이 된다', () => {
    const world: Pt[] = [[-300, -150], [300, -150], [300, 150], [0, 200], [-300, 150]]
    const next = run(layoutOf(), (d) => setTargetPolygon(d, 'outer', world, 'world'))
    expect(next.tent.outer).toEqual({ kind: 'polygon', points: world })
    expect(next.tent.outerTemplate).toBeUndefined()
    const circle = rectInner('c', 1, 1, 0, 0)
    circle.shape = { kind: 'circle', d: 100 }
    circle.template = { kind: 'circle', d: 100 }
    const bell = run(layoutOf(goldenTent([circle])), (d) => setTargetPolygon(d, { innerId: 'c' }, [[-50, -50], [50, -50], [0, 50]], 'local'))
    expect(innerOf(bell, 'c').shape).toEqual({ kind: 'polygon', points: [[-50, -50], [50, -50], [0, 50]] })
  })

  it('setTargetPolygon: 템플릿 없이 반올림 후 같은 점이면 패치 0, 템플릿이 있으면 같은 점이어도 쓴다', () => {
    const pts: Pt[] = [[-50, -50], [50, -50], [0, 50]]
    const l = layoutOf(goldenTent([polyInner('p', pts, 0, 0)]))
    expect(patchCount(l, (d) => setTargetPolygon(d, { innerId: 'p' }, [[-50.04, -50], [50, -49.96], [0, 50]], 'local'))).toBe(0)
    expect(patchCount(l, (d) => setTargetPolygon(d, { innerId: 'p' }, [[-50, -50], [50.1, -50], [0, 50]], 'local'))).toBeGreaterThan(0)
    const rect = layoutOf(goldenTent([rectInner('r', 100, 100, 0, 0)]))
    const ring = targetLocalRing(rect, { innerId: 'r' })
    expect(patchCount(rect, (d) => setTargetPolygon(d, { innerId: 'r' }, ring, 'local'))).toBeGreaterThan(0)
    expect(patchCount(l, (d) => setTargetPolygon(d, { innerId: 'zz' }, pts, 'local'))).toBe(0)
  })

  it('setTargetShapeTemplate: 이너는 보이는 가운데(로컬 bbox 가운데의 월드 자리)를 지키고 회전은 그대로', () => {
    const l = layoutOf(goldenTent([polyInner('p', [[0, 0], [200, 0], [200, 100], [0, 100]], 10, 20, 90)]))
    const next = run(l, (d) => setTargetShapeTemplate(d, { innerId: 'p' }, { kind: 'rect', w: 200, h: 100 }))
    expect(innerOf(next, 'p')).toMatchObject({
      x: -40,
      y: 120,
      rotation: 90,
      shape: { kind: 'rect', w: 200, h: 100 },
      template: { kind: 'rect', w: 200, h: 100 },
    })
  })

  it('setTargetShapeTemplate: 같은 템플릿이면 패치 0, 외곽은 setOuterTemplate과 같다', () => {
    const l = layoutOf()
    expect(patchCount(l, (d) => setTargetShapeTemplate(d, { innerId: 'in1' }, { kind: 'rect', w: 300, h: 300 }))).toBe(0)
    const a = run(l, (d) => setTargetShapeTemplate(d, 'outer', { kind: 'circle', d: 500 }))
    const b = run(l, (d) => setOuterTemplate(d, { kind: 'circle', d: 500 }))
    expect(a).toEqual(b)
  })

  it('moveInnerTo: 같은 자리면 패치 0, 아니면 반올림해 옮김', () => {
    const l = layoutOf()
    expect(patchCount(l, (d) => moveInnerTo(d, 'in1', 150, 0))).toBe(0)
    expect(patchCount(l, (d) => moveInnerTo(d, 'in1', 150.04, -0.02))).toBe(0)
    expect(innerOf(run(l, (d) => moveInnerTo(d, 'in1', 12.34, -56.78)), 'in1')).toMatchObject({ x: 12.3, y: -56.8 })
    expect(patchCount(l, (d) => moveInnerTo(d, 'zz', 1, 1))).toBe(0)
  })

  it('targetLocalRing: 다각형은 점 그대로, 사각형은 shapeRing, 원·없는 이너는 []', () => {
    const pts: Pt[] = [[0, 0], [10, 0], [0, 10]]
    const l = layoutOf(goldenTent([polyInner('p', pts, 5, 5, 30)]))
    expect(targetLocalRing(l, { innerId: 'p' })).toEqual(pts)
    expect(targetLocalRing(l, 'outer')).toHaveLength(4)
    expect(targetLocalRing(layoutOf({ name: 'b', outer: { kind: 'circle', d: 300 }, inners: [] }), 'outer')).toEqual([])
    expect(targetLocalRing(l, { innerId: 'zz' })).toEqual([])
  })
})

// 변 끌기(소유자 요청 2026-10-16): 변을 바깥쪽 법선 방향으로 평행 이동, 대칭 「자동 맞춤」이면 짝도
describe('edgeMoves', () => {
  // 외곽 rect 600×300: 꼭짓점 0(−300,−150) 1(300,−150) 2(300,150) 3(−300,150), 변 1 = 오른쪽 변
  it('바깥쪽(+)·안쪽(−)으로 변의 두 꼭짓점만, 꼭짓점 순서가 반대여도 바깥은 바깥', () => {
    const l = layoutOf()
    expect(edgeMoves(l, 'outer', 1, 20, null)).toEqual([
      { index: 1, world: [320, -150] },
      { index: 2, world: [320, 150] },
    ])
    expect(edgeMoves(l, 'outer', 0, -30, null)).toEqual([
      { index: 0, world: [-300, -120] },
      { index: 1, world: [300, -120] },
    ])
    const ccw = layoutOf({ ...goldenTent(), outer: { kind: 'polygon', points: [[-300, -150], [-300, 150], [300, 150], [300, -150]] } })
    delete ccw.tent.outerTemplate
    // 변 2 = (300,150)→(300,−150) 오른쪽 변
    expect(edgeMoves(ccw, 'outer', 2, 20, null)).toEqual([
      { index: 2, world: [320, 150] },
      { index: 3, world: [320, -150] },
    ])
  })

  it('대칭 자동 맞춤(좌우): 대칭이면 반대편 짝 변도 거울로, 기준선을 가로지르는 변은 그대로 둘만', () => {
    const l = layoutOf()
    expect(edgeMoves(l, 'outer', 1, 20, 'x')).toEqual([
      { index: 0, world: [-320, -150] },
      { index: 1, world: [320, -150] },
      { index: 2, world: [320, 150] },
      { index: 3, world: [-320, 150] },
    ])
    expect(edgeMoves(l, 'outer', 0, 10, 'x')).toEqual([
      { index: 0, world: [-300, -160] },
      { index: 1, world: [300, -160] },
    ])
  })

  it('기준선 위 꼭짓점은 기준선을 따라서만(대칭 유지), 대칭이 아니면 짝 없음', () => {
    // 집 모양: 꼭대기 1(0,−100)이 기준선 위
    const house = layoutOf({ ...goldenTent([]), outer: { kind: 'polygon', points: [[-100, -50], [0, -100], [100, -50], [100, 50], [-100, 50]] } })
    delete house.tent.outerTemplate
    const m = edgeMoves(house, 'outer', 1, 10, 'x')!
    const byIndex = new Map(m.map((v) => [v.index, v.world]))
    expect([...byIndex.keys()].sort()).toEqual([0, 1, 2])
    expect(byIndex.get(1)![0]).toBe(0)
    const v2 = byIndex.get(2)!
    expect(byIndex.get(0)).toEqual([-v2[0], v2[1]])
    // 대칭이 아니면(오른쪽 아래만 다름) 두 꼭짓점만
    const skew = layoutOf({ ...goldenTent([]), outer: { kind: 'polygon', points: [[-100, -50], [100, -50], [120, 50], [-100, 50]] } })
    delete skew.tent.outerTemplate
    expect(edgeMoves(skew, 'outer', 0, 10, 'x')!.map((v) => v.index)).toEqual([0, 1])
  })

  it('돌린 이너는 월드에서 그 변의 바깥쪽으로, 원·없는 번호는 null', () => {
    // 이너 300×300 @(150,0)를 90° 돌림: 로컬 변 1(오른쪽)이 월드 아래쪽
    const l = layoutOf(goldenTent([rectInner('in1', 300, 300, 150, 0, { rotation: 90 })]))
    const m = edgeMoves(l, { innerId: 'in1' }, 1, 20, null)!
    expect(m.map((v) => v.index)).toEqual([1, 2])
    for (const v of m) expect(v.world[1]).toBeCloseTo(170, 6)
    expect(edgeMoves(l, 'outer', 9, 20, null)).toBeNull()
    const circ = layoutOf({ ...goldenTent([]), outer: { kind: 'circle', d: 300 } })
    delete circ.tent.outerTemplate
    expect(edgeMoves(circ, 'outer', 0, 20, null)).toBeNull()
  })

  // 이웃 변을 따라 밀기(소유자 요청 2026-10-19): 끝점이 이웃 변을 따라 미끄러져 이웃 변의 기울기는 그대로
  // 사다리꼴: 꼭짓점 0(−100,−60) 1(100,−60) 2(140,60) 3(−140,60), 변 1 = 오른쪽 빗변
  const trapezoid = () => {
    const l = layoutOf({ ...goldenTent([]), outer: { kind: 'polygon', points: [[-100, -60], [100, -60], [140, 60], [-140, 60]] } })
    delete l.tent.outerTemplate
    return l
  }
  const expectMoves = (m: ReturnType<typeof edgeMoves>, expected: Array<{ index: number; world: Pt }>) => {
    expect(m?.map((v) => v.index)).toEqual(expected.map((v) => v.index))
    m?.forEach((v, i) => {
      expect(v.world[0]).toBeCloseTo(at(expected, i).world[0], 6)
      expect(v.world[1]).toBeCloseTo(at(expected, i).world[1], 6)
    })
  }

  it('사다리꼴 빗변은 윗·아랫변을 따라 가로로(변까지 수직 거리 = offset)', () => {
    // 수직 10cm = 가로 10 / cos(빗변 법선과 가로의 각) = 10·√(40²+120²)/120
    const dx = (10 * Math.hypot(40, 120)) / 120
    expectMoves(edgeMoves(trapezoid(), 'outer', 1, 10, null), [
      { index: 1, world: [100 + dx, -60] },
      { index: 2, world: [140 + dx, 60] },
    ])
  })

  it('가로 변은 끝점이 빗변을 따라: 사다리꼴 윗변을 위로 30 → 양 끝이 빗변을 타고 10씩 안으로', () => {
    expectMoves(edgeMoves(trapezoid(), 'outer', 0, 30, null), [
      { index: 0, world: [-90, -90] },
      { index: 1, world: [90, -90] },
    ])
  })

  it('이웃 변이 끄는 변과 거의 일직선(15° 미만)이면 그 끝점은 수직으로', () => {
    // 꼭짓점 1(100,0)은 윗변 위에 넣은 점(180°): 변 0을 위로 밀면 0은 왼쪽 변을 따라, 1은 수직으로
    const straight = layoutOf({ ...goldenTent([]), outer: { kind: 'polygon', points: [[0, 0], [100, 0], [200, 0], [200, 100], [0, 100]] } })
    delete straight.tent.outerTemplate
    expectMoves(edgeMoves(straight, 'outer', 0, 10, null), [
      { index: 0, world: [0, -10] },
      { index: 1, world: [100, -10] },
    ])
    // 10°만 꺾여도 수직으로
    const bent = layoutOf({ ...goldenTent([]), outer: { kind: 'polygon', points: [[0, 0], [100, 0], [200, 100 * Math.tan(Math.PI / 18)], [200, 100], [0, 100]] } })
    delete bent.tent.outerTemplate
    expect(at(edgeMoves(bent, 'outer', 0, 10, null)!, 1).world[0]).toBeCloseTo(100, 1)
  })
})

describe('edgeEndRates', () => {
  it('변이 바깥으로 1cm 갈 때 두 끝점의 이동(월드): 사다리꼴 빗변은 둘 다 가로, 돌린 이너는 월드 방향', () => {
    const l = layoutOf({ ...goldenTent([]), outer: { kind: 'polygon', points: [[-100, -60], [100, -60], [140, 60], [-140, 60]] } })
    delete l.tent.outerTemplate
    const r = edgeEndRates(l, 'outer', 1, null)!
    for (const v of r) {
      expect(v[0]).toBeCloseTo(Math.hypot(40, 120) / 120, 9)
      expect(v[1]).toBeCloseTo(0, 9)
    }
    // 이너 300×300 @(150,0)를 90° 돌림: 로컬 변 1(오른쪽)이 월드 아래쪽 → 두 끝점 모두 아래로
    const rot = layoutOf(goldenTent([rectInner('in1', 300, 300, 150, 0, { rotation: 90 })]))
    for (const v of edgeEndRates(rot, { innerId: 'in1' }, 1, null)!) {
      expect(v[0]).toBeCloseTo(0, 9)
      expect(v[1]).toBeCloseTo(1, 9)
    }
    expect(edgeEndRates(rot, 'outer', 9, null)).toBeNull()
  })
})

describe('targetFlipped', () => {
  it('꼭짓점 순서 방향이 반대가 되면(변을 맞은편 너머로) true, 그대로·넓이 0이면 false', () => {
    const l = layoutOf()
    const apply = (offset: number) =>
      produce(l, (d) => {
        for (const m of edgeMoves(l, 'outer', 1, offset, null)!) setVertex(d, 'outer', m.index, m.world)
      })
    expect(targetFlipped(l, apply(-100), 'outer')).toBe(false)
    expect(targetFlipped(l, apply(-600), 'outer')).toBe(false)
    expect(targetFlipped(l, apply(-700), 'outer')).toBe(true)
    expect(targetFlipped(l, l, { innerId: 'nope' })).toBe(false)
  })
})
