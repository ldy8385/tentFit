// 브라우저 저장(스펙 §5.5·§9, Plan 7 핵심 — 소유자 요청 2026-10-15 「텐트 만들면 저장 돼?」).
// - 배치는 메모리 보관소(memoryLayouts)가 원본이고, 바뀌면 1초 뒤 IndexedDB에 씁니다(떠날 때·flush 때는 바로).
// - 앱을 열 때 initStorage가 저장된 배치·마지막 배치·내 텐트를 메모리로 불러옵니다. 형식이 깨진 배치는 corrupt:<id>로 옮기고 계속합니다.
// - IndexedDB를 못 쓰면(사생활 보호·차단) 메모리로만 동작하고 상태를 'unavailable'로 알립니다(§9.6).
// - 전체 백업(내보내기 파일 §5.6)과 가져오기(§9.5: 전부 반영 또는 아무것도 안 함, 겹치는 id는 새 id·「(가져옴)」).
// - 내 도형(myItems, 2026-10-15): 물건을 이 브라우저의 라이브러리 「내 도형」으로. 배치 지우기도 여기서.
// 아직 없는 것: 여러 창 알림(BroadcastChannel), persist 요청, 백업 권유 배너.
import { useSyncExternalStore } from 'react'
import { migrateExportFile, migrateLayout, migrateMyItems, migrateMyTents } from '../../core/migrate'
import { newId, SCHEMA_VERSION, type ExportFile, type Item, type ItemPreset, type Layout, type Shape, type Tent, type TentPreset } from '../../core/model'
import { centerPolygon } from '../../core/polygonEdit'
import { withRadii } from '../../core/radii'
import { uniqueName } from '../../core/ops/items'
import { validateLayout } from '../../core/validate'
import { deleteMemoryLayout, getMemoryLayout, listMemoryLayouts, putMemoryLayout } from '../memoryLayouts'
import type { Kv } from './kv'

export type StorageStatus = 'unknown' | 'ok' | 'unavailable' | 'failed'

/** 바뀐 뒤 저장까지(ms, §9.1) */
export const SAVE_DELAY_MS = 1000
const IMPORTED = ' (가져옴)'

let kv: Kv | null = null
let status: StorageStatus = 'unknown'
let restoredLast: string | null = null
let myTents: TentPreset[] = []
let myItems: ItemPreset[] = []
const pendingLayouts = new Map<string, Layout>()
let pendingLast: string | null | undefined = undefined
let timer: ReturnType<typeof setTimeout> | null = null
let writing: Promise<void> = Promise.resolve()
const listeners = new Set<() => void>()
let unbind: (() => void) | null = null

function notify(): void {
  for (const l of listeners) l()
}

function fail(): void {
  if (status === 'ok') {
    status = 'failed'
    notify()
  }
}

async function write(entries: Array<[string, unknown]>, deletes: string[] = []): Promise<void> {
  if (kv === null || (entries.length === 0 && deletes.length === 0)) return
  const target = kv
  writing = writing
    .then(async () => {
      if (entries.length > 0) await target.setMany(entries)
      if (deletes.length > 0) await target.delMany(deletes)
    })
    .catch(fail)
  return writing
}

/**
 * 저장소를 열고 저장된 것을 메모리로 불러옵니다(앱 시작 때 한 번, 화면을 그리기 전).
 * store가 null이면 저장소 없이(메모리로만). 떠날 때(pagehide·숨김) 대기 중인 저장을 바로 씁니다.
 */
export async function initStorage(store: Kv | null): Promise<void> {
  kv = store
  if (store === null) {
    status = 'unavailable'
    notify()
    return
  }
  try {
    const entries = await store.entries()
    const corrupt: Array<[string, unknown]> = []
    const drop: string[] = []
    for (const [key, value] of entries) {
      if (key.startsWith('layout:')) {
        try {
          putMemoryLayout(validateLayout(migrateLayout(value)).layout)
        } catch {
          corrupt.push([`corrupt:${key.slice('layout:'.length)}`, value])
          drop.push(key)
        }
      } else if (key === 'settings') {
        const last = (value as { lastLayoutId?: unknown } | null)?.lastLayoutId
        restoredLast = typeof last === 'string' ? last : null
      } else if (key === 'myTents') {
        try {
          myTents = migrateMyTents(value)
        } catch {
          corrupt.push(['corrupt:myTents', value])
          drop.push(key)
        }
      } else if (key === 'myItems') {
        try {
          myItems = migrateMyItems(value)
        } catch {
          corrupt.push(['corrupt:myItems', value])
          drop.push(key)
        }
      }
    }
    status = 'ok'
    await write(corrupt, drop)
  } catch {
    kv = null
    status = 'unavailable'
  }
  notify()
  if (typeof window !== 'undefined' && unbind === null) {
    const flushNow = () => void flushSaves()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushNow()
    }
    window.addEventListener('pagehide', flushNow)
    document.addEventListener('visibilitychange', onVisibility)
    unbind = () => {
      window.removeEventListener('pagehide', flushNow)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }
}

