// 로컬 개발 서버 전용 [프리셋으로 저장] 연결(소유자 요청 2026-10-14). 배포본(vite build)에는 없습니다.
// POST /__tentfit/item-presets { preset } → 검사 뒤 presets/items.json에 넣거나 바꿉니다.
// POST /__tentfit/tent-presets { entry } → 검사 뒤 presets/tents.json에 넣거나 바꿉니다(같은 id면 바꿈, 2026-10-15 파일 하나로).
// 이 파일이 바뀌어도 화면을 새로 고치지 않습니다(메모리에만 있는 배치를 잃지 않게). 앱은 저장 결과를 자기 목록에 바로 더합니다.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { existsSync } from 'node:fs'
import { ItemPresetFileSchema, ItemPresetSchema, TentFileEntrySchema, type TentFileEntry } from '../src/core/model'
import { parseTentPresetFile } from '../src/core/presets'
import { formatItemsFile, upsertItemPreset } from './itemPresetFile'
import { formatTentFile, upsertTentEntry } from './tentPresetFile'

export const ITEM_PRESET_ENDPOINT = '/__tentfit/item-presets'
export const TENT_PRESET_ENDPOINT = '/__tentfit/tent-presets'

/** POST 본문(JSON)을 읽어 handle에 넘기고, 결과·오류를 JSON으로 답합니다. */
function jsonPost(handle: (body: unknown) => unknown): (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void {
  return (req, res) => {
    const send = (status: number, body: unknown) => {
      res.statusCode = status
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(body))
    }
    if (req.method !== 'POST') return send(405, { error: 'POST만 받아요' })
    let raw = ''
    req.on('data', (c: Buffer) => (raw += c.toString('utf8')))
    req.on('end', () => {
      try {
        send(200, { ok: true, ...(handle(JSON.parse(raw)) as object) })
      } catch (e) {
        send(400, { error: e instanceof Error ? e.message : String(e) })
      }
    })
  }
}

export function devPresetPlugin(root: string): Plugin {
  const file = resolve(root, 'presets/items.json')
  const tentsFile = resolve(root, 'presets/tents.json')
  return {
    name: 'tentfit-dev-presets',
    apply: 'serve',
    handleHotUpdate(ctx) {
      const f = resolve(ctx.file)
      if (f === file || f === tentsFile) return []
    },
    configureServer(server) {
      // POST /__tentfit/tent-presets { entry } → presets/tents.json에 넣거나 바꿈
      server.middlewares.use(
        TENT_PRESET_ENDPOINT,
        jsonPost((body) => {
          const parsed = TentFileEntrySchema.parse((body as { entry?: unknown }).entry) as TentFileEntry
          const current = existsSync(tentsFile) ? ((JSON.parse(readFileSync(tentsFile, 'utf8')) as { presets?: TentFileEntry[] }).presets ?? []) : []
          const text = formatTentFile(upsertTentEntry(current, parsed))
          const { issues } = parseTentPresetFile(JSON.parse(text), { file: 'tents.json', requireBrand: true })
          if (issues.length > 0) throw new Error(issues.join('\n'))
          writeFileSync(tentsFile, text)
          return { id: parsed.id, file: 'presets/tents.json' }
        }),
      )
      server.middlewares.use(ITEM_PRESET_ENDPOINT, (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(body))
        }
        if (req.method !== 'POST') return send(405, { error: 'POST만 받아요' })
        let raw = ''
        req.on('data', (c: Buffer) => (raw += c.toString('utf8')))
        req.on('end', () => {
          try {
            const preset = ItemPresetSchema.parse((JSON.parse(raw) as { preset?: unknown }).preset)
            const current = ItemPresetFileSchema.parse(JSON.parse(readFileSync(file, 'utf8')))
            writeFileSync(file, formatItemsFile(upsertItemPreset(current.items, preset)))
            send(200, { ok: true, id: preset.id })
          } catch (e) {
            send(400, { error: e instanceof Error ? e.message : String(e) })
          }
        })
      })
    },
  }
}
