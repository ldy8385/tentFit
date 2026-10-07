import { describe, expect, it } from 'vitest'
import { outerRing, pointInRing, worldRing } from './geom'
import { measure, pickTarget, pointSegment, ringToRing, segmentSegment, type MeasureTarget } from './measure'
import { createLayout, type Item, type Layout, type Pt, type Shape, type Tent } from './model'

// ── 테스트 도우미 ──────────────────────────────────────────────────────
/** 스펙 §13.2 공통: 외곽 600×300, 이너 300×300 @(150,0) */
const tent: Tent = {
  name: '테스트 텐트',
  outer: { kind: 'rect', w: 600, h: 300 },
  inners: [{ id: 'in1', name: '이너 1', shape: { kind: 'rect', w: 300, h: 300 }, x: 150, y: 0, rotation: 0 }],
}

function item(id: string, shape: Shape, x: number, y: number, extra: Partial<Item> = {}): Item {
  return { id, name: id, shape, x, y, rotation: 0, color: 'green', category: 'MAT', countsArea: true, ...extra }
}

function layoutOf(items: Item[], t: Tent = tent): Layout {
  return { ...createLayout(t, { name: '측정 테스트', id: 'L1', now: '2026-10-07T00:00:00.000Z' }), items }
}

const MAT: Shape = { kind: 'rect', w: 200, h: 60 }
const R = 8

function expectPt(actual: Pt, expected: Pt): void {
  expect(actual[0]).toBeCloseTo(expected[0], 6)
  expect(actual[1]).toBeCloseTo(expected[1], 6)
}

/** 벽(외곽 또는 이너 id)의 월드 고리에서 두 끝점이 모두 on을 만족하는 변의 번호(꼭짓점 i → i+1) */
function edgeOf(layout: Layout, wall: string, on: (p: Pt) => boolean): number {
  let ring: Pt[]
  if (wall === 'outer') {
    ring = outerRing(layout.tent)
  } else {
    const inner = layout.tent.inners.find((x) => x.id === wall)
    if (!inner) throw new Error(`이너 ${wall} 없음`)
    ring = worldRing(inner)
  }
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    if (a !== undefined && b !== undefined && on(a) && on(b)) return i
  }
  throw new Error(`${wall}에 조건에 맞는 변이 없음`)
}

/** 벽 대상 하나(변 하나) */
function wallT(layout: Layout, wall: string, on: (p: Pt) => boolean): MeasureTarget {
  return { kind: 'wall', wall, edge: edgeOf(layout, wall, on) }
}

const xIs = (x: number) => (p: Pt) => Math.abs(p[0] - x) < 1e-9
const yIs = (y: number) => (p: Pt) => Math.abs(p[1] - y) < 1e-9

// ── 거리 기본 연산 ─────────────────────────────────────────────────────
describe('pointSegment / segmentSegment / ringToRing', () => {
  it('pointSegment: 수선의 발과 끝점으로 자르기', () => {
    expect(pointSegment([5, 5], [0, 0], [10, 0])).toEqual({ d: 5, q: [5, 0] })
    expect(pointSegment([15, 0], [0, 0], [10, 0])).toEqual({ d: 5, q: [10, 0] })
    expect(pointSegment([3, 4], [0, 0], [0, 0])).toEqual({ d: 5, q: [0, 0] })
  })

  it('segmentSegment: 교차하면 0과 교점, 평행하면 간격', () => {
    const x = segmentSegment([0, 0], [10, 10], [0, 10], [10, 0])
    expect(x.d).toBe(0)
    expectPt(x.p, [5, 5])
    expectPt(x.q, [5, 5])
    const par = segmentSegment([0, 0], [10, 0], [2, 3], [8, 3])
    expect(par.d).toBe(3)
    expect(par.q[1]).toBe(3)
    expect(par.p[1]).toBe(0)
    const tee = segmentSegment([0, 0], [10, 0], [5, 2], [5, 9])
    expect(tee).toEqual({ d: 2, p: [5, 0], q: [5, 2] })
  })

  it('ringToRing: 경계 사이 거리. 안에 들어 있어도 0이 아니고, 경계가 교차하면 0', () => {
    const big: Pt[] = [[-50, -50], [50, -50], [50, 50], [-50, 50]]
    const small: Pt[] = [[-5, -5], [5, -5], [5, 5], [-5, 5]]
    expect(ringToRing(small, big).d).toBe(45)
    const crossing: Pt[] = [[40, -5], [60, -5], [60, 5], [40, 5]]
    expect(ringToRing(crossing, big).d).toBe(0)
  })
})

