import { describe, expect, it } from 'vitest'
import { itemLabelTooltip } from './itemTooltip'

describe('캔버스 물건 이름 툴팁(소유자 요청 2026-10-15)', () => {
  it('라벨이 말줄임으로 잘렸거나 숨었으면 전체 라벨', () => {
    expect(itemLabelTooltip('NEMO 텐서 올시즌 와이드 190×64', ['NEMO 텐서 올…'])).toBe('NEMO 텐서 올시즌 와이드 190×64')
    expect(itemLabelTooltip('매트 200×60', null)).toBe('매트 200×60')
    expect(itemLabelTooltip('매트 200×60', [])).toBe('매트 200×60')
  })

  it('다 보이면 없음', () => {
    expect(itemLabelTooltip('매트 200×60', ['매트 200×60'])).toBeNull()
  })
})
