// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { createLayout } from '../core/model'
import { loadGridStep, loadGuidesVisible, loadSegmentDims, loadSymmetryMode, setGridStep, setGuidesVisible, setSegmentDims, setSymmetryAxis, setSymmetryMode } from './gridActions'
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

describe('구간 치수 켜기·끄기(소유자 요청 2026-10-16)', () => {
  afterEach(() => localStorage.removeItem('tentfit.segmentDims'))

  it('기본 끔, 켜면 기억해서 다음에도 켜짐', () => {
    const s = setup()
    expect(s.ui.getState().segmentDims).toBe(false)
    expect(loadSegmentDims()).toBe(false)
    setSegmentDims(s, true)
    expect(s.ui.getState().segmentDims).toBe(true)
    expect(setup().ui.getState().segmentDims).toBe(true)
    setSegmentDims(s, false)
    expect(loadSegmentDims()).toBe(false)
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

describe('대칭 맞춤 축(소유자 요청 2026-10-15: 좌우·상하 고르기)', () => {
  afterEach(() => {
    localStorage.removeItem('tentfit.symmetryMode')
  })

  // 소유자 요청 2026-10-16: 기본값은 끄기 — 고른 축을 기억하지 않아 새로 열 때마다 끄기로 시작
  it('기본 끄기, 좌우·상하로 바꿔도 기억하지 않아 새로 열면 끄기', () => {
    const s = setup()
    expect(s.ui.getState().symmetryAxis).toBe('off')
    setSymmetryAxis(s, 'y')
    expect(s.ui.getState().symmetryAxis).toBe('y')
    expect(setup().ui.getState().symmetryAxis).toBe('off')
    expect(localStorage.getItem('tentfit.symmetryAxis')).toBeNull()
  })

  it('예전에 기억해 둔 축이 있어도 끄기로 시작', () => {
    localStorage.setItem('tentfit.symmetryAxis', 'x')
    expect(setup().ui.getState().symmetryAxis).toBe('off')
  })

  it('방식: 기본 자동 맞춤, 안내 표기로 바꾸면 기억(잘못된 값은 자동 맞춤)', () => {
    const s = setup()
    expect(s.ui.getState().symmetryMode).toBe('mirror')
    setSymmetryMode(s, 'guide')
    expect(s.ui.getState().symmetryMode).toBe('guide')
    expect(setup().ui.getState().symmetryMode).toBe('guide')
    localStorage.setItem('tentfit.symmetryMode', 'zz')
    expect(loadSymmetryMode()).toBe('mirror')
  })
})
