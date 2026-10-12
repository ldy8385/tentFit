// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Inner, Pt, ShapeTemplate, Tent } from '../../core/model'
import { shapeFromTemplate } from '../../core/templates'
import { TentPreview, innerSizeText, previewBBox, previewFit } from './TentPreview'

function rectInner(id: string, name: string, x: number, y: number, w: number, h: number): Inner {
  return { id, name, x, y, rotation: 0, shape: { kind: 'rect', w, h }, template: { kind: 'rect', w, h } }
}

function tentOf(template: ShapeTemplate, inners: Inner[] = []): Tent {
  return { name: '내 텐트', outer: shapeFromTemplate(template), outerTemplate: template, inners }
}

const RECT: ShapeTemplate = { kind: 'rect', w: 400, h: 300 }

describe('previewFit·previewBBox', () => {
  it('bbox를 여백 안에 가운데 맞춘다', () => {
    const fit = previewFit({ minX: -200, minY: -150, maxX: 200, maxY: 150 }, { width: 400, height: 300 }, 24)
    expect(fit.scale).toBeCloseTo(0.84, 6)
    expect(fit.ox).toBe(200)
    expect(fit.oy).toBe(150)
  })

  it('넓이가 0인 bbox에서도 NaN이 없다', () => {
    const fit = previewFit({ minX: 0, minY: 0, maxX: 0, maxY: 0 }, { width: 100, height: 100 }, 10)
    expect(Number.isFinite(fit.scale)).toBe(true)
  })

  it('맞춤 범위에 외곽 밖으로 나간 이너도 들어간다', () => {
    const b = previewBBox(tentOf(RECT, [rectInner('i1', '이너 1', 250, 0, 200, 100)]))
    expect(b).toEqual({ minX: -200, minY: -150, maxX: 350, maxY: 150 })
  })

  it('원 외곽은 정확한 지름으로 잡는다', () => {
    expect(previewBBox(tentOf({ kind: 'circle', d: 400 }))).toEqual({ minX: -200, minY: -200, maxX: 200, maxY: 200 })
  })
})

describe('innerSizeText', () => {
  it('사각형 템플릿·원·다각형', () => {
    expect(innerSizeText(rectInner('i', '이너 1', 0, 0, 300, 220))).toBe('300×220')
    expect(innerSizeText({ id: 'c', name: '원', x: 0, y: 0, rotation: 0, shape: { kind: 'circle', d: 120 } })).toBe('지름 120')
    const tri: Pt[] = [
      [0, 0],
      [100, 0],
      [0, 50],
    ]
    expect(innerSizeText({ id: 'p', name: '삼각', x: 0, y: 0, rotation: 0, shape: { kind: 'polygon', points: tri } })).toBe('100×50')
  })
})

describe('TentPreview', () => {
  it('외곽·이너·라벨(이너 치수, 전실 넓이)과 격자를 그린다', () => {
    const tent = tentOf(RECT, [rectInner('i1', '이너 1', 0, -60, 180, 180)])
    const { container } = render(<TentPreview tent={tent} template={RECT} />)
    expect(screen.getByRole('img', { name: '내 텐트 미리보기' })).toBeTruthy()
    expect(container.querySelectorAll('polygon.tf-tp__outer')).toHaveLength(1)
    expect(container.querySelectorAll('.tf-tp__inner')).toHaveLength(1)
    expect(screen.getByText('이너 1 · 180×180')).toBeTruthy()
    // 400×300 − 180×180 = 87,600cm² → 8.8m²
    expect(screen.getByText('전실 1 · 8.8m²')).toBeTruthy()
    expect(container.querySelectorAll('.tf-tp__grid--strong').length).toBeGreaterThan(0)
  })

  it('이탈 이너에는 경고 표시(빨간 실선 클래스 + 빗금)가 붙고, 안쪽 이너에는 없다', () => {
    const tent = tentOf(RECT, [rectInner('in', '이너 1', 0, -60, 180, 180), rectInner('out', '이너 2', 260, 0, 200, 100)])
    const { container } = render(<TentPreview tent={tent} template={RECT} />)
    const outGroup = container.querySelector('[data-inner-id="out"]')
    const inGroup = container.querySelector('[data-inner-id="in"]')
    expect(outGroup?.querySelector('.tf-tp__inner--escape')).not.toBeNull()
    expect(outGroup?.querySelector('.tf-tp__hatch')?.getAttribute('fill')).toMatch(/^url\(#tf-tp-hatch-[A-Za-z0-9_-]+\)$/)
    expect(inGroup?.querySelector('.tf-tp__inner--escape')).toBeNull()
    expect(inGroup?.querySelector('.tf-tp__hatch')).toBeNull()
  })

  it('템플릿 모양이면 꼭짓점 점을 그리지 않는다', () => {
    const { container } = render(<TentPreview tent={tentOf(RECT)} template={RECT} />)
    expect(container.querySelectorAll('.tf-tp__vertex')).toHaveLength(0)
  })

  it('자유 모양(template null)이면 꼭짓점 수만큼 점, 고른 꼭짓점은 채움', () => {
    const points: Pt[] = [
      [-200, -150],
      [200, -150],
      [250, 0],
      [200, 150],
      [-200, 150],
    ]
    const tent: Tent = { name: '자유', outer: { kind: 'polygon', points }, inners: [] }
    const { container } = render(<TentPreview tent={tent} template={null} selectedVertex={2} />)
    expect(container.querySelectorAll('.tf-tp__vertex')).toHaveLength(5)
    expect(container.querySelectorAll('.tf-tp__vertex--selected')).toHaveLength(1)
  })

  it('사다리꼴이면 앞변·뒷변 길이와 깊이 수직 치수선', () => {
    const t: ShapeTemplate = { kind: 'trapezoid', front: 520, back: 620, depth: 320, offset: 0 }
    const { container } = render(<TentPreview tent={tentOf(t)} template={t} />)
    expect(screen.getByText('깊이 320cm')).toBeTruthy()
    expect(screen.getByText('뒷변 620cm')).toBeTruthy()
    expect(screen.getByText('앞변 520cm')).toBeTruthy()
    const lines = [...container.querySelectorAll('.tf-tp__dim-line')]
    const vertical = lines.filter((l) => l.getAttribute('x1') === l.getAttribute('x2'))
    expect(vertical).toHaveLength(1)
  })

  it('원 외곽은 실제 원으로 그린다', () => {
    const t: ShapeTemplate = { kind: 'circle', d: 400 }
    const { container } = render(<TentPreview tent={tentOf(t)} template={t} />)
    expect(container.querySelector('circle.tf-tp__outer')).not.toBeNull()
    expect(container.querySelectorAll('.tf-tp__vertex')).toHaveLength(0)
  })

  it('이너가 없으면 바닥 조각 라벨', () => {
    render(<TentPreview tent={tentOf(RECT)} template={RECT} />)
    expect(screen.getByText('바닥 1 · 12.0m²')).toBeTruthy()
  })
})
