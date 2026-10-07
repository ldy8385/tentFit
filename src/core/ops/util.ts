// 문서 조작(ops) 공용 도우미. ops 밖에서는 쓰지 않습니다.
import { LIMITS, round1, type Item, type Layout, type Pt, type Shape } from '../model'

/** 길이를 LIMITS.length 범위로 자르고 0.1cm로 반올림합니다. */
export function clampLen(v: number): number {
  const [min, max] = LIMITS.length
  return round1(Math.min(max, Math.max(min, v)))
}

/** 좌표를 LIMITS.coord 범위로 자르고 0.1cm로 반올림합니다(-0 없음). */
export function clampCoord(v: number): number {
  const [min, max] = LIMITS.coord
  return round1(Math.min(max, Math.max(min, v)))
}

export function roundPt(p: Pt): Pt {
  return [clampCoord(p[0]), clampCoord(p[1])]
}

/** 도형을 새 객체로 복사하면서 반올림·범위 자르기를 합니다. immer draft를 넣어도 일반 객체가 나옵니다. */
export function normalizeShape(s: Shape): Shape {
  switch (s.kind) {
    case 'rect':
      return { kind: 'rect', w: clampLen(s.w), h: clampLen(s.h) }
    case 'circle':
      return { kind: 'circle', d: clampLen(s.d) }
    case 'polygon':
      return { kind: 'polygon', points: s.points.map((p) => roundPt(p)) }
  }
}

/** JSON으로 표현되는 값(모델 전체가 해당)을 깊게 복사합니다. draft·동결 객체 모두 됩니다. */
export function cloneJson<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

/** p를 pivot 기준으로 deg만큼 돌립니다. 시계 방향 양수(y 아래), geom.transformRing과 같은 방향입니다. */
export function rotateAround(p: Pt, pivot: Pt, deg: number): Pt {
  const t = (deg * Math.PI) / 180
  const c = Math.cos(t)
  const s = Math.sin(t)
  const dx = p[0] - pivot[0]
  const dy = p[1] - pivot[1]
  return [pivot[0] + dx * c - dy * s, pivot[1] + dx * s + dy * c]
}

/** d.items를 인덱스로 읽어 배열로 돌려줍니다. 레시피 안에서는 각 원소가 draft입니다. */
export function itemList(d: Layout): Item[] {
  const out: Item[] = []
  for (let i = 0; i < d.items.length; i++) {
    const it = d.items[i]
    if (it) out.push(it)
  }
  return out
}

/** next 순서가 지금과 다를 때만 d.items를 그 순서로 바꿉니다(바뀐 게 없으면 immer가 같은 참조를 돌려줌). */
export function setItemOrder(d: Layout, next: Item[]): void {
  const cur = itemList(d)
  if (cur.length === next.length && cur.every((it, i) => it === next[i])) return
  d.items.splice(0, d.items.length, ...next)
}
