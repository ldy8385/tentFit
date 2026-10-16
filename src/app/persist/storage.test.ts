import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLayout, type Layout, type Tent } from '../../core/model'
import { clearLayoutRepo, deleteAllLayouts, getLastLayoutId, getLayout, listLayoutSummaries, putLayout, setLastLayoutId } from '../layoutRepo'
import { memoryKv } from './kv'
import {
  buildBackup,
  deleteMyItem,
  deleteAllStoredLayouts,
  deleteMyTent,
  deleteStoredLayout,
  listMyItems,
  saveMyItem,
  flushSaves,
  importBackup,
  initStorage,
  listMyTents,
  resetStorageForTest,
  saveMyTent,
  storageStatus,
} from './storage'

const TENT: Tent = { name: '터널', outer: { kind: 'rect', w: 600, h: 300 }, inners: [] }
const NOW = '2026-10-15T00:00:00.000Z'

function layout(id: string, name = `배치 ${id}`): Layout {
  return createLayout(TENT, { name, id, now: NOW })
}

afterEach(() => {
  resetStorageForTest()
  clearLayoutRepo()
  vi.useRealTimers()
})

describe('브라우저 저장(Plan 7)', () => {
  it('시작할 때 저장된 배치·마지막 배치·내 텐트를 불러옴, 깨진 배치는 corrupt:로 옮기고 계속', async () => {
    const kv = memoryKv([
      ['layout:a', layout('a')],
      ['layout:bad', { nope: true }],
      ['settings', { lastLayoutId: 'a' }],
      ['myTents', { schemaVersion: 1, items: [{ id: 'my/1', model: '내 터널', tent: TENT }] }],
    ])
    await initStorage(kv)
    expect(storageStatus()).toBe('ok')
    expect(getLayout('a')?.name).toBe('배치 a')
    expect(getLayout('bad')).toBeUndefined()
    expect(getLastLayoutId()).toBe('a')
    expect(listMyTents().map((t) => t.model)).toEqual(['내 터널'])
    expect(kv.data.has('corrupt:bad')).toBe(true)
    expect(kv.data.has('layout:bad')).toBe(false)
  })

  it('배치를 바꾸면 1초 뒤 저장, flush는 바로, 마지막 배치도 저장', async () => {
    vi.useFakeTimers()
    const kv = memoryKv()
    await initStorage(kv)
    putLayout(layout('x'))
    expect(kv.data.has('layout:x')).toBe(false)
    await vi.advanceTimersByTimeAsync(1100)
    expect((kv.data.get('layout:x') as Layout).name).toBe('배치 x')
    putLayout({ ...layout('x'), name: '바뀜' })
    await flushSaves()
    expect((kv.data.get('layout:x') as Layout).name).toBe('바뀜')
    setLastLayoutId('x')
    await flushSaves()
    expect(kv.data.get('settings')).toMatchObject({ lastLayoutId: 'x' })
  })

  it('저장소가 없으면 메모리로만(상태 unavailable)', async () => {
    await initStorage(null)
    expect(storageStatus()).toBe('unavailable')
    putLayout(layout('m'))
    await flushSaves()
    expect(getLayout('m')).toBeDefined()
  })

  it('내 텐트 저장·지우기(새 id, 이름 겹치면 번호)', async () => {
    const kv = memoryKv()
    await initStorage(kv)
    const a = await saveMyTent({ ...TENT, name: '우리 텐트' })
    const b = await saveMyTent({ ...TENT, name: '우리 텐트' })
    expect(listMyTents().map((t) => t.model)).toEqual(['우리 텐트', '우리 텐트 2'])
    expect(a.id).not.toBe(b.id)
    expect((kv.data.get('myTents') as { items: unknown[] }).items).toHaveLength(2)
    await deleteMyTent(a.id)
    expect(listMyTents().map((t) => t.id)).toEqual([b.id])
  })

  it('전체 백업 → 가져오기 왕복: 겹치는 id는 새 id·이름 「(가져옴)」, 모두 반영 또는 아무것도 안 함', async () => {
    const kv = memoryKv()
    await initStorage(kv)
    putLayout(layout('p', '캠핑'))
    await saveMyTent({ ...TENT, name: '내 것' })
    await flushSaves()
    const backup = buildBackup(NOW)
    expect(backup).toMatchObject({ format: 'tentfit', layouts: [{ id: 'p' }], myTents: [{ model: '내 것' }] })
    const r = await importBackup(JSON.parse(JSON.stringify(backup)))
    expect(r).toEqual({ ok: true, layouts: 1, myTents: 1 })
    const names = listLayoutSummaries().map((s) => s.name).sort()
    expect(names).toEqual(['캠핑', '캠핑 (가져옴)'])
    expect(listMyTents().map((t) => t.model)).toEqual(['내 것', '내 것 (가져옴)'])
    const bad = await importBackup({ format: 'tentfit', schemaVersion: 1, layouts: [{ id: 1 }] })
    expect(bad.ok).toBe(false)
    expect(listLayoutSummaries()).toHaveLength(2)
  })
})

