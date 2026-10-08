import { describe, expect, it } from 'vitest'
import {
  ANCHOR_HIT_PX,
  ANCHOR_SIZE_PX,
  POINTER_MIN_EDGE_ANCHOR_PX,
  POINTER_MIN_RESIZE_PX,
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
const sq = (n: number) => ({ w: n, h: n })

describe('transformerConfig', () => {
  it('핸들 크기는 12px, 잡는 영역은 터치 28px·마우스·펜 24px, 회전 핸들은 잡는 영역 + 4px 위', () => {
    expect(ANCHOR_SIZE_PX).toBe(12)
    expect(ANCHOR_HIT_PX).toEqual({ mouse: 24, pen: 24, touch: 28 })
    expect(ROTATE_ANCHOR_OFFSET_PX).toEqual({ mouse: 28, pen: 28, touch: 32 })
    for (const p of ['mouse', 'pen', 'touch'] as const) {
      const c = transformerConfig(one, p, sq(200))
      expect(c.anchorSize).toBe(12)
      expect(c.anchorHitPx).toBe(ANCHOR_HIT_PX[p])
      expect(c.rotateAnchorOffset).toBe(ANCHOR_HIT_PX[p] + 4)
    }
  })

  it('선택 0개: 핸들 없음', () => {
    expect(transformerConfig({ count: 0, singleIsCircle: false }, 'mouse', sq(0))).toMatchObject({
      resizeEnabled: false,
      rotateEnabled: false,
      enabledAnchors: [],
    })
  })

  it('1개·사각형·다각형 + 마우스·펜: 변 중간 포함 8개, 비율 고정 없음, 회전 가능(D31)', () => {
    for (const p of ['mouse', 'pen'] as const) {
      expect(transformerConfig(one, p, sq(POINTER_MIN_EDGE_ANCHOR_PX))).toMatchObject({
        resizeEnabled: true,
        rotateEnabled: true,
        keepRatio: false,
        enabledAnchors: ALL8,
      })
    }
  })

  it('재검증 회귀: 마우스·펜은 변 중간 핸들을 축별로 판정해, 낮고 긴 물건도 길이만 바꿀 수 있다(D31)', () => {
    expect(POINTER_MIN_EDGE_ANCHOR_PX).toBe(2 * ANCHOR_HIT_PX.mouse)
    const edge = POINTER_MIN_EDGE_ANCHOR_PX
    for (const p of ['mouse', 'pen'] as const) {
      // 조금 축소한 매트(210×63px): 8개 그대로
      expect(transformerConfig(one, p, { w: 210, h: 63 }).enabledAnchors).toEqual(ALL8)
      // 맞춤 보기의 벤치(154×45px): 위·아래 핸들만 숨기고 좌·우는 남김
      expect(transformerConfig(one, p, { w: 154, h: edge - 0.1 }).enabledAnchors).toEqual([
        'top-left',
        'top-right',
        'middle-right',
        'middle-left',
        'bottom-left',
        'bottom-right',
      ])
      // 세워 둔 물건: 좌·우만 숨김
      expect(transformerConfig(one, p, { w: edge - 0.1, h: 154 }).enabledAnchors).toEqual([
        'top-left',
        'top-center',
        'top-right',
        'bottom-left',
        'bottom-center',
        'bottom-right',
      ])
      // 두 축 다 좁으면 모서리 4개
      expect(transformerConfig(one, p, sq(edge - 0.1))).toMatchObject({ resizeEnabled: true, enabledAnchors: CORNERS })
      expect(transformerConfig(circle, p, sq(POINTER_MIN_RESIZE_PX))).toMatchObject({
        resizeEnabled: true,
        keepRatio: true,
        enabledAnchors: CORNERS,
      })
    }
  })

  it('리뷰 회귀: 마우스·펜이고 짧은 변이 잡는 영역의 1.5배 미만이면 크기 조절 없이 회전만(원이면 핸들 없음)', () => {
    expect(POINTER_MIN_RESIZE_PX).toBe(1.5 * ANCHOR_HIT_PX.mouse)
    for (const p of ['mouse', 'pen'] as const) {
      // 축소한 수납 박스(29×20px)·원형 스툴(지름 20px)
      expect(transformerConfig(one, p, { w: 29, h: 20 })).toMatchObject({ resizeEnabled: false, rotateEnabled: true, enabledAnchors: [] })
      expect(transformerConfig(one, p, { w: 200, h: Number.NaN })).toMatchObject({ resizeEnabled: false, rotateEnabled: true })
      expect(transformerConfig(circle, p, sq(20))).toMatchObject({ resizeEnabled: false, rotateEnabled: false, enabledAnchors: [] })
    }
  })

  it('1개·원: 모서리 4개 + 비율 고정, 회전 핸들 없음(마우스·펜·큰 터치)', () => {
    for (const p of ['mouse', 'pen', 'touch'] as const) {
      expect(transformerConfig(circle, p, sq(200))).toMatchObject({
        resizeEnabled: true,
        rotateEnabled: false,
        keepRatio: true,
        enabledAnchors: CORNERS,
      })
    }
  })

  it('1개 + 터치: 모서리 4개(짧은 변 72px 이상, 경계 포함)', () => {
    expect(TOUCH_MIN_RESIZE_PX).toBe(72)
    expect(transformerConfig(one, 'touch', sq(72))).toMatchObject({
      resizeEnabled: true,
      rotateEnabled: true,
      keepRatio: false,
      enabledAnchors: CORNERS,
    })
  })

  it('터치이고 짧은 변 72px 미만: 크기 조절 없이 회전만(원이면 핸들 없음)', () => {
    expect(transformerConfig(one, 'touch', { w: 200, h: 71.9 })).toMatchObject({ resizeEnabled: false, rotateEnabled: true, enabledAnchors: [] })
    expect(transformerConfig(one, 'touch', sq(Number.NaN))).toMatchObject({ resizeEnabled: false, rotateEnabled: true })
    expect(transformerConfig(circle, 'touch', sq(50))).toMatchObject({ resizeEnabled: false, rotateEnabled: false, enabledAnchors: [] })
    // 마우스·펜은 36px까지 크기 조절을 남깁니다(터치는 72px).
    expect(transformerConfig(one, 'mouse', sq(50)).resizeEnabled).toBe(true)
  })

  it('2개 이상: 크기 조절 없음, 이동·회전만(D17) — 포인터와 상관없이', () => {
    for (const p of ['mouse', 'pen', 'touch'] as const) {
      expect(transformerConfig({ count: 3, singleIsCircle: false }, p, sq(500))).toMatchObject({
        resizeEnabled: false,
        rotateEnabled: true,
        keepRatio: false,
        enabledAnchors: [],
      })
    }
  })

  it('돌려준 핸들 배열을 고쳐도 다음 결과에 번지지 않는다', () => {
    const a = transformerConfig(one, 'mouse', sq(100))
    a.enabledAnchors.pop()
    expect(transformerConfig(one, 'mouse', sq(100)).enabledAnchors).toEqual(ALL8)
  })
})
