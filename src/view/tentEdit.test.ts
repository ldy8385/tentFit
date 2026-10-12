import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { createLayout, type Inner, type Layout, type Pt, type Tent } from '../core/model'
import { setVertex, targetWorldRing } from '../core/ops/tent'
import {
  INVALID_EDIT_STYLE,
  MIN_EDGE_FOR_PLUS_PX,
  VERTEX_GRAB_PX,
  handleAt,
  previewInnerMove,
  previewVertexDrag,
  tableOrigin,
  tableToWorld,
  tentDragDelta,
  tentHandles,
  tentHitAt,
  edgeLabels,
  EDGE_LABEL_OFFSET_PX,
  tentTargetBBox,
  worldToTable,
  type TentHandle,
} from './tentEdit'
import type { View } from './viewport'

const NOW = '2026-10-08T00:00:00.000Z'
const VIEW1: View = { zoom: 1, panX: 0, panY: 0 }

function rectInner(id: string, w: number, h: number, x: number, y: number, rotation = 0): Inner {
  return { id, name: `이너 ${id}`, shape: { kind: 'rect', w, h }, template: { kind: 'rect', w, h }, x, y, rotation }
}

/** 외곽 사각형 w×h(원점 가운데) */
function rectTent(w: number, h: number, inners: Inner[] = []): Tent {
  return { name: '테스트', outer: { kind: 'rect', w, h }, outerTemplate: { kind: 'rect', w, h }, inners }
}

function layoutOf(tent: Tent): Layout {
  return createLayout(tent, { name: '배치', id: 'L1', now: NOW })
}

function kinds(hs: TentHandle[]): string[] {
  return hs.map((h) => (h.kind === 'vertex' ? `v${h.index}` : `+${h.edgeIndex}`))
}

function near(a: Pt, b: Pt, tol: number): boolean {
  return Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol
}

describe('상수', () => {
  it('잡는 거리 터치 22px·마우스·펜 8px, + 숨김 기준 64px, 잘못된 편집 표시', () => {
    expect(VERTEX_GRAB_PX).toEqual({ touch: 22, pen: 8, mouse: 8 })
    expect(MIN_EDGE_FOR_PLUS_PX).toBe(64)
    expect(INVALID_EDIT_STYLE.stroke).toBe('var(--danger)')
    expect([...INVALID_EDIT_STYLE.dash]).toEqual([6, 4])
    expect(INVALID_EDIT_STYLE.label).toBe('놓으면 취소돼요')
  })
})

