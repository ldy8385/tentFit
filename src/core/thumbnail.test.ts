import { describe, expect, it } from 'vitest'
import type { ColorKey, Inner, Item, Shape, Tent } from './model'
import { THUMB_COLORS, thumbnailSvg } from './thumbnail'

function tent(outer: Shape, inners: Inner[] = [], name = '테스트 텐트'): Tent {
  return { name, outer, inners }
}

function inner(shape: Shape, x: number, y: number, rotation = 0, id = 'in-1'): Inner {
  return { id, name: '이너 1', shape, x, y, rotation }
}

function item(over: Partial<Item> & Pick<Item, 'shape'>): Item {
  return {
    id: 'it-1',
    name: '물건',
    x: 0,
    y: 0,
    rotation: 0,
    color: 'green',
    category: 'MAT',
    countsArea: true,
    ...over,
  }
}

/** class가 cls인 polygon마다 꼭짓점 문자열을 정렬·중복 제거해 돌려줍니다(시작점·방향과 무관하게 비교). */
function polygonPoints(svg: string, cls: string): string[][] {
  const re = new RegExp(`<polygon class="${cls}" points="([^"]*)"`, 'g')
  return [...svg.matchAll(re)].map((m) => [...new Set((m[1] ?? '').split(' '))].sort())
}

const RECT_OUTER: Shape = { kind: 'rect', w: 600, h: 300 }

