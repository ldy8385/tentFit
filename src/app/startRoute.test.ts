import { describe, expect, it } from 'vitest'
import type { LayoutSummary } from './layoutRepo'
import { startRoute } from './startRoute'

function summary(id: string, updatedAt: string, name = id): LayoutSummary {
  return { id, name, updatedAt, itemCount: 0 }
}

const OLD = summary('old', '2026-10-01T00:00:00.000Z')
const NEW = summary('new', '2026-10-08T00:00:00.000Z')

describe('startRoute(§4.7 앞머리, R16)', () => {
  it('lastLayoutId가 목록에 있으면 그 배치(더 최근 배치가 있어도)', () => {
    expect(startRoute([NEW, OLD], 'old')).toEqual({ name: 'edit', layoutId: 'old' })
  })

  it('목록에 없는 lastLayoutId는 무시하고 가장 최근에 수정한 배치', () => {
    expect(startRoute([OLD, NEW], 'gone')).toEqual({ name: 'edit', layoutId: 'new' })
  })

  it('lastLayoutId가 없으면 가장 최근에 수정한 배치(목록 순서와 무관)', () => {
    expect(startRoute([OLD, NEW], null)).toEqual({ name: 'edit', layoutId: 'new' })
  })

  it('배치가 하나도 없으면 고르기 화면', () => {
    expect(startRoute([], null)).toEqual({ name: 'pick' })
    expect(startRoute([], 'gone')).toEqual({ name: 'pick' })
  })

  it('넘긴 목록을 바꾸지 않는다', () => {
    const list = [OLD, NEW]
    startRoute(list, null)
    expect(list).toEqual([OLD, NEW])
  })
})