describe('tentHandles(§4.4-7)', () => {
  it('사각형 외곽 = 꼭짓점 4개(왼쪽 위부터 시계 방향) + 변 중간 + 4개', () => {
    const layout = layoutOf(rectTent(600, 300))
    const hs = tentHandles(layout, 'outer', VIEW1)
    expect(kinds(hs)).toEqual(['v0', 'v1', 'v2', 'v3', '+0', '+1', '+2', '+3'])
    expect(hs[0]).toEqual({ kind: 'vertex', index: 0, world: [-300, -150] })
    expect(hs[2]).toEqual({ kind: 'vertex', index: 2, world: [300, 150] })
    // 변 0 = 꼭짓점 0 → 1(윗변)의 중점, 변 3 = 3 → 0(왼쪽 변)
    expect(hs[4]).toEqual({ kind: 'plus', edgeIndex: 0, world: [0, -150] })
    expect(hs[7]).toEqual({ kind: 'plus', edgeIndex: 3, world: [-300, 0] })
  })

  it('원 외곽·원 이너는 핸들이 없다(§4.4-5)', () => {
    const circleOuter = layoutOf({ name: '원', outer: { kind: 'circle', d: 400 }, inners: [] })
    expect(tentHandles(circleOuter, 'outer', VIEW1)).toEqual([])
    const circleInner = layoutOf(
      rectTent(600, 300, [{ id: 'c', name: '원 이너', shape: { kind: 'circle', d: 100 }, x: 0, y: 0, rotation: 0 }]),
    )
    expect(tentHandles(circleInner, { innerId: 'c' }, VIEW1)).toEqual([])
  })

  it('없는 이너는 []', () => {
    expect(tentHandles(layoutOf(rectTent(600, 300)), { innerId: 'nope' }, VIEW1)).toEqual([])
  })

  it('화면 63.9px 변에는 + 가 없고 64px 변에는 있다', () => {
    const view: View = { zoom: 0.5, panX: 0, panY: 0 }
    // 가로 127.8cm × 0.5 = 63.9px(윗변·아랫변), 세로 400cm × 0.5 = 200px(왼쪽·오른쪽 변)
    const short = tentHandles(layoutOf(rectTent(127.8, 400)), 'outer', view)
    expect(kinds(short)).toEqual(['v0', 'v1', 'v2', 'v3', '+1', '+3'])
    // 가로 128cm × 0.5 = 64px
    const exact = tentHandles(layoutOf(rectTent(128, 400)), 'outer', view)
    expect(kinds(exact)).toEqual(['v0', 'v1', 'v2', 'v3', '+0', '+1', '+2', '+3'])
  })

  it('회전한 이너의 핸들은 월드 좌표(이너 회전 반영)', () => {
    const layout = layoutOf(rectTent(600, 300, [rectInner('a', 100, 50, 10, 20, 90)]))
    const hs = tentHandles(layout, { innerId: 'a' }, VIEW1)
    const ring = targetWorldRing(layout, { innerId: 'a' })
    expect(hs.filter((h) => h.kind === 'vertex').map((h) => h.world)).toEqual(ring)
  })
})

describe('handleAt(잡는 거리)', () => {
  const layout = layoutOf(rectTent(600, 300))
  const hs = tentHandles(layout, 'outer', VIEW1)

  it('터치는 22px 안에서 잡히고 23px이면 안 잡힌다', () => {
    // 꼭짓점 0 = 화면 (-300,-150)
    expect(handleAt(hs, [-300 - 22, -150], VIEW1, 'touch')).toEqual({ kind: 'vertex', index: 0, world: [-300, -150] })
    expect(handleAt(hs, [-300 - 23, -150], VIEW1, 'touch')).toBeNull()
  })

  it('마우스·펜은 8px 안에서만', () => {
    expect(handleAt(hs, [-300, -150 - 8], VIEW1, 'mouse')?.kind).toBe('vertex')
    expect(handleAt(hs, [-300, -150 - 9], VIEW1, 'mouse')).toBeNull()
    expect(handleAt(hs, [-300, -150 - 9], VIEW1, 'pen')).toBeNull()
  })

  it('가장 가까운 핸들을 고른다', () => {
    // 윗변 + = (0,-150). (5,-150)은 + 와 5px
    expect(handleAt(hs, [5, -150], VIEW1, 'touch')).toEqual({ kind: 'plus', edgeIndex: 0, world: [0, -150] })
  })

  it('꼭짓점과 + 가 같은 거리면 꼭짓점', () => {
    // 가로 40cm 변을 zoom 2로 보면 80px(+ 보임). 꼭짓점 0 (-20,-50)·+0 (0,-50) 사이 가운데 (-10,-50)은 둘 다 화면 20px
    const small = layoutOf(rectTent(40, 100))
    const view: View = { zoom: 2, panX: 0, panY: 0 }
    const handles = tentHandles(small, 'outer', view)
    expect(handles.some((h) => h.kind === 'plus' && h.edgeIndex === 0)).toBe(true)
    expect(handleAt(handles, [-20, -100], view, 'touch')).toEqual({ kind: 'vertex', index: 0, world: [-20, -50] })
  })

  it('보기 이동·배율을 반영한다(화면 점 기준)', () => {
    const view: View = { zoom: 2, panX: 100, panY: 50 }
    // 꼭짓점 1 (300,-150) → 화면 (700,-250)
    expect(handleAt(tentHandles(layout, 'outer', view), [705, -250], view, 'mouse')).toEqual({
      kind: 'vertex',
      index: 1,
      world: [300, -150],
    })
  })
})

