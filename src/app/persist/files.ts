// 백업 파일 내려받기·불러오기(스펙 §9.4·§9.5 중 핵심). 공유 시트(navigator.share)와 홈 화면 앱 처리는 아직 없습니다.
import type { Stores } from '../stores'
import { buildBackup, importBackup } from './storage'

function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

/** 전체 백업 JSON을 내려받습니다(tentfit-backup-YYYYMMDD.json). */
export function downloadBackup(now: Date = new Date()): void {
  const blob = new Blob([JSON.stringify(buildBackup(now.toISOString()), null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `tentfit-backup-${ymd(now)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** 파일을 골라 불러옵니다. 결과를 토스트로 알립니다. */
export function pickAndImport(stores: Stores): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,application/json,text/plain'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (file === undefined) return
    let raw: unknown
    try {
      raw = JSON.parse(await file.text())
    } catch {
      stores.ui.getState().showToast('JSON 파일이 아니에요')
      return
    }
    const r = await importBackup(raw)
    stores.ui.getState().showToast(r.ok ? `불러왔어요: 배치 ${r.layouts}개 · 내 텐트 ${r.myTents}개(「내 배치」에서 열어요)` : `불러오지 못했어요: ${r.error}`)
  }
  input.click()
}