describe('배치 지우기·내 도형(2026-10-15)', () => {
  it('배치를 지우면 메모리·저장소에서 빠지고, 마지막 배치였으면 그것도 비움', async () => {
    const kv = memoryKv([['layout:a', layout('a')], ['settings', { lastLayoutId: 'a' }]])
    await initStorage(kv)
    await deleteStoredLayout('a')
    expect(getLayout('a')).toBeUndefined()
    expect(kv.data.has('layout:a')).toBe(false)
    expect(getLastLayoutId()).toBeNull()
  })

  it('배치 전체 지우기: 메모리·저장소의 배치(저장 대기 중 포함)와 마지막 배치 기억이 빠지고, 내 텐트·복구 백업은 그대로(2026-10-16)', async () => {
    const kv = memoryKv([['layout:a', layout('a')], ['layout:b', layout('b')], ['settings', { lastLayoutId: 'a' }], ['corrupt:z', { broken: true }]])
    await initStorage(kv)
    await saveMyTent(TENT)
    putLayout(layout('c'))
    await deleteAllStoredLayouts()
    expect(listLayoutSummaries()).toEqual([])
    expect([...kv.data.keys()].filter((k) => k.startsWith('layout:'))).toEqual([])
    expect(getLastLayoutId()).toBeNull()
    expect((kv.data.get('settings') as { lastLayoutId?: string }).lastLayoutId).toBeUndefined()
    expect(listMyTents()).toHaveLength(1)
    expect(kv.data.has('myTents')).toBe(true)
    expect(kv.data.has('corrupt:z')).toBe(true)
    await flushSaves()
    expect([...kv.data.keys()].filter((k) => k.startsWith('layout:'))).toEqual([])
  })

  it('보관소 deleteAllLayouts는 이번에 연 배치 기억도 비운다', async () => {
    const kv = memoryKv([['layout:a', layout('a')], ['layout:b', layout('b')]])
    await initStorage(kv)
    setLastLayoutId('b')
    await deleteAllLayouts()
    expect(getLastLayoutId()).toBeNull()
    expect(getLayout('a')).toBeUndefined()
    expect(getLayout('b')).toBeUndefined()
  })

  it('내 도형 저장(새 id·이름 겹치면 번호)·지우기, 다시 열면 불러오고 백업에도 들어감', async () => {
    const kv = memoryKv()
    await initStorage(kv)
    const item = { id: 'x', name: '내 매트', shape: { kind: 'rect' as const, w: 190, h: 60 }, x: 5, y: 5, rotation: 30, color: 'green' as const, category: 'MAT' as const, countsArea: true }
    const a = await saveMyItem(item)
    await saveMyItem(item)
    expect(listMyItems().map((p) => p.name)).toEqual(['내 매트', '내 매트 2'])
    expect(a).toMatchObject({ category: 'MAT', shape: { kind: 'rect', w: 190, h: 60 }, color: 'green' })
    expect(a.id.startsWith('my/')).toBe(true)
    expect(buildBackup(NOW).myItems).toHaveLength(2)
    resetStorageForTest()
    await initStorage(kv)
    expect(listMyItems()).toHaveLength(2)
    await deleteMyItem(a.id)
    expect(listMyItems().map((p) => p.name)).toEqual(['내 매트 2'])
  })
})
