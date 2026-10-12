import { describe, expect, it } from 'vitest'
import type { Shape, Tent } from '../../core/model'
import { shapeFromTemplate } from '../../core/templates'
import {
  applyTemplateField,
  editableTemplate,
  parsePolygonFieldId,
  parseTargetKey,
  parseVertexFieldId,
  polygonFieldId,
  samePoint,
  setSquare,
  shapeKindLabel,
  shapeSummary,
  switchNgonSizeBy,
  targetKey,
  targetName,
  targetShape,
  vertexFieldId,
} from './tentEditorModel'

const TENT: Tent = {
  name: '시험 텐트',
  outer: { kind: 'rect', w: 620, h: 320 },
  outerTemplate: { kind: 'rect', w: 620, h: 320 },
  inners: [
    {
      id: 'i1',
      name: '이너 1',
      shape: { kind: 'rect', w: 220, h: 300 },
      template: { kind: 'rect', w: 220, h: 300 },
      x: -200,
      y: 0,
      rotation: 0,
    },
  ],
}

describe('대상 키', () => {
  it('없음·외곽·이너를 문자열로 바꾸고 되돌린다', () => {
    expect(targetKey(null)).toBe('')
    expect(targetKey('outer')).toBe('outer')
    expect(targetKey({ innerId: 'i1' })).toBe('inner:i1')
    expect(parseTargetKey('outer')).toBe('outer')
    expect(parseTargetKey('inner:i1')).toEqual({ innerId: 'i1' })
    expect(parseTargetKey('')).toBeNull()
    expect(parseTargetKey('inner:')).toBeNull()
    expect(parseTargetKey('x')).toBeNull()
  })

  it('꼭짓점 입력칸 id는 대상 키와 번호', () => {
    expect(vertexFieldId({ innerId: 'i1' }, 2)).toBe('inner:i1#2')
    expect(parseVertexFieldId('inner:i1#2')).toEqual({ target: { innerId: 'i1' }, index: 2 })
    expect(parseVertexFieldId('outer#0')).toEqual({ target: 'outer', index: 0 })
    expect(parseVertexFieldId('outer')).toBeNull()
    expect(parseVertexFieldId('outer#-1')).toBeNull()
    expect(parseVertexFieldId('outer#1.5')).toBeNull()
  })
})

describe('이름·도형', () => {
  it('외곽은 「외곽」, 이너는 그 이름, 없는 이너는 null', () => {
    expect(targetName(TENT, 'outer')).toBe('외곽')
    expect(targetName(TENT, { innerId: 'i1' })).toBe('이너 1')
    expect(targetName(TENT, { innerId: 'gone' })).toBeNull()
    expect(targetShape(TENT, { innerId: 'gone' })).toBeNull()
    expect(targetShape(TENT, { innerId: 'i1' })?.shape).toEqual({ kind: 'rect', w: 220, h: 300 })
  })

  it('모양 요약: 사각형·원·사다리꼴·정N각형·자유 다각형', () => {
    expect(shapeSummary(TENT.outer, TENT.outerTemplate)).toBe('사각형 · 620 × 320 cm')
    expect(shapeSummary({ kind: 'circle', d: 400 }, undefined)).toBe('원 · 지름 400 cm')
    const trap = { kind: 'trapezoid', front: 300, back: 200, depth: 250, offset: 0 } as const
    expect(shapeSummary(shapeFromTemplate(trap), trap)).toBe('사다리꼴 · 300 × 250 cm')
    const ngon = { kind: 'ngon', n: 6, sizeBy: 'diameter', size: 400 } as const
    expect(shapeKindLabel(shapeFromTemplate(ngon), ngon)).toBe('정6각형')
    const poly: Shape = { kind: 'polygon', points: [[0, 0], [100, 0], [0, 50]] }
    expect(shapeSummary(poly, undefined)).toBe('자유 다각형 · 100 × 50 cm')
  })

  it('편집할 템플릿: 템플릿이 있으면 그것, 템플릿 없는 사각형·원은 같은 치수, 자유 다각형은 null', () => {
    expect(editableTemplate(TENT.outer, TENT.outerTemplate)).toBe(TENT.outerTemplate)
    expect(editableTemplate({ kind: 'rect', w: 90, h: 60 }, undefined)).toEqual({ kind: 'rect', w: 90, h: 60 })
    expect(editableTemplate({ kind: 'circle', d: 300 }, undefined)).toEqual({ kind: 'circle', d: 300 })
    expect(editableTemplate({ kind: 'polygon', points: [[0, 0], [10, 0], [0, 10]] }, undefined)).toBeNull()
  })
})

