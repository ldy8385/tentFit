import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { COLOR_KEYS, createLayout, type Item, type ItemPreset, type Layout, type Pt, type Tent } from '../model'
import { outerRing, pointInRing, ringBBox, transformRing, worldRing } from '../geom'
import { buildZones } from '../zones'
import {
  addItem,
  applyTransform,
  deleteItems,
  duplicateItems,
  itemFromPreset,
  makeItem,
  moveItems,
  newItemPosition,
  nextColor,
  resizeItem,
  rotateItems,
  selectionPivot,
  setItemProps,
  uniqueItemName,
} from './items'

const NOW = '2026-10-07T00:00:00.000Z'

// 골든 공통 조건(스펙 §13.2): 외곽 rect 600×300, 이너 rect 300×300 @(150,0)
function goldenTent(): Tent {
  return {
    name: '테스트 텐트',
    outer: { kind: 'rect', w: 600, h: 300 },
    inners: [{ id: 'in1', name: '이너 1', shape: { kind: 'rect', w: 300, h: 300 }, x: 150, y: 0, rotation: 0 }],
  }
}

function mat(id: string, x: number, y: number, extra: Partial<Item> = {}): Item {
  return {
    id,
    name: `매트 ${id}`,
    shape: { kind: 'rect', w: 200, h: 60 },
    x,
    y,
    rotation: 0,
    color: 'green',
    category: 'MAT',
    countsArea: true,
    ...extra,
  }
}

function layoutOf(items: Item[], groupIds: string[] = [], tent: Tent = goldenTent()): Layout {
  const base = createLayout(tent, { name: '테스트 배치', id: 'L1', now: NOW })
  return { ...base, items, groups: groupIds.map((id) => ({ id })) }
}

const idsOf = (l: Layout) => l.items.map((it) => it.id)

function get(l: Layout, id: string): Item {
  const found = l.items.find((it) => it.id === id)
  if (!found) throw new Error(`물건 ${id} 없음`)
  return found
}

function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i]
  if (v === undefined) throw new Error(`인덱스 ${i} 없음`)
  return v
}

// 값을 돌려주는 레시피도 있으므로 본문을 항상 중괄호로 감쌉니다(immer는 반환값을 새 상태로 봄).
function run(l: Layout, fn: (d: Layout) => unknown): Layout {
  return produce(l, (d) => {
    fn(d)
  })
}

describe('makeItem · itemFromPreset · nextColor', () => {
  it('makeItem은 좌표와 치수를 0.1cm로 반올림하고 -0을 남기지 않는다', () => {
    const item = makeItem(
      { name: '새 도형', shape: { kind: 'rect', w: 100.06, h: 49.94 }, color: 'blue', category: 'ETC', countsArea: true },
      [10.04, -0.04],
    )
    expect(item.x).toBe(10)
    expect(item.y).toBe(0)
    expect(Object.is(item.y, -0)).toBe(false)
    expect(item.rotation).toBe(0)
    expect(item.shape).toEqual({ kind: 'rect', w: 100.1, h: 49.9 })
    expect(item).toMatchObject({ name: '새 도형', color: 'blue', category: 'ETC', countsArea: true })
    expect('presetId' in item).toBe(false)
    expect('groupId' in item).toBe(false)
    expect(item.id).toMatch(/^[0-9a-f-]{36}$/)
    const other = makeItem(
      { name: '새 도형', shape: { kind: 'circle', d: 40 }, color: 'blue', category: 'ETC', countsArea: true },
      [0, 0],
    )
    expect(other.id).not.toBe(item.id)
  })

  it('itemFromPreset은 프리셋 값을 복사하고 presetId를 남긴다', () => {
    const preset: ItemPreset = {
      id: 'stool-35',
      name: '원형 스툴',
      category: 'CHAIR',
      shape: { kind: 'circle', d: 35 },
      color: 'sky',
      countsArea: true,
    }
    const item = itemFromPreset(preset, [30, -20])
    expect(item).toMatchObject({
      name: '원형 스툴',
      category: 'CHAIR',
      color: 'sky',
      countsArea: true,
      presetId: 'stool-35',
      x: 30,
      y: -20,
      rotation: 0,
    })
    expect(item.shape).toEqual({ kind: 'circle', d: 35 })
    expect(item.shape).not.toBe(preset.shape)
  })

  it('nextColor는 물건 수에 따라 팔레트 8색을 시안 순서대로 돌린다 (OD-2)', () => {
    expect(COLOR_KEYS).toEqual(['blue', 'teal', 'green', 'purple', 'pink', 'gray', 'sky', 'brown'])
    expect(nextColor(layoutOf([]))).toBe('blue')
    const seen = Array.from({ length: 10 }, (_, n) =>
      nextColor(layoutOf(Array.from({ length: n }, (_, i) => mat(`m${i}`, i * 10, 0)))),
    )
    expect(seen).toEqual(['blue', 'teal', 'green', 'purple', 'pink', 'gray', 'sky', 'brown', 'blue', 'teal'])
  })
})

