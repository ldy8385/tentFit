// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { createLayout } from '../core/model'
import { loadGridStep, loadGuidesVisible, setGridStep, setGuidesVisible } from './gridActions'
import { createStores } from './stores'

const KEY = 'tentfit.gridStep'

function setup() {
  return createStores(createLayout({ name: 't', outer: { kind: 'rect', w: 600, h: 300 }, inners: [] }, { name: 'l', id: 'L', now: '2026-10-15T00:00:00.000Z' }))
}

afterEach(() => localStorage.removeItem(KEY))

describe('격자 간격(소유자 요청 2026-10-15)', () => {
  it('기본 10cm, 1~1000 정수로 맞추고 이 브라우저에 기억', () => {
    const s = setup()
    expect(s.ui.getState().gridStep).toBe(10)
    setGridStep(s, 2.6)
    expect(s.ui.getState().gridStep).toBe(3)
    setGridStep(s, 5000)
    expect(s.ui.getState().gridStep).toBe(1000)
    setGridStep(s, 0)
    expect(s.ui.getState().gridStep).toBe(1)
    expect(localStorage.getItem(KEY)).toBe('1')
    expect(setup().ui.getState().gridStep).toBe(1)
  })

  it('숫자가 아니면 그대로, 저장값이 잘못되면 10cm', () => {
    const s = setup()
    setGridStep(s, Number.NaN)
    expect(s.ui.getState().gridStep).toBe(10)
    localStorage.setItem(KEY, 'abc')
    expect(loadGridStep()).toBe(10)
    localStorage.setItem(KEY, '0')
    expect(loadGridStep()).toBe(10)
  })
})

describe('정렬 안내선 켜기·끄기(소유자 요청 2026-10-15)', () => {
  afterEach(() => localStorage.removeItem('tentfit.guidesVisible'))

  it('기본 켬, 끄면 기억해서 다음에도 꺼짐', () => {
    const s = setup()
    expect(s.ui.getState().guidesVisible).toBe(true)
    setGuidesVisible(s, false)
    expect(s.ui.getState().guidesVisible).toBe(false)
    expect(setup().ui.getState().guidesVisible).toBe(false)
    expect(loadGuidesVisible()).toBe(false)
  })
})
