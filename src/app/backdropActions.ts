// 배경 이미지 동작(소유자 요청 2026-10-14: "이미지만 레이어처럼 깔아주면 돼", 투명도 조절, 편집하는 동안만).
// 화면 상태(ui.backdrop)만 바꾸고 문서·실행 취소 기록은 건드리지 않습니다. 이미지 주소(object URL)는 빼거나 바꿀 때 돌려줍니다.
import { LIMITS, type Pt } from '../core/model'
import type { Backdrop } from '../store/ui'
import { viewCenterWorld } from '../view/viewport'
import type { Stores } from './stores'

/** 처음 투명도 */
export const BACKDROP_DEFAULT_OPACITY = 0.5
/** 처음 크기: 보이는 영역의 이 비율 안에 들게 */
const FIT_RATIO = 0.8
const [W_MIN, W_MAX] = LIMITS.length

function clampW(w: number): number {
  return Math.min(W_MAX, Math.max(W_MIN, w))
}

function update(stores: Stores, fn: (b: Backdrop) => Backdrop): void {
  const cur = stores.ui.getState().backdrop
  if (cur !== null) stores.ui.getState().setBackdrop(fn(cur))
}

function revoke(url: string): void {
  if (url.startsWith('blob:')) URL.revokeObjectURL(url)
}

/**
 * 이미지를 깝니다(있던 이미지는 바꿈). 가운데 = 보이는 영역 가운데, 크기 = 보이는 영역의 80% 안(가로세로 비율 유지).
 * aspect = 세로/가로(이미지 원래 크기). 바꾸는 경우 투명도는 이어받습니다.
 */
export function placeBackdrop(stores: Stores, url: string, aspect: number): void {
  const ui = stores.ui.getState()
  const prev = ui.backdrop
  const { view, size, insets } = ui
  const center: Pt = viewCenterWorld(view, size, insets)
  const visW = size.width / view.zoom
  const visH = Math.max(1, size.height - insets.top - insets.bottom) / view.zoom
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
  const w = clampW(Math.min(visW * FIT_RATIO, (visH * FIT_RATIO) / a))
  if (prev !== null && prev.url !== url) revoke(prev.url)
  ui.setBackdrop({ url, x: center[0], y: center[1], w, aspect: a, opacity: prev?.opacity ?? BACKDROP_DEFAULT_OPACITY, adjusting: false })
}

/** 이미지를 뺍니다. */
export function removeBackdrop(stores: Stores): void {
  const cur = stores.ui.getState().backdrop
  if (cur === null) return
  revoke(cur.url)
  stores.ui.getState().setBackdrop(null)
}

/** 투명도(0.05~1) */
export function setBackdropOpacity(stores: Stores, opacity: number): void {
  if (!Number.isFinite(opacity)) return
  const o = Math.min(1, Math.max(0.05, opacity))
  update(stores, (b) => (b.opacity === o ? b : { ...b, opacity: o }))
}

/** 가로 크기(cm, 가운데 그대로) */
export function setBackdropWidth(stores: Stores, w: number): void {
  if (!Number.isFinite(w)) return
  const next = clampW(w)
  update(stores, (b) => (b.w === next ? b : { ...b, w: next }))
}

/** 맞추기 켜기·끄기 */
export function setBackdropAdjusting(stores: Stores, on: boolean): void {
  update(stores, (b) => (b.adjusting === on ? b : { ...b, adjusting: on }))
}

/** 맞추기: 월드 cm만큼 옮김 */
export function moveBackdrop(stores: Stores, dx: number, dy: number): void {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return
  update(stores, (b) => ({ ...b, x: b.x + dx, y: b.y + dy }))
}

/** 맞추기: at(월드)을 고정점으로 factor배(가로 1~5000cm 안에서) */
export function scaleBackdropAt(stores: Stores, factor: number, at: Pt): void {
  if (!Number.isFinite(factor) || factor <= 0) return
  update(stores, (b) => {
    const w = clampW(b.w * factor)
    const k = w / b.w
    if (k === 1) return b
    return { ...b, w, x: at[0] + (b.x - at[0]) * k, y: at[1] + (b.y - at[1]) * k }
  })
}

/** 파일을 읽어 깝니다(이미지가 아니거나 읽지 못하면 토스트). */
export function placeBackdropFile(stores: Stores, file: File): void {
  if (!file.type.startsWith('image/')) {
    stores.ui.getState().showToast('이미지 파일을 골라 주세요')
    return
  }
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.onload = () => placeBackdrop(stores, url, img.naturalWidth > 0 ? img.naturalHeight / img.naturalWidth : 1)
  img.onerror = () => {
    revoke(url)
    stores.ui.getState().showToast('이미지를 읽지 못했어요')
  }
  img.src = url
}
