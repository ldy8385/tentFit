import { describe, expect, it } from 'vitest'
import {
  ANCHOR_HIT_PX,
  ANCHOR_SIZE_PX,
  ROTATE_ANCHOR_OFFSET_PX,
  TOUCH_MIN_RESIZE_PX,
  transformerConfig,
} from './transformerConfig'

const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
const ALL8 = [
  'top-left',
  'top-center',
  'top-right',
  'middle-right',
  'middle-left',
  'bottom-left',
  'bottom-center',
  'bottom-right',
]
const one = { count: 1, singleIsCircle: false }
const circle = { count: 1, singleIsCircle: true }

describe('transformerConfig', () => {
  it('핸들 크기는 12px, 잡는 영역은 터치 28px·마우스·펜 24px, 회전 핸들은 잡는 영역 + 4px 위', () => {
    expect(ANCHOR_SIZE_PX).toBe(12)
    expect(ANCHOR_HIT_PX).toEqual({ mouse: 24, pen: 24, touch: 28 })
    expect(ROTATE_ANCHOR_OFFSET_PX).toEqual({ mouse: 28, pen: 28, touch: 32 })
    for (const p of ['mouse', 'pen', 'touch'] as const) {
      const c = transformerConfig(one, p, 200)
      expect(c.anchorSize).toBe(12)
      expect(c.anchorHitPx).toBe(ANCHOR_HIT_PX[p])
      expect(c.rotateAnchorOffset).toBe(ANCHOR_HIT_PX[p] + 4)
    }
  })

  it('선택 0개: 핸들 없음', () => {
    expect(transformerConfig({ count: 0, singleIsCircle: false }, 'mouse', 0)).toMatchObject({
      resizeEnabled: false,
      rotateEnabled: false,
      enabledAnchors: [],
    })
  })

  it('1개·사각형·다각형 + 마우스·펜: 변 중간 포함 8개, 비율 고정 없음, 회전 가능(D31)', () => {
    for (const p of ['mouse', 'pen'] as const) {
      expect(transformerConfig(one, p, 10)).toMatchObject({
        resizeEnabled: true,
        rotateEnabled: true,
        keepRatio: false,
        enabledAnchors: ALL8,
      })
    }
  })

  it('1개·원: 모서리 4개 + 비율 고정, 회전 핸들 없음(마우스·펜·큰 터치)', () => {
    for (const p of ['mouse', 'pen', 'touch'] as const) {
      expect(transformerConfig(circle, p, 200)).toMatchObject({
        resizeEnabled: true,
        rotateEnabled: false,
        keepRatio: true,
        enabledAnchors: CORNERS,
      })
    }
  })

  it('1개 + 터치: 모서리 4개(짧은 변 72px 이상, 경계 포함)', () => {
    expect(TOUCH_MIN_RESIZE_PX).toBe(72)
    expect(transformerConfig(one, 'touch', 72)).toMatchObject({
      resizeEnabled: true,
      rotateEnabled: true,
      keepRatio: false,
      enabledAnchors: CORNERS,
    })
  })

  it('터치이고 짧은 변 72px 미만: 크기 조절 없이 회전만(원이면 핸들 없음)', () => {
    expect(transformerConfig(one, 'touch', 71.9)).toMatchObject({ resizeEnabled: false, rotateEnabled: true, enabledAnchors: [] })
    expect(transformerConfig(one, 'touch', Number.NaN)).toMatchObject({ resizeEnabled: false, rotateEnabled: true })
    expect(transformerConfig(circle, 'touch', 50)).toMatchObject({ resizeEnabled: false, rotateEnabled: false, enabledAnchors: [] })
    // 마우스는 작은 물건도 핸들을 숨기지 않습니다(72px 규칙은 터치 전용).
    expect(transformerConfig(one, 'mouse', 20).resizeEnabled).toBe(true)
  })

  it('2개 이상: 크기 조절 없음, 이동·회전만(D17) — 포인터와 상관없이', () => {
    for (const p of ['mouse', 'pen', 'touch'] as const) {
      expect(transformerConfig({ count: 3, singleIsCircle: false }, p, 500)).toMatchObject({
        resizeEnabled: false,
        rotateEnabled: true,
        keepRatio: false,
        enabledAnchors: [],
      })
    }
  })

  it('돌려준 핸들 배열을 고쳐도 다음 결과에 번지지 않는다', () => {
    const a = transformerConfig(one, 'mouse', 100)
    a.enabledAnchors.pop()
    expect(transformerConfig(one, 'mouse', 100).enabledAnchors).toEqual(ALL8)
  })
})
