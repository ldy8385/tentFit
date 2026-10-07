import { round1 } from './model'
import type { Pt, Shape, ShapeTemplate } from './model'

/** 정N각형: 외접원 지름 → 한 변 */
export function ngonSideFromDiameter(n: number, diameter: number): number {
  return diameter * Math.sin(Math.PI / n)
}

/** 정N각형: 한 변 → 외접원 지름 */
export function ngonDiameterFromSide(n: number, side: number): number {
  return side / Math.sin(Math.PI / n)
}

/** 바운딩 박스 중심이 원점이 되도록 옮기고 꼭짓점을 0.1cm로 반올림합니다. */
function centerAndRound(points: Pt[]): Pt[] {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  return points.map(([x, y]): Pt => [round1(x - cx), round1(y - cy)])
}

/**
 * 사다리꼴: 앞변은 아래(y+), 뒷변은 위(y−). offset이 +면 뒷변이 오른쪽(x+)으로 이동.
 * 꼭짓점 순서: 뒷변 왼쪽 → 뒷변 오른쪽 → 앞변 오른쪽 → 앞변 왼쪽.
 */
function trapezoidPoints(front: number, back: number, depth: number, offset: number): Pt[] {
  const top = -depth / 2
  const bottom = depth / 2
  return centerAndRound([
    [offset - back / 2, top],
    [offset + back / 2, top],
    [front / 2, bottom],
    [-front / 2, bottom],
  ])
}

/**
 * 정N각형: 외접원 지름 기준, 한 변이 아래쪽(y+)에 수평.
 * 꼭짓점 순서: 아래 변 왼쪽에서 시작해 왼쪽 변을 타고 올라가 오른쪽으로 돌아 아래 변 오른쪽에서 끝납니다.
 * 좌우 대칭을 정확히 맞추려고 오른쪽 절반은 왼쪽 절반을 뒤집어 만듭니다.
 */
function ngonPoints(n: number, diameter: number): Pt[] {
  const r = diameter / 2
  const pts: Pt[] = []
  for (let k = 0; k < n; k++) {
    const phi = Math.PI / n + (2 * Math.PI * k) / n // 아래쪽(y+)에서 시작해 화면 기준 시계 방향으로 잰 각
    pts.push([-r * Math.sin(phi), r * Math.cos(phi)])
  }
  for (let k = 0; k < Math.floor(n / 2); k++) {
    const left = pts[k]
    if (left) pts[n - 1 - k] = [-left[0], left[1]]
  }
  if (n % 2 === 1) {
    const mid = pts[(n - 1) / 2]
    if (mid) pts[(n - 1) / 2] = [0, mid[1]]
  }
  return centerAndRound(pts)
}

/** 템플릿 → 도형(§4.8). 템플릿이 원본이고 도형은 여기서 만든 값입니다. */
export function shapeFromTemplate(t: ShapeTemplate): Shape {
  switch (t.kind) {
    case 'rect': {
      const w = round1(t.w)
      return { kind: 'rect', w, h: t.square ? w : round1(t.h) }
    }
    case 'circle':
      return { kind: 'circle', d: round1(t.d) }
    case 'trapezoid':
      return { kind: 'polygon', points: trapezoidPoints(t.front, t.back, t.depth, t.offset) }
    case 'ngon': {
      const diameter = t.sizeBy === 'diameter' ? t.size : ngonDiameterFromSide(t.n, t.size)
      return { kind: 'polygon', points: ngonPoints(t.n, diameter) }
    }
  }
}

/** 두 도형이 tol(cm) 안에서 같은지. 다각형은 같은 순서의 꼭짓점끼리 x·y를 각각 비교합니다. */
export function shapesEqual(a: Shape, b: Shape, tol = 0.1): boolean {
  const near = (u: number, v: number) => Math.abs(u - v) <= tol + 1e-9
  switch (a.kind) {
    case 'rect':
      return b.kind === 'rect' && near(a.w, b.w) && near(a.h, b.h)
    case 'circle':
      return b.kind === 'circle' && near(a.d, b.d)
    case 'polygon': {
      if (b.kind !== 'polygon' || a.points.length !== b.points.length) return false
      return a.points.every((p, i) => {
        const q = b.points[i]
        return q !== undefined && near(p[0], q[0]) && near(p[1], q[1])
      })
    }
  }
}