// ── measure ───────────────────────────────────────────────────────────
describe('measure', () => {
  it('텐트 안 물건 ↔ 외곽 아래 변: 면을 품고 있어도 겹침이 아니라 그 변까지 거리', () => {
    const layout = layoutOf([item('m', MAT, -150, 100)]) // y 70~130, 아래 변 y=150
    const r = measure(layout, { kind: 'item', id: 'm' }, wallT(layout, 'outer', yIs(150)))
    expect(r.relation).toBe('gap')
    expect(r.distance).toBe(20)
    expect(r.label).toBe('20.0cm')
    expect(r.p1[1]).toBe(130)
    expect(r.p2[1]).toBe(150)
    expect(r.p1[0]).toBe(r.p2[0])
    expect(r.p1[0]).toBeGreaterThanOrEqual(-250)
    expect(r.p1[0]).toBeLessThanOrEqual(-50)
  })

  it('벽 대상은 변 하나(OD-15): 매트 ↔ 외곽 왼쪽 변은 50cm(더 가까운 아래 변의 20cm가 아님)', () => {
    const layout = layoutOf([item('m', MAT, -150, 100)]) // x −250~−50, y 70~130
    const left = pickTarget(layout, [-299, 0], R)
    expect(left).toEqual({ kind: 'wall', wall: 'outer', edge: edgeOf(layout, 'outer', xIs(-300)) })
    const r = measure(layout, { kind: 'item', id: 'm' }, left)
    expect(r.relation).toBe('gap')
    expect(r.distance).toBe(50)
    expect(r.label).toBe('50.0cm')
    expect(r.p1[0]).toBe(-250)
    expect(r.p2[0]).toBe(-300)
    expect(r.p1[1]).toBe(r.p2[1])
    expect(r.p1[1]).toBeGreaterThanOrEqual(70)
    expect(r.p1[1]).toBeLessThanOrEqual(130)
    // 점 ↔ 변: 수선의 발이 변 밖이면 가까운 끝점까지
    const pt = measure(layout, { kind: 'point', p: [-350, 200] }, left)
    expect(pt.distance).toBeCloseTo(Math.hypot(50, 50), 9)
    expectPt(pt.p2, [-300, 150])
  })

  it('물건 ↔ 이너 변, 물건이 그 변을 가로지를 때만 0', () => {
    const layout = layoutOf([item('m', MAT, -150, 100), item('cross', MAT, -150, 140)])
    const inner = measure(layout, { kind: 'item', id: 'm' }, wallT(layout, 'in1', xIs(0)))
    expect(inner.distance).toBe(50)
    expect(inner.label).toBe('50.0cm')
    expectPt(inner.p2, [0, inner.p1[1]])
    // cross: y 110~170 → 아래 변(y=150)을 가로지름
    const crossing = measure(layout, { kind: 'item', id: 'cross' }, wallT(layout, 'outer', yIs(150)))
    expect(crossing.distance).toBe(0)
    expect(crossing.relation).toBe('touch')
    expect(crossing.label).toBe('0cm(맞닿음)')
    // 같은 물건도 가로지르지 않는 왼쪽 변까지는 실제 거리
    const toLeft = measure(layout, { kind: 'item', id: 'cross' }, wallT(layout, 'outer', xIs(-300)))
    expect(toLeft.distance).toBe(50)
  })

  it('외곽 변 ↔ 이너 변: 나란히 80cm 떨어지면 80.0cm', () => {
    const t: Tent = {
      name: '변 사이',
      outer: { kind: 'rect', w: 600, h: 300 },
      inners: [{ id: 'in2', name: '이너 1', shape: { kind: 'rect', w: 200, h: 200 }, x: -120, y: 0, rotation: 0 }],
    }
    const layout = layoutOf([], t) // 이너 x −220~−20, y −100~100
    const outerLeft = pickTarget(layout, [-299, 0], R)
    const innerLeft = pickTarget(layout, [-221, 0], R)
    expect(outerLeft).toEqual({ kind: 'wall', wall: 'outer', edge: edgeOf(layout, 'outer', xIs(-300)) })
    expect(innerLeft).toEqual({ kind: 'wall', wall: 'in2', edge: edgeOf(layout, 'in2', xIs(-220)) })
    const r = measure(layout, outerLeft, innerLeft)
    expect(r.relation).toBe('gap')
    expect(r.distance).toBe(80)
    expect(r.label).toBe('80.0cm')
    expect(r.p1[0]).toBe(-300)
    expect(r.p2[0]).toBe(-220)
    expect(r.p1[1]).toBe(r.p2[1])
    expect(Math.abs(r.p1[1])).toBeLessThanOrEqual(100)
  })

  it('외곽과 벽을 공유하는 이너: 공유한 변끼리는 맞닿음, 공유하지 않은 외곽 변까지는 실제 간격', () => {
    // 스펙 §13.2 G13 장면: 외곽 620×320, 이너 220×300을 오른쪽 위 모서리에 맞붙임(x 90~310, y −160~140)
    const t: Tent = {
      name: '터널',
      outer: { kind: 'rect', w: 620, h: 320 },
      inners: [{ id: 'in1', name: '이너 1', shape: { kind: 'rect', w: 220, h: 300 }, x: 200, y: -10, rotation: 0 }],
    }
    const layout = layoutOf([], t)
    const right = measure(layout, wallT(layout, 'outer', xIs(310)), wallT(layout, 'in1', xIs(310)))
    expect(right.relation).toBe('touch')
    expect(right.label).toBe('0cm(맞닿음)')
    const top = measure(layout, wallT(layout, 'outer', yIs(-160)), wallT(layout, 'in1', yIs(-160)))
    expect(top.relation).toBe('touch')
    const bottom = measure(layout, wallT(layout, 'outer', yIs(160)), wallT(layout, 'in1', yIs(140)))
    expect(bottom.relation).toBe('gap')
    expect(bottom.distance).toBe(20)
    expect(bottom.label).toBe('20.0cm')
    const left = measure(layout, wallT(layout, 'outer', xIs(-310)), wallT(layout, 'in1', xIs(90)))
    expect(left.distance).toBe(400)
    expect(left.label).toBe('400.0cm')
  })

  it('매트 두 장 40cm 간격 → 40.0cm, 맞닿음 → 0cm(맞닿음)', () => {
    const gap = layoutOf([item('a', MAT, -150, -50), item('b', MAT, -150, 50)])
    const r = measure(gap, { kind: 'item', id: 'a' }, { kind: 'item', id: 'b' })
    expect(r.relation).toBe('gap')
    expect(r.distance).toBeCloseTo(40, 9)
    expect(r.label).toBe('40.0cm')
    expect(r.p1[1]).toBe(-20)
    expect(r.p2[1]).toBe(20)

    const touch = layoutOf([item('a', MAT, -150, -50), item('b', MAT, -150, 10)])
    const t = measure(touch, { kind: 'item', id: 'a' }, { kind: 'item', id: 'b' })
    expect(t.relation).toBe('touch')
    expect(t.distance).toBe(0)
    expect(t.label).toBe('0cm(맞닿음)')
  })

  it('러그 위 매트 → 겹침(측정점은 겹친 부분 안)', () => {
    const rug = item('rug', { kind: 'rect', w: 300, h: 200 }, -150, 0, { category: 'RUG', countsArea: false })
    const mat = item('mat', MAT, -150, 0)
    const layout = layoutOf([rug, mat])
    const r = measure(layout, { kind: 'item', id: 'rug' }, { kind: 'item', id: 'mat' })
    expect(r.relation).toBe('overlap')
    expect(r.label).toBe('겹침')
    expect(r.distance).toBe(0)
    expect(pointInRing(r.p1, worldRing(mat))).toBe(true)
    expect(r.p2).toEqual(r.p1)
  })

  it('점 ↔ 점, 점 ↔ 원(밖·안)', () => {
    const layout = layoutOf([item('stool', { kind: 'circle', d: 40 }, 0, 0)])
    const pp = measure(layout, { kind: 'point', p: [0, 0] }, { kind: 'point', p: [30, 40] })
    expect(pp.distance).toBe(50)
    expect(pp.label).toBe('50.0cm')

    const out = measure(layout, { kind: 'point', p: [100, 0] }, { kind: 'item', id: 'stool' })
    expect(out.distance).toBe(80)
    expect(out.label).toBe('80.0cm')
    expect(out.p1).toEqual([100, 0])
    expectPt(out.p2, [20, 0])

    const inside = measure(layout, { kind: 'point', p: [5, 5] }, { kind: 'item', id: 'stool' })
    expect(inside.distance).toBe(0)
    expect(inside.relation).toBe('touch')
  })

  it('원 ↔ 원: max(0, |c₁c₂| − r₁ − r₂), 겹치면 겹침', () => {
    const apart = layoutOf([item('s', { kind: 'circle', d: 40 }, 0, 0), item('t', { kind: 'circle', d: 60 }, 100, 0)])
    const r = measure(apart, { kind: 'item', id: 's' }, { kind: 'item', id: 't' })
    expect(r.distance).toBe(50)
    expect(r.label).toBe('50.0cm')
    expectPt(r.p1, [20, 0])
    expectPt(r.p2, [70, 0])

    // 순서를 바꾸면 p1·p2 도 바뀜
    const swapped = measure(apart, { kind: 'item', id: 't' }, { kind: 'item', id: 's' })
    expectPt(swapped.p1, [70, 0])
    expectPt(swapped.p2, [20, 0])

    const overlap = layoutOf([item('s', { kind: 'circle', d: 40 }, 0, 0), item('t', { kind: 'circle', d: 60 }, 40, 0)])
    const o = measure(overlap, { kind: 'item', id: 's' }, { kind: 'item', id: 't' })
    expect(o.relation).toBe('overlap')
    expect(o.label).toBe('겹침')
  })

  it('원 ↔ 다각형: 중심에서 다각형까지 거리 − r', () => {
    const layout = layoutOf([item('s', { kind: 'circle', d: 40 }, -150, -100), item('m', MAT, -150, 0)])
    const r = measure(layout, { kind: 'item', id: 's' }, { kind: 'item', id: 'm' })
    expect(r.distance).toBeCloseTo(50, 9)
    expect(r.label).toBe('50.0cm')
    expectPt(r.p1, [-150, -80])
    expectPt(r.p2, [-150, -30])
  })

  it('원 물건 ↔ 외곽 변: 중심에서 그 변까지 거리 − r', () => {
    const layout = layoutOf([item('s', { kind: 'circle', d: 40 }, -150, 100)])
    const r = measure(layout, { kind: 'item', id: 's' }, wallT(layout, 'outer', yIs(150)))
    expect(r.distance).toBe(30)
    expectPt(r.p1, [-150, 120])
    expectPt(r.p2, [-150, 150])
  })

  it('원 외곽 벽(곡선 변 하나, edge 0): 점과 원 물건', () => {
    const bell: Tent = { name: '벨', outer: { kind: 'circle', d: 400 }, inners: [] }
    const layout = layoutOf([item('s', { kind: 'circle', d: 40 }, 100, 0)], bell)
    const wall: MeasureTarget = { kind: 'wall', wall: 'outer', edge: 0 }
    const pt = measure(layout, { kind: 'point', p: [100, 0] }, wall)
    expect(pt.distance).toBe(100)
    expectPt(pt.p2, [200, 0])
    const disk = measure(layout, { kind: 'item', id: 's' }, wall)
    expect(disk.distance).toBe(80)
    expectPt(disk.p1, [120, 0])
    expectPt(disk.p2, [200, 0])
  })

  it('원 외곽 벽 ↔ 다각형(물건·이너 변): 가장 먼 꼭짓점에서 원까지', () => {
    const bell: Tent = {
      name: '벨',
      outer: { kind: 'circle', d: 400 },
      inners: [{ id: 'in1', name: '이너 1', shape: { kind: 'rect', w: 200, h: 100 }, x: 0, y: 0, rotation: 0 }],
    }
    const layout = layoutOf([item('m', MAT, 0, 0)], bell)
    const wall: MeasureTarget = { kind: 'wall', wall: 'outer', edge: 0 }
    const mat = measure(layout, { kind: 'item', id: 'm' }, wall)
    expect(mat.distance).toBeCloseTo(200 - Math.hypot(100, 30), 9)
    expect(mat.label).toBe('95.6cm')
    expect(Math.hypot(mat.p2[0], mat.p2[1])).toBeCloseTo(200, 9)
    // 이너 오른쪽 변(x=100, y −50~50)의 먼 끝점 (100, ±50)에서 원까지
    const walls = measure(layout, wallT(layout, 'in1', xIs(100)), wall)
    expect(walls.distance).toBeCloseTo(200 - Math.hypot(100, 50), 9)
    expect(walls.label).toBe('88.2cm')
  })

  it('없는 대상·없는 변이면 오류', () => {
    const layout = layoutOf([])
    expect(() => measure(layout, { kind: 'item', id: 'nope' }, { kind: 'wall', wall: 'outer', edge: 0 })).toThrow()
    expect(() => measure(layout, { kind: 'point', p: [0, 0] }, { kind: 'wall', wall: 'nope', edge: 0 })).toThrow()
    // 사각형 외곽의 변은 0~3
    expect(() => measure(layout, { kind: 'point', p: [0, 0] }, { kind: 'wall', wall: 'outer', edge: 4 })).toThrow()
    expect(() => measure(layout, { kind: 'point', p: [0, 0] }, { kind: 'wall', wall: 'outer', edge: -1 })).toThrow()
    expect(() => measure(layout, { kind: 'point', p: [0, 0] }, { kind: 'wall', wall: 'outer', edge: 1.5 })).toThrow()
    // 원 벽은 변 0 하나뿐
    const bell = layoutOf([], { name: '벨', outer: { kind: 'circle', d: 400 }, inners: [] })
    expect(() => measure(bell, { kind: 'point', p: [0, 0] }, { kind: 'wall', wall: 'outer', edge: 1 })).toThrow()
  })
})

