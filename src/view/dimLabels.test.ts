import { describe, expect, it } from 'vitest'
import type { Shape } from '../core/model'
import { DIM_INSIDE_GAP_PX, DIM_LINE_GAP_PX, dimModel, EDGE_LABEL_GAP_PX, MIN_LABEL_SPAN_PX, RADIUS_LABEL_GAP_PX } from './dimLabels'

const V = { zoom: 2, panX: 500, panY: 400 }
const AT0 = { x: 0, y: 0, rotation: 0 }

describe('dimModel', () => {
  it('사각형: 가로(아래)·세로(오른쪽) 치수선만, 변 숫자 없음(모서리 포인트 4개는 따로)', () => {
    const m = dimModel({ kind: 'rect', w: 200, h: 60 }, AT0, V)
    expect(m.labels.filter((l) => l.key.kind === 'radius')).toHaveLength(4)
    expect(m.labels.filter((l) => l.key.kind !== 'radius').map((l) => [l.id, l.name, l.text])).toEqual([
      ['w', '가로', '200'],
      ['h', '세로', '60'],
    ])
    const w = m.lines.find((l) => l.id === 'w')!
    // 아래 변 y = 30cm → 화면 460, 그 아래 46px
    expect(w.a).toEqual([300, 460 + DIM_LINE_GAP_PX])
    expect(w.b).toEqual([700, 460 + DIM_LINE_GAP_PX])
    expect(m.labels[0]!.at).toEqual([500, 460 + DIM_LINE_GAP_PX])
    const h = m.lines.find((l) => l.id === 'h')!
    expect(h.a[0]).toBe(700 + DIM_LINE_GAP_PX)
  })

  it('원: 지름 하나(⌀)', () => {
    const m = dimModel({ kind: 'circle', d: 80 }, { x: 10, y: 0, rotation: 30 }, V)
    expect(m.labels.map((l) => [l.name, l.text, l.value])).toEqual([['지름', '⌀80', 80]])
    expect(m.lines).toHaveLength(1)
  })

  it('다각형: 변마다 숫자를 바깥쪽으로(점 순서가 반대여도)', () => {
    const sq: Shape = { kind: 'polygon', points: [[-50, -50], [50, -50], [50, 50], [-50, 50]] }
    for (const shape of [sq, { ...sq, points: [...(sq as { points: [number, number][] }).points].reverse() } as Shape]) {
      const m = dimModel(shape, AT0, V)
      const edges = m.labels.filter((l) => l.key.kind === 'edge')
      expect(edges).toHaveLength(4)
      for (const l of edges) {
        // 가운데(500,400)에서 100px(변) + 18px
        expect(Math.hypot(l.at[0] - 500, l.at[1] - 400)).toBeCloseTo(100 + EDGE_LABEL_GAP_PX, 6)
        expect(l.text).toBe('100')
      }
    }
  })

  it('화면에서 짧은 변은 숫자를 숨김, 도형이 아주 작으면 아무것도 없음', () => {
    const tri: Shape = { kind: 'polygon', points: [[0, 0], [100, 0], [100, 10]] }
    const m = dimModel(tri, AT0, V)
    expect(m.labels.find((l) => l.id === 'e1')).toBeUndefined()
    expect(m.labels.find((l) => l.id === 'h')).toBeUndefined()
    expect(dimModel({ kind: 'rect', w: 10, h: 10 }, AT0, { zoom: (MIN_LABEL_SPAN_PX - 1) / 10, panX: 0, panY: 0 })).toEqual({ labels: [], lines: [] })
  })

  it('모서리 포인트는 모든 꼭짓점에(둥근 곳은 R 숫자, 뾰족한 곳은 글자 없음), 바깥쪽으로', () => {
    const m = dimModel({ kind: 'rect', w: 200, h: 60, radii: [0, 0, 10, 0] }, AT0, V)
    const r = m.labels.filter((l) => l.key.kind === 'radius')
    expect(r.map((l) => [l.name, l.text, l.value])).toEqual([
      ['모서리 1(왼쪽 위) 둥글기', '', 0],
      ['모서리 2(오른쪽 위) 둥글기', '', 0],
      ['모서리 3(오른쪽 아래) 둥글기', 'R 10', 10],
      ['모서리 4(왼쪽 아래) 둥글기', '', 0],
    ])
    // 오른쪽 아래 꼭짓점(700,460)에서 바깥 대각선으로 RADIUS_LABEL_GAP_PX
    const d = RADIUS_LABEL_GAP_PX / Math.SQRT2
    expect(r[2]!.at[0]).toBeCloseTo(700 + d, 6)
    expect(r[2]!.at[1]).toBeCloseTo(460 + d, 6)
    expect(r[2]!.dir![0]).toBeCloseTo(Math.SQRT1_2, 6)
  })

  it('보이는 영역 밖이면 반대쪽 바깥, 그것도 밖이면 도형 안쪽에 치수선', () => {
    // 아래가 시트에 가려짐(보이는 아래 끝 480): 가로 치수선은 위(위 변 y=340에서 46px 위)
    const up = dimModel({ kind: 'rect', w: 200, h: 60 }, AT0, V, { left: 0, top: 0, right: 1000, bottom: 480 })
    expect(up.labels.find((l) => l.id === 'w')!.at[1]).toBe(340 - DIM_LINE_GAP_PX)
    // 도형이 화면을 가득: 위아래 모두 밖 → 안쪽 아래 가장자리에서 28px 위(화면 두께 200px)
    const inside = dimModel({ kind: 'rect', w: 200, h: 100 }, AT0, V, { left: 0, top: 290, right: 1000, bottom: 520 })
    expect(inside.labels.find((l) => l.id === 'w')!.at[1]).toBe(500 - DIM_INSIDE_GAP_PX)
    // 얇은 물건(화면 두께 120px)은 안쪽에 두지 않고 기본 자리(아래)
    const thin = dimModel({ kind: 'rect', w: 200, h: 60 }, AT0, V, { left: 0, top: 330, right: 1000, bottom: 480 })
    expect(thin.labels.find((l) => l.id === 'w')!.at[1]).toBe(460 + DIM_LINE_GAP_PX)
  })

  it('돌린 물건은 치수선도 같이 돎', () => {
    const m = dimModel({ kind: 'rect', w: 200, h: 60 }, { x: 0, y: 0, rotation: 90 }, V)
    const w = m.lines.find((l) => l.id === 'w')!
    // 로컬 아래(y+)가 화면 왼쪽(x−)
    expect(w.a[0]).toBeCloseTo(500 - 60 - DIM_LINE_GAP_PX, 6)
    expect(w.a[0]).toBeCloseTo(w.b[0], 6)
  })
})
