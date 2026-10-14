// 모서리 반지름 배열 도우미(소유자 요청 2026-10-14). 순수 함수이고 입력을 바꾸지 않습니다.
// 반지름은 꼭짓점 순서(geom.cornerRing)와 같은 길이이고, 저장할 때는 모두 0이면 radii를 아예 빼서 예전 문서와 같게 둡니다.
import { LIMITS, round1, type Shape } from './model'

type Rounded = Extract<Shape, { kind: 'rect' | 'polygon' }>

/** n칸으로 맞추고(모자라면 0, 넘치면 버림) 0.1cm 반올림·0~5000으로 자릅니다. 모두 0이면 undefined. */
export function normalizeRadii(radii: readonly number[] | undefined, n: number): number[] | undefined {
  if (radii === undefined || n <= 0) return undefined
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const r = radii[i] ?? 0
    out.push(Number.isFinite(r) ? round1(Math.min(LIMITS.length[1], Math.max(0, r))) : 0)
  }
  return out.some((r) => r > 0) ? out : undefined
}

/** 도형의 꼭짓점 수(사각형 4, 다각형 점 수, 원 0) */
export function cornerCount(shape: Shape): number {
  return shape.kind === 'rect' ? 4 : shape.kind === 'polygon' ? shape.points.length : 0
}

/** 꼭짓점마다 반지름(없으면 0). 원은 []. */
export function radiiOf(shape: Shape): number[] {
  const n = cornerCount(shape)
  if (shape.kind === 'circle') return []
  return Array.from({ length: n }, (_, i) => shape.radii?.[i] ?? 0)
}

/** 반지름을 정리해 붙인 새 도형(모두 0이면 radii 없음). 원은 그대로. */
export function withRadii(shape: Shape, radii: readonly number[] | undefined): Shape {
  if (shape.kind === 'circle') return shape
  const { radii: _old, ...rest } = shape as Rounded
  const next = normalizeRadii(radii, cornerCount(shape))
  return (next === undefined ? rest : { ...rest, radii: next }) as Shape
}

/** 두 반지름 배열이 같은지(없음 = 모두 0, tol cm 안) */
export function sameRadii(a: readonly number[] | undefined, b: readonly number[] | undefined, n: number, tol = 0): boolean {
  for (let i = 0; i < n; i++) if (Math.abs((a?.[i] ?? 0) - (b?.[i] ?? 0)) > tol + 1e-9) return false
  return true
}