describe('uniqueItemName (OD-10)', () => {
  const named = (id: string, name: string): Item => mat(id, 0, 0, { name })

  it('겹치지 않는 이름은 그대로 둔다(안 쓰인 번호 이름도)', () => {
    const l = layoutOf([named('a', '캠핑의자'), named('b', '랜턴 거치대')])
    expect(uniqueItemName(l, '롤 테이블')).toBe('롤 테이블')
    expect(uniqueItemName(l, '캠핑의자 2')).toBe('캠핑의자 2')
  })

  it('겹치면 기본 이름 뒤에 가장 큰 번호 + 1을 붙인다(번호 없는 이름은 1로 셈)', () => {
    expect(uniqueItemName(layoutOf([named('a', '캠핑의자')]), '캠핑의자')).toBe('캠핑의자 2')
    const l = layoutOf([named('a', '캠핑의자'), named('b', '캠핑의자 4'), named('c', '캠핑의자 2')])
    expect(uniqueItemName(l, '캠핑의자')).toBe('캠핑의자 5')
    expect(uniqueItemName(l, '캠핑의자 2')).toBe('캠핑의자 5')
    // 끝이 " 숫자"가 아니면 이름 전체가 기본 이름
    expect(uniqueItemName(layoutOf([named('a', '매트 200×60')]), '매트 200×60')).toBe('매트 200×60 2')
  })

  it('excludeId인 물건은 비교에서 뺀다', () => {
    const l = layoutOf([named('a', '캠핑의자'), named('b', '랜턴')])
    expect(uniqueItemName(l, '캠핑의자', 'a')).toBe('캠핑의자')
    expect(uniqueItemName(l, '랜턴', 'a')).toBe('랜턴 2')
  })
})

describe('newItemPosition', () => {
  it('화면 가운데가 외곽 안이면 그 점을 0.1cm로 반올림해 쓴다', () => {
    const l = layoutOf([])
    expect(newItemPosition(l, buildZones(l.tent), [12.34, -56.78])).toEqual([12.3, -56.8])
  })

  it('같은 자리에 물건이 있으면 (+20,+20)씩 비켜 놓는다', () => {
    const l = layoutOf([mat('a', 0, 0), mat('b', 20, 20)])
    expect(newItemPosition(l, buildZones(l.tent), [0, 0])).toEqual([40, 40])
  })

  it('ㄷ자 외곽에서 화면 가운데가 홈(외곽 밖)이면 외곽 안쪽 깊은 곳에 놓는다 (Review Focus 2)', () => {
    const uTent: Tent = {
      name: 'ㄷ자',
      outer: {
        kind: 'polygon',
        points: [
          [-300, -150],
          [300, -150],
          [300, 150],
          [100, 150],
          [100, -50],
          [-100, -50],
          [-100, 150],
          [-300, 150],
        ],
      },
      inners: [],
    }
    const l = layoutOf([], [], uTent)
    const ring = outerRing(l.tent)
    expect(pointInRing([0, 0], ring)).toBe(false) // 바운딩 박스 중심은 홈 안(외곽 밖)
    const p = newItemPosition(l, buildZones(l.tent), [0, 0])
    expect(pointInRing(p, ring)).toBe(true)
    // 외곽 안쪽으로 50cm 이상 들어가 있음(가장자리에 걸친 점이 아님)
    const around: Pt[] = [
      [p[0] - 50, p[1]],
      [p[0] + 50, p[1]],
      [p[0], p[1] - 50],
      [p[0], p[1] + 50],
    ]
    for (const q of around) expect(pointInRing(q, ring)).toBe(true)
  })

  it('폭 20cm의 가는 ㄱ자 띠 외곽에서도 외곽 안에 놓는다 (Review Focus 2)', () => {
    const band: Tent = {
      name: '가는 띠',
      outer: {
        kind: 'polygon',
        points: [
          [-300, -150],
          [300, -150],
          [300, -130],
          [-280, -130],
          [-280, 150],
          [-300, 150],
        ],
      },
      inners: [],
    }
    const l = layoutOf([], [], band)
    const ring = outerRing(l.tent)
    expect(pointInRing([0, 0], ring)).toBe(false)
    const p = newItemPosition(l, buildZones(l.tent), [0, 0])
    expect(pointInRing(p, ring)).toBe(true)
  })
})

