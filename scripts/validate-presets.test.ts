import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { thumbnailSvg } from '../src/core/thumbnail'
import { buildZones } from '../src/core/zones'
import { checkPresets } from './validate-presets'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const PRESETS = join(ROOT, 'presets')
const SCRIPT = join(ROOT, 'scripts', 'validate-presets.ts')

// 테스트에서 JSON을 고치기 위한 최소 형태(검사 대상이므로 일부러 느슨하게 둡니다)
type RawInner = { id: string; name: string; x: number; y: number; rotation: number; template?: unknown; shape?: unknown }
type RawTentEntry = {
  id: string
  brand?: string
  model: string
  note?: string
  tent: { name: string; outerTemplate?: unknown; outer?: unknown; inners: RawInner[] }
}
type RawTentFile = { $schema?: string; presets: RawTentEntry[] }
type RawItem = { id: string; name: string; category: string; shape: unknown; color: string; countsArea: boolean }
type RawItemFile = { $schema?: string; items: RawItem[] }

const temps: string[] = []

/** 실제 presets/를 임시 폴더로 복사합니다. 테스트는 복사본만 고칩니다. */
function copyPresets(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tentfit-presets-'))
  temps.push(dir)
  cpSync(PRESETS, dir, { recursive: true })
  return dir
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function entry(file: RawTentFile, id: string): RawTentEntry {
  const found = file.presets.find((p) => p.id === id)
  if (!found) throw new Error(`테스트 데이터에 ${id}가 없어요`)
  return found
}

function expectNear(actual: number, expected: number, tol: number): void {
  expect(Math.abs(actual - expected), `${actual} ≈ ${expected} (±${tol})`).toBeLessThanOrEqual(tol)
}

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('checkPresets — 실제 데이터', () => {
  it('저장소의 presets/는 오류 없이 통과한다', () => {
    const r = checkPresets(PRESETS)
    expect(r.errors).toEqual([])
    expect(r.tentFiles).toContain('generic')
    expect(r.tents.map((t) => t.id)).toEqual(
      expect.arrayContaining([
        'generic/dome-2p',
        'generic/tunnel-4p',
        'generic/living-shell',
        'generic/bell-4m',
        'generic/tipi-hex',
      ]),
    )
    expect(r.items.length).toBeGreaterThanOrEqual(18)
  })

  it('일반 예시 텐트 5개의 넓이와 구역이 손계산과 같고, 이너 이탈이 없다', () => {
    const { tents } = checkPresets(PRESETS)
    const byId = new Map(tents.map((t) => [t.id, t]))
    const zonesOf = (id: string) => {
      const t = byId.get(id)
      if (!t) throw new Error(`${id} 없음`)
      return buildZones(t.tent)
    }

    // 돔 2인: 210×210 − 이너 210×130 = 전실 210×80
    const dome = zonesOf('generic/dome-2p')
    expectNear(dome.outerArea, 44_100, 0.01)
    expect(dome.inners.map((z) => z.name)).toEqual(['이너 1'])
    expectNear(dome.inners[0]?.area ?? -1, 27_300, 0.01)
    expectNear(dome.floorArea, 16_800, 0.01)
    expect(dome.pieces.map((p) => p.name)).toEqual(['전실 1'])

    // 터널 4인: 620×320 − 220×300
    const tunnel = zonesOf('generic/tunnel-4p')
    expectNear(tunnel.outerArea, 198_400, 0.01)
    expectNear(tunnel.inners[0]?.area ?? -1, 66_000, 0.01)
    expectNear(tunnel.floorArea, 132_400, 0.01)
    expect(tunnel.pieces.map((p) => p.name)).toEqual(['전실 1'])

    // 리빙쉘: 500×400 − 300×220. 이너가 벽에 안 닿아 전실은 구멍 난 조각 1개
    const shell = zonesOf('generic/living-shell')
    expectNear(shell.outerArea, 200_000, 0.01)
    expectNear(shell.inners[0]?.area ?? -1, 66_000, 0.01)
    expectNear(shell.floorArea, 134_000, 0.01)
    expect(shell.pieces).toHaveLength(1)
    expectNear(shell.pieces[0]?.area ?? -1, 134_000, 0.01)

    // 벨텐트 4m: π·200² − 260×150 (원 허용 오차 1cm²)
    const bell = zonesOf('generic/bell-4m')
    expectNear(bell.outerArea, Math.PI * 200 * 200, 1)
    expectNear(bell.inners[0]?.area ?? -1, 39_000, 0.01)
    expectNear(bell.floorArea, Math.PI * 200 * 200 - 39_000, 1)

    // 티피 6각: 이너 0개 → "바닥 1"(Review Focus 1). 정육각형 넓이 (3√3/2)·200² ≈ 103,923
    // 꼭짓점을 0.1cm로 반올림하므로(173.205 → 173.2) 5cm² 안쪽 차이를 허용합니다.
    const tipi = zonesOf('generic/tipi-hex')
    expectNear(tipi.outerArea, ((3 * Math.sqrt(3)) / 2) * 200 * 200, 5)
    expect(tipi.inners).toEqual([])
    expect(tipi.floorLabel).toBe('바닥')
    expect(tipi.pieces.map((p) => p.name)).toEqual(['바닥 1'])

    for (const t of tents) expect(buildZones(t.tent).innerEscapes, t.id).toEqual([])
  })

  it('물건 프리셋은 카테고리 6개를 모두 갖고, 깔개만 점유 면적에서 빠진다', () => {
    const { items } = checkPresets(PRESETS)
    expect(new Set(items.map((i) => i.category))).toEqual(new Set(['MAT', 'CHAIR', 'TABLE', 'FURNITURE', 'RUG', 'ETC']))
    for (const i of items) expect(i.countsArea, i.id).toBe(i.category !== 'RUG')

    const circle = (category: string, d: number) =>
      items.find((i) => i.category === category && i.shape.kind === 'circle' && i.shape.d === d)
    expect(circle('CHAIR', 35)?.name).toBe('원형 스툴')
    expect(circle('ETC', 45)?.name).toBe('난로')
    expect(circle('TABLE', 80)?.name).toBe('원형 테이블')
  })

  it('모든 텐트 프리셋의 썸네일을 NaN 없이 만든다', () => {
    for (const t of checkPresets(PRESETS).tents) {
      const svg = thumbnailSvg({ tent: t.tent })
      expect(svg.startsWith('<svg'), t.id).toBe(true)
      expect(svg, t.id).not.toContain('NaN')
    }
  })
})

describe('checkPresets — 깨진 데이터', () => {
  it('복사본도 처음에는 통과한다(아래 실패들의 대조군)', () => {
    expect(checkPresets(copyPresets()).errors).toEqual([])
  })

  it('JSON 문법 오류', () => {
    const dir = copyPresets()
    writeFileSync(join(dir, 'tents', 'generic.json'), '{ "presets": [', 'utf8')
    expect(checkPresets(dir).errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/^tents\/generic\.json: JSON 문법 오류/)]),
    )
  })

  it('같은 파일 안의 id 중복', () => {
    const dir = copyPresets()
    const path = join(dir, 'tents', 'generic.json')
    const file = readJson<RawTentFile>(path)
    file.presets.push(structuredClone(entry(file, 'generic/dome-2p')))
    writeJson(path, file)
    expect(checkPresets(dir).errors).toContain(
      "tents/generic.json 'generic/dome-2p': id 중복 'generic/dome-2p' (먼저 나온 곳: tents/generic.json 'generic/dome-2p')",
    )
  })

  it('텐트와 물건 사이의 id 중복', () => {
    const dir = copyPresets()
    const path = join(dir, 'items.json')
    const file = readJson<RawItemFile>(path)
    const first = file.items[0]
    if (!first) throw new Error('items.json이 비어 있어요')
    first.id = 'generic/dome-2p'
    writeJson(path, file)
    expect(checkPresets(dir).errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/^items\.json 'generic\/dome-2p': id 중복/)]),
    )
  })

  it('브랜드 파일은 brand가 필수다(있으면 통과)', () => {
    const dir = copyPresets()
    const generic = readJson<RawTentFile>(join(dir, 'tents', 'generic.json'))
    const dome = structuredClone(entry(generic, 'generic/dome-2p'))
    dome.id = 'acme/dome-2p'
    const acmePath = join(dir, 'tents', 'acme.json')

    writeJson(acmePath, { $schema: '../tents.schema.json', presets: [dome] })
    const missing = checkPresets(dir)
    expect(missing.errors.length).toBeGreaterThan(0)
    expect(missing.errors.every((e) => e.startsWith('tents/acme.json'))).toBe(true)

    writeJson(acmePath, { $schema: '../tents.schema.json', presets: [{ ...dome, brand: 'ACME' }] })
    const ok = checkPresets(dir)
    expect(ok.errors).toEqual([])
    expect(ok.tentFiles).toEqual(['acme', 'generic'])
  })

  it('id 앞부분이 파일 slug와 다르면 실패', () => {
    const dir = copyPresets()
    const path = join(dir, 'tents', 'generic.json')
    const file = readJson<RawTentFile>(path)
    entry(file, 'generic/dome-2p').id = 'other/dome-2p'
    writeJson(path, file)
    const { errors } = checkPresets(dir)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.every((e) => e.startsWith('tents/generic.json'))).toBe(true)
  })

  it('템플릿과 어긋난 outer를 함께 적으면 실패', () => {
    const dir = copyPresets()
    const path = join(dir, 'tents', 'generic.json')
    const file = readJson<RawTentFile>(path)
    entry(file, 'generic/dome-2p').tent.outer = { kind: 'rect', w: 210, h: 200 }
    writeJson(path, file)
    const { errors } = checkPresets(dir)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.every((e) => e.startsWith('tents/generic.json'))).toBe(true)
  })

  it('이너가 외곽 밖으로 나가면 실패', () => {
    const dir = copyPresets()
    const path = join(dir, 'tents', 'generic.json')
    const file = readJson<RawTentFile>(path)
    const inner = entry(file, 'generic/dome-2p').tent.inners[0]
    if (!inner) throw new Error('돔 이너 없음')
    inner.y = -100 // 이너 위쪽 끝 -165 < 외곽 -105
    writeJson(path, file)
    expect(checkPresets(dir).errors).toEqual(
      expect.arrayContaining(["tents/generic.json 'generic/dome-2p' tent.inners: 이너 '이너 1'이 외곽 밖으로 나가요"]),
    )
  })

  it('이너끼리 겹치면 실패', () => {
    const dir = copyPresets()
    const path = join(dir, 'tents', 'generic.json')
    const file = readJson<RawTentFile>(path)
    const shell = entry(file, 'generic/living-shell')
    const first = shell.tent.inners[0]
    if (!first) throw new Error('리빙쉘 이너 없음')
    shell.tent.inners.push({ ...structuredClone(first), id: '0b6f3f0e-2a51-4d7c-9c1e-6a3e5b1f2d40', name: '이너 2', x: 100 })
    writeJson(path, file)
    expect(checkPresets(dir).errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/^tents\/generic\.json 'generic\/living-shell' .*\[inner-overlap\]/)]),
    )
  })

  it('자기교차하는 물건 다각형은 실패', () => {
    const dir = copyPresets()
    const path = join(dir, 'items.json')
    const file = readJson<RawItemFile>(path)
    const hex = file.items.find((i) => i.id === 'items/table-hex-80')
    if (!hex) throw new Error('육각 테이블 없음')
    hex.shape = { kind: 'polygon', points: [[0, 0], [50, 50], [50, 0], [0, 50]] }
    writeJson(path, file)
    expect(checkPresets(dir).errors).toEqual(
      expect.arrayContaining(["items.json 'items/table-hex-80' shape: [self-intersect] 다각형이 올바르지 않아요"]),
    )
  })

  it('범위 밖 치수(길이 0)는 스키마 검사에서 실패', () => {
    const dir = copyPresets()
    const path = join(dir, 'items.json')
    const file = readJson<RawItemFile>(path)
    const first = file.items[0]
    if (!first) throw new Error('items.json이 비어 있어요')
    first.shape = { kind: 'rect', w: 0, h: 60 }
    writeJson(path, file)
    const { errors } = checkPresets(dir)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.every((e) => e.startsWith('items.json'))).toBe(true)
  })

  it('필수 파일이 없으면 실패', () => {
    const dir = copyPresets()
    rmSync(join(dir, 'items.json'))
    rmSync(join(dir, 'tents', 'generic.json'))
    expect(checkPresets(dir).errors).toEqual([
      'tents/generic.json: 파일이 없어요(일반 예시용 예약 파일)',
      'items.json: 파일이 없어요',
    ])
  })
})

describe('validate-presets 명령', () => {
  const run = (dir: string) =>
    spawnSync(process.execPath, ['--import', 'tsx', SCRIPT, dir], { cwd: ROOT, encoding: 'utf8' })

  it('정상 데이터면 exit 0', () => {
    const r = run(PRESETS)
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toContain('프리셋 검사 통과')
  }, 30_000)

  it('깨진 임시 파일이 있으면 exit 1과 이유를 출력', () => {
    const dir = copyPresets()
    writeFileSync(join(dir, 'tents', 'broken.json'), '{ "presets": [', 'utf8')
    const r = run(dir)
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('- tents/broken.json: JSON 문법 오류')
    expect(r.stderr).toContain('프리셋 검사 실패: 1건')
  }, 30_000)
})
