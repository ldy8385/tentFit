import { describe, expect, it } from 'vitest'
import type { Inner, Item, Layout, Pt } from './model'
import { innersOverlap, ringIssue, validateLayout, validateTent } from './validate'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function inner(id: string, x: number, w = 300, h = 300, extra: Partial<Inner> = {}): Inner {
  return { id, name: `이너 ${id}`, shape: { kind: 'rect', w, h }, x, y: 0, rotation: 0, ...extra }
}

function mat(id: string, x = 0, y = 0, groupId?: string): Item {
  const item: Item = {
    id,
    name: `매트 ${id}`,
    shape: { kind: 'rect', w: 200, h: 60 },
    x,
    y,
    rotation: 0,
    color: 'green',
    category: 'MAT',
    countsArea: true,
  }
  if (groupId !== undefined) item.groupId = groupId
  return item
}

function base(): Layout {
  return {
    schemaVersion: 1,
    id: 'layout-1',
    name: '검사용 배치',
    createdAt: '2026-10-07T03:00:00.000Z',
    updatedAt: '2026-10-07T03:00:00.000Z',
    tent: {
      name: '검사용 텐트',
      outer: { kind: 'rect', w: 600, h: 300 },
      outerTemplate: { kind: 'rect', w: 600, h: 300 },
      inners: [inner('inner-1', 150, 300, 300, { template: { kind: 'rect', w: 300, h: 300 } })],
    },
    items: [mat('m1', -150, -30, 'g1'), mat('m2', -150, 30, 'g1'), mat('m3', 150, 0)],
    groups: [{ id: 'g1' }],
  }
}

function deepFreeze<T>(v: T): T {
  if (typeof v === 'object' && v !== null) {
    for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k])
    Object.freeze(v)
  }
  return v
}

const square: Pt[] = [[0, 0], [10, 0], [10, 10], [0, 10]]
const bowtie: Pt[] = [[-300, -150], [300, 150], [300, -150], [-300, 150]]

describe('ringIssue', () => {
  it('정상 사각형은 null(닫는 점이 있어도)', () => {
    expect(ringIssue(square)).toBeNull()
    expect(ringIssue([...square, [0, 0]])).toBeNull()
  })

  it('꼭짓점 부족(연속 중복점은 하나로 셈)', () => {
    expect(ringIssue([[0, 0], [10, 0]])).toBe('too-few-points')
    expect(ringIssue([[0, 0], [10, 0], [10, 0], [0, 0]])).toBe('too-few-points')
    expect(ringIssue([])).toBe('too-few-points')
  })

  it('나비 모양은 자기교차', () => {
    expect(ringIssue(bowtie)).toBe('self-intersect')
  })

  it('넓이 1cm² 이하는 tiny-area', () => {
    expect(ringIssue([[0, 0], [1, 0], [0, 1]])).toBe('tiny-area')
    expect(ringIssue([[0, 0], [1, 0], [1, 1], [0, 1]])).toBe('tiny-area')
    expect(ringIssue([[0, 0], [1.1, 0], [1.1, 1], [0, 1]])).toBeNull()
  })
})

describe('innersOverlap (5mm 규칙)', () => {
  const a = inner('a', 0, 100, 100)

  it('정확히 맞닿음과 0.3cm 파고듦은 겹침이 아니다', () => {
    expect(innersOverlap(a, inner('b', 100, 100, 100))).toBe(false)
    expect(innersOverlap(a, inner('b', 99.7, 100, 100))).toBe(false)
  })

  it('1cm 파고듦은 겹침이다(순서 무관)', () => {
    const b = inner('b', 99, 100, 100)
    expect(innersOverlap(a, b)).toBe(true)
    expect(innersOverlap(b, a)).toBe(true)
  })

  it('한쪽이 다른 쪽 안에 들어가도 겹침이다', () => {
    expect(innersOverlap(inner('big', 0, 300, 300), inner('small', 0, 50, 50))).toBe(true)
  })

  it('회전한 이너도 월드 좌표로 판정한다', () => {
    const tall = inner('tall', 0, 100, 300) // x −50~50
    const rotated: Inner = { ...inner('r', 110, 300, 100), rotation: 90 } // 돌리면 100×300 → x 60~160
    expect(innersOverlap(tall, rotated)).toBe(false) // 돌리지 않았다면 x −40~260이라 겹쳤을 자리
    expect(innersOverlap(tall, { ...rotated, x: 90 })).toBe(true) // x 40~140 → 10cm 겹침
  })
})

