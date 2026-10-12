import { describe, expect, it } from 'vitest'
import { editHash, parseHash, PICK_HASH } from './router'

describe('parseHash', () => {
  it("'#/edit/<id>'는 편집기", () => {
    expect(parseHash('#/edit/abc-123')).toEqual({ name: 'edit', layoutId: 'abc-123' })
    expect(parseHash('#/edit/abc-123/')).toEqual({ name: 'edit', layoutId: 'abc-123' })
  })

  it("'#/pick'(뒤 슬래시 허용)은 텐트 고르기", () => {
    expect(parseHash('#/pick')).toEqual({ name: 'pick' })
    expect(parseHash('#/pick/')).toEqual({ name: 'pick' })
    expect(parseHash(PICK_HASH)).toEqual({ name: 'pick' })
    expect(PICK_HASH).toBe('#/pick')
  })

  it('그 밖은 모두 시작', () => {
    for (const h of [
      '',
      '#',
      '#/',
      '#/edit',
      '#/edit/',
      '#/edit/a/b',
      '#edit/abc',
      '#/edit/%20',
      '#/edit/%E0%A4%A',
      '#pick',
      '#/pick/abc',
      '#/pick//',
      '#/picker',
    ]) {
      expect(parseHash(h)).toEqual({ name: 'start' })
    }
  })

  it('editHash와 왕복한다(인코딩이 필요한 id 포함)', () => {
    for (const id of ['8ed636c1-dcfd-44c0-ae0e-48c562ce4677', '배치 1', 'a/b?c#d']) {
      expect(parseHash(editHash(id))).toEqual({ name: 'edit', layoutId: id })
    }
    expect(editHash('abc')).toBe('#/edit/abc')
  })
})
