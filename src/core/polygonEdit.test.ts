import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import type { Pt } from './model'
import {
  canClosePolygon,
  centerPolygon,
  drawGridOrigin,
  edgeLengths,
  interiorAngles,
  minEdgeLength,
  scaleToSize,
  segmentCrosses,
  setEdgeLength,
  setVertexAngle,
  snapDrawPoint,
} from './polygonEdit'

function close(a: Pt[], b: Pt[], tol = 1e-9): void {
  expect(a.length).toBe(b.length)
  a.forEach((p, i) => {
    const q = b[i]!
    expect(Math.abs(p[0] - q[0])).toBeLessThanOrEqual(tol)
    expect(Math.abs(p[1] - q[1])).toBeLessThanOrEqual(tol)
  })
}

const L_SHAPE: Pt[] = [
  [0, 0],
  [400, 0],
  [400, 200],
  [200, 200],
  [200, 400],
  [0, 400],
]

describe('edgeLengths·interiorAngles(변 i = p[i] → p[i+1], 꼭짓점 i = p[i], 0부터)', () => {
  it('변 길이는 닫는 변까지 n개', () => {
    expect(edgeLengths([[0, 0], [300, 0], [300, 400]])).toEqual([300, 400, 500])
  })

  it('직사각형은 어느 방향으로 돌아도 내각이 모두 90°', () => {
    const cw: Pt[] = [[0, 0], [600, 0], [600, 300], [0, 300]]
    for (const a of interiorAngles(cw)) expect(a).toBeCloseTo(90, 9)
    for (const a of interiorAngles([...cw].reverse())) expect(a).toBeCloseTo(90, 9)
  })

  it('L자의 안쪽 꺾인 꼭짓점은 270°, 나머지는 90°', () => {
    const angles = interiorAngles(L_SHAPE)
    expect(angles.map((a) => Math.round(a))).toEqual([90, 90, 90, 270, 90, 90])
    expect(angles.map((a) => Math.round(a))).toEqual(interiorAngles([...L_SHAPE].reverse()).map((a) => Math.round(a)).reverse())
  })
})

describe('setEdgeLength(설계 §2.3-2: p[i+1 … n−1]을 그 변 방향으로 밀고 닫는 변이 흡수)', () => {
  it('맞춤으로 직각이 된 대충 그린 사각형에 변 1=620·변 2=320·변 3=620 → 정확한 620×320', () => {
    let pts: Pt[] = [[0, 0], [600, 0], [600, 330], [10, 330]]
    pts = setEdgeLength(pts, 0, 620)
    pts = setEdgeLength(pts, 1, 320)
    pts = setEdgeLength(pts, 2, 620)
    close(pts, [[0, 0], [620, 0], [620, 320], [0, 320]])
    expect(edgeLengths(pts)[3]).toBeCloseTo(320, 9)
  })

  it('L자 6변을 실제 치수로(변 5개 입력, 닫는 변 자동)', () => {
    let pts = L_SHAPE
    ;[500, 150, 250, 250, 250].forEach((len, i) => {
      pts = setEdgeLength(pts, i, len)
    })
    close(pts, [[0, 0], [500, 0], [500, 150], [250, 150], [250, 400], [0, 400]])
  })

  it('바꾼 변만 길이가 바뀌고 다른 변(닫는 변 제외) 길이·내각(꼭짓점 1…n−2)은 그대로, p0 고정', () => {
    const hex: Pt[] = [[0, 0], [200, -50], [380, 40], [360, 260], [150, 300], [-40, 160]]
    const before = edgeLengths(hex)
    const beforeAngles = interiorAngles(hex)
    const after = setEdgeLength(hex, 2, 300)
    const lens = edgeLengths(after)
    expect(lens[2]).toBeCloseTo(300, 9)
    for (const i of [0, 1, 3, 4]) expect(lens[i]).toBeCloseTo(before[i]!, 9)
    const angles = interiorAngles(after)
    for (const i of [1, 2, 3, 4]) expect(angles[i]).toBeCloseTo(beforeAngles[i]!, 9)
    expect(after[0]).toEqual([0, 0])
  })

  it('입력 배열을 바꾸지 않고, 길이 0인 변·범위 밖 번호는 그대로 복사본', () => {
    const pts: Pt[] = [[0, 0], [100, 0], [100, 100]]
    const copy = JSON.parse(JSON.stringify(pts)) as Pt[]
    setEdgeLength(pts, 0, 200)
    expect(pts).toEqual(copy)
    expect(setEdgeLength(pts, 2, 50)).toEqual(copy)
    expect(setEdgeLength([[0, 0], [0, 0], [100, 100]], 0, 50)).toEqual([[0, 0], [0, 0], [100, 100]])
  })

  it('성질: 무작위 다각형(5~10점)에서 변 i를 L로 → 그 변 = L, 변 0…n−2의 나머지는 그대로', () => {
    const arb = fc
      .integer({ min: 5, max: 10 })
      .chain((n) =>
        fc.record({
          n: fc.constant(n),
          radii: fc.array(fc.integer({ min: 50, max: 800 }), { minLength: n, maxLength: n }),
          edge: fc.integer({ min: 0, max: n - 2 }),
          length: fc.integer({ min: 10, max: 50000 }).map((v) => v / 10),
        }),
      )
    fc.assert(
      fc.property(arb, ({ n, radii, edge, length }) => {
        const pts: Pt[] = radii.map((r, k) => {
          const t = (2 * Math.PI * k) / n
          return [Math.round(r * Math.cos(t) * 10) / 10, Math.round(r * Math.sin(t) * 10) / 10]
        })
        const before = edgeLengths(pts)
        const lens = edgeLengths(setEdgeLength(pts, edge, length))
        expect(Math.abs(lens[edge]! - length)).toBeLessThanOrEqual(1e-6)
        for (let i = 0; i <= n - 2; i++) {
          if (i !== edge) expect(Math.abs(lens[i]! - before[i]!)).toBeLessThanOrEqual(1e-6)
        }
        return true
      }),
      { numRuns: 200 },
    )
  })
})