describe('validateTent', () => {
  it('정상 텐트는 이슈 없음', () => {
    expect(validateTent(base().tent)).toEqual([])
  })

  it('나비 모양 외곽 → self-intersect, path tent.outer', () => {
    const tent = { ...base().tent, outer: { kind: 'polygon' as const, points: bowtie } }
    delete tent.outerTemplate
    expect(validateTent(tent)).toEqual([
      { code: 'self-intersect', path: 'tent.outer', message: '외곽: 변끼리 교차해요', fixed: false },
    ])
  })

  it('경로 접두사를 바꿀 수 있다', () => {
    const tent = { ...base().tent, outer: { kind: 'polygon' as const, points: bowtie } }
    expect(validateTent(tent, 'layouts.0.tent')[0]?.path).toBe('layouts.0.tent.outer')
  })

  it('이너 다각형 꼭짓점 부족 → path tent.inners.0.shape', () => {
    const tent = base().tent
    tent.inners = [{ ...inner('p', 0), shape: { kind: 'polygon', points: [[0, 0], [100, 0], [100, 0]] } }]
    expect(validateTent(tent)).toEqual([
      { code: 'too-few-points', path: 'tent.inners.0.shape', message: '이너 p: 꼭짓점이 3개보다 적어요', fixed: false },
    ])
  })

  it('이너 겹침 → inner-overlap, 뒤쪽 이너 경로', () => {
    const tent = base().tent
    tent.inners = [inner('a', -100, 100, 100), inner('b', -1, 100, 100), inner('c', 200, 100, 100)]
    expect(validateTent(tent)).toEqual([
      { code: 'inner-overlap', path: 'tent.inners.1', message: '이너 a과(와) 이너 b이(가) 5mm 넘게 겹쳐요', fixed: false },
    ])
  })

  it('이너가 외곽 밖으로 나가는 것은 이슈가 아니다(경고 몫)', () => {
    const tent = base().tent
    tent.inners = [inner('out', 200)]
    expect(validateTent(tent)).toEqual([])
  })
})

describe('validateLayout — 정상', () => {
  it('정상 배치는 ok, 이슈 없음, 같은 내용의 새 객체', () => {
    const input = deepFreeze(base())
    const r = validateLayout(input)
    expect(r.ok).toBe(true)
    expect(r.issues).toEqual([])
    expect(r.layout).toEqual(input)
    expect(r.layout).not.toBe(input)
  })

  it('사각형·원은 길이 범위만 보므로 지름 1cm 원도 통과', () => {
    const layout = base()
    layout.items.push({ ...mat('tiny'), shape: { kind: 'circle', d: 1 } })
    expect(validateLayout(layout).ok).toBe(true)
  })
})