describe('tentHitAt(R10)', () => {
  // 이너 a(0,0 200×200)와 b(80,0 200×200)가 겹침. 배열 뒤쪽 b가 위
  const layout = layoutOf(rectTent(600, 300, [rectInner('a', 200, 200, 0, 0), rectInner('b', 200, 200, 80, 0)]))

  it('이너 두 개가 겹친 점은 뒤쪽(위) 이너', () => {
    expect(tentHitAt(layout, [40, 0], 8)).toEqual({ kind: 'inner', innerId: 'b' })
    expect(tentHitAt(layout, [-80, 0], 8)).toEqual({ kind: 'inner', innerId: 'a' })
  })

  it('이너 밖 바닥은 외곽', () => {
    expect(tentHitAt(layout, [-250, 120], 8)).toEqual({ kind: 'outer' })
  })

  it('외곽선 바깥 7px(마우스 8px) = 외곽, 9px = 대상 없음', () => {
    expect(tentHitAt(layout, [300 + 7, 0], VERTEX_GRAB_PX.mouse / 1)).toEqual({ kind: 'outer' })
    expect(tentHitAt(layout, [300 + 9, 0], VERTEX_GRAB_PX.mouse / 1)).toEqual({ kind: 'none' })
    // 모서리 바깥 대각선 거리(√(6²+6²) ≈ 8.49 > 8)
    expect(tentHitAt(layout, [306, -156], 8)).toEqual({ kind: 'none' })
  })

  it('잡는 거리는 월드 cm로 받는다(zoom 0.5에서 터치 22px = 44cm)', () => {
    expect(tentHitAt(layout, [300 + 40, 0], VERTEX_GRAB_PX.touch / 0.5)).toEqual({ kind: 'outer' })
    expect(tentHitAt(layout, [300 + 45, 0], VERTEX_GRAB_PX.touch / 0.5)).toEqual({ kind: 'none' })
  })

  it('원 외곽도 안·근처는 외곽', () => {
    const circle = layoutOf({ name: '원', outer: { kind: 'circle', d: 400 }, inners: [] })
    expect(tentHitAt(circle, [0, 0], 8)).toEqual({ kind: 'outer' })
    expect(tentHitAt(circle, [205, 0], 8)).toEqual({ kind: 'outer' })
    expect(tentHitAt(circle, [215, 0], 8)).toEqual({ kind: 'none' })
  })
})

describe('좌표 표 기준점(D32)', () => {
  it('기준점 = 외곽 bbox 왼쪽 위', () => {
    expect(tableOrigin(rectTent(600, 300))).toEqual([-300, -150])
    expect(tableOrigin({ name: '원', outer: { kind: 'circle', d: 400 }, inners: [] })).toEqual([-200, -200])
    const poly: Tent = { name: '다각형', outer: { kind: 'polygon', points: [[10, 20], [300, -40], [120, 200]] }, inners: [] }
    expect(tableOrigin(poly)).toEqual([10, -40])
  })

  it('표 ↔ 월드 변환', () => {
    const o: Pt = [-300, -150]
    expect(worldToTable([-300, -150], o)).toEqual([0, 0])
    expect(worldToTable([0, 0], o)).toEqual([300, 150])
    expect(tableToWorld([300, 150], o)).toEqual([0, 0])
    expect(Object.is(worldToTable([-300, -150], o)[0], 0)).toBe(true) // -0 없음
  })

  it('회전 이너 꼭짓점을 표 → 월드 → setVertex로 되돌려도 0.1cm 안', () => {
    const layout = layoutOf(rectTent(600, 300, [rectInner('r', 123.4, 56.7, 31.3, -12.9, 33.3)]))
    const origin = tableOrigin(layout.tent)
    const ring = targetWorldRing(layout, { innerId: 'r' })
    ring.forEach((p, i) => {
      const back = tableToWorld(worldToTable(p, origin), origin)
      const next = produce(layout, (d) => {
        setVertex(d, { innerId: 'r' }, i, back)
      })
      const after = targetWorldRing(next, { innerId: 'r' })[i]
      expect(after).toBeDefined()
      expect(near(after as Pt, p, 0.1)).toBe(true)
    })
  })
})

