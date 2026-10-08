import { describe, expect, it } from 'vitest'
import { computeStats } from '../../core/stats'
import type { Inner, Item, Layout } from '../../core/model'
import type { View } from '../../view/viewport'
import { viewCenterWorld } from '../../view/viewport'
import { centerViewOn, warningRows, warningTargetPoint, withSubject } from './warningRows'

// 스펙 §13.2 공통 조건: 외곽 rect 600×300 @원점, 이너 rect 300×300 @(150,0)(오른쪽 벽 공유), 매트 200×60
function inner(id: string, name: string, x: number, w = 300): Inner {
  return { id, name, shape: { kind: 'rect', w, h: 300 }, x, y: 0, rotation: 0 }
}

function mat(id: string, name: string, x: number, y: number, countsArea = true): Item {
  return { id, name, shape: { kind: 'rect', w: 200, h: 60 }, x, y, rotation: 0, color: 'green', category: 'MAT', countsArea }
}

function layoutOf(inners: Inner[], items: Item[]): Layout {
  return {
    schemaVersion: 1,
    id: 'L',
    name: '테스트',
    createdAt: '2026-10-08T00:00:00.000Z',
    updatedAt: '2026-10-08T00:00:00.000Z',
    tent: { name: '텐트', outer: { kind: 'rect', w: 600, h: 300 }, inners },
    items,
    groups: [],
  }
}

const rowsOf = (l: Layout) => warningRows(l, computeStats(l))

describe('warningRows', () => {
  it('경고 없는 배치는 빈 배열', () => {
    expect(rowsOf(layoutOf([inner('i1', '이너 1', 150)], [mat('a', '매트', -150, 0)]))).toEqual([])
  })

  it('나감(G10)은 danger, 걸침(G2)은 warn. 이너가 1개면 이름 없이 "이너 벽에 걸침"', () => {
    const l = layoutOf([inner('i1', '이너 1', 150)], [mat('b', '걸친 매트', 0, 0), mat('a', '나간 매트', 250, 0)])
    expect(rowsOf(l)).toEqual([
      { key: 'item:a', kind: 'item', targetId: 'a', severity: 'danger', title: '나간 매트', reason: '텐트 밖으로 나감' },
      { key: 'item:b', kind: 'item', targetId: 'b', severity: 'warn', title: '걸친 매트', reason: '이너 벽에 걸침' },
    ])
  })

  it('나감과 걸침이 함께면 한 행에 사유를 이어 붙이고 danger', () => {
    // x −100~100, y 130~190: 아래 벽 밖으로 나가고 이너 왼쪽 벽(x=0)에 걸침
    const l = layoutOf([inner('i1', '이너 1', 150)], [mat('c', '매트', 0, 160)])
    expect(rowsOf(l)).toEqual([
      { key: 'item:c', kind: 'item', targetId: 'c', severity: 'danger', title: '매트', reason: '텐트 밖으로 나감 · 이너 벽에 걸침' },
    ])
  })

  it('이너가 여럿이면 걸친 이너 이름을 이너 순서대로 쓴다', () => {
    // 이너 100×300 두 개 @(−100,0), @(100,0) → 매트 x −100~100이 두 이너 벽에 모두 걸침
    const l = layoutOf([inner('i1', '이너 1', -100, 100), inner('i2', '이너 2', 100, 100)], [mat('a', '매트', 0, 0)])
    expect(rowsOf(l)).toEqual([
      { key: 'item:a', kind: 'item', targetId: 'a', severity: 'warn', title: '매트', reason: '이너 1 벽에 걸침 · 이너 2 벽에 걸침' },
    ])
  })

  it('이너 이탈(G8)은 innerEscape 행, danger, "이너 1이 외곽 밖으로 나감"', () => {
    const l = layoutOf([inner('i1', '이너 1', 200)], [])
    expect(rowsOf(l)).toEqual([
      { key: 'escape:i1', kind: 'innerEscape', targetId: 'i1', severity: 'danger', title: '이너 1', reason: '이너 1이 외곽 밖으로 나감' },
    ])
  })

  it('정렬: danger 먼저, 같은 등급은 물건(배열 순서) → 이너 이탈', () => {
    const l = layoutOf(
      [inner('i1', '이너 1', 200), inner('i2', '이너 2', -240, 100)],
      [mat('w1', '걸침 1', 50, 0), mat('o1', '나감 1', -250, 0), mat('w2', '걸침 2', 50, -100), mat('o2', '나감 2', 0, -160)],
    )
    expect(rowsOf(l).map((r) => [r.key, r.severity])).toEqual([
      ['item:o1', 'danger'],
      ['item:o2', 'danger'],
      ['escape:i1', 'danger'],
      ['item:w1', 'warn'],
      ['item:w2', 'warn'],
    ])
  })

  it('점유 면적 제외 물건은 걸침 대신 나감만 본다(O1)', () => {
    const l = layoutOf([inner('i1', '이너 1', 150)], [mat('r', '러그', 0, 0, false), mat('o', '러그 2', 250, 0, false)])
    expect(rowsOf(l).map((r) => [r.key, r.reason])).toEqual([['item:o', '텐트 밖으로 나감']])
  })
})

describe('withSubject', () => {
  it('받침 유무에 따라 이/가를 붙인다', () => {
    expect(withSubject('이너 1')).toBe('이너 1이')
    expect(withSubject('이너 2')).toBe('이너 2가')
    expect(withSubject('이너 10')).toBe('이너 10이')
    expect(withSubject('침실')).toBe('침실이')
    expect(withSubject('사랑채')).toBe('사랑채가')
    expect(withSubject('Room')).toBe('Room이(가)')
  })
})

describe('warningTargetPoint·centerViewOn', () => {
  it('물건은 월드 바운딩 박스 가운데, 이너 이탈은 이너 가운데', () => {
    const l = layoutOf([inner('i1', '이너 1', 200)], [mat('a', '매트', 250, 10)])
    const [itemRow] = warningRows(l, computeStats(l)).filter((r) => r.kind === 'item')
    const [escRow] = warningRows(l, computeStats(l)).filter((r) => r.kind === 'innerEscape')
    if (!itemRow || !escRow) throw new Error('행 없음')
    expect(warningTargetPoint(l, itemRow)).toEqual([250, 10])
    expect(warningTargetPoint(l, escRow)).toEqual([200, 0])
    expect(warningTargetPoint(l, { ...itemRow, targetId: '없는 id' })).toBeNull()
  })

  it('배율은 그대로 두고 대상이 보이는 영역 가운데에 오게 옮긴다', () => {
    const v: View = { zoom: 2, panX: 10, panY: 20 }
    const size = { width: 400, height: 600 }
    const insets = { top: 40, bottom: 200 }
    const next = centerViewOn(v, size, insets, [50, -30])
    expect(next.zoom).toBe(2)
    const c = viewCenterWorld(next, size, insets)
    expect(c[0]).toBeCloseTo(50, 9)
    expect(c[1]).toBeCloseTo(-30, 9)
  })
})