describe('템플릿 칸 반영', () => {
  it('사각형 가로·세로, 정사각형이면 둘을 같이', () => {
    expect(applyTemplateField({ kind: 'rect', w: 620, h: 320 }, 'w', 600)).toEqual({ kind: 'rect', w: 600, h: 320 })
    expect(applyTemplateField({ kind: 'rect', w: 210, h: 210, square: true }, 'w', 250)).toEqual({
      kind: 'rect',
      w: 250,
      h: 250,
      square: true,
    })
  })

  it('사다리꼴 4칸, 정N각형 n·크기, 원 지름. 없는 칸은 그대로', () => {
    const trap = { kind: 'trapezoid', front: 300, back: 200, depth: 250, offset: 0 } as const
    expect(applyTemplateField(trap, 'offset', -30)).toEqual({ ...trap, offset: -30 })
    expect(applyTemplateField(trap, 'w', 1)).toBe(trap)
    const ngon = { kind: 'ngon', n: 6, sizeBy: 'diameter', size: 400 } as const
    expect(applyTemplateField(ngon, 'n', 8)).toEqual({ ...ngon, n: 8 })
    expect(applyTemplateField({ kind: 'circle', d: 400 }, 'd', 350)).toEqual({ kind: 'circle', d: 350 })
  })

  it('정사각형 켜면 세로를 가로에 맞추고, 끄면 치수 그대로', () => {
    expect(setSquare({ kind: 'rect', w: 300, h: 200 }, true)).toEqual({ kind: 'rect', w: 300, h: 300, square: true })
    expect(setSquare({ kind: 'rect', w: 300, h: 300, square: true }, false)).toEqual({
      kind: 'rect',
      w: 300,
      h: 300,
      square: false,
    })
  })

  it('정N각형 크기 기준을 바꾸면 같은 도형이 되게 환산한다(정6각형 지름 400 = 한 변 200)', () => {
    const d = { kind: 'ngon', n: 6, sizeBy: 'diameter', size: 400 } as const
    const s = switchNgonSizeBy(d, 'side')
    expect(s).toEqual({ kind: 'ngon', n: 6, sizeBy: 'side', size: 200 })
    expect(switchNgonSizeBy(s, 'diameter')).toEqual(d)
    expect(switchNgonSizeBy(d, 'diameter')).toBe(d)
  })

  it('같은 점 판정은 0.05cm 안', () => {
    expect(samePoint([10, 20], [10.04, 19.96])).toBe(true)
    expect(samePoint([10, 20], [10.1, 20])).toBe(false)
  })
})

describe('polygonFieldId(Plan 4.1)', () => {
  it('변·각도는 번호, 가로·세로는 번호 없이, 역함수로 되살린다', () => {
    expect(polygonFieldId('outer', 'e', 2)).toBe('outer@e2')
    expect(polygonFieldId({ innerId: 'a#b' }, 'a', 1)).toBe('inner:a#b@a1')
    expect(polygonFieldId('outer', 'w')).toBe('outer@w')
    expect(parsePolygonFieldId('outer@e2')).toEqual({ target: 'outer', kind: 'e', index: 2 })
    expect(parsePolygonFieldId('inner:x@h')).toEqual({ target: { innerId: 'x' }, kind: 'h', index: 0 })
    expect(parsePolygonFieldId('outer@e')).toBeNull()
    expect(parsePolygonFieldId('outer@z1')).toBeNull()
    expect(parsePolygonFieldId('outer#1')).toBeNull()
  })
})