describe('validateLayout — 고칠 수 있는 위반(fixed: true)', () => {
  it('물건 id 중복: 뒤에 나온 것에 새 id', () => {
    const layout = base()
    layout.items[2] = mat('m1', 150, 0)
    const r = validateLayout(deepFreeze(layout))
    expect(r.ok).toBe(true)
    expect(r.issues).toEqual([
      { code: 'dup-id', path: 'items.2.id', message: '중복된 id(m1)에 새 id를 줬어요', fixed: true },
    ])
    expect(r.layout.items[0]!.id).toBe('m1')
    expect(r.layout.items[2]!.id).toMatch(UUID)
  })

  it('이너와 물건의 id가 겹치면 물건에 새 id', () => {
    const layout = base()
    layout.items[2] = mat('inner-1', 150, 0)
    const r = validateLayout(layout)
    expect(r.issues.map((i) => [i.code, i.path])).toEqual([['dup-id', 'items.2.id']])
    expect(r.layout.tent.inners[0]!.id).toBe('inner-1')
    expect(r.layout.items[2]!.id).toMatch(UUID)
  })

  it('이너 id 중복', () => {
    const layout = base()
    layout.tent.inners = [inner('in', -200, 100, 100), inner('in', 200, 100, 100)]
    const r = validateLayout(layout)
    expect(r.issues.map((i) => [i.code, i.path])).toEqual([['dup-id', 'tent.inners.1.id']])
    expect(r.layout.tent.inners[1]!.id).toMatch(UUID)
  })

  it('그룹 목록 id 중복은 하나로', () => {
    const layout = base()
    layout.groups = [{ id: 'g1' }, { id: 'g1' }]
    const r = validateLayout(layout)
    expect(r.ok).toBe(true)
    expect(r.issues).toEqual([
      { code: 'dup-id', path: 'groups.1.id', message: '그룹 목록의 중복(g1)을 하나로 합쳤어요', fixed: true },
    ])
    expect(r.layout.groups).toEqual([{ id: 'g1' }])
  })

  it('그룹 id가 물건 id와 겹치면 그룹에 새 id를 주고 멤버 참조도 바꾼다', () => {
    const layout = base()
    layout.groups = [{ id: 'm3' }]
    layout.items[0]!.groupId = 'm3'
    layout.items[1]!.groupId = 'm3'
    const r = validateLayout(layout)
    expect(r.issues.map((i) => [i.code, i.path])).toEqual([['dup-id', 'groups.0.id']])
    const gid = r.layout.groups[0]!.id
    expect(gid).toMatch(UUID)
    expect(r.layout.items[0]!.groupId).toBe(gid)
    expect(r.layout.items[1]!.groupId).toBe(gid)
  })

  it('없는 groupId 참조는 지운다', () => {
    const layout = base()
    layout.items[2]!.groupId = 'ghost'
    const r = validateLayout(layout)
    expect(r.ok).toBe(true)
    expect(r.issues).toEqual([
      { code: 'group-missing', path: 'items.2.groupId', message: '없는 그룹(ghost) 참조를 지웠어요', fixed: true },
    ])
    expect('groupId' in r.layout.items[2]!).toBe(false)
  })

  it('흩어진 그룹 멤버는 가장 위 멤버 자리로 모은다(상대 순서 유지)', () => {
    const layout = base()
    layout.items = [mat('a', 0, 0, 'g1'), mat('b'), mat('c', 0, 0, 'g1'), mat('d')]
    const r = validateLayout(layout)
    expect(r.ok).toBe(true)
    expect(r.issues).toEqual([
      { code: 'group-noncontiguous', path: 'groups.0', message: '흩어진 그룹 멤버를 한자리로 모았어요', fixed: true },
    ])
    expect(r.layout.items.map((i) => i.id)).toEqual(['b', 'a', 'c', 'd'])
  })

  it('세 군데로 흩어진 멤버도 가장 위 자리로', () => {
    const layout = base()
    layout.items = [mat('a', 0, 0, 'g1'), mat('b'), mat('c', 0, 0, 'g1'), mat('d'), mat('e', 0, 0, 'g1'), mat('f')]
    const r = validateLayout(layout)
    expect(r.layout.items.map((i) => i.id)).toEqual(['b', 'd', 'a', 'c', 'e', 'f'])
  })

  it('멤버 1개 그룹은 해제하고, 빈 그룹은 지운다', () => {
    const layout = base()
    layout.items = [mat('a', 0, 0, 'g1'), mat('b', 0, 0, 'ghost'), mat('c')]
    layout.groups = [{ id: 'g1' }, { id: 'empty' }]
    const r = validateLayout(layout)
    expect(r.ok).toBe(true)
    expect(r.issues).toEqual([
      { code: 'group-missing', path: 'items.1.groupId', message: '없는 그룹(ghost) 참조를 지웠어요', fixed: true },
      { code: 'group-too-small', path: 'groups.0', message: '멤버가 1개인 그룹을 해제했어요', fixed: true },
      { code: 'group-too-small', path: 'groups.1', message: '멤버가 없는 그룹을 지웠어요', fixed: true },
    ])
    expect(r.layout.groups).toEqual([])
    expect(r.layout.items.every((i) => i.groupId === undefined)).toBe(true)
  })

  it('그룹 이슈 경로는 입력 groups의 위치 기준이다', () => {
    const layout = base()
    layout.groups = [{ id: 'g0' }, { id: 'g1' }]
    layout.items = [mat('a', 0, 0, 'g1'), mat('b'), mat('c', 0, 0, 'g1')]
    const r = validateLayout(layout)
    expect(r.issues.map((i) => [i.code, i.path])).toEqual([
      ['group-too-small', 'groups.0'],
      ['group-noncontiguous', 'groups.1'],
    ])
  })

  it('템플릿과 다른 외곽·이너 도형은 템플릿으로 다시 만든다', () => {
    const layout = base()
    layout.tent.outer = { kind: 'rect', w: 620, h: 300 }
    layout.tent.inners[0]!.shape = { kind: 'rect', w: 300, h: 290 }
    const r = validateLayout(layout)
    expect(r.ok).toBe(true)
    expect(r.issues).toEqual([
      { code: 'template-mismatch', path: 'tent.outer', message: '외곽을 템플릿으로 다시 만들었어요', fixed: true },
      { code: 'template-mismatch', path: 'tent.inners.0.shape', message: '이너 inner-1을(를) 템플릿으로 다시 만들었어요', fixed: true },
    ])
    expect(r.layout.tent.outer).toEqual({ kind: 'rect', w: 600, h: 300 })
    expect(r.layout.tent.inners[0]!.shape).toEqual({ kind: 'rect', w: 300, h: 300 })
  })

  it('0.1cm 안의 차이는 템플릿 불일치가 아니다', () => {
    const layout = base()
    layout.tent.outer = { kind: 'rect', w: 600.05, h: 300 }
    expect(validateLayout(layout).issues).toEqual([])
  })
})

