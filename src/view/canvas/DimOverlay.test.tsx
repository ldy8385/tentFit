// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { StoresProvider, createStores, type Stores } from '../../app/stores'
import { createLayout, type Item, type Tent } from '../../core/model'
import { installFakeMatchMedia, type FakeMedia } from '../../ui/shell/fakeMatchMedia'
import { DESKTOP_QUERY } from '../../ui/shell/useIsDesktop'
import { activeDimSubject, DimOverlay } from './DimOverlay'

const TENT: Tent = { name: 't', outer: { kind: 'rect', w: 600, h: 300 }, outerTemplate: { kind: 'rect', w: 600, h: 300 }, inners: [] }
const MAT: Item = { id: 'm', name: '매트', shape: { kind: 'rect', w: 200, h: 60 }, x: 0, y: 0, rotation: 0, color: 'green', category: 'MAT', countsArea: true }

let media: FakeMedia
beforeEach(() => {
  media = installFakeMatchMedia({ [DESKTOP_QUERY]: true })
})
afterEach(() => {
  cleanup()
  media.restore()
})

function setup(opts: { mode?: 'tent' | 'place'; busy?: boolean } = {}): Stores {
  const layout = createLayout(TENT, { name: 'l', id: 'L', now: '2026-10-14T00:00:00.000Z' })
  layout.items = [MAT]
  const stores = createStores(layout, { mode: opts.mode ?? 'place' })
  stores.ui.getState().setSize({ width: 1000, height: 800 })
  stores.ui.setState({ view: { zoom: 2, panX: 500, panY: 400 } })
  if ((opts.mode ?? 'place') === 'place') stores.ui.getState().setSelection(['m'])
  else stores.ui.getState().selectTentTarget('outer')
  render(
    <StoresProvider stores={stores}>
      <DimOverlay busy={opts.busy ?? false} hidden={false} dimmed={new Set()} />
    </StoresProvider>,
  )
  return stores
}

function mat(stores: Stores): Item {
  return stores.doc.getState().layout.items[0] as Item
}

function editTo(name: string, text: string): void {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name} `) }))
  const input = screen.getByRole('textbox', { name })
  fireEvent.change(input, { target: { value: text } })
  fireEvent.keyDown(input, { key: 'Enter' })
}

describe('DimOverlay', () => {
  it('물건 하나를 고르면 가로·세로 숫자', () => {
    setup()
    expect(screen.getByRole('button', { name: '가로 200cm 고치기' }).textContent).toBe('200')
    expect(screen.getByRole('button', { name: '세로 60cm 고치기' })).toBeTruthy()
  })

  it('숫자를 눌러 고치고 Enter → 비율 유지(기본)로 전체 같은 배율, 실행 취소 1칸', () => {
    const s = setup()
    editTo('가로', '100')
    expect(mat(s).shape).toEqual({ kind: 'rect', w: 100, h: 30 })
    expect(screen.queryByRole('textbox')).toBeNull()
    act(() => s.doc.getState().undo())
    expect(mat(s).shape).toEqual({ kind: 'rect', w: 200, h: 60 })
  })

  it('비율 유지를 끄면 그 축만', () => {
    const s = setup()
    fireEvent.click(screen.getByRole('button', { name: /^세로 / }))
    fireEvent.click(screen.getByRole('switch', { name: '비율 유지' }))
    expect(s.ui.getState().keepRatio).toBe(false)
    const input = screen.getByRole('textbox', { name: '세로' })
    fireEvent.change(input, { target: { value: '70' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mat(s).shape).toEqual({ kind: 'rect', w: 200, h: 70 })
  })

  it('범위 밖이면 문구를 보이고 입력 유지, Esc는 반영 없이 닫음', () => {
    const s = setup()
    editTo('가로', '0')
    expect(screen.getByRole('alert').textContent).toBe('1~5,000 사이로 입력해 주세요')
    const input = screen.getByRole('textbox', { name: '가로' })
    fireEvent.change(input, { target: { value: '150' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(mat(s).shape).toEqual({ kind: 'rect', w: 200, h: 60 })
  })

  it('텐트 모드: 외곽 대상의 치수, 템플릿째 배율', () => {
    const s = setup({ mode: 'tent' })
    editTo('가로', '900')
    expect(s.doc.getState().layout.tent.outerTemplate).toEqual({ kind: 'rect', w: 900, h: 450 })
  })

  it('끄는 중이면 숨김', () => {
    setup({ busy: true })
    expect(screen.queryByTestId('dim-overlay')).toBeNull()
  })

  it('휴대폰: 키보드 위 막대에 이름·확인', () => {
    media.set(DESKTOP_QUERY, false)
    const s = setup()
    fireEvent.click(screen.getByRole('button', { name: /^가로 / }))
    const bar = screen.getByRole('group', { name: '가로 고치기' })
    expect(bar.className).toBe('tf-dimbar')
    fireEvent.change(screen.getByRole('textbox', { name: '가로' }), { target: { value: '220' } })
    fireEvent.click(screen.getByRole('button', { name: '확인' }))
    expect(mat(s).shape).toEqual({ kind: 'rect', w: 220, h: 66 })
  })
})

describe('activeDimSubject', () => {
  const layout = { ...createLayout(TENT, { name: 'l', id: 'L', now: '2026-10-14T00:00:00.000Z' }), items: [MAT] }
  const base = { mode: 'place' as const, measuring: false, drawing: null, tentTarget: null, tentLock: 'none' as const, outerPending: false, selection: ['m'] }

  it('여러 개·흐린 물건·측정 중·그리는 중·잠긴 단계면 없음', () => {
    expect(activeDimSubject(base, layout, new Set())?.subject).toEqual({ kind: 'item', id: 'm' })
    expect(activeDimSubject({ ...base, selection: ['m', 'x'] }, layout, new Set())).toBeNull()
    expect(activeDimSubject(base, layout, new Set(['m']))).toBeNull()
    expect(activeDimSubject({ ...base, measuring: true }, layout, new Set())).toBeNull()
    const tent = { ...base, mode: 'tent' as const, tentTarget: 'outer' as const }
    expect(activeDimSubject(tent, layout, new Set())?.subject).toEqual({ kind: 'tent', target: 'outer' })
    expect(activeDimSubject({ ...tent, drawing: { goal: 'outer', points: [] } }, layout, new Set())).toBeNull()
    expect(activeDimSubject({ ...tent, tentLock: 'outer' }, layout, new Set())).toBeNull()
  })
})
