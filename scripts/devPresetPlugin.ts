// 로컬 개발 서버 전용 [프리셋으로 저장] 연결(소유자 요청 2026-10-14). 배포본(vite build)에는 없습니다.
// POST /__tentfit/item-presets { preset } → 검사 뒤 presets/items.json에 넣거나 바꿉니다.
// 이 파일이 바뀌어도 화면을 새로 고치지 않습니다(메모리에만 있는 배치를 잃지 않게). 앱은 저장 결과를 자기 목록에 바로 더합니다.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { ItemPresetFileSchema, ItemPresetSchema } from '../src/core/model'
import { formatItemsFile, upsertItemPreset } from './itemPresetFile'

export const ITEM_PRESET_ENDPOINT = '/__tentfit/item-presets'

export function devPresetPlugin(root: string): Plugin {
  const file = resolve(root, 'presets/items.json')
  return {
    name: 'tentfit-dev-presets',
    apply: 'serve',
    handleHotUpdate(ctx) {
      if (resolve(ctx.file) === file) return []
    },
    configureServer(server) {
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
