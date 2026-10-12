// 배치 보관 경계(스펙 §4.7·§9). 고르기 화면·만들기 화면·편집기는 memoryLayouts.ts를 직접 부르지 않고 이것만 씁니다.
// 지금은 이 탭의 메모리(새로고침하면 사라짐)이고, Plan 7이 이 한 겹만 IndexedDB로 바꿉니다. 그때까지 동기 API입니다.
import { createLayout, type Layout, type Tent } from '../core/model'
import { uniqueName } from '../core/ops/items'
import { clearMemoryLayouts, getMemoryLayout, listMemoryLayouts, putMemoryLayout } from './memoryLayouts'

/** 내 배치 목록·시작 규칙이 쓰는 요약 */
export type LayoutSummary = { id: string; name: string; updatedAt: string; itemCount: number }

/** 마지막으로 연 배치(시작 규칙 §4.7). Plan 7이 저장소의 lastLayoutId로 바꿉니다. */
let lastLayoutId: string | null = null

/** updatedAt을 시각으로. 읽을 수 없으면 가장 오래된 것으로 봅니다. */
function timeOf(iso: string): number {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY
}

/** 최근 수정이 앞(updatedAt 내림차순), 같으면 이름순(한국어), 그다음 id순 */
export function compareRecent(a: LayoutSummary, b: LayoutSummary): number {
  const ta = timeOf(a.updatedAt)
  const tb = timeOf(b.updatedAt)
  if (ta !== tb) return ta < tb ? 1 : -1
  const byName = a.name.localeCompare(b.name, 'ko')
  if (byName !== 0) return byName
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export function getLayout(id: string): Layout | undefined {
  return getMemoryLayout(id)
}

export function putLayout(layout: Layout): void {
  putMemoryLayout(layout)
}

/** updatedAt 내림차순(같으면 이름) */
export function listLayoutSummaries(): LayoutSummary[] {
  return listMemoryLayouts()
    .map((l): LayoutSummary => ({ id: l.id, name: l.name, updatedAt: l.updatedAt, itemCount: l.items.length }))
    .sort(compareRecent)
}

export function layoutCount(): number {
  return listMemoryLayouts().length
}

/**
 * 새 배치(§4.7-1·§4.7-7): 이름 = uniqueName(기존 배치 이름들, '<텐트 이름> 배치'), tent는 복사본(D10),
 * sourcePresetId가 있으면 기록합니다. 보관하고 돌려줍니다. 실행 취소 기록은 편집기가 빈 상태로 시작합니다(§8).
 */
export function createLayoutFromTent(tent: Tent, opts?: { sourcePresetId?: string }): Layout {
  const names = listMemoryLayouts().map((l) => l.name)
  const name = uniqueName(names, `${tent.name} 배치`)
  const layout = createLayout(tent, { name, sourcePresetId: opts?.sourcePresetId })
  putMemoryLayout(layout)
  return layout
}

export function getLastLayoutId(): string | null {
  return lastLayoutId
}

/** 편집기를 열 때마다 부릅니다(Task 5). */
export function setLastLayoutId(id: string | null): void {
  lastLayoutId = id
}

/** 테스트용: 보관한 배치와 마지막 배치 기록을 비웁니다. */
export function clearLayoutRepo(): void {
  clearMemoryLayouts()
  lastLayoutId = null
}
