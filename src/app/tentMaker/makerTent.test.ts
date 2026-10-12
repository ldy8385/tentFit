import { describe, expect, it } from 'vitest'
import { createLayout } from '../../core/model'
import { DEFAULT_TENT_NAME, finalTentName, initialTentName, makerLayout, makerConfirmTent, PLACEHOLDER_OUTER } from './makerTent'

describe('만들기 화면 텐트(Plan 4.1)', () => {
  it('처음 이름은 「내 텐트」(내 텐트 이름과 겹치면 번호)', () => {
    expect(initialTentName([])).toBe('내 텐트')
    expect(initialTentName(['내 텐트'])).toBe('내 텐트 2')
  })

  it('확정 이름은 앞뒤 공백을 떼고, 비면 「내 텐트」', () => {
    expect(finalTentName('  쉘터 A  ')).toBe('쉘터 A')
    expect(finalTentName('   ')).toBe(DEFAULT_TENT_NAME)
  })

  it('자리표시 배치: 외곽 400×200(외곽 없음 표시와 함께 씀), 이너 없음', () => {
    const l = makerLayout('내 텐트')
    expect(l.tent).toEqual({ name: '내 텐트', outer: PLACEHOLDER_OUTER, inners: [] })
  })

  it('확정 텐트는 이름을 넣은 복사본', () => {
    const l = createLayout({ name: 'x', outer: { kind: 'rect', w: 400, h: 300 }, outerTemplate: { kind: 'rect', w: 400, h: 300 }, inners: [] }, { name: 'm' })
    const tent = makerConfirmTent(l, ' 쉘터 ')
    expect(tent).toEqual({ name: '쉘터', outer: { kind: 'rect', w: 400, h: 300 }, outerTemplate: { kind: 'rect', w: 400, h: 300 }, inners: [] })
    tent.inners.push({ id: 'a', name: 'a', shape: { kind: 'rect', w: 1, h: 1 }, x: 0, y: 0, rotation: 0 })
    expect(l.tent.inners).toEqual([])
  })
})