describe('addItem · deleteItems', () => {
  it('addItem은 맨 위(배열 끝)에 넣는다', () => {
    const l = layoutOf([mat('a', 0, 0), mat('b', 0, 0)])
    const next = run(l, (d) => addItem(d, mat('c', 50, 50)))
    expect(idsOf(next)).toEqual(['a', 'b', 'c'])
  })

  it('같은 이름의 물건을 두 번 추가하면 "캠핑의자", "캠핑의자 2"로 저장한다 (OD-10)', () => {
    const chair = (): Item =>
      makeItem(
        { name: '캠핑의자', shape: { kind: 'rect', w: 55, h: 60 }, color: 'brown', category: 'CHAIR', countsArea: true },
        [0, 0],
      )
    const once = run(layoutOf([]), (d) => addItem(d, chair()))
    const twice = run(once, (d) => addItem(d, chair()))
    expect(twice.items.map((it) => it.name)).toEqual(['캠핑의자', '캠핑의자 2'])
  })

  it('지운 뒤 멤버가 1개 남은 그룹은 자동 해제된다', () => {
    const l = layoutOf(
      [mat('a', 0, 0), mat('b', 0, 0, { groupId: 'g1' }), mat('c', 0, 0, { groupId: 'g1' }), mat('d', 0, 0)],
      ['g1'],
    )
    const next = run(l, (d) => deleteItems(d, ['b']))
    expect(idsOf(next)).toEqual(['a', 'c', 'd'])
    expect('groupId' in get(next, 'c')).toBe(false)
    expect(next.groups).toEqual([])
  })

  it('없는 id만 주면 아무것도 바뀌지 않는다(같은 참조)', () => {
    const l = layoutOf([mat('a', 0, 0)])
    expect(run(l, (d) => deleteItems(d, ['zz']))).toBe(l)
  })
})

describe('moveItems · rotateItems', () => {
  it('이동 결과를 0.1cm로 반올림하고 고른 물건만 옮긴다', () => {
    const l = layoutOf([mat('a', 0, 0), mat('b', 5, 5)])
    const next = run(l, (d) => moveItems(d, ['a'], 10.04, -0.04))
    expect(get(next, 'a').x).toBe(10)
    expect(get(next, 'a').y).toBe(0)
    expect(Object.is(get(next, 'a').y, -0)).toBe(false)
    expect(get(next, 'b')).toBe(l.items[1])
  })

  it('피벗 기준 90° 회전: 원점은 (100,50)→(-50,100), rotation 90, 월드 고리는 강체 회전과 같다', () => {
    const l = layoutOf([mat('a', 100, 50)])
    const before = worldRing(get(l, 'a'))
    const next = run(l, (d) => rotateItems(d, ['a'], [0, 0], 90))
    const a = get(next, 'a')
    expect(a.x).toBe(-50)
    expect(a.y).toBe(100)
    expect(a.rotation).toBe(90)
    const after = worldRing(a)
    const expected = transformRing(before, 0, 0, 90)
    expect(after).toHaveLength(expected.length)
    after.forEach((p, i) => {
      expect(p[0]).toBeCloseTo(at(expected, i)[0], 6)
      expect(p[1]).toBeCloseTo(at(expected, i)[1], 6)
    })
    const b = ringBBox(after)
    expect(b.minX).toBeCloseTo(-80, 6)
    expect(b.maxX).toBeCloseTo(-20, 6)
    expect(b.minY).toBeCloseTo(0, 6)
    expect(b.maxY).toBeCloseTo(200, 6)
  })

  it('rotation은 [0,360)으로 정규화된다', () => {
    const l = layoutOf([mat('a', 0, 0, { rotation: 350 }), mat('b', 300, 0)])
    const plus = run(l, (d) => rotateItems(d, ['a'], [0, 0], 20))
    expect(get(plus, 'a').rotation).toBe(10)
    const minus = run(l, (d) => rotateItems(d, ['b'], [300, 0], -90))
    expect(get(minus, 'b').rotation).toBe(270)
    expect(get(minus, 'b').x).toBe(300)
    expect(get(minus, 'b').y).toBe(0)
  })
})

