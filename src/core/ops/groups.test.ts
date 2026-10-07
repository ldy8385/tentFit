import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { createLayout, type Item, type Layout } from '../model'
import { deleteItems } from './items'
import { expandSelection, groupBlocks, groupItems, normalizeGroups, ungroup } from './groups'

const NOW = '2026-10-07T00:00:00.000Z'

// 'b@g1'처럼 쓰면 groupId가 g1인 물건. groups는 따로 줍니다(손상된 목록을 만들기 위해).
function layoutOf(spec: string[], groups: string[]): Layout {
  const base = createLayout(
    { name: '테스트 텐트', outer: { kind: 'rect', w: 600, h: 300 }, inners: [] },
    { name: '그룹', id: 'L1', now: NOW },
  )
  const items: Item[] = spec.map((s, i) => {
    const [id = s, gid] = s.split('@')
    const it: Item = {
      id,
      name: id,
      shape: { kind: 'rect', w: 50, h: 50 },
      x: i * 60,
      y: 0,
      rotation: 0,
      color: 'gray',
      category: 'ETC',
      countsArea: true,
    }
    if (gid !== undefined) it.groupId = gid
    return it
  })
  return { ...base, items, groups: groups.map((id) => ({ id })) }
}

/** 'id' 또는 'id@groupId' 형태로 현재 순서를 적습니다. */
const shape = (l: Layout) => l.items.map((it) => (it.groupId === undefined ? it.id : `${it.id}@${it.groupId}`))
const idsOf = (l: Layout) => l.items.map((it) => it.id)

describe('groupBlocks · expandSelection', () => {
  it('groupBlocks는 배열 순서대로 블록을 나눈다', () => {
    const l = layoutOf(['a', 'b@g1', 'c@g1', 'd'], ['g1'])
    expect(groupBlocks(l)).toEqual([
      { groupId: null, ids: ['a'] },
      { groupId: 'g1', ids: ['b', 'c'] },
      { groupId: null, ids: ['d'] },
    ])
  })

  it('expandSelection은 멤버 하나만 골라도 그룹 전체로 넓힌다(배열 순서)', () => {
    const l = layoutOf(['a', 'b@g1', 'c@g1', 'd'], ['g1'])
    expect(expandSelection(l, ['d', 'b'])).toEqual(['b', 'c', 'd'])
    expect(expandSelection(l, ['zz', 'a', 'a'])).toEqual(['a'])
  })

  it('그룹 안 편집(scope)이면 넓히지 않고 그 그룹 멤버만 남긴다', () => {
    const l = layoutOf(['a', 'b@g1', 'c@g1', 'd'], ['g1'])
    expect(expandSelection(l, ['c', 'a'], 'g1')).toEqual(['c'])
  })
})

