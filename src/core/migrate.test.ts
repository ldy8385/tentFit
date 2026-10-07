import { describe, expect, it } from 'vitest'
import { MigrateError, migrateExportFile, migrateLayout, migrateMyItems, migrateMyTents } from './migrate'
import type { ItemPreset, Layout, TentPreset } from './model'

function layoutV1(): Layout {
  return {
    schemaVersion: 1,
    id: 'layout-1',
    name: '터널 4인 배치',
    createdAt: '2026-10-07T03:00:00.000Z',
    updatedAt: '2026-10-07T03:10:00.000Z',
    tent: {
      name: '터널 4인 예시',
      outer: { kind: 'rect', w: 620, h: 320 },
      outerTemplate: { kind: 'rect', w: 620, h: 320 },
      inners: [
        { id: 'inner-1', name: '이너 1', shape: { kind: 'rect', w: 220, h: 300 }, x: -200, y: 0, rotation: 0 },
      ],
    },
    sourcePresetId: 'generic/tunnel-4',
    items: [
      {
        id: 'item-1',
        name: '매트',
        shape: { kind: 'rect', w: 200, h: 60 },
        x: -200,
        y: 0,
        rotation: 90,
        color: 'green',
        category: 'MAT',
        countsArea: true,
      },
    ],
    groups: [],
  }
}

const myTent: TentPreset = {
  id: 'my/우리 텐트',
  model: '우리 텐트',
  tent: { name: '우리 텐트', outer: { kind: 'circle', d: 400 }, outerTemplate: { kind: 'circle', d: 400 }, inners: [] },
}

const myItem: ItemPreset = {
  id: 'my-item-1',
  name: '아이스박스',
  category: 'ETC',
  shape: { kind: 'rect', w: 60, h: 40 },
  color: 'blue',
  countsArea: true,
}

function catchMigrate(fn: () => unknown): MigrateError {
  try {
    fn()
  } catch (e) {
    if (e instanceof MigrateError) return e
    throw e
  }
  throw new Error('MigrateError가 나지 않았어요')
}

describe('MigrateError', () => {
  it('Error를 상속하고 path를 가진다', () => {
    const e = new MigrateError('메시지', 'items.0.color')
    expect(e).toBeInstanceOf(Error)
    expect(e.name).toBe('MigrateError')
    expect(e.message).toBe('메시지')
    expect(e.path).toBe('items.0.color')
  })
})

describe('migrateLayout', () => {
  it('정상 v1을 그대로 통과시킨다', () => {
    const raw = layoutV1()
    expect(migrateLayout(JSON.parse(JSON.stringify(raw)))).toEqual(raw)
  })

  it('모르는 키는 버린다', () => {
    const raw = { ...layoutV1(), extra: 123 }
    expect('extra' in migrateLayout(raw)).toBe(false)
  })

  it('schemaVersion 2는 MigrateError(path schemaVersion)', () => {
    const e = catchMigrate(() => migrateLayout({ ...layoutV1(), schemaVersion: 2 }))
    expect(e.path).toBe('schemaVersion')
    expect(e.message).toContain('더 새로운 버전(2)')
  })

  it('schemaVersion이 없거나 숫자가 아니거나 0이면 MigrateError', () => {
    const noVersion: Record<string, unknown> = { ...layoutV1() }
    delete noVersion.schemaVersion
    expect(catchMigrate(() => migrateLayout(noVersion)).path).toBe('schemaVersion')
    expect(catchMigrate(() => migrateLayout({ ...layoutV1(), schemaVersion: '1' })).path).toBe('schemaVersion')
    expect(catchMigrate(() => migrateLayout({ ...layoutV1(), schemaVersion: 0 })).path).toBe('schemaVersion')
  })

  it('객체가 아니면 루트 경로', () => {
    expect(catchMigrate(() => migrateLayout(null)).path).toBe('')
    expect(catchMigrate(() => migrateLayout([layoutV1()])).path).toBe('')
    expect(catchMigrate(() => migrateLayout('layout')).path).toBe('')
  })

  it('필드 오류는 첫 이슈의 경로(items.0.color)', () => {
    const raw = JSON.parse(JSON.stringify(layoutV1())) as { items: Array<{ color: string }> }
    raw.items[0]!.color = 'red'
    const e = catchMigrate(() => migrateLayout(raw))
    expect(e.path).toBe('items.0.color')
    expect(e.message).toContain('items.0.color')
  })

  it('범위 밖 좌표도 경로로 알린다', () => {
    const raw = layoutV1()
    raw.tent.inners[0]!.x = 10001
    expect(catchMigrate(() => migrateLayout(raw)).path).toBe('tent.inners.0.x')
  })
})

describe('migrateExportFile', () => {
  const file = () => ({
    format: 'tentfit',
    schemaVersion: 1,
    exportedAt: '2026-10-07T12:00:00+09:00',
    layouts: [layoutV1()],
    myTents: [myTent],
    myItems: [myItem],
  })

  it('정상 파일을 통과시킨다', () => {
    expect(migrateExportFile(JSON.parse(JSON.stringify(file())))).toEqual(file())
  })

  it('format이 다르면 path format', () => {
    expect(catchMigrate(() => migrateExportFile({ ...file(), format: 'other' })).path).toBe('format')
    expect(catchMigrate(() => migrateExportFile({ layouts: [] })).path).toBe('format')
  })

  it('파일 버전 2는 MigrateError', () => {
    expect(catchMigrate(() => migrateExportFile({ ...file(), schemaVersion: 2 })).path).toBe('schemaVersion')
  })

  it('안의 배치 버전·필드 오류는 layouts.N 경로', () => {
    const v2 = file()
    v2.layouts = [{ ...layoutV1(), schemaVersion: 2 as 1 }]
    expect(catchMigrate(() => migrateExportFile(v2)).path).toBe('layouts.0.schemaVersion')

    const badColor = JSON.parse(JSON.stringify(file())) as { layouts: Array<{ items: Array<{ color: string }> }> }
    badColor.layouts[0]!.items[0]!.color = 'red'
    expect(catchMigrate(() => migrateExportFile(badColor)).path).toBe('layouts.0.items.0.color')
  })
})

describe('migrateMyTents / migrateMyItems', () => {
  it('정상 값에서 목록을 꺼낸다', () => {
    expect(migrateMyTents({ schemaVersion: 1, items: [myTent] })).toEqual([myTent])
    expect(migrateMyItems({ schemaVersion: 1, items: [myItem] })).toEqual([myItem])
  })

  it('키가 없으면(undefined) 빈 목록', () => {
    expect(migrateMyTents(undefined)).toEqual([])
    expect(migrateMyItems(undefined)).toEqual([])
  })

  it('버전 2와 필드 오류는 MigrateError', () => {
    expect(catchMigrate(() => migrateMyTents({ schemaVersion: 2, items: [] })).path).toBe('schemaVersion')
    expect(catchMigrate(() => migrateMyTents({ schemaVersion: 1, items: [{ ...myTent, model: '' }] })).path).toBe(
      'items.0.model',
    )
    expect(catchMigrate(() => migrateMyItems({ schemaVersion: 1, items: [{ ...myItem, color: 'red' }] })).path).toBe(
      'items.0.color',
    )
    expect(catchMigrate(() => migrateMyItems(null)).path).toBe('')
  })
})