export function storageStatus(): StorageStatus {
  return status
}

/** 저장 상태를 구독(저장 불가 알림용) */
export function useStorageStatus(): StorageStatus {
  return useSyncExternalStore(subscribe, storageStatus, storageStatus)
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** 시작할 때 불러온 마지막 배치 id */
export function restoredLastLayoutId(): string | null {
  return restoredLast
}

function schedule(): void {
  if (kv === null) return
  if (timer !== null) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    void flushSaves()
  }, SAVE_DELAY_MS)
}

/** 배치가 바뀜(보관소가 부름): 1초 뒤 저장 */
export function layoutChanged(layout: Layout): void {
  pendingLayouts.set(layout.id, layout)
  schedule()
}

/** 마지막으로 연 배치(보관소가 부름) */
export function lastLayoutChanged(id: string | null): void {
  pendingLast = id
  schedule()
}

/** 대기 중인 저장을 바로 씁니다(떠날 때·배치 전환·가져오기 전). */
export async function flushSaves(): Promise<void> {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
  const entries: Array<[string, unknown]> = [...pendingLayouts.values()].map((l): [string, unknown] => [`layout:${l.id}`, l])
  pendingLayouts.clear()
  if (pendingLast !== undefined) {
    entries.push(['settings', { lastLayoutId: pendingLast ?? undefined }])
    pendingLast = undefined
  }
  await write(entries)
  await writing
}

// ── 내 텐트(§5.5 myTents) ───────────────────────────────────────

export function listMyTents(): TentPreset[] {
  return myTents
}

/** 내 텐트 목록 구독(고르기 화면) */
export function useMyTents(): TentPreset[] {
  return useSyncExternalStore(subscribe, listMyTents, listMyTents)
}

async function writeMyTents(next: TentPreset[]): Promise<void> {
  myTents = next
  notify()
  await write([['myTents', { schemaVersion: SCHEMA_VERSION, items: next }]])
}

/** 지금 텐트를 내 텐트로(새 id, 이름이 겹치면 번호). 만든 프리셋을 돌려줍니다. */
export async function saveMyTent(tent: Tent): Promise<TentPreset> {
  const model = uniqueName(
    myTents.map((t) => t.model),
    tent.name.trim() === '' ? '내 텐트' : tent.name.trim(),
  )
  const preset: TentPreset = { id: `my/${newId()}`, model, tent: { ...structuredClone(tent), name: model } }
  await writeMyTents([...myTents, preset])
  return preset
}

export async function deleteMyTent(id: string): Promise<void> {
  await writeMyTents(myTents.filter((t) => t.id !== id))
}

// ── 배치 지우기 ──────────────────────────────────────────────────

/** 배치를 메모리·저장소에서 지웁니다. 마지막으로 연 배치였으면 그 기억도 비웁니다. */
export async function deleteStoredLayout(id: string): Promise<void> {
  deleteMemoryLayout(id)
  pendingLayouts.delete(id)
  if (restoredLast === id) {
    restoredLast = null
    pendingLast = null
  }
  notify()
  await write(pendingLast === null ? [['settings', { lastLayoutId: undefined }]] : [], [`layout:${id}`])
  if (pendingLast === null) pendingLast = undefined
}

/**
 * 배치를 모두 지웁니다(내 배치 [전체 지우기], 2026-10-16). 저장 대기 중인 배치와 마지막 배치 기억도 비웁니다.
 * 내 텐트·내 도형·복구 백업(corrupt:)은 그대로입니다.
 */
export async function deleteAllStoredLayouts(): Promise<void> {
  const ids = new Set([...listMemoryLayouts().map((l) => l.id), ...pendingLayouts.keys()])
  for (const id of ids) deleteMemoryLayout(id)
  pendingLayouts.clear()
  restoredLast = null
  pendingLast = undefined
  notify()
  await write([['settings', { lastLayoutId: undefined }]], [...ids].map((id) => `layout:${id}`))
}

