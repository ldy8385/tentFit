// Konva 터치 스파이크용 도형 데이터(버리는 코드). 단위 cm, 로컬 원점 = 도형 중심.
// rect 20 · circle 15 · 8각형 15 = 50개. 휴대폰 축척(0.65px/cm)에서 40cm 스툴 하나를 일부러 넣는다(스펙 §14 ②).

export type SpikeKind = 'rect' | 'circle' | 'octagon'

export type SpikeItem = {
  id: string
  name: string
  kind: SpikeKind
  w: number // rect: 가로, circle·octagon: 지름
  h: number // rect: 세로, circle·octagon: 지름(= w)
  x: number
  y: number
  rotation: number
  color: string
}

export const ITEM_COUNT = 50
export const CELL_CM = 120
export const COLUMNS = 5
export const STOOL_ID = 'c2'
const STOOL_INDEX = 22 // 5열 격자의 가운데 열(0, -60)

export const SPIKE_COLORS = ['#6a9955', '#c8b27a', '#5b8bd9', '#3fa7a0', '#8d6cc4', '#d87aa6', '#9a6b4f', '#8a8f98'] as const

export function round1(v: number): number {
  return Math.round(v * 10) / 10 + 0 // + 0: -0 제거
}

export function makeSpikeItems(): SpikeItem[] {
  const items: SpikeItem[] = []
  for (let i = 0; i < ITEM_COUNT; i++) {
    const x = ((i % COLUMNS) - 2) * CELL_CM
    const y = (Math.floor(i / COLUMNS) - 4.5) * CELL_CM
    const color = SPIKE_COLORS[i % SPIKE_COLORS.length] ?? '#8a8f98'
    if (i < 20) {
      const w = 60 + ((i * 17) % 41)
      const h = 30 + ((i * 23) % 61)
      items.push({ id: `r${i}`, name: `사각 ${i + 1}`, kind: 'rect', w, h, x, y, rotation: 0, color })
    } else if (i < 35) {
      const j = i - 20
      const stool = i === STOOL_INDEX
      const d = stool ? 40 : 50 + ((j * 13) % 51)
      items.push({ id: `c${j}`, name: stool ? '스툴' : `원 ${j + 1}`, kind: 'circle', w: d, h: d, x, y, rotation: 0, color })
    } else {
      const k = i - 35
      const d = 50 + ((k * 19) % 51)
      items.push({ id: `o${k}`, name: `8각 ${k + 1}`, kind: 'octagon', w: d, h: d, x, y, rotation: 0, color })
    }
  }
  return items
}

/** 정8각형 꼭짓점(Konva Line points 형식). 한 변이 아래쪽(y+)에 수평. */
export function octagonPoints(d: number): number[] {
  const r = d / 2
  const points: number[] = []
  for (let k = 0; k < 8; k++) {
    const a = ((22.5 + 45 * k) * Math.PI) / 180
    points.push(round1(r * Math.cos(a)), round1(r * Math.sin(a)))
  }
  return points
}

export function itemLabel(item: SpikeItem): string {
  return item.kind === 'rect' ? `${item.name}\n${item.w}×${item.h}` : `${item.name}\n⌀${item.w}`
}

/** transformend 때 Konva scale을 치수로 옮긴다. 원·8각형은 비율 고정이라 scaleX만 쓴다. */
export function bakeScale(item: SpikeItem, scaleX: number, scaleY: number): { w: number; h: number } {
  if (item.kind === 'rect') {
    return { w: round1(item.w * Math.abs(scaleX)), h: round1(item.h * Math.abs(scaleY)) }
  }
  const d = round1(item.w * Math.abs(scaleX))
  return { w: d, h: d }
}
