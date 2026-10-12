// 텐트 고르기 목록(스펙 §4.7-1·§5.4). 프리셋 파일은 tentCatalogData를 동적 import해 별도 청크로 받습니다.
// 빌드 전에 validate-presets가 이미 검사했으므로 여기서 문제가 나오면 데이터가 깨진 것이라 throw합니다.
import type { TentPreset } from '../core/model'
import { parseTentPresetFile } from '../core/presets'

export type TentCatalog = { generic: TentPreset[]; brands: { brand: string; presets: TentPreset[] }[] }

const GENERIC_SLUG = 'generic'
const FILE_NAME = /([^/\\]+)\.json$/

/** '/presets/tents/<slug>.json' → slug. 형식이 다르면 null */
function slugOf(path: string): string | null {
  return FILE_NAME.exec(path)?.[1] ?? null
}

/**
 * 경로 → slug, generic 파일은 일반 예시, 나머지는 brand별(브랜드 이름순, 한국어 정렬).
 * 같은 브랜드 안에서는 파일 이름순·파일 안 순서를 지킵니다. 문제가 있으면(파싱 이슈, 겹치는 id) throw.
 */
export function catalogFromFiles(files: Record<string, unknown>): TentCatalog {
  const generic: TentPreset[] = []
  const byBrand = new Map<string, TentPreset[]>()
  const seen = new Set<string>()
  for (const path of Object.keys(files).sort()) {
    const slug = slugOf(path)
    if (slug === null) throw new Error(`텐트 프리셋 파일 이름을 읽지 못했어요: ${path}`)
    const { presets, issues } = parseTentPresetFile(files[path], slug)
    if (issues.length > 0) throw new Error(`텐트 프리셋을 읽지 못했어요\n${issues.join('\n')}`)
    for (const preset of presets) {
      if (seen.has(preset.id)) throw new Error(`텐트 프리셋 id가 겹쳐요: ${preset.id}`)
      seen.add(preset.id)
      if (slug === GENERIC_SLUG) {
        generic.push(preset)
        continue
      }
      // parseTentPresetFile이 generic이 아닌 파일의 brand를 이미 요구하므로 여기서는 늘 있습니다.
      const brand = preset.brand ?? ''
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