describe('validateLayout — 고칠 수 없는 위반(ok: false)', () => {
  it('나비 모양 외곽 → ok false + path tent.outer', () => {
    const layout = base()
    layout.tent.outer = { kind: 'polygon', points: bowtie }
    delete layout.tent.outerTemplate
    const r = validateLayout(layout)
    expect(r.ok).toBe(false)
    expect(r.issues).toEqual([
      { code: 'self-intersect', path: 'tent.outer', message: '외곽: 변끼리 교차해요', fixed: false },
    ])
  })

  it('1cm 파고든 이너 → inner-overlap, 0.3cm는 통과', () => {
    const overlapping = base()
    overlapping.tent.inners = [inner('a', -100, 100, 100), inner('b', -1, 100, 100)]
    const r = validateLayout(overlapping)
    expect(r.ok).toBe(false)
    expect(r.issues.map((i) => [i.code, i.path, i.fixed])).toEqual([['inner-overlap', 'tent.inners.1', false]])

    const touching = base()
    touching.tent.inners = [inner('a', -100, 100, 100), inner('b', -0.3, 100, 100)]
    expect(validateLayout(touching).ok).toBe(true)
  })

  it('물건 다각형도 검사한다', () => {
    const layout = base()
    layout.items[2] = { ...mat('poly'), shape: { kind: 'polygon', points: [[0, 0], [1, 0], [0, 1]] } }
    const r = validateLayout(layout)
    expect(r.ok).toBe(false)
    expect(r.issues).toEqual([
      { code: 'tiny-area', path: 'items.2.shape', message: '매트 poly: 넓이가 1cm² 이하예요', fixed: false },
    ])
  })

  it('고칠 것과 못 고칠 것이 섞이면 둘 다 남기고 ok false, 경로는 입력 기준', () => {
    const layout = base()
    layout.items = [mat('a', 0, 0, 'g1'), mat('b'), { ...mat('a'), shape: { kind: 'polygon', points: bowtie } }, mat('c', 0, 0, 'g1')]
    const r = validateLayout(deepFreeze(layout))
    expect(r.ok).toBe(false)
    expect(r.issues.map((i) => [i.code, i.path, i.fixed])).toEqual([
      ['self-intersect', 'items.2.shape', false],
      ['dup-id', 'items.2.id', true],
      ['group-noncontiguous', 'groups.0', true],
    ])
    expect(r.layout.items.map((i) => i.name)).toEqual(['매트 b', '매트 a', '매트 a', '매트 c'])
  })
})

describe('validateLayout — 입력 불변', () => {
  it('얼린 입력으로 모든 정리를 해도 예외가 없고 입력은 그대로다', () => {
    const layout = base()
    layout.tent.outer = { kind: 'rect', w: 620, h: 300 }
    layout.items = [mat('a', 0, 0, 'g1'), mat('a'), mat('c', 0, 0, 'g1'), mat('d', 0, 0, 'ghost')]
    layout.groups = [{ id: 'g1' }, { id: 'g1' }]
    const before = JSON.stringify(layout)
    const r = validateLayout(deepFreeze(layout))
    expect(JSON.stringify(layout)).toBe(before)
    expect(r.ok).toBe(true)
    expect(r.issues.map((i) => i.code)).toEqual(['template-mismatch', 'dup-id', 'dup-id', 'group-missing', 'group-noncontiguous'])
  })
})