describe('setVertexAngle(설계 §2.3-3: p[i+1 … n−1]을 p[i] 둘레로 돌려 내각 = deg)', () => {
  it('직사각형 꼭짓점 2(0부터 1)를 120°로 → 그 내각 120°, 변 길이 0…n−2 그대로', () => {
    const rect: Pt[] = [[0, 0], [400, 0], [400, 300], [0, 300]]
    const after = setVertexAngle(rect, 1, 120)
    expect(interiorAngles(after)[1]).toBeCloseTo(120, 9)
    const lens = edgeLengths(after)
    expect(lens[0]).toBeCloseTo(400, 9)
    expect(lens[1]).toBeCloseTo(300, 9)
    expect(lens[2]).toBeCloseTo(400, 9)
    expect(after[0]).toEqual([0, 0])
    expect(after[1]).toEqual([400, 0])
  })

  it('반대 방향 다각형에서도 같은 결과(내각 기준), 270°(오목)도 된다', () => {
    const ccw: Pt[] = [[0, 0], [0, 300], [400, 300], [400, 0]]
    expect(interiorAngles(setVertexAngle(ccw, 2, 100))[2]).toBeCloseTo(100, 9)
    expect(interiorAngles(setVertexAngle(L_SHAPE, 3, 250))[3]).toBeCloseTo(250, 9)
  })

  it('바꾼 꼭짓점 밖 내각(1…n−2)은 그대로', () => {
    const before = interiorAngles(L_SHAPE)
    const after = interiorAngles(setVertexAngle(L_SHAPE, 2, 100))
    for (const i of [1, 3, 4]) expect(after[i]).toBeCloseTo(before[i]!, 9)
  })

  it('번호가 1 … n−2 밖이면 그대로 복사본', () => {
    const rect: Pt[] = [[0, 0], [400, 0], [400, 300], [0, 300]]
    expect(setVertexAngle(rect, 0, 120)).toEqual(rect)
    expect(setVertexAngle(rect, 3, 120)).toEqual(rect)
  })
})

describe('scaleToSize(bbox 가운데 기준 축별 비율)', () => {
  it('가로만 바꾸면 세로는 그대로, 가운데 유지', () => {
    const pts: Pt[] = [[-100, -50], [100, -50], [100, 50], [0, 80], [-100, 50]]
    const out = scaleToSize(pts, 400, 130)
    close(out, [[-200, -50], [200, -50], [200, 50], [0, 80], [-200, 50]])
  })

  it('두 축 모두, bbox가 원점 밖이어도 가운데 기준', () => {
    const pts: Pt[] = [[100, 100], [300, 100], [300, 200], [100, 200]]
    close(scaleToSize(pts, 100, 200), [[150, 50], [250, 50], [250, 250], [150, 250]])
  })
})

describe('drawGridOrigin', () => {
  it('외곽 bbox 왼쪽 위, 외곽 없음이면 원점', () => {
    expect(drawGridOrigin({ outer: { kind: 'rect', w: 620, h: 320 } }, false)).toEqual([-310, -160])
    expect(drawGridOrigin({ outer: { kind: 'rect', w: 620, h: 320 } }, true)).toEqual([0, 0])
  })
})