// ── pickTarget ────────────────────────────────────────────────────────
describe('pickTarget — 꼭짓점 > 품은 물건 > 가장 가까운 변 > 테두리 > 자유 점', () => {
  const layout = layoutOf([
    item('corner', MAT, -200, -120), // x −300~−100, y −150~−90 (왼쪽 위 꼭짓점을 덮음)
    item('wallMat', MAT, -190, 120), // x −290~−90, y 90~150 (아래 벽에 붙음)
    item('stool', { kind: 'circle', d: 10 }, -50, -50),
    item('box', { kind: 'rect', w: 10, h: 10 }, -150, 0),
  ])

  it('1. 외곽·이너 꼭짓점이 물건보다 먼저(점 대상)', () => {
    expect(pickTarget(layout, [-297, -148], R)).toEqual({ kind: 'point', p: [-300, -150] })
    expect(pickTarget(layout, [4, 147], R)).toEqual({ kind: 'point', p: [0, 150] })
  })

  it('2. 벽에 붙은 매트 안쪽을 탭하면 벽이 아니라 물건', () => {
    expect(pickTarget(layout, [-190, 147], R)).toEqual({ kind: 'item', id: 'wallMat' })
  })

  it('3. 물건 밖이면 가장 가까운 외곽·이너 변 하나(벽 대상), 같은 거리면 외곽', () => {
    expect(pickTarget(layout, [-20, 145], R)).toEqual({ kind: 'wall', wall: 'outer', edge: edgeOf(layout, 'outer', yIs(150)) })
    expect(pickTarget(layout, [3, 0], R)).toEqual({ kind: 'wall', wall: 'in1', edge: edgeOf(layout, 'in1', xIs(0)) })
    // 오른쪽 벽은 외곽과 이너가 공유: 거리가 같으면 외곽
    expect(pickTarget(layout, [298, 0], R)).toEqual({ kind: 'wall', wall: 'outer', edge: edgeOf(layout, 'outer', xIs(300)) })
    // 원 외곽은 곡선 변 하나(edge 0)
    const bell = layoutOf([], { name: '벨', outer: { kind: 'circle', d: 400 }, inners: [] })
    expect(pickTarget(bell, [0, 196], R)).toEqual({ kind: 'wall', wall: 'outer', edge: 0 })
  })

  it('4. 작은 물건은 테두리 근처 탭으로 고른다', () => {
    expect(pickTarget(layout, [-50, -58], R)).toEqual({ kind: 'item', id: 'stool' })
    expect(pickTarget(layout, [-150, 9], R)).toEqual({ kind: 'item', id: 'box' })
  })

  it('5. 아무것도 없으면 자유 점', () => {
    expect(pickTarget(layout, [-100, 50], R)).toEqual({ kind: 'point', p: [-100, 50] })
  })

  it('겹친 물건은 맨 위(배열 뒤쪽)', () => {
    const stacked = layoutOf([item('under', MAT, -150, 0), item('over', { kind: 'rect', w: 50, h: 50 }, -150, 0)])
    expect(pickTarget(stacked, [-150, 0], R)).toEqual({ kind: 'item', id: 'over' })
    expect(pickTarget(stacked, [-230, 0], R)).toEqual({ kind: 'item', id: 'under' })
  })
})