describe('setItemProps · resizeItem · applyTransform', () => {
  it('setItemProps는 준 필드만 바꾸고, 없는 id면 그대로', () => {
    const l = layoutOf([mat('a', 0, 0)])
    const next = run(l, (d) => setItemProps(d, 'a', { name: '러그', category: 'RUG', countsArea: false, color: 'brown' }))
    expect(get(next, 'a')).toMatchObject({ name: '러그', category: 'RUG', countsArea: false, color: 'brown', x: 0 })
    expect(run(l, (d) => setItemProps(d, 'zz', { name: 'x' }))).toBe(l)
  })

  it('resizeItem: 사각형은 준 축만, 원은 지름', () => {
    const l = layoutOf([mat('a', 0, 0), mat('c', 0, 0, { shape: { kind: 'circle', d: 40 } })])
    const next = run(l, (d) => {
      resizeItem(d, 'a', { w: 180.04 })
      resizeItem(d, 'c', { d: 45 })
    })
    expect(get(next, 'a').shape).toEqual({ kind: 'rect', w: 180, h: 60 })
    expect(get(next, 'c').shape).toEqual({ kind: 'circle', d: 45 })
  })

  it('resizeItem: 다각형은 로컬 바운딩 박스 기준으로 원점을 중심으로 축별 비례', () => {
    const tri = mat('t', 0, 0, {
      shape: {
        kind: 'polygon',
        points: [
          [0, 0],
          [100, 0],
          [100, 50],
        ],
      },
    })
    const l = layoutOf([tri])
    const wide = run(l, (d) => resizeItem(d, 't', { w: 50 }))
    expect(get(wide, 't').shape).toEqual({
      kind: 'polygon',
      points: [
        [0, 0],
        [50, 0],
        [50, 50],
      ],
    })
    const both = run(l, (d) => resizeItem(d, 't', { w: 200, h: 100 }))
    expect(get(both, 't').shape).toEqual({
      kind: 'polygon',
      points: [
        [0, 0],
        [200, 0],
        [200, 100],
      ],
    })
  })

  it('applyTransform: Konva scale을 치수로 바꾸고 위치·각도를 반올림한다', () => {
    const l = layoutOf([
      mat('a', 0, 0),
      mat('c', 0, 0, { shape: { kind: 'circle', d: 40 } }),
      mat('p', 0, 0, {
        shape: {
          kind: 'polygon',
          points: [
            [-50, -30],
            [50, -30],
            [0, 30],
          ],
        },
      }),
    ])
    const next = run(l, (d) => {
      applyTransform(d, 'a', { x: 10.04, y: 20, rotation: 359.996, scaleX: 1.5, scaleY: 0.5 })
      applyTransform(d, 'c', { x: 0, y: 0, rotation: 0, scaleX: 1.5, scaleY: 1 })
      applyTransform(d, 'p', { x: 0, y: 0, rotation: 45, scaleX: 2, scaleY: -0.5 })
    })
    expect(get(next, 'a')).toMatchObject({ x: 10, y: 20, rotation: 0, shape: { kind: 'rect', w: 300, h: 30 } })
    expect(get(next, 'c').shape).toEqual({ kind: 'circle', d: 60 })
    expect(get(next, 'p').rotation).toBe(45)
    expect(get(next, 'p').shape).toEqual({
      kind: 'polygon',
      points: [
        [-100, 15],
        [100, 15],
        [0, -15],
      ],
    })
    expect('scaleX' in get(next, 'a')).toBe(false)
  })

  it('applyTransform: 길이는 1cm 아래로 줄지 않는다', () => {
    const l = layoutOf([mat('a', 0, 0)])
    const next = run(l, (d) => applyTransform(d, 'a', { x: 0, y: 0, rotation: 0, scaleX: 0.001, scaleY: 1 }))
    expect(get(next, 'a').shape).toEqual({ kind: 'rect', w: 1, h: 60 })
  })
})