describe('snapDrawPoint(설계 §2.2 맞춤)', () => {
  it('첫 점: 격자 원점 기준 10cm 격자', () => {
    expect(snapDrawPoint(null, [123.4, -56.7], [0, 0])).toEqual([120, -60])
    expect(snapDrawPoint(null, [123.4, -56.7], [-203, -103])).toEqual([127, -53])
  })

  it('다음 점: 방향 15° 단위, 길이 10cm 단위, 0.1cm 반올림', () => {
    expect(snapDrawPoint([0, 0], [296, 8], [0, 0])).toEqual([300, 0])
    expect(snapDrawPoint([100, 100], [103, 397], [0, 0])).toEqual([100, 400])
    // 47° → 45°, 길이 141.4 → 140
    const p = snapDrawPoint([0, 0], [96.4, 103.4], [0, 0])
    expect(p[0]).toBeCloseTo(99, 0)
    expect(p).toEqual([Math.round(140 * Math.SQRT1_2 * 10) / 10, Math.round(140 * Math.SQRT1_2 * 10) / 10])
  })

  it('길이는 최소 10cm', () => {
    expect(snapDrawPoint([0, 0], [3, 0.3], [0, 0])).toEqual([10, 0])
  })
})

describe('segmentCrosses(마지막 점 → next 변)', () => {
  const open: Pt[] = [[0, 0], [400, 0], [400, 300]]

  it('이웃이 아닌 변과 교차하면 true', () => {
    expect(segmentCrosses(open, [200, -100])).toBe(true)
  })

  it('교차가 없으면 false, 점이 하나뿐이면 길이 0만 막음', () => {
    expect(segmentCrosses(open, [0, 300])).toBe(false)
    expect(segmentCrosses([[0, 0]], [100, 0])).toBe(false)
    expect(segmentCrosses([], [100, 0])).toBe(false)
  })

  it('길이 0(마지막 점과 같음)이면 true', () => {
    expect(segmentCrosses(open, [400, 300])).toBe(true)
    expect(segmentCrosses([[0, 0]], [0, 0])).toBe(true)
  })

  it('바로 앞 변으로 되접히면 true, 꺾이기만 하면 false', () => {
    expect(segmentCrosses(open, [400, 100])).toBe(true)
    expect(segmentCrosses(open, [500, 300])).toBe(false)
  })

  it('이미 있는 변·꼭짓점에 닿아도 true', () => {
    expect(segmentCrosses([[0, 0], [400, 0], [400, 300], [200, 300]], [200, 0])).toBe(true)
    expect(segmentCrosses([[0, 0], [400, 0], [400, 300], [200, 300]], [0, 0])).toBe(true)
  })
})

describe('canClosePolygon(validate.ringIssue와 같은 기준)', () => {
  it('세 사유', () => {
    expect(canClosePolygon([[0, 0], [100, 0]])).toEqual({ ok: false, reason: 'too-few' })
    expect(canClosePolygon([[0, 0], [100, 100], [100, 0], [0, 100]])).toEqual({ ok: false, reason: 'cross' })
    expect(canClosePolygon([[0, 0], [100, 0], [100, 0.01]])).toEqual({ ok: false, reason: 'tiny' })
    expect(canClosePolygon([[0, 0], [100, 0], [100, 100]])).toEqual({ ok: true })
  })
})

describe('centerPolygon·minEdgeLength', () => {
  it('bbox 가운데(0.1cm)가 원점이 되게 옮기고 가운데를 돌려준다', () => {
    const { center, points } = centerPolygon([[100, 100], [500, 100], [500, 400], [100, 400]])
    expect(center).toEqual([300, 250])
    expect(points).toEqual([[-200, -150], [200, -150], [200, 150], [-200, 150]])
  })

  it('가운데를 0.1cm로 반올림하고, 가운데 + 로컬 점 = 원래 점(0.1cm 격자)', () => {
    const raw: Pt[] = [[0, 0], [100.1, 0], [100.1, 50.3]]
    const { center, points } = centerPolygon(raw)
    expect(Math.abs(center[0] - 50.05)).toBeLessThanOrEqual(0.05 + 1e-9)
    expect(Math.abs(center[1] - 25.15)).toBeLessThanOrEqual(0.05 + 1e-9)
    points.forEach((p, i) => {
      expect(Math.round((p[0] + center[0]) * 10) / 10).toBe(raw[i]![0])
      expect(Math.round((p[1] + center[1]) * 10) / 10).toBe(raw[i]![1])
    })
  })

  it('가장 짧은 변 길이(닫는 변 포함)', () => {
    expect(minEdgeLength([[0, 0], [300, 0], [300, 400]])).toBe(300)
    expect(minEdgeLength([[0, 0], [300, 0], [300, 400], [0, 0.01]])).toBeCloseTo(0.01, 9)
  })
})

describe('snapDrawPoint — 상하좌우로만(각도 단위 90°)', () => {
  it('각도 단위를 90°로 주면 0·90·180·270°로만 맞춘다', () => {
    expect(snapDrawPoint([0, 0], [100, 30], [0, 0], 90)).toEqual([100, 0])
    expect(snapDrawPoint([0, 0], [20, -150], [0, 0], 90)).toEqual([0, -150])
    expect(snapDrawPoint([0, 0], [100, 30], [0, 0])).toEqual([Math.round(100 * Math.cos(Math.PI / 12) * 10) / 10, Math.round(100 * Math.sin(Math.PI / 12) * 10) / 10])
  })
})