// ── 내 도형(§5.5 myItems) ───────────────────────────────────────

export function listMyItems(): ItemPreset[] {
  return myItems
}

/** 내 도형 목록 구독(라이브러리) */
export function useMyItems(): ItemPreset[] {
  return useSyncExternalStore(subscribe, listMyItems, listMyItems)
}

async function writeMyItems(next: ItemPreset[]): Promise<void> {
  myItems = next
  notify()
  await write([['myItems', { schemaVersion: SCHEMA_VERSION, items: next }]])
}

/** 다각형은 바운딩 박스 가운데가 원점이 되게(반지름 유지) */
function centered(shape: Shape): Shape {
  if (shape.kind !== 'polygon') return structuredClone(shape)
  return withRadii({ kind: 'polygon', points: centerPolygon(shape.points).points }, shape.radii)
}

/** 물건을 내 도형으로(새 id, 이름이 겹치면 번호, 위치·회전은 빼고 모양·색·카테고리·점유 면적만) */
export async function saveMyItem(item: Item): Promise<ItemPreset> {
  const name = uniqueName(
    myItems.map((p) => p.name),
    item.name.trim() === '' ? '내 도형' : item.name.trim(),
  )
  const preset: ItemPreset = { id: `my/${newId()}`, name, category: item.category, shape: centered(item.shape), color: item.color, countsArea: item.countsArea }
  await writeMyItems([...myItems, preset])
  return preset
}

export async function deleteMyItem(id: string): Promise<void> {
  await writeMyItems(myItems.filter((p) => p.id !== id))
}

/** 내 도형인지(id가 my/로 시작) */
export function isMyItem(p: { id: string }): boolean {
  return p.id.startsWith('my/')
}

// ── 백업·가져오기(§5.6·§9.5) ────────────────────────────────────

/** 전체 백업 파일 내용(모든 배치 + 내 텐트) */
export function buildBackup(now: string = new Date().toISOString()): ExportFile {
  return { format: 'tentfit', schemaVersion: SCHEMA_VERSION, exportedAt: now, layouts: listMemoryLayouts(), myTents, myItems }
}

export type ImportResult = { ok: true; layouts: number; myTents: number } | { ok: false; error: string }

/** 백업 파일을 합칩니다. 하나라도 틀리면 아무것도 바꾸지 않습니다. */
export async function importBackup(raw: unknown): Promise<ImportResult> {
  let file: ExportFile
  try {
    file = migrateExportFile(raw)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
  const layouts: Layout[] = []
  for (const [i, l] of file.layouts.entries()) {
    const v = validateLayout(l)
    if (!v.ok) return { ok: false, error: `배치 ${i + 1}(${l.name}): ${v.issues.find((x) => !x.fixed)?.message ?? '형식이 맞지 않아요'}` }
    layouts.push(v.layout)
  }
  await flushSaves()
  const names = listMemoryLayouts().map((l) => l.name)
  for (const l of layouts) {
    if (getMemoryLayout(l.id) !== undefined) {
      l.id = newId()
      l.name = uniqueName(names, `${l.name}${IMPORTED}`)
    }
    names.push(l.name)
    putMemoryLayout(l)
  }
  const tents = [...myTents]
  for (const t of file.myTents) {
    const clash = tents.some((x) => x.id === t.id)
    tents.push(clash ? { ...t, id: `my/${newId()}`, model: uniqueName(tents.map((x) => x.model), `${t.model}${IMPORTED}`) } : t)
  }
  myTents = tents
  const items = [...myItems]
  for (const p of file.myItems) {
    const clash = items.some((x) => x.id === p.id)
    items.push(clash ? { ...p, id: `my/${newId()}`, name: uniqueName(items.map((x) => x.name), `${p.name}${IMPORTED}`) } : p)
  }
  myItems = items
  notify()
  await write([
    ...layouts.map((l): [string, unknown] => [`layout:${l.id}`, l]),
    ['myTents', { schemaVersion: SCHEMA_VERSION, items: tents }],
    ['myItems', { schemaVersion: SCHEMA_VERSION, items }],
  ])
  await writing
  return { ok: true, layouts: layouts.length, myTents: file.myTents.length }
}

/** 시험용 */
export function resetStorageForTest(): void {
  if (timer !== null) clearTimeout(timer)
  timer = null
  kv = null
  status = 'unknown'
  restoredLast = null
  myTents = []
  myItems = []
  pendingLayouts.clear()
  pendingLast = undefined
  writing = Promise.resolve()
  unbind?.()
  unbind = null
}
