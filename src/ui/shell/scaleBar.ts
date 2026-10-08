// 축척 막대(스펙 §4.6 "격자와 축척"). 보통은 0·50·100cm 막대이고, 100cm가 화면에서 너무 짧거나 길면
// 다른 단계로 바꿔 막대 길이를 대략 100px로 맞춥니다. 끝 눈금에만 단위를 붙입니다('100cm').
import { clampZoom } from '../../view/viewport'

export const SCALE_BAR_STEPS_CM = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000] as const
/** 100cm 막대를 그대로 쓰는 화면 길이 범위(px). 64px보다 짧으면 가운데 '50'과 끝 '100cm' 글자가 겹칩니다. */
export const SCALE_BAR_DEFAULT_RANGE_PX = [64, 200] as const
/** 다른 단계를 고를 때 맞추는 막대 길이(px) */
export const SCALE_BAR_TARGET_PX = 100

export type ScaleBar = {
  lengthCm: number
  widthPx: number
  ticks: { px: number; label: string }[]
}

function pickLength(zoom: number): number {
  const [lo, hi] = SCALE_BAR_DEFAULT_RANGE_PX
  if (100 * zoom >= lo && 100 * zoom <= hi) return 100
  let best: number = SCALE_BAR_STEPS_CM[0]
  let bestErr = Infinity
  for (const step of SCALE_BAR_STEPS_CM) {
    const err = Math.abs(Math.log((step * zoom) / SCALE_BAR_TARGET_PX))
    if (err < bestErr) {
      best = step
      bestErr = err
    }
  }
  return best
}

export function scaleBar(zoom: number): ScaleBar {
  const z = clampZoom(zoom)
  const lengthCm = pickLength(z)
  const widthPx = lengthCm * z
  return {
    lengthCm,
    widthPx,
    ticks: [
      { px: 0, label: '0' },
      { px: widthPx / 2, label: String(lengthCm / 2) },
      { px: widthPx, label: `${lengthCm}cm` },
    ],
  }
}