describe('tentDragDelta', () => {
  it('지금은 그대로 돌려준다(Plan 5 스냅 자리)', () => {
    const layout = layoutOf(rectTent(600, 300))
    expect(tentDragDelta({ dx: 12.3, dy: -4, layout, target: 'outer' })).toEqual({ dx: 12.3, dy: -4 })
  })
})

describe('끄는 중 미리보기(R11)', () => {
  it('외곽 꼭짓점을 끌어 자기교차 → 이슈 1개, 문서는 그대로', () => {
    const layout = layoutOf(rectTent(600, 300))
    const r = previewVertexDrag(layout, 'outer', 0, [0, 300])
    expect(r.issues.map((i) => i.code)).toEqual(['self-intersect'])
    expect(r.tent.outer.kind).toBe('polygon')
    expect(layout.tent.outer.kind).toBe('rect')
  })

  it('정상 끌기 → 이슈 0, 미리보기 텐트에 새 꼭짓점', () => {
    const layout = layoutOf(rectTent(600, 300))
    const r = previewVertexDrag(layout, 'outer', 1, [350, -200])
    expect(r.issues).toEqual([])
    expect(r.tent.outer).toEqual({
      kind: 'polygon',
      points: [
        [-300, -150],
        [350, -200],
        [300, 150],
        [-300, 150],
      ],
    })
  })

  it('원래 겹친 텐트에서 다른 이너를 옮기면 새 이슈 0', () => {
    const layout = layoutOf(
      rectTent(1000, 400, [rectInner('a', 200, 200, -300, 0), rectInner('b', 200, 200, -220, 0), rectInner('c', 100, 100, 300, 0)]),
    )
    const r = previewInnerMove(layout, 'c', 20, 10)
    expect(r.issues).toEqual([])
    const moved = r.tent.inners.find((i) => i.id === 'c')
    expect(moved?.x).toBe(320)
    expect(moved?.y).toBe(10)
  })

  it('이너를 다른 이너 위로 옮기면 겹침 이슈 1개', () => {
    const layout = layoutOf(rectTent(1000, 400, [rectInner('a', 200, 200, -300, 0), rectInner('c', 100, 100, 300, 0)]))
    const r = previewInnerMove(layout, 'c', -560, 0)
    expect(r.issues.map((i) => i.code)).toEqual(['inner-overlap'])
  })

  it('이너를 외곽 밖으로 옮겨도(이탈) 이슈가 아니다', () => {
    const layout = layoutOf(rectTent(600, 300, [rectInner('c', 100, 100, 0, 0)]))
    expect(previewInnerMove(layout, 'c', 500, 0).issues).toEqual([])
  })
})

describe('tentTargetBBox', () => {
  it('외곽 사각형·원, 회전 이너, 없는 이너', () => {
    const layout = layoutOf(rectTent(600, 300, [rectInner('a', 100, 50, 10, 20, 90)]))
    expect(tentTargetBBox(layout, 'outer')).toEqual({ minX: -300, minY: -150, maxX: 300, maxY: 150 })
    const b = tentTargetBBox(layout, { innerId: 'a' })
    expect(b).not.toBeNull()
    expect(b?.minX).toBeCloseTo(-15, 6)
    expect(b?.maxX).toBeCloseTo(35, 6)
    expect(b?.minY).toBeCloseTo(-30, 6)
    expect(b?.maxY).toBeCloseTo(70, 6)
    expect(tentTargetBBox(layout, { innerId: 'nope' })).toBeNull()
    const circle = layoutOf({
      name: '원',
      outer: { kind: 'circle', d: 400 },
      inners: [{ id: 'c', name: '원 이너', shape: { kind: 'circle', d: 100 }, x: 30, y: -20, rotation: 0 }],
    })
    expect(tentTargetBBox(circle, 'outer')).toEqual({ minX: -200, minY: -200, maxX: 200, maxY: 200 })
    expect(tentTargetBBox(circle, { innerId: 'c' })).toEqual({ minX: -20, minY: -70, maxX: 80, maxY: 30 })
  })
})

