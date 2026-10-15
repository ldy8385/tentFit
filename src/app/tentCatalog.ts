// 텐트 고르기 목록(스펙 §4.7-1·§5.4). 프리셋 파일은 tentCatalogData를 동적 import해 별도 청크로 받습니다.
// 빌드 전에 validate-presets가 이미 검사했으므로 여기서 문제가 나오면 데이터가 깨진 것이라 throw합니다.
import type { TentPreset } from '../core/model'
import { parseTentPresetFile } from '../core/presets'

export type TentCatalog = { generic: TentPreset[]; brands: { brand: string; presets: TentPreset[] }[] }

/** 경로의 파일 이름('/presets/tents.json' → 'tents.json') */
function fileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/**
 * brand가 있으면 브랜드별(브랜드 이름순, 한국어 정렬), 없으면(시험용 예시) 일반 예시.
 * 같은 브랜드 안에서는 경로순·파일 안 순서를 지킵니다. 문제가 있으면(파싱 이슈, 겹치는 id) throw.
 */
export function catalogFromFiles(files: Record<string, unknown>): TentCatalog {
  const generic: TentPreset[] = []
  const byBrand = new Map<string, TentPreset[]>()
  const seen = new Set<string>()
  for (const path of Object.keys(files).sort()) {
    // brand 필수 검사는 validate-presets가 저장소 파일에만 합니다(시험용 예시는 brand 없음).
    const { presets, issues } = parseTentPresetFile(files[path], { file: fileName(path), requireBrand: false })
    if (issues.length > 0) throw new Error(`텐트 프리셋을 읽지 못했어요\n${issues.join('\n')}`)
    for (const preset of presets) {
      if (seen.has(preset.id)) throw new Error(`텐트 프리셋 id가 겹쳐요: ${preset.id}`)
      seen.add(preset.id)
      const brand = preset.brand
      if (brand === undefined) {
        generic.push(preset)
        continue
      }
      const list = byBrand.get(brand)
      if (list === undefined) byBrand.set(brand, [preset])
      else list.push(preset)
    }
  }
  const brands = [...byBrand.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'ko'))
    .map(([brand, presets]) => ({ brand, presets }))
  return { generic, brands }
}

let pending: Promise<TentCatalog> | null = null

/**
 * 로컬 개발 서버에서 [텐트 프리셋으로 저장]한 프리셋을 이미 불러온 목록에 바로 넣습니다(화면을 새로 고치지 않으므로, 2026-10-15).
 * 같은 id면 바꿉니다. 아직 안 불러왔으면 다음 불러오기가 파일에서 읽습니다.
 */
export function registerTentPreset(preset: TentPreset): void {
  if (pending === null) return
  pending = pending.then((c) => {
    const brand = preset.brand ?? ''
    const others = c.brands.map((b) => ({ brand: b.brand, presets: b.presets.filter((p) => p.id !== preset.id) }))
    const hit = others.find((b) => b.brand === brand)
    if (hit !== undefined) hit.presets.push(preset)
    else others.push({ brand, presets: [preset] })
    others.sort((a, b) => a.brand.localeCompare(b.brand, 'ko'))
    return { generic: c.generic, brands: others.filter((b) => b.presets.length > 0) }
  })
}

/**
 * 고르기 화면·텐트 바꾸기 대화상자가 부릅니다. tentCatalogData를 동적 import해 청크를 나눕니다(§5.4).
 * 같은 Promise를 재사용하고, 실패하면 다음 호출([다시 시도])이 새로 불러오도록 비웁니다.
 */
export function loadTentCatalog(): Promise<TentCatalog> {
  if (pending === null) {
    const next = import('./tentCatalogData').then((m) => catalogFromFiles(m.tentFiles))
    pending = next
    next.catch(() => {
      if (pending === next) pending = null
    })
  }
  return pending
}
