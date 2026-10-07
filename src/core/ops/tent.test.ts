import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { createLayout, round1, type Inner, type Item, type Layout, type Pt, type Tent } from '../model'
import { area, region, ringArea, ringBBox, subtract, worldRing } from '../geom'
import { buildZones, type Zones } from '../zones'
import {
  addInner,
  deleteInner,
  deleteVertex,
  insertVertex,
  moveInner,
  renameInner,
  rotateInner,
  setCircleDiameter,
  setInnerTemplate,
  setOuterTemplate,
  setVertex,
  swapTent,
  targetWorldRing,
  tentIssues,
} from './tent'

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