describe('thumbnailSvg', () => {
  it('<svg로 시작해 </svg>로 끝나고 NaN이 없다', () => {
    const svg = thumbnailSvg({
      tent: tent(RECT_OUTER, [inner({ kind: 'rect', w: 300, h: 300 }, 150, 0)]),
      items: [
        item({ shape: { kind: 'rect', w: 200, h: 60 }, rotation: 33 }),
        item({ id: 'it-2', shape: { kind: 'circle', d: 40 }, x: -200, y: 50 }),
        item({ id: 'it-3', shape: { kind: 'polygon', points: [[0, -30], [30, 30], [-30, 30]] }, x: 100, y: 0, rotation: 45 }),
      ],
    })
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.endsWith('</svg>')).toBe(true)
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg).not.toContain('NaN')
    expect(svg).not.toContain('Infinity')
    expect(svg).not.toContain('undefined')
  })

  it('원 외곽은 <circle로 그리고 viewBox는 외곽 bbox에 5% 여백을 더한다', () => {
    const svg = thumbnailSvg({ tent: tent({ kind: 'circle', d: 400 }) })
    expect(svg).toContain('<circle class="tf-outer" cx="0" cy="0" r="200"')
    expect(svg).not.toContain('<polygon class="tf-outer"')
    // bbox -200..200, 여백 = 0.05 × 400 = 20
    expect(svg).toContain('viewBox="-220 -220 440 440"')
  })

  it('사각형 외곽 600×300은 polygon이고 viewBox는 -330 -180 660 360', () => {
    const svg = thumbnailSvg({ tent: tent(RECT_OUTER) })
    // 여백은 긴 변 기준: 0.05 × 600 = 30
    expect(svg).toContain('viewBox="-330 -180 660 360"')
    expect(polygonPoints(svg, 'tf-outer')).toEqual([['-300,-150', '-300,150', '300,-150', '300,150']])
  })

  it('사각형 이너는 월드 좌표의 <polygon으로 그린다', () => {
    const svg = thumbnailSvg({ tent: tent({ kind: 'circle', d: 400 }, [inner({ kind: 'rect', w: 260, h: 150 }, 0, -50)]) })
    expect(svg).toContain('<polygon class="tf-inner"')
    expect(svg).not.toContain('<circle class="tf-inner"')
    // x: ±130, y: -50 ± 75
    expect(polygonPoints(svg, 'tf-inner')).toEqual([['-130,-125', '-130,25', '130,-125', '130,25']])
  })

  it('원 이너는 <circle로 그린다', () => {
    const svg = thumbnailSvg({ tent: tent(RECT_OUTER, [inner({ kind: 'circle', d: 120 }, -100, 20)]) })
    expect(svg).toContain('<circle class="tf-inner" cx="-100" cy="20" r="60"')
  })

  it('회전한 물건은 회전된 꼭짓점으로 그린다', () => {
    const svg = thumbnailSvg({
      tent: tent(RECT_OUTER),
      items: [item({ shape: { kind: 'rect', w: 200, h: 60 }, x: 10, y: 20, rotation: 90 })],
    })
    // 90° 회전하면 가로 60 × 세로 200: x 10±30, y 20±100
    expect(polygonPoints(svg, 'tf-item')).toEqual([['-20,-80', '-20,120', '40,-80', '40,120']])
  })

  it('원 물건은 <circle로 그리고 좌표는 0.1cm로 반올림하며 -0을 쓰지 않는다', () => {
    const svg = thumbnailSvg({
      tent: tent(RECT_OUTER),
      items: [
        item({ shape: { kind: 'circle', d: 35 }, x: 100, y: 50 }),
        item({ id: 'it-2', shape: { kind: 'circle', d: 45 }, x: -0.04, y: 12.345 }),
      ],
    })
    expect(svg).toContain('<circle class="tf-item" cx="100" cy="50" r="17.5"')
    expect(svg).toContain('<circle class="tf-item" cx="0" cy="12.3" r="22.5"')
    expect(svg).not.toContain('"-0"')
  })

  it('size를 width·height에 반영하고, 없거나 잘못되면 160', () => {
    const t = tent(RECT_OUTER)
    expect(thumbnailSvg({ tent: t })).toContain('width="160" height="160"')
    expect(thumbnailSvg({ tent: t }, { size: 240 })).toContain('width="240" height="240"')
    expect(thumbnailSvg({ tent: t }, { size: 0 })).toContain('width="160" height="160"')
    expect(thumbnailSvg({ tent: t }, { size: Number.NaN })).toContain('width="160" height="160"')
  })

  it('THUMB_COLORS는 색 키 8개 모두 시안 obj-<키> HEX 값을 가진다 (OD-2)', () => {
    const keys: ColorKey[] = ['blue', 'teal', 'green', 'purple', 'pink', 'gray', 'sky', 'brown']
    expect(Object.keys(THUMB_COLORS).sort()).toEqual([...keys].sort())
    for (const k of keys) expect(THUMB_COLORS[k]).toMatch(/^#[0-9A-F]{6}$/)
    expect(THUMB_COLORS).toEqual({
      blue: '#4A7FD0',
      teal: '#159C92',
      green: '#6F9636',
      purple: '#8A6AD4',
      pink: '#C2559E',
      gray: '#5B7386',
      sky: '#2BA3C7',
      brown: '#9A8449',
    })
  })

  it('물건의 색 키를 HEX로 바꾸고, colors 옵션으로 덮어쓸 수 있다', () => {
    const src = { tent: tent(RECT_OUTER), items: [item({ shape: { kind: 'rect', w: 100, h: 50 }, color: 'teal' })] }
    const svg = thumbnailSvg(src)
    expect(svg).toContain(`fill="${THUMB_COLORS.teal}"`)
    expect(svg).toContain(`stroke="${THUMB_COLORS.teal}"`)

    const custom = thumbnailSvg(src, { colors: { teal: '#123456' } })
    expect(custom).toContain('fill="#123456"')
    expect(custom).not.toContain(THUMB_COLORS.teal)
  })

  it('모르는 색 키는 gray로 그린다', () => {
    const svg = thumbnailSvg({
      tent: tent(RECT_OUTER),
      items: [
        item({ shape: { kind: 'rect', w: 100, h: 50 }, color: 'red' as ColorKey }),
        item({ id: 'it-2', shape: { kind: 'rect', w: 100, h: 50 }, color: 'constructor' as ColorKey }),
      ],
    })
    expect(svg.split(`fill="${THUMB_COLORS.gray}"`).length - 1).toBe(2)
    expect(svg).not.toContain('function')
  })

  it('점유 면적에서 빠진 물건(countsArea=false)만 점선으로 그린다', () => {
    const svg = thumbnailSvg({
      tent: tent(RECT_OUTER),
      items: [
        item({ shape: { kind: 'rect', w: 300, h: 200 }, category: 'RUG', countsArea: false, color: 'brown' }),
        item({ id: 'it-2', shape: { kind: 'rect', w: 200, h: 60 } }),
      ],
    })
    expect(svg.split('stroke-dasharray').length - 1).toBe(1)
  })

  it('외곽 → 이너 → 물건(배열 순서) 순서로 그린다', () => {
    const svg = thumbnailSvg({
      tent: tent(RECT_OUTER, [inner({ kind: 'rect', w: 300, h: 300 }, 150, 0)]),
      items: [
        item({ id: 'a', shape: { kind: 'rect', w: 100, h: 50 }, color: 'blue' }),
        item({ id: 'b', shape: { kind: 'rect', w: 100, h: 50 }, color: 'pink' }),
      ],
    })
    const outerAt = svg.indexOf('class="tf-outer"')
    const innerAt = svg.indexOf('class="tf-inner"')
    const blueAt = svg.indexOf(`fill="${THUMB_COLORS.blue}"`)
    const pinkAt = svg.indexOf(`fill="${THUMB_COLORS.pink}"`)
    expect(outerAt).toBeGreaterThan(0)
    expect(outerAt).toBeLessThan(innerAt)
    expect(innerAt).toBeLessThan(blueAt)
    expect(blueAt).toBeLessThan(pinkAt)
  })

  it('items를 생략하면 텐트만 그린다', () => {
    const svg = thumbnailSvg({ tent: tent(RECT_OUTER, [inner({ kind: 'rect', w: 300, h: 300 }, 150, 0)]) })
    expect(svg).not.toContain('tf-item')
    expect(svg).toContain('tf-inner')
  })

  it('텐트 이름은 aria-label에 이스케이프해서 넣는다', () => {
    const svg = thumbnailSvg({ tent: tent(RECT_OUTER, [], `<b>"A&B"</b>`) })
    expect(svg).toContain('aria-label="&lt;b&gt;&quot;A&amp;B&quot;&lt;/b&gt;"')
    expect(svg).not.toContain('<b>')
  })

  it('꼭짓점이 3개 미만인 다각형은 그리지 않고, 외곽이 그렇다면 기본 viewBox를 쓴다', () => {
    const svg = thumbnailSvg({
      tent: tent({ kind: 'polygon', points: [] }),
      items: [item({ shape: { kind: 'polygon', points: [[0, 0], [10, 0]] } })],
    })
    expect(svg).not.toContain('tf-outer')
    expect(svg).not.toContain('tf-item')
    // 기본 상자 -100..100, 여백 0.05 × 200 = 10
    expect(svg).toContain('viewBox="-110 -110 220 220"')
    expect(svg).not.toContain('NaN')
  })
})