describe('duplicateItems', () => {
  it('물건 1개: (+20,+20) 비켜 원본 바로 위에 넣고 새 id를 돌려준다', () => {
    const l = layoutOf([mat('a', 0, 0, { presetId: 'mat-200' }), mat('b', 100, 0)])
    let created: string[] = []
    const next = run(l, (d) => {
      created = duplicateItems(d, ['a'])
    })
    expect(created).toHaveLength(1)
    const copyId = at(created, 0)
    expect(idsOf(next)).toEqual(['a', copyId, 'b'])
    expect(get(next, copyId)).toMatchObject({ x: 20, y: 20, name: '매트 a 2', presetId: 'mat-200', rotation: 0 })
    expect(get(next, copyId).shape).toEqual({ kind: 'rect', w: 200, h: 60 })
    expect('groupId' in get(next, copyId)).toBe(false)
  })

  it('그룹(scope 없음): 블록을 통째로 복제해 블록 바로 위에 넣고 새 groupId를 준다', () => {
    const l = layoutOf(
      [mat('a', 0, 0), mat('b', 0, 0, { groupId: 'g1' }), mat('c', 50, 0, { groupId: 'g1' }), mat('d', 0, 0)],
      ['g1'],
    )
    let created: string[] = []
    const next = run(l, (d) => {
      created = duplicateItems(d, ['b'])
    })
    expect(created).toHaveLength(2)
    const [b2, c2] = created as [string, string]
    expect(idsOf(next)).toEqual(['a', 'b', 'c', b2, c2, 'd'])
    const gid = get(next, b2).groupId
    expect(gid).toBeDefined()
    expect(gid).not.toBe('g1')
    expect(get(next, c2).groupId).toBe(gid)
    expect(get(next, c2)).toMatchObject({ x: 70, y: 20 })
    expect([get(next, b2).name, get(next, c2).name]).toEqual(['매트 b 2', '매트 c 2'])
    expect(next.groups.map((g) => g.id)).toEqual(['g1', gid])
  })

  it('복제본 이름은 언제나 다음 번호: "캠핑의자"·"캠핑의자 2"가 있을 때 "캠핑의자 2" 복제 → "캠핑의자 3" (OD-10)', () => {
    const l = layoutOf([mat('a', 0, 0, { name: '캠핑의자' }), mat('b', 100, 0, { name: '캠핑의자 2' })])
    let created: string[] = []
    const next = run(l, (d) => {
      created = duplicateItems(d, ['b'])
    })
    expect(get(next, at(created, 0)).name).toBe('캠핑의자 3')
    // 함께 복제하면 같은 조작 안에서 번호가 이어진다
    let both: string[] = []
    const next2 = run(l, (d) => {
      both = duplicateItems(d, ['a', 'b'])
    })
    expect(both.map((id) => get(next2, id).name)).toEqual(['캠핑의자 3', '캠핑의자 4'])
  })

  it('그룹 안 편집(scope): 같은 그룹 안에서 원본 바로 위에 넣는다', () => {
    const l = layoutOf(
      [mat('a', 0, 0), mat('b', 0, 0, { groupId: 'g1' }), mat('c', 0, 0, { groupId: 'g1' }), mat('d', 0, 0)],
      ['g1'],
    )
    let created: string[] = []
    const next = run(l, (d) => {
      created = duplicateItems(d, ['b'], 'g1')
    })
    const b2 = at(created, 0)
    expect(idsOf(next)).toEqual(['a', 'b', b2, 'c', 'd'])
    expect(get(next, b2).groupId).toBe('g1')
    expect(get(next, b2).name).toBe('매트 b 2')
    expect(next.groups).toEqual([{ id: 'g1' }])
  })

  it('고른 것이 없으면 빈 목록을 돌려주고 그대로(같은 참조)', () => {
    const l = layoutOf([mat('a', 0, 0)])
    let created: string[] = ['x']
    const next = run(l, (d) => {
      created = duplicateItems(d, [])
    })
    expect(created).toEqual([])
    expect(next).toBe(l)
  })
})

describe('selectionPivot', () => {
  it('1개면 그 물건의 원점(회전해 있어도)', () => {
    const l = layoutOf([mat('a', 12.5, -7, { rotation: 33 })])
    expect(selectionPivot(l, ['a'])).toEqual([12.5, -7])
  })

  it('여러 개면 월드 바운딩 박스 중심(원은 지름 그대로)', () => {
    const l = layoutOf([mat('a', 0, 0), mat('c', 200, 100, { shape: { kind: 'circle', d: 40 } })])
    // 매트 x -100~100, y -30~30 / 원 x 180~220, y 80~120 → x -100~220, y -30~120
    const p = selectionPivot(l, ['a', 'c'])
    expect(p[0]).toBeCloseTo(60, 6)
    expect(p[1]).toBeCloseTo(45, 6)
  })

  it('고른 물건이 없으면 [0,0]', () => {
    expect(selectionPivot(layoutOf([mat('a', 5, 5)]), ['zz'])).toEqual([0, 0])
  })
})
