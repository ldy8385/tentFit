// 오각형(전실형) 예시(소유자 요청 2026-10-15): 사각형 몸통 + 한쪽만 뾰족한 전실, 뾰족한 끝은 늘 가운데.
import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { editDim } from './dimEdit'
import { cornerRing, ringBBox } from './geom'
import { createLayout, ShapeTemplateSchema, type Layout, type ShapeTemplate } from './model'
import { rotateTent } from './ops/tent'
import { attachBBoxToWall, attachSidesFor, defaultOuterTemplate, shapeFromTemplate, templateFromBBox } from './templates'

const P = (dir: 'front' | 'back' | 'left' | 'right'): ShapeTemplate => ({ kind: 'pentagon', w: 500, h: 300, tip: 100, dir })

describe('오각형(전실) 템플릿', () => {
  it('스키마로 읽힘, 기본값은 오른쪽이 뾰족', () => {
    expect(ShapeTemplateSchema.parse(P('right'))).toEqual(P('right'))
    expect(defaultOuterTemplate('pentagon')).toEqual({ kind: 'pentagon', w: 500, h: 300, tip: 100, dir: 'right' })
  })

  it('뾰족한 끝은 그 방향 가운데, 바깥 상자 = 가로×세로, 시계 방향 5점', () => {
    const right = cornerRing(shapeFromTemplate(P('right')))
    expect(right).toEqual([[-250, -150], [150, -150], [250, 0], [150, 150], [-250, 150]])
    const front = cornerRing(shapeFromTemplate(P('front')))
    expect(front).toContainEqual([0, 150])
    expect(front).toContainEqual([250, 50])
    for (const d of ['front', 'back', 'left', 'right'] as const) {
      const ring = cornerRing(shapeFromTemplate(P(d)))
      expect(ring).toHaveLength(5)
      expect(ringBBox(ring)).toEqual({ minX: -250, minY: -150, maxX: 250, maxY: 150 })
    }
  })

  it('붙일 벽 = 뾰족하지 않은 세 벽, 벽 가운데로', () => {
    expect(attachSidesFor(P('right'))).toEqual(['back', 'front', 'left'])
    expect(attachSidesFor(P('front'))).toEqual(['back', 'left', 'right'])
    // 오른쪽이 뾰족: 위 벽은 x −250~150 → 가운데 −50
    const move = attachBBoxToWall(P('right'), { minX: -20, maxX: 20, minY: -10, maxY: 10 }, 'back')
    expect(move).toEqual({ dx: -50, dy: -140 })
  })

  it('비율 유지 = 모든 값 같은 배율, 전실 깊이는 그 방향 길이보다 짧아야', () => {
    const t = P('right')
    const r = editDim({ shape: shapeFromTemplate(t), template: t }, { kind: 'w' }, 250, true)
    expect(r.ok && r.spec.template).toEqual({ kind: 'pentagon', w: 250, h: 150, tip: 50, dir: 'right' })
    const bad = editDim({ shape: shapeFromTemplate(t), template: t }, { kind: 'w' }, 90, false)
    expect(bad).toEqual({ ok: false, reason: 'pentagon-tip' })
  })

  it('90° 돌리면 방향만 바뀌고 가로·세로가 바뀜(템플릿 유지)', () => {
    const l: Layout = createLayout({ name: 't', outer: shapeFromTemplate(P('right')), outerTemplate: P('right'), inners: [] }, { name: 'l', id: 'L', now: '2026-10-15T00:00:00.000Z' })
    const next = produce(l, (d) => rotateTent(d, 90))
    expect(next.tent.outerTemplate).toEqual({ kind: 'pentagon', w: 300, h: 500, tip: 100, dir: 'front' })
    expect(produce(l, (d) => rotateTent(d, 270)).tent.outerTemplate).toMatchObject({ dir: 'back' })
    expect(produce(l, (d) => rotateTent(d, 180)).tent.outerTemplate).toMatchObject({ dir: 'left', w: 500 })
  })

  it('모양 바꾸기(가로×세로 이어받기)', () => {
    expect(templateFromBBox('pentagon', 600, 300)).toEqual({ kind: 'pentagon', w: 600, h: 300, tip: 120, dir: 'right' })
  })
})
