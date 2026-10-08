// 경고 목록 행(스펙 §4.6 "경고 목록", §6.5, D26)과 행을 눌렀을 때 화면을 옮길 위치. 순수 함수만 둡니다.
import { ringBBox, worldRing } from '../../core/geom'
import type { Layout, Pt } from '../../core/model'
import type { Stats } from '../../core/stats'
import { viewCenterWorld, type Insets, type Size, type View } from '../../view/viewport'

export type WarningRow = {
  key: string
  kind: 'item' | 'innerEscape'
  targetId: string
  severity: 'danger' | 'warn'
  title: string
  reason: string
}

const REASON_OUTSIDE = '텐트 밖으로 나감'
const REASON_SEP = ' · '

/** 숫자를 한국어로 읽었을 때 마지막 음절에 받침이 있는지(0 영, 1 일, 3 삼, 6 육, 7 칠, 8 팔은 있음) */
const DIGIT_BATCHIM: Record<string, boolean> = {
  '0': true,
  '1': true,
  '2': false,
  '3': true,
  '4': false,
  '5': false,
  '6': true,
  '7': true,
  '8': true,
  '9': false,
}

/** 이름 뒤에 주격 조사 이/가를 붙입니다. 한글·숫자로 끝나지 않으면 '이(가)'. */
export function withSubject(name: string): string {
  const last = name.trimEnd().slice(-1)
  const code = last.charCodeAt(0)
  if (code >= 0xac00 && code <= 0xd7a3) return `${name}${(code - 0xac00) % 28 === 0 ? '가' : '이'}`
  const digit = DIGIT_BATCHIM[last]
  if (digit !== undefined) return `${name}${digit ? '이' : '가'}`
  return `${name}이(가)`
}

/**
 * 물건 하나에 행 하나, 사유는 ' · '로 이어 붙입니다(나감 → 걸침은 이너 순서).
 * 이너가 1개인 텐트는 '이너 벽에 걸침', 여럿이면 '이너 1 벽에 걸침'. 이탈 이너는 '이너 1이 외곽 밖으로 나감'.
 * 나감·이탈은 danger, 걸침만 있으면 warn. 정렬은 danger 먼저, 같은 등급 안에서는 물건(배열 순서) → 이탈 이너(배열 순서).
 */
export function warningRows(layout: Layout, stats: Stats): WarningRow[] {
  const innerName = new Map(layout.tent.inners.map((i) => [i.id, i.name] as const))
  const namedInners = layout.tent.inners.length > 1
  const rows: WarningRow[] = []

  for (const item of layout.items) {
    const w = stats.warnings[item.id]
    if (w === undefined) continue
    const reasons: string[] = []
    if (w.outside) reasons.push(REASON_OUTSIDE)
    for (const innerId of w.straddles) {
      reasons.push(namedInners ? `${innerName.get(innerId) ?? '이너'} 벽에 걸침` : '이너 벽에 걸침')
    }
    if (reasons.length === 0) continue
    rows.push({
      key: `item:${item.id}`,
      kind: 'item',
      targetId: item.id,
      severity: w.outside ? 'danger' : 'warn',
      title: item.name,
      reason: reasons.join(REASON_SEP),
    })
  }

  for (const innerId of stats.innerEscapes) {
    const name = innerName.get(innerId)
    if (name === undefined) continue
    rows.push({
      key: `escape:${innerId}`,
      kind: 'innerEscape',
      targetId: innerId,
      severity: 'danger',
      title: name,
      reason: `${withSubject(name)} 외곽 밖으로 나감`,
    })
  }

  // Array.prototype.sort는 안정 정렬이라 같은 등급 안의 순서가 유지됩니다.
  return rows.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'danger' ? -1 : 1))
}

/** 행을 눌렀을 때 화면 가운데로 가져올 월드 점: 대상(물건·이너)의 월드 바운딩 박스 가운데. 대상이 없으면 null */
export function warningTargetPoint(layout: Layout, row: WarningRow): Pt | null {
  const target =
    row.kind === 'item'
      ? layout.items.find((it) => it.id === row.targetId)
      : layout.tent.inners.find((i) => i.id === row.targetId)
  if (target === undefined) return null
  const b = ringBBox(worldRing(target))
  return [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2]
}

/** 배율은 그대로 두고, 보이는 영역(시트·배너 높이를 뺀 곳) 가운데에 p가 오도록 옮긴 보기 */
export function centerViewOn(v: View, size: Size, insets: Insets, p: Pt): View {
  const c = viewCenterWorld(v, size, insets)
  return { zoom: v.zoom, panX: v.panX + (c[0] - p[0]) * v.zoom, panY: v.panY + (c[1] - p[1]) * v.zoom }
}