describe('groupItems', () => {
  it('흩어진 3개를 묶으면 가장 위 물건 자리로 모이고 상대 순서를 지킨다', () => {
    const l = layoutOf(['a', 'b', 'c', 'd', 'e'], [])
    let gid = ''
    const next = produce(l, (d) => {
      gid = groupItems(d, ['e', 'a', 'c'])
    })
    expect(gid).not.toBe('')
    expect(shape(next)).toEqual(['b', 'd', `a@${gid}`, `c@${gid}`, `e@${gid}`])
    expect(next.groups).toEqual([{ id: gid }])
  })

  it('가장 위 물건이 가운데쯤이면 그 자리로 모인다', () => {
    const l = layoutOf(['a', 'b', 'c', 'd', 'e'], [])
    let gid = ''
    const next = produce(l, (d) => {
      gid = groupItems(d, ['a', 'c', 'd'])
    })
    expect(shape(next)).toEqual(['b', `a@${gid}`, `c@${gid}`, `d@${gid}`, 'e'])
  })

  it('기존 그룹 멤버 + 낱개를 묶으면 기존 그룹을 흡수해 그룹이 1개가 된다', () => {
    const l = layoutOf(['a', 'b@g1', 'c@g1', 'd'], ['g1'])
    let gid = ''
    const next = produce(l, (d) => {
      gid = groupItems(d, ['a', 'b'])
    })
    expect(gid).not.toBe('g1')
    expect(shape(next)).toEqual([`a@${gid}`, `b@${gid}`, `c@${gid}`, 'd'])
    expect(next.groups).toEqual([{ id: gid }])
  })

  it('두 그룹을 한꺼번에 흡수하고 사이의 낱개는 아래로 비킨다', () => {
    const l = layoutOf(['x@g1', 'y@g1', 'z', 'w@g2', 'v@g2'], ['g1', 'g2'])
    let gid = ''
    const next = produce(l, (d) => {
      gid = groupItems(d, ['x', 'w'])
    })
    expect(shape(next)).toEqual(['z', `x@${gid}`, `y@${gid}`, `w@${gid}`, `v@${gid}`])
    expect(next.groups).toEqual([{ id: gid }])
  })

  it('넓혀도 1개뿐이면 바꾸지 않고 빈 문자열, 이미 한 그룹 전체면 그 id를 그대로 돌려준다', () => {
    const l = layoutOf(['a', 'b@g1', 'c@g1'], ['g1'])
    let one = 'x'
    expect(
      produce(l, (d) => {
        one = groupItems(d, ['a'])
      }),
    ).toBe(l)
    expect(one).toBe('')
    let same = ''
    expect(
      produce(l, (d) => {
        same = groupItems(d, ['c'])
      }),
    ).toBe(l)
    expect(same).toBe('g1')
  })
})

describe('ungroup · 자동 해제', () => {
  it('ungroup은 groupId와 그룹 항목을 지우고 순서는 그대로 둔다', () => {
    const l = layoutOf(['a', 'b@g1', 'c@g1', 'd'], ['g1'])
    const next = produce(l, (d) => ungroup(d, 'g1'))
    expect(shape(next)).toEqual(['a', 'b', 'c', 'd'])
    expect(next.groups).toEqual([])
  })

  it('멤버를 지워 1개만 남으면 그룹이 자동 해제된다', () => {
    const l = layoutOf(['a@g1', 'b@g1', 'c'], ['g1'])
    const next = produce(l, (d) => deleteItems(d, ['a']))
    expect(shape(next)).toEqual(['b', 'c'])
    expect(next.groups).toEqual([])
  })
})

describe('normalizeGroups', () => {
  it('흩어진 멤버를 가장 위 멤버 자리로 모은다(연속성)', () => {
    const l = layoutOf(['a@g1', 'b', 'c@g1', 'd', 'e@g1', 'f'], ['g1'])
    const next = produce(l, (d) => normalizeGroups(d))
    expect(shape(next)).toEqual(['b', 'd', 'a@g1', 'c@g1', 'e@g1', 'f'])
  })

  it('서로 엇갈린 두 그룹도 각각 모은다', () => {
    const l = layoutOf(['a@g1', 'b@g2', 'c@g1', 'd@g2'], ['g1', 'g2'])
    const next = produce(l, (d) => normalizeGroups(d))
    expect(shape(next)).toEqual(['a@g1', 'c@g1', 'b@g2', 'd@g2'])
  })

  it('없는 그룹 참조 제거 · 멤버 1개 해제 · 빈 그룹 삭제 · 목록 중복 제거', () => {
    const l = layoutOf(['a@g1', 'b@g1', 'c@ghost', 'd@solo'], ['g1', 'g1', 'solo', 'empty'])
    const next = produce(l, (d) => normalizeGroups(d))
    expect(shape(next)).toEqual(['a@g1', 'b@g1', 'c', 'd'])
    expect(next.groups).toEqual([{ id: 'g1' }])
  })

  it('이미 정상이면 아무것도 바꾸지 않는다(같은 참조)', () => {
    const l = layoutOf(['a', 'b@g1', 'c@g1', 'd'], ['g1'])
    expect(produce(l, (d) => normalizeGroups(d))).toBe(l)
    expect(idsOf(l)).toEqual(['a', 'b', 'c', 'd'])
  })
})
