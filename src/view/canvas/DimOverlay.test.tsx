// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { StoresProvider, createStores, type Stores } from '../../app/stores'
import { createLayout, type Item, type Shape, type Tent } from '../../core/model'
import { installFakeMatchMedia, type FakeMedia } from '../../ui/shell/fakeMatchMedia'
import { DESKTOP_QUERY } from '../../ui/shell/useIsDesktop'
import { activeDimSubject, cornerPopoverPos, DimOverlay } from './DimOverlay'

// 외곽 600×300(사각형 템플릿). 치수 층은 텐트 편집 모드(편집기·만들기·모양 편집 화면)만입니다(2026-10-15).
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
  const layout = createLayout(TENT, { name: 'l', id: 'L', now: '2026-10-15T00:00:00.000Z' })
  layout.items = [MAT]
  const stores = createStores(layout, { mode: opts.mode ?? 'tent' })
  stores.ui.getState().setSize({ width: 2000, height: 1600 })
  stores.ui.setState({ view: { zoom: 1, panX: 1000, panY: 800 } })
  if ((opts.mode ?? 'tent') === 'place') stores.ui.getState().setSelection(['m'])
  else stores.ui.getState().selectTentTarget('outer')
  render(
    <StoresProvider stores={stores}>
      <DimOverlay busy={opts.busy ?? false} hidden={false} />
    </StoresProvider>,
  )
  return stores
}

function outer(stores: Stores): Shape {
  return stores.doc.getState().layout.tent.outer
}

function editTo(name: string, text: string): void {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name.replace(/[()]/g, '\\$&')} `) }))
  const input = screen.getByRole('textbox', { name })
  fireEvent.change(input, { target: { value: text } })
  fireEvent.keyDown(input, { key: 'Enter' })
}

describe('DimOverlay', () => {
  it('배치 모드에서는 치수를 띄우지 않음(이동·회전만)', () => {
    setup({ mode: 'place' })
    expect(screen.queryByTestId('dim-overlay')).toBeNull()
  })

  it('외곽을 고르면 가로·세로 숫자', () => {
    setup()
    expect(screen.getByRole('button', { name: '가로 600cm 고치기' }).textContent).toBe('600')
    expect(screen.getByRole('button', { name: '세로 300cm 고치기' })).toBeTruthy()
  })

  it('숫자를 눌러 고치고 Enter → 비율 유지(기본)로 템플릿째 같은 배율, 실행 취소 1칸', () => {
    const s = setup()
    editTo('가로', '300')
    expect(s.doc.getState().layout.tent.outerTemplate).toEqual({ kind: 'rect', w: 300, h: 150 })
    expect(screen.queryByRole('textbox')).toBeNull()
    act(() => s.doc.getState().undo())
    expect(s.doc.getState().layout.tent.outerTemplate).toEqual({ kind: 'rect', w: 600, h: 300 })
  })

  it('비율 유지를 끄면 그 축만', () => {
    const s = setup()
    fireEvent.click(screen.getByRole('button', { name: /^세로 / }))
    fireEvent.click(screen.getByRole('switch', { name: '비율 유지' }))
    expect(s.ui.getState().keepRatio).toBe(false)
    const input = screen.getByRole('textbox', { name: '세로' })
    fireEvent.change(input, { target: { value: '350' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(outer(s)).toEqual({ kind: 'rect', w: 600, h: 350 })
  })

  it('범위 밖이면 문구를 보이고 입력 유지, Esc는 반영 없이 닫음', () => {
    const s = setup()
    editTo('가로', '0')
    expect(screen.getByRole('alert').textContent).toBe('1~5,000 사이로 입력해 주세요')
    const input = screen.getByRole('textbox', { name: '가로' })
    fireEvent.change(input, { target: { value: '150' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(outer(s)).toEqual({ kind: 'rect', w: 600, h: 300 })
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
    fireEvent.change(screen.getByRole('textbox', { name: '가로' }), { target: { value: '660' } })
    fireEvent.click(screen.getByRole('button', { name: '확인' }))
    expect(outer(s)).toEqual({ kind: 'rect', w: 660, h: 330 })
  })
})

describe('모서리 포인트(소유자 요청 2026-10-14)', () => {
  it('뾰족한 모서리 점을 누르면 옆에 둥글기 창, 그 모서리만 둥글게(점은 그대로 보임)', () => {
    const s = setup()
    const dot = screen.getByRole('button', { name: '모서리 3(오른쪽 아래) 둥글기 0cm 고치기' })
    expect(dot.getAttribute('data-dot')).toBe('true')
    fireEvent.click(dot)
    const pop = screen.getByRole('group', { name: '모서리 3(오른쪽 아래) 둥글기 고치기' })
    expect(pop.className).toContain('tf-dimedit--corner')
    const input = screen.getByRole('textbox', { name: '모서리 3(오른쪽 아래) 둥글기' })
    fireEvent.change(input, { target: { value: '12' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(outer(s)).toEqual({ kind: 'rect', w: 600, h: 300, radii: [0, 0, 12, 0] })
    expect(screen.getByRole('button', { name: '모서리 3(오른쪽 아래) 둥글기 12cm 고치기' }).textContent).toBe('R 12')
  })

  it('창 자리: 바깥쪽 옆에 여백 두고, 화면 끝이면 반대쪽으로·안으로', () => {
    const area = { left: 0, top: 0, right: 1000, bottom: 800 }
    expect(cornerPopoverPos([500, 400], [0.7, 0.7], area)).toEqual({ left: 516, top: 376 })
    expect(cornerPopoverPos([500, 400], [-0.7, -0.7], area)).toEqual({ left: 500 - 16 - 196, top: 400 - 72 })
    expect(cornerPopoverPos([950, 400], [0.7, 0.7], area).left).toBe(950 - 16 - 196)
    expect(cornerPopoverPos([500, 790], [0.7, 0.7], area).top).toBe(800 - 8 - 96)
  })
})

describe('activeDimSubject', () => {
  const layout = { ...createLayout(TENT, { name: 'l', id: 'L', now: '2026-10-15T00:00:00.000Z' }), items: [MAT] }
  const tent = { mode: 'tent' as const, measuring: false, drawing: null, tentTarget: 'outer' as const, tentLock: 'none' as const, outerPending: false }

  it('텐트 편집 대상만: 배치 모드·측정 중·그리는 중·잠긴 단계면 없음', () => {
    expect(activeDimSubject(tent, layout)?.subject).toEqual({ kind: 'tent', target: 'outer' })
    expect(activeDimSubject({ ...tent, mode: 'place' }, layout)).toBeNull()
    expect(activeDimSubject({ ...tent, measuring: true }, layout)).toBeNull()
    expect(activeDimSubject({ ...tent, drawing: { goal: 'outer', points: [] } }, layout)).toBeNull()
    expect(activeDimSubject({ ...tent, tentLock: 'outer' }, layout)).toBeNull()
  })
})