describe('리뷰 회귀: 원 물건과 다각형 물건이 정확히 맞닿으면 겹침이 아니다(§6.7 공식)', () => {
  const box: Shape = { kind: 'rect', w: 100, h: 100 }
  const sides: Array<[string, (r: number) => Pt]> = [
    ['오른쪽', (r) => [-150 + 50 + r, 0]],
    ['왼쪽', (r) => [-150 - 50 - r, 0]],
    ['아래', (r) => [-150, 50 + r]],
    ['위', (r) => [-150, -50 - r]],
  ]
  for (const d of [30, 40, 60, 100]) {
    for (const [name, pos] of sides) {
      it(`지름 ${d} 원이 ${name}에서 맞닿음 → 0cm(맞닿음)`, () => {
        const [x, y] = pos(d / 2)
        const l = layoutOf([item('box', box, -150, 0), item('stool', { kind: 'circle', d }, x, y)])
        const res = measure(l, { kind: 'item', id: 'box' }, { kind: 'item', id: 'stool' })
        expect(res.relation).toBe('touch')
        expect(res.label).toBe('0cm(맞닿음)')
      })
    }
  }
  it('1cm 파고들면 겹침', () => {
    const l = layoutOf([item('box', box, -150, 0), item('stool', { kind: 'circle', d: 40 }, -150 + 50 + 20 - 1, 0)])
    expect(measure(l, { kind: 'item', id: 'box' }, { kind: 'item', id: 'stool' }).relation).toBe('overlap')
  })
  it('원 중심이 다각형 안이면 겹침', () => {
    const l = layoutOf([item('box', box, -150, 0), item('stool', { kind: 'circle', d: 300 }, -150, 0)])
    expect(measure(l, { kind: 'item', id: 'box' }, { kind: 'item', id: 'stool' }).relation).toBe('overlap')
  })
})