describe('tentHitAt — 잠금(Plan 4.1)', () => {
  const layout = createLayout(
    {
      name: '잠금',
      outer: { kind: 'rect', w: 600, h: 300 },
      inners: [{ id: 'a', name: '이너 a', shape: { kind: 'rect', w: 100, h: 100 }, x: -200, y: 0, rotation: 0 }],
    },
    { name: '배치', id: 'L', now: '2026-10-12T00:00:00.000Z' },
  )
  it("'inners'면 이너를 건너뛰고 외곽, 'outer'면 외곽 대신 none", () => {
    expect(tentHitAt(layout, [-200, 0], 8, 'inners')).toEqual({ kind: 'outer' })
    expect(tentHitAt(layout, [0, 0], 8, 'outer')).toEqual({ kind: 'none' })
    expect(tentHitAt(layout, [-200, 0], 8, 'outer')).toEqual({ kind: 'inner', innerId: 'a' })
    expect(tentHitAt(layout, [-200, 0], 8)).toEqual({ kind: 'inner', innerId: 'a' })
  })
})

describe('edgeLabels(자유 다각형 변 번호 배지, 패널 「변 i」와 같은 번호)', () => {
  const square: Pt[] = [[-100, -50], [100, -50], [100, 50], [-100, 50]]
  const free = (points: Pt[], inners: Inner[] = []): Layout =>
    layoutOf({ name: '자유', outer: { kind: 'polygon', points }, inners })

  it('변 i(0부터) 가운데에서 바깥쪽으로 EDGE_LABEL_OFFSET_PX(화면 px)만큼, 글자는 i+1', () => {
    const labels = edgeLabels(free(square), 'outer', { zoom: 2, panX: 0, panY: 0 })
    const d = EDGE_LABEL_OFFSET_PX / 2
    expect(labels).toEqual([
      { index: 0, text: '1', at: [0, -50 - d] },
      { index: 1, text: '2', at: [100 + d, 0] },
      { index: 2, text: '3', at: [0, 50 + d] },
      { index: 3, text: '4', at: [-100 - d, 0] },
    ])
  })

  it('반대 방향으로 돈 다각형도 바깥쪽', () => {
    const labels = edgeLabels(free([...square].reverse()), 'outer', VIEW1)
    // 거꾸로 돈 사각형의 변 1 = 아래 변((−100,50)→(100,50)) → 아래(바깥)쪽
    expect(labels[0]).toEqual({ index: 0, text: '1', at: [0, 50 + EDGE_LABEL_OFFSET_PX] })
  })

  it('이너는 월드(회전 반영) 좌표로, 템플릿이 있는 대상·원·없는 이너는 배지 없음', () => {
    const poly: Inner = { id: 'p', name: 'p', shape: { kind: 'polygon', points: [[-10, -10], [10, -10], [0, 10]] }, x: 50, y: 0, rotation: 0 }
    const l = free(square, [poly, rectInner('r', 20, 20, 0, 0)])
    expect(edgeLabels(l, { innerId: 'p' }, VIEW1)[0]!.at[0]).toBeCloseTo(50, 9)
    expect(edgeLabels(l, { innerId: 'r' }, VIEW1)).toEqual([])
    expect(edgeLabels(layoutOf(rectTent(400, 300)), 'outer', VIEW1)).toEqual([])
    expect(edgeLabels(l, { innerId: 'zz' }, VIEW1)).toEqual([])
  })
})
