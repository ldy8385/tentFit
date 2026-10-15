import { describe, expect, it } from 'vitest'
import { ANCHOR_HIT_PX, ANCHOR_SIZE_PX, ROTATE_ANCHOR_OFFSET_PX, transformerConfig } from './transformerConfig'

describe('transformerConfig(배치 모드 = 이동·회전만, 2026-10-15)', () => {
  it('선택이 없으면 핸들 없음', () => {
    expect(transformerConfig({ count: 0, singleIsCircle: false }, 'mouse')).toMatchObject({ resizeEnabled: false, rotateEnabled: false, enabledAnchors: [] })
  })

  it('1개: 회전 핸들만, 크기 핸들 없음(원은 회전도 없음)', () => {
    expect(transformerConfig({ count: 1, singleIsCircle: false }, 'mouse')).toMatchObject({ resizeEnabled: false, rotateEnabled: true, enabledAnchors: [] })
    expect(transformerConfig({ count: 1, singleIsCircle: true }, 'touch')).toMatchObject({ resizeEnabled: false, rotateEnabled: false })
  })

  it('여러 개: 회전만', () => {
    expect(transformerConfig({ count: 3, singleIsCircle: false }, 'pen')).toMatchObject({ resizeEnabled: false, rotateEnabled: true })
  })

  it('잡는 영역·회전 핸들 거리는 포인터마다', () => {
    const c = transformerConfig({ count: 1, singleIsCircle: false }, 'touch')
    expect(c.anchorSize).toBe(ANCHOR_SIZE_PX)
    expect(c.anchorHitPx).toBe(ANCHOR_HIT_PX.touch)
    expect(c.rotateAnchorOffset).toBe(ROTATE_ANCHOR_OFFSET_PX.touch)
  })
})
