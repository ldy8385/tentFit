import { afterEach, describe, expect, it, vi } from 'vitest'
import genericJson from '../test/fixtures/tents/generic.json'
import { catalogFromFiles, loadTentCatalog } from './tentCatalog'

/** tents.json 항목(사각 300×200, 이너 없음) */
function entry(id: string, model: string, brand?: string): Record<string, unknown> {
  const e: Record<string, unknown> = {
    id,
    model,
    tent: { name: model, outerTemplate: { kind: 'rect', w: 300, h: 200 }, inners: [] },
  }
  if (brand !== undefined) e.brand = brand
  return e
}

const GENERIC_PATH = '/src/test/fixtures/tents/generic.json'
const TENTS_PATH = '/presets/tents.json'

describe('catalogFromFiles', () => {
  it('brand 없는 시험용 예시만 있으면 일반 예시 5개(파일 순서), 브랜드는 없음', () => {
    const catalog = catalogFromFiles({ [GENERIC_PATH]: genericJson })
    expect(catalog.generic.map((p) => p.id)).toEqual([
      'generic/dome-2p',
      'generic/tunnel-4p',
      'generic/living-shell',
      'generic/bell-4m',
      'generic/tipi-hex',
    ])
    expect(catalog.brands).toEqual([])
    // 템플릿으로 외곽이 채워져 있다
    expect(catalog.generic[1]?.tent.outer).toEqual({ kind: 'rect', w: 620, h: 320 })
  })

  it('tents.json 하나 안에서 브랜드별로 묶고 브랜드 이름순, 같은 브랜드는 파일 안 순서(시험용 예시는 일반 예시로)', () => {
    const catalog = catalogFromFiles({
      [GENERIC_PATH]: genericJson,
      [TENTS_PATH]: { presets: [entry('kovea/b', '리빙 B', '코베아'), entry('gana/a', '돔 A', '가나캠핑'), entry('kovea/c', '리빙 C', '코베아')] },
    })
    expect(catalog.generic).toHaveLength(5)
    expect(catalog.brands.map((b) => b.brand)).toEqual(['가나캠핑', '코베아'])
    expect(catalog.brands[1]?.presets.map((p) => p.id)).toEqual(['kovea/b', 'kovea/c'])
  })

  it('id는 파일 이름과 무관(예전 접두사 규칙 없음)', () => {
    const catalog = catalogFromFiles({ [TENTS_PATH]: { presets: [entry('아무거나/a', 'A', '코베아')] } })
    expect(catalog.brands[0]?.presets.map((p) => p.id)).toEqual(['아무거나/a'])
  })

  it('id가 겹치면 throw', () => {
    expect(() =>
      catalogFromFiles({
        [TENTS_PATH]: { presets: [entry('kovea/a', 'A', '코베아')] },
        '/elsewhere/more.json': { presets: [entry('kovea/a', 'A2', '코베아')] },
      }),
    ).toThrow(/id가 겹쳐요: kovea\/a/)
  })

  it('형식이 깨지면 파일 이름이 붙은 문구로 throw', () => {
    expect(() => catalogFromFiles({ [TENTS_PATH]: { presets: 'x' } })).toThrow(/tents\.json presets/)
  })
})

describe('loadTentCatalog', () => {
  afterEach(() => {
    vi.doUnmock('./tentCatalogData')
    vi.resetModules()
  })

  it('저장소의 프리셋 파일을 동적으로 불러온다(일반 예시 5개 + 브랜드 묶음)', async () => {
    const catalog = await loadTentCatalog()
    expect(catalog.generic.map((p) => p.tent.name)).toEqual([
      '돔 2인 예시',
      '터널 4인 예시',
      '리빙쉘 예시',
      '벨텐트 4m 예시',
      '티피 6각 예시',
    ])
    // 브랜드 묶음(로컬 [텐트 프리셋으로 저장]으로 늘어남): 묶음마다 같은 브랜드의 프리셋만
    for (const group of catalog.brands) {
      expect(group.presets.length).toBeGreaterThan(0)
      expect(group.presets.every((p) => p.brand === group.brand)).toBe(true)
    }
  })

  it('같은 Promise를 재사용한다', () => {
    expect(loadTentCatalog()).toBe(loadTentCatalog())
  })

  it('실패하면 다음 호출([다시 시도])은 새로 불러온다', async () => {
    vi.resetModules()
    vi.doMock('./tentCatalogData', () => ({ tentFiles: { '/presets/tents.json': { presets: 'x' } } }))
    const fresh = await import('./tentCatalog')
    const first = fresh.loadTentCatalog()
    await expect(first).rejects.toThrow(/텐트 프리셋을 읽지 못했어요/)
    const second = fresh.loadTentCatalog()
    expect(second).not.toBe(first)
    await expect(second).rejects.toThrow(/텐트 프리셋을 읽지 못했어요/)
  })
})
