// @vitest-environment happy-dom
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StoresProvider, createStores, type Stores } from '../../app/stores'
import { createLayout, type Inner, type Tent } from '../../core/model'
import { EDGES_LABEL } from './PolygonFields'
import { ANGLES_LABEL, COORDS_LABEL, DRAWING_HINT, EDGE_HINT, EMPTY_TARGET_TEXT, FREE_EDIT_LABEL, TentEditor, type TentEditorVariant } from './TentEditor'

afterEach(() => {
  vi.useRealTimers()
})

function rectInner(id: string, name: string, w: number, h: number, x: number, y: number): Inner {
  return { id, name, shape: { kind: 'rect', w, h }, template: { kind: 'rect', w, h }, x, y, rotation: 0 }
}

/** 외곽 600×300(가운데 원점), 이너 1 = 200×200 @(−150,0) → x −250~−50, 이너 2 = 100×100 @(150,0) → x 100~200 */
const TWO_INNERS: Tent = {
  name: '시험 텐트',
  outer: { kind: 'rect', w: 600, h: 300 },
  outerTemplate: { kind: 'rect', w: 600, h: 300 },
  inners: [rectInner('i1', '이너 1', 200, 200, -150, 0), rectInner('i2', '이너 2', 100, 100, 150, 0)],
}

/** 자유 다각형 외곽(템플릿 없음) 600×300, 기준점(왼쪽 위) = (−300, −150) */
const POLY: Tent = {
  name: '다각형 텐트',
  outer: {
    kind: 'polygon',
    points: [
      [-300, -150],
      [300, -150],
      [300, 150],
      [-300, 150],
    ],
  },
  inners: [],
}

function setup(
  tent: Tent,
  opts: {
    variant?: TentEditorVariant
    target?: 'outer' | string | null
    vertex?: number
    context?: 'editor' | 'maker'
    before?: (s: Stores) => void
  } = {},
): Stores {
  const stores = createStores(createLayout(tent, { name: '배치', id: 'L1', now: '2026-10-08T00:00:00.000Z' }))
  const ui = stores.ui.getState()
  ui.setMode('tent')
  opts.before?.(stores)
  const t = opts.target ?? null
  if (t !== null) ui.selectTentTarget(t === 'outer' ? 'outer' : { innerId: t }, opts.vertex ?? null)
  render(
    <StoresProvider stores={stores}>
      <TentEditor variant={opts.variant ?? 'panel'} context={opts.context ?? 'editor'} />
    </StoresProvider>,
  )
  return stores
}

/** 메뉴 버튼을 열고 항목을 고릅니다 */
function pickMenu(button: string, item: string): void {
  fireEvent.click(within(editor()).getByRole('button', { name: button }))
  fireEvent.click(within(editor()).getByRole('menuitem', { name: item }))
}

/** 접힌 칸(꼭짓점 각도·좌표로 고치기)을 엽니다 */
function expand(name: string): void {
  fireEvent.click(within(editor()).getByRole('button', { name }))
}

function editor(): HTMLElement {
  return screen.getByTestId('tent-editor')
}

function field(label: string): HTMLInputElement {
  return within(editor()).getByLabelText(label) as HTMLInputElement
}

/** 입력하고 Enter(포커스는 그대로) */
function typeEnter(el: HTMLInputElement, text: string): void {
  act(() => el.focus())
  fireEvent.change(el, { target: { value: text } })
  fireEvent.keyDown(el, { key: 'Enter' })
}

function listRow(name: RegExp): HTMLElement {
  return within(within(editor()).getByRole('list', { name: '텐트 구성' })).getByRole('button', { name })
}

function tableInputs(): HTMLInputElement[] {
  return within(screen.getByTestId('tent-vertex-table')).getAllByRole('textbox') as HTMLInputElement[]
}

describe('TentEditor 구성 목록(§4.4-3)', () => {
  it('외곽 / 이너 1 / 이너 2 / [+ 이너] 한 목록, 선택한 행만 강조', () => {
    const stores = setup(TWO_INNERS, { target: 'i2' })
    const list = within(editor()).getByRole('list', { name: '텐트 구성' })
    const rows = within(list).getAllByRole('button')
    expect(rows.map((r) => r.textContent)).toEqual([
      '외곽사각형 · 600 × 300 cm',
      '이너 1사각형 · 200 × 200 cm',
      '이너 2사각형 · 100 × 100 cm',
      '+ 이너',
    ])
    expect(rows.map((r) => r.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true', null])
    fireEvent.click(rows[0]!)
    expect(stores.ui.getState().tentTarget).toBe('outer')
    expect(rows[0]!.getAttribute('aria-pressed')).toBe('true')
  })

  it('대상이 없으면 목록과 안내 문구, 편집 칸 없음', () => {
    setup(TWO_INNERS)
    expect(within(editor()).getByText(EMPTY_TARGET_TEXT)).toBeTruthy()
    expect(screen.queryByTestId('tent-target-fields')).toBeNull()
    expect(within(editor()).getByRole('button', { name: '텐트 바꾸기' })).toBeTruthy()
    expect(within(editor()).getByRole('button', { name: '내 텐트로 저장' })).toBeTruthy() // Plan 7(2026-10-15)
  })

  it('[+ 이너 ▾] → 사각형은 새 이너를 만들고 그 이너를 대상으로 고른다', () => {
    const stores = setup({ ...TWO_INNERS, inners: [] })
    pickMenu('+ 이너', '사각형')
    const inners = stores.doc.getState().layout.tent.inners
    expect(inners).toHaveLength(1)
    expect(stores.ui.getState().tentTarget).toEqual({ innerId: inners[0]!.id })
    expect(listRow(/^이너 1/).getAttribute('aria-pressed')).toBe('true')
  })

  it('[텐트 바꾸기]는 텐트 바꾸기 대화상자를 연다(editorDialog)', () => {
    const stores = setup(TWO_INNERS, { target: 'outer' })
    fireEvent.click(within(editor()).getByRole('button', { name: '텐트 바꾸기' }))
    expect(stores.ui.getState().editorDialog).toBe('swapTent')
  })

  it("variant 'sheet'는 제목 줄 없이 같은 내용(제목은 시트가 그림)", () => {
    setup(TWO_INNERS, { variant: 'sheet', target: 'outer' })
    expect(editor().dataset.variant).toBe('sheet')
    expect(within(editor()).queryByRole('heading', { name: '텐트 편집' })).toBeNull()
    expect(within(editor()).getByRole('list', { name: '텐트 구성' })).toBeTruthy()
  })
})

describe('TentEditor 템플릿 대상', () => {
  it('템플릿 대상은 치수 칸만 있고 좌표 표가 없다. 버튼을 누르면 표가 보이지만 문서는 그대로', () => {
    const stores = setup(TWO_INNERS, { target: 'outer' })
    expect(field('가로').value).toBe('600')
    expect(field('세로').value).toBe('300')
    expect(screen.queryByTestId('tent-vertex-table')).toBeNull()
    fireEvent.click(within(editor()).getByRole('button', { name: FREE_EDIT_LABEL }))
    expect(tableInputs()).toHaveLength(8) // 꼭짓점 4개 × (X, Y)
    expect(tableInputs()[0]!.value).toBe('0') // 기준점 = 외곽 bbox 왼쪽 위
    expect(tableInputs()[2]!.value).toBe('600')
    expect(stores.doc.getState().layout.tent.outerTemplate).toEqual({ kind: 'rect', w: 600, h: 300 })
    expect(stores.doc.getState().canUndo).toBe(false)
    expect(within(editor()).queryByRole('button', { name: FREE_EDIT_LABEL })).toBeNull()
  })

  it('표를 연 뒤 다른 대상을 고르면 표가 닫히고 버튼이 다시 보인다', () => {
    const stores = setup(TWO_INNERS, { target: 'outer' })
    fireEvent.click(within(editor()).getByRole('button', { name: FREE_EDIT_LABEL }))
    act(() => stores.ui.getState().selectTentTarget({ innerId: 'i1' }))
    expect(screen.queryByTestId('tent-vertex-table')).toBeNull()
    expect(within(editor()).getByRole('button', { name: FREE_EDIT_LABEL })).toBeTruthy()
  })

  it('치수를 바꾸면 템플릿에 반영(실행 취소 1칸) — 비율 유지 끔이면 그 축만', () => {
    const stores = setup(TWO_INNERS, { target: 'outer', before: (s) => s.ui.getState().patch({ keepRatio: false }) })
    typeEnter(field('가로'), '640')
    expect(stores.doc.getState().layout.tent.outerTemplate).toEqual({ kind: 'rect', w: 640, h: 300 })
    expect(stores.doc.getState().layout.tent.outer).toEqual({ kind: 'rect', w: 640, h: 300 })
    expect(stores.doc.getState().canUndo).toBe(true)
  })

  it('비율 유지(기본 켬)면 사각형 가로를 바꿀 때 세로도 같은 배율', () => {
    const stores = setup(TWO_INNERS, { target: 'outer' })
    expect((within(editor()).getByRole('switch', { name: '비율 유지' }) as HTMLInputElement).checked).toBe(true)
    typeEnter(field('가로'), '660')
    expect(stores.doc.getState().layout.tent.outerTemplate).toEqual({ kind: 'rect', w: 660, h: 330 })
  })

  it('Review Focus 3: 같은 값을 넣으면 기록이 남지 않는다', () => {
    const stores = setup(TWO_INNERS, { target: 'outer' })
    typeEnter(field('가로'), '600')
    act(() => field('가로').blur())
    expect(stores.doc.getState().canUndo).toBe(false)
  })

  it('Review Focus 2: 이너끼리 겹치게 하는 치수는 그 칸에 오류를 보이고 반영하지 않는다', () => {
    const stores = setup(TWO_INNERS, { target: 'i1' })
    // 이너 1 가로 520 → x −410~110, 이너 2(x 100~) 와 10cm 겹침
    typeEnter(field('가로'), '520')
    expect(within(editor()).getByRole('alert').textContent).toBe('이너 1과(와) 이너 2이(가) 5mm 넘게 겹쳐요')
    expect(field('가로').value).toBe('200')
    expect(stores.doc.getState().layout.tent.inners[0]!.template).toEqual({ kind: 'rect', w: 200, h: 200 })
    expect(stores.doc.getState().canUndo).toBe(false)
  })

  it('보류 Minor #12: 오류가 난 뒤 다른 대상을 고르면 새 대상의 칸에는 오류가 없다', () => {
    const stores = setup(TWO_INNERS, { target: 'i1' })
    typeEnter(field('가로'), '520')
    expect(within(editor()).queryByRole('alert')).not.toBeNull()
    act(() => field('가로').blur())
    act(() => stores.ui.getState().selectTentTarget({ innerId: 'i2' }))
    expect(field('가로').value).toBe('100')
    expect(within(editor()).queryByRole('alert')).toBeNull()
  })

  it('정사각형을 켜면 세로가 가로에 묶이고 세로 칸은 잠긴다', () => {
    const stores = setup(TWO_INNERS, { target: 'outer' })
    fireEvent.click(within(editor()).getByRole('checkbox', { name: '정사각형' }))
    expect(stores.doc.getState().layout.tent.outerTemplate).toEqual({ kind: 'rect', w: 600, h: 600, square: true })
    expect(field('세로').disabled).toBe(true)
    expect(field('세로').value).toBe('600')
  })

  it('원 외곽은 지름만, [꼭짓점 직접 편집] 버튼이 없다', () => {
    const stores = setup({ name: '원', outer: { kind: 'circle', d: 400 }, outerTemplate: { kind: 'circle', d: 400 }, inners: [] }, { target: 'outer' })
    expect(field('지름').value).toBe('400')
    expect(within(editor()).queryByRole('button', { name: FREE_EDIT_LABEL })).toBeNull()
    expect(within(editor()).queryByLabelText('가로')).toBeNull()
    typeEnter(field('지름'), '450')
    expect(stores.doc.getState().layout.tent.outer).toEqual({ kind: 'circle', d: 450 })
  })

  it('사다리꼴은 도면 용어로 윗변(뒤)·아랫변(앞)·세로·치우침([±])과 도움말', () => {
    const stores = setup(
      {
        name: '사다리꼴',
        outer: { kind: 'rect', w: 1, h: 1 },
        outerTemplate: { kind: 'trapezoid', front: 300, back: 200, depth: 250, offset: 0 },
        inners: [],
      },
      { target: 'outer' },
    )
    for (const label of ['윗변(뒤)', '아랫변(앞)', '세로', '치우침']) expect(field(label)).toBeTruthy()
    expect(field('윗변(뒤)').value).toBe('200')
    expect(field('아랫변(앞)').value).toBe('300')
    expect(field('세로').value).toBe('250')
    expect(within(editor()).getByRole('button', { name: '치우침 부호 바꾸기' })).toBeTruthy()
    expect(within(editor()).getByText('+면 윗변이 오른쪽으로')).toBeTruthy()
    typeEnter(field('치우침'), '30')
    expect(stores.doc.getState().layout.tent.outerTemplate).toEqual({ kind: 'trapezoid', front: 300, back: 200, depth: 250, offset: 30 })
  })

  it('정N각형: 변 수는 정수만, 크기 기준을 바꾸면 같은 도형이 되게 환산', () => {
    const stores = setup(
      { name: '육각', outer: { kind: 'rect', w: 1, h: 1 }, outerTemplate: { kind: 'ngon', n: 6, sizeBy: 'diameter', size: 400 }, inners: [] },
      { target: 'outer' },
    )
    typeEnter(field('변 수'), '6.5')
    expect(within(editor()).getByRole('alert').textContent).toBe('5~12 사이의 정수로 입력해 주세요')
    expect(stores.doc.getState().canUndo).toBe(false)
    fireEvent.click(within(editor()).getByRole('radio', { name: '한 변' }))
    expect(stores.doc.getState().layout.tent.outerTemplate).toEqual({ kind: 'ngon', n: 6, sizeBy: 'side', size: 200 })
    expect(field('한 변').value).toBe('200')
  })
})

describe('TentEditor 자유 다각형과 좌표 표(D32)', () => {
  it('자유 다각형의 좌표 표는 「좌표로 고치기」를 열면 보인다(기준점 = 외곽 bbox 왼쪽 위)', () => {
    setup(POLY, { target: 'outer' })
    expect(within(editor()).queryByRole('button', { name: FREE_EDIT_LABEL })).toBeNull()
    expect(screen.queryByTestId('tent-vertex-table')).toBeNull()
    expand(COORDS_LABEL)
    expect(tableInputs().map((i) => i.value)).toEqual(['0', '0', '600', '0', '600', '300', '0', '300'])
  })

  it('기준점 고정: 왼쪽 위 꼭짓점 x를 −50으로 넣는 동안 다른 칸 표시값이 바뀌지 않고, 표를 떠나면 한 번 다시 매겨진다', () => {
    const stores = setup(POLY, { target: 'outer' })
    expand(COORDS_LABEL)
    typeEnter(tableInputs()[0]!, '-50')
    // 월드에는 기준점(−300)을 더해 −350으로 저장
    expect(stores.doc.getState().layout.tent.outer).toEqual({
      kind: 'polygon',
      points: [
        [-350, -150],
        [300, -150],
        [300, 150],
        [-300, 150],
      ],
    })
    // 포커스가 표 안에 있는 동안: 기준점(−300) 그대로
    expect(tableInputs().map((i) => i.value)).toEqual(['-50', '0', '600', '0', '600', '300', '0', '300'])
    act(() => (document.activeElement as HTMLElement).blur())
    // 표를 떠나면 새 bbox 왼쪽 위(−350) 기준
    expect(tableInputs().map((i) => i.value)).toEqual(['0', '0', '650', '0', '650', '300', '50', '300'])
  })

  it('자기교차가 되는 입력은 그 칸에 오류, 문서 그대로', () => {
    const stores = setup(POLY, { target: 'outer' })
    expand(COORDS_LABEL)
    // 1번 꼭짓점을 (700, 0)으로 → 변 1-2와 3-4가 교차
    typeEnter(tableInputs()[0]!, '700')
    expect(within(screen.getByTestId('tent-vertex-table')).getByRole('alert').textContent).toBe('외곽: 변끼리 교차해요')
    expect(stores.doc.getState().layout.tent.outer).toEqual(POLY.outer)
    expect(stores.doc.getState().canUndo).toBe(false)
  })

  it('템플릿 대상의 표에 같은 값을 넣으면 자유 다각형으로 바뀌지 않는다(기록 없음)', () => {
    const stores = setup(TWO_INNERS, { target: 'outer' })
    fireEvent.click(within(editor()).getByRole('button', { name: FREE_EDIT_LABEL }))
    typeEnter(tableInputs()[2]!, '600')
    expect(stores.doc.getState().layout.tent.outerTemplate).toEqual({ kind: 'rect', w: 600, h: 300 })
    expect(stores.doc.getState().canUndo).toBe(false)
  })

  it('선택 꼭짓점: 표가 없으면 x·y 칸, 입력하면 자유 다각형이 된다. [꼭짓점 삭제]', () => {
    const stores = setup(TWO_INNERS, { target: 'outer', vertex: 1 })
    const box = screen.getByTestId('tent-selected-vertex')
    expect(within(box).getByText('2번 꼭짓점')).toBeTruthy()
    expect((within(box).getByLabelText('X') as HTMLInputElement).value).toBe('600')
    typeEnter(within(box).getByLabelText('X') as HTMLInputElement, '620')
    expect(stores.doc.getState().layout.tent.outer.kind).toBe('polygon')
    expect(stores.doc.getState().layout.tent.outerTemplate).toBeUndefined()
    act(() => (document.activeElement as HTMLElement).blur())
    fireEvent.click(within(screen.getByTestId('tent-selected-vertex')).getByRole('button', { name: '꼭짓점 삭제' }))
    const outer = stores.doc.getState().layout.tent.outer
    expect(outer.kind === 'polygon' ? outer.points : []).toHaveLength(3)
    expect(stores.ui.getState().vertexIndex).toBeNull()
  })

  it('꼭짓점이 3개면 [꼭짓점 삭제]가 비활성', () => {
    setup(
      {
        name: '삼각',
        outer: {
          kind: 'polygon',
          points: [
            [0, -100],
            [100, 100],
            [-100, 100],
          ],
        },
        inners: [],
      },
      { target: 'outer', vertex: 0 },
    )
    expect(
      (within(screen.getByTestId('tent-selected-vertex')).getByRole('button', { name: '꼭짓점 삭제' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })
})

describe('TentEditor 이너', () => {
  it('이름·회전·[90도]·삭제가 있고 외곽에는 없다', () => {
    const stores = setup(TWO_INNERS, { target: 'i1' })
    expect(field('이름').value).toBe('이너 1')
    expect(field('회전').value).toBe('0')
    expect(within(editor()).getByRole('button', { name: '90도' })).toBeTruthy()
    expect(within(editor()).getByRole('button', { name: '이너 1 삭제' })).toBeTruthy()
    act(() => stores.ui.getState().selectTentTarget('outer'))
    expect(within(editor()).queryByLabelText('이름')).toBeNull()
    expect(within(editor()).queryByLabelText('회전')).toBeNull()
    expect(within(editor()).queryByRole('button', { name: /삭제$/ })).toBeNull()
  })

  it('이름을 바꾸면 목록·제목이 바뀐다(최대 길이 공용 상수)', () => {
    const stores = setup(TWO_INNERS, { target: 'i1' })
    expect(field('이름').maxLength).toBe(40)
    typeEnter(field('이름'), '  침실  ')
    expect(stores.doc.getState().layout.tent.inners[0]!.name).toBe('침실')
    expect(listRow(/^침실/)).toBeTruthy()
    expect(within(editor()).getByRole('heading', { name: /^침실/ })).toBeTruthy()
  })

  it('회전 입력은 [0,360)으로, [90도]는 90°씩', () => {
    const stores = setup(TWO_INNERS, { target: 'i1' })
    typeEnter(field('회전'), '405')
    expect(stores.doc.getState().layout.tent.inners[0]!.rotation).toBe(45)
    act(() => field('회전').blur())
    fireEvent.click(within(editor()).getByRole('button', { name: '90도' }))
    expect(stores.doc.getState().layout.tent.inners[0]!.rotation).toBe(135)
  })

  it('Review Focus 3: 이너 삭제 → 대상 해제 → 실행 취소 → 이너는 돌아오고 대상은 없음(dangling 없음)', () => {
    const stores = setup(TWO_INNERS, { target: 'i1' })
    fireEvent.click(within(editor()).getByRole('button', { name: '이너 1 삭제' }))
    expect(stores.doc.getState().layout.tent.inners.map((i) => i.id)).toEqual(['i2'])
    expect(stores.ui.getState().tentTarget).toBeNull()
    expect(within(editor()).getByText(EMPTY_TARGET_TEXT)).toBeTruthy()
    act(() => stores.doc.getState().undo())
    expect(stores.doc.getState().layout.tent.inners.map((i) => i.id)).toEqual(['i1', 'i2'])
    expect(stores.ui.getState().tentTarget).toBeNull()
    expect(within(editor()).getByText(EMPTY_TARGET_TEXT)).toBeTruthy()
    act(() => stores.doc.getState().redo())
    expect(stores.ui.getState().tentTarget).toBeNull()
    expect(screen.queryByTestId('tent-target-fields')).toBeNull()
  })
})

describe('TentEditor 측정 중(§4.3)', () => {
  it('measuring이면 목록·입력·버튼이 모두 비활성', () => {
    const stores = setup(TWO_INNERS, { target: 'i1' })
    act(() => stores.ui.getState().patch({ measuring: true }))
    for (const b of within(editor()).getAllByRole('button')) expect((b as HTMLButtonElement).disabled).toBe(true)
    for (const i of within(editor()).getAllByRole('textbox')) expect((i as HTMLInputElement).disabled).toBe(true)
    expect((within(editor()).getByRole('checkbox', { name: '정사각형' }) as HTMLInputElement).disabled).toBe(true)
    fireEvent.click(within(editor()).getByRole('button', { name: '텐트 바꾸기' }))
    expect(stores.ui.getState().editorDialog).toBeNull()
  })
})

/** 맞춤으로 직각인 대충 그린 외곽 600×330(밑변 590) */
const ROUGH: Tent = {
  name: '그린 텐트',
  outer: { kind: 'polygon', points: [[0, 0], [600, 0], [600, 330], [10, 330]] },
  inners: [],
}

function outerPoints(stores: Stores): number[][] {
  const o = stores.doc.getState().layout.tent.outer
  return o.kind === 'polygon' ? o.points : []
}

describe('TentEditor 예시 모양 메뉴(Plan 4.1 §3)', () => {
  it('[+ 이너 ▾] 항목: 사각형·사다리꼴·정N각형·원·자유 그리기, 자유 그리기는 새 이너 그리기를 시작', () => {
    const stores = setup(TWO_INNERS)
    fireEvent.click(within(editor()).getByRole('button', { name: '+ 이너' }))
    expect(within(editor()).getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['사각형', '사다리꼴', '오각형(전실)', '육각형', '정N각형', '원', '자유 그리기'])
    fireEvent.click(within(editor()).getByRole('menuitem', { name: '자유 그리기' }))
    expect(stores.ui.getState().drawing).toEqual({ goal: 'newInner', points: [] })
  })

  it('[모양 바꾸기 ▾]: 지금 종류는 비활성, 원을 고르면 지름 = 짧은 변(1칸)', () => {
    const stores = setup(TWO_INNERS, { target: 'outer' })
    fireEvent.click(within(editor()).getByRole('button', { name: '모양 바꾸기' }))
    const rect = within(editor()).getByRole('menuitem', { name: '사각형' }) as HTMLButtonElement
    expect(rect.disabled).toBe(true)
    fireEvent.click(within(editor()).getByRole('menuitem', { name: '원' }))
    expect(stores.doc.getState().layout.tent.outer).toEqual({ kind: 'circle', d: 300 })
    expect(stores.doc.getState().canUndo).toBe(true)
  })

  it('[다시 그리기]는 그 대상 그리기를 시작한다(원도 가능)', () => {
    const stores = setup({ name: '원', outer: { kind: 'circle', d: 400 }, outerTemplate: { kind: 'circle', d: 400 }, inners: [] }, { target: 'outer' })
    fireEvent.click(within(editor()).getByRole('button', { name: '다시 그리기' }))
    expect(stores.ui.getState().drawing?.goal).toBe('outer')
  })

  it('그리는 중에는 대상 칸 대신 안내', () => {
    const stores = setup(TWO_INNERS, { target: 'outer' })
    act(() => stores.ui.getState().startDrawing('outer'))
    expect(screen.queryByTestId('tent-target-fields')).toBeNull()
    expect(within(editor()).getByText(DRAWING_HINT)).toBeTruthy()
  })
})

describe('TentEditor 자유 다각형 cm 맞추기(Plan 4.1 §2.3)', () => {
  it('전체 크기·비율 유지, 변 길이 표·각도·좌표는 접힘(표를 열면 닫는 변까지 변 1…n 모두 입력)', () => {
    setup(ROUGH, { target: 'outer' })
    expect(field('가로').value).toBe('600')
    expect(field('세로').value).toBe('330')
    expect(within(editor()).getByRole('switch', { name: '비율 유지' })).toBeTruthy()
    expect(within(editor()).queryByLabelText('변 1')).toBeNull()
    expand(EDGES_LABEL)
    expect(['변 1', '변 2', '변 3', '변 4'].map((l) => field(l).value)).toEqual(['600', '330', '590', '330.2'])
    expect(within(editor()).queryByLabelText('꼭짓점 2')).toBeNull()
    expect(screen.queryByTestId('tent-vertex-table')).toBeNull()
  })

  it('비율 유지 끔: 변 1=620·변 2=320·변 3=620 → 정확한 620×320(각 1칸)', () => {
    const stores = setup(ROUGH, { target: 'outer', before: (s) => s.ui.getState().patch({ keepRatio: false }) })
    expand(EDGES_LABEL)
    typeEnter(field('변 1'), '620')
    typeEnter(field('변 2'), '320')
    typeEnter(field('변 3'), '620')
    expect(outerPoints(stores)).toEqual([[0, 0], [620, 0], [620, 320], [0, 320]])
    expect(field('변 4').value).toBe('320')
  })

  it('비율 유지 켬: 변 하나를 바꾸면 모양 그대로 전체 배율', () => {
    const stores = setup({ ...ROUGH, outer: { kind: 'polygon', points: [[0, 0], [600, 0], [600, 300], [0, 300]] } }, { target: 'outer' })
    expand(EDGES_LABEL)
    typeEnter(field('변 2'), '600')
    expect(outerPoints(stores)).toEqual([[-300, -150], [900, -150], [900, 450], [-300, 450]])
  })

  it('닫는 변이 0이 되는 변 길이는 그 칸에 오류, 문서 그대로', () => {
    const stores = setup(
      { ...ROUGH, outer: { kind: 'polygon', points: [[0, 0], [400, 0], [400, 300], [0, 300], [0, 100]] } },
      { target: 'outer', before: (s) => s.ui.getState().patch({ keepRatio: false }) },
    )
    expand(EDGES_LABEL)
    typeEnter(field('변 4'), '300')
    expect(within(editor()).getByRole('alert').textContent).toBe('변 길이가 0이 돼요')
    expect(stores.doc.getState().canUndo).toBe(false)
  })

  it('꼭짓점 각도: 열면 꼭짓점 2…n−1 입력, 1·n은 읽기 전용, 입력하면 1칸', () => {
    const stores = setup(ROUGH, { target: 'outer' })
    expand(ANGLES_LABEL)
    expect(field('꼭짓점 2').value).toBe('90')
    expect(field('꼭짓점 3').value).toBe('90')
    expect(within(editor()).queryByLabelText('꼭짓점 1')).toBeNull()
    expect(within(editor()).queryByLabelText('꼭짓점 4')).toBeNull()
    typeEnter(field('꼭짓점 2'), '100')
    expect(stores.doc.getState().canUndo).toBe(true)
    expect(field('꼭짓점 2').value).toBe('100')
  })

  it('비율 유지 끔: 전체 크기 가로를 바꾸면 그 축만 비율대로', () => {
    const stores = setup(
      { ...ROUGH, outer: { kind: 'polygon', points: [[0, 0], [600, 0], [600, 300], [0, 300]] } },
      { target: 'outer', before: (s) => s.ui.getState().patch({ keepRatio: false }) },
    )
    typeEnter(field('가로'), '300')
    expect(outerPoints(stores)).toEqual([[150, 0], [450, 0], [450, 300], [150, 300]])
  })

  it('꼭짓점을 고르면 표가 접혀 있어도 그 꼭짓점 x·y 칸이 보인다', () => {
    setup(ROUGH, { target: 'outer', vertex: 2 })
    const box = screen.getByTestId('tent-selected-vertex')
    expect(within(box).getByText('3번 꼭짓점')).toBeTruthy()
    expect(within(box).getByLabelText('X')).toBeTruthy()
  })
})

describe('TentEditor 벽에 붙이기(Plan 4.1 §2.4)', () => {
  it('외곽 템플릿이 사각형이면 이너에 [뒤·앞·왼쪽·오른쪽], 누르면 그 벽으로(1칸)', () => {
    const stores = setup(TWO_INNERS, { target: 'i2' })
    const group = within(editor()).getByRole('group', { name: '벽에 붙이기' })
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['뒤', '앞', '왼쪽', '오른쪽'])
    fireEvent.click(within(group).getByRole('button', { name: '뒤' }))
    expect(stores.doc.getState().layout.tent.inners[1]).toMatchObject({ x: 0, y: -100 })
  })

  it('외곽이 자유 다각형이거나 대상이 외곽이면 줄이 없다', () => {
    setup(TWO_INNERS, { target: 'outer' })
    expect(within(editor()).queryByRole('group', { name: '벽에 붙이기' })).toBeNull()
  })
})

describe('TentEditor 잠금·만들기 화면(Plan 4.1 §1.1)', () => {
  it("이너 잠금('inners')이면 이너 행 비활성, [+ 이너] 없음", () => {
    setup(TWO_INNERS, { before: (s) => s.ui.getState().setTentLock('inners') })
    expect((listRow(/^이너 1/) as HTMLButtonElement).disabled).toBe(true)
    expect((listRow(/^외곽/) as HTMLButtonElement).disabled).toBe(false)
    expect(within(editor()).queryByRole('button', { name: '+ 이너' })).toBeNull()
  })

  it("외곽 잠금('outer')이면 외곽 행 비활성, 외곽 없음이면 외곽 행 자체가 없다", () => {
    setup(TWO_INNERS, { before: (s) => s.ui.getState().setTentLock('outer') })
    expect((listRow(/^외곽/) as HTMLButtonElement).disabled).toBe(true)
  })

  it('외곽 없음이면 외곽 행이 없다', () => {
    setup({ ...TWO_INNERS, inners: [] }, { before: (s) => s.ui.getState().setOuterPending(true) })
    expect(within(editor()).queryByRole('button', { name: /^외곽/ })).toBeNull()
  })

  it("context 'maker'면 [텐트 바꾸기]·목록의 [+ 이너]가 없다", () => {
    setup(TWO_INNERS, { context: 'maker' })
    expect(within(editor()).queryByRole('button', { name: '텐트 바꾸기' })).toBeNull()
    expect(within(editor()).queryByRole('button', { name: '+ 이너' })).toBeNull()
  })
})

describe('최종 리뷰 수정(Plan 4.1)', () => {
  it("시트(variant 'sheet')는 [모양 바꾸기]가 메뉴가 아니라 버튼 줄(시트 스크롤에 잘리지 않게), 지금 모양은 비활성", () => {
    const stores = setup(TWO_INNERS, { variant: 'sheet', target: 'i2' })
    expect(within(editor()).queryByRole('button', { name: '모양 바꾸기' })).toBeNull()
    const group = within(editor()).getByRole('group', { name: '모양 바꾸기' })
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['사각형', '사다리꼴', '오각형(전실)', '육각형', '정N각형', '원'])
    expect((within(group).getByRole('button', { name: '사각형' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(within(group).getByRole('button', { name: '원' }))
    expect(stores.doc.getState().layout.tent.inners[1]!.shape).toEqual({ kind: 'circle', d: 100 })
  })

  it('시트에는 목록의 [+ 이너]가 없다(휴대폰은 툴바 [+이너 ▾], 설계 §3)', () => {
    setup(TWO_INNERS, { variant: 'sheet' })
    expect(within(editor()).queryByRole('button', { name: '+ 이너' })).toBeNull()
  })

  it('그리는 중에는 [텐트 바꾸기]가 꺼진다', () => {
    const stores = setup(TWO_INNERS, { target: 'outer' })
    act(() => stores.ui.getState().startDrawing('newInner'))
    expect((within(editor()).getByRole('button', { name: '텐트 바꾸기' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('변 번호 안내(소유자 피드백: 변 1·2·3이 어디인지)', () => {
  it('변 길이 칸에 포커스하면 그 변을 캔버스에서 강조하도록 알리고(polygonFocus), 떠나면 지운다', () => {
    const stores = setup(ROUGH, { target: 'outer' })
    expand(EDGES_LABEL)
    expect(within(editor()).getByText(EDGE_HINT)).toBeTruthy()
    act(() => field('변 2').focus())
    expect(stores.ui.getState().polygonFocus).toEqual({ kind: 'edge', index: 1 })
    act(() => field('변 2').blur())
    expect(stores.ui.getState().polygonFocus).toBeNull()
  })

  it('꼭짓점 각도 칸에 포커스하면 그 꼭짓점을 알린다', () => {
    const stores = setup(ROUGH, { target: 'outer' })
    expand(ANGLES_LABEL)
    act(() => field('꼭짓점 3').focus())
    expect(stores.ui.getState().polygonFocus).toEqual({ kind: 'vertex', index: 2 })
  })
})

describe('모서리 둥글기(소유자 요청 2026-10-14)', () => {
  it('모서리마다 칸으로 그 모서리만, 템플릿은 그대로', () => {
    const stores = setup(TWO_INNERS, { target: 'outer' })
    typeEnter(field('모서리 2(오른쪽 위)'), '25')
    expect(stores.doc.getState().layout.tent.outer).toEqual({ kind: 'rect', w: 600, h: 300, radii: [0, 25, 0, 0] })
    expect(stores.doc.getState().layout.tent.outerTemplate).toEqual({ kind: 'rect', w: 600, h: 300 })
    expect(field('모서리 둥글기').value).toBe('')
  })
})

describe('가운데로 맞추기(2026-10-15)', () => {
  it('고른 꼭짓점 옆 [가운데로 맞추기]: 뾰족한 끝을 나머지의 가운데 줄로(1칸)', () => {
    const tent: Tent = { name: '전실', outer: { kind: 'polygon', points: [[0, 0], [400, 0], [500, 170], [400, 300], [0, 300]] }, inners: [] }
    const stores = setup(tent, { target: 'outer', vertex: 2 })
    fireEvent.click(within(screen.getByTestId('tent-selected-vertex')).getByRole('button', { name: '가운데로 맞추기' }))
    const outer = stores.doc.getState().layout.tent.outer
    expect(outer.kind === 'polygon' && outer.points[2]).toEqual([500, 150])
    expect(stores.doc.getState().canUndo).toBe(true)
  })
})

describe('텐트 회전(소유자 요청 2026-10-14)', () => {
  it('외곽을 고르면 [90도]·돌리기 칸: 외곽과 이너가 함께 돌고 실행 취소 1칸, 칸은 0으로 돌아옴', () => {
    const stores = setup(TWO_INNERS, { target: 'outer' })
    fireEvent.click(within(editor()).getAllByRole('button', { name: '90도' })[0]!)
    expect(stores.doc.getState().layout.tent.outerTemplate).toEqual({ kind: 'rect', w: 300, h: 600 })
    expect(stores.doc.getState().layout.tent.inners[0]).toMatchObject({ x: 0, y: -150, rotation: 90 })
    typeEnter(field('돌리기'), '-90')
    expect(stores.doc.getState().layout.tent.outerTemplate).toEqual({ kind: 'rect', w: 600, h: 300 })
    expect(field('돌리기').value).toBe('0')
  })

  it('이너를 고르면 텐트 돌리기 칸은 없다(이너는 자기 회전)', () => {
    setup(TWO_INNERS, { target: 'i1' })
    expect(within(editor()).queryByLabelText('돌리기')).toBeNull()
  })
})

describe('육각형 칸(업체 도면식: 가로·세로·윗·아랫변)', () => {
  const HEX: Tent = { name: '육각', outer: { kind: 'rect', w: 1, h: 1 }, outerTemplate: { kind: 'hexagon', w: 260, h: 225, edge: 130 }, inners: [] }

  it('가로·세로·윗·아랫변 칸, 값을 바꾸면 템플릿에 반영, 윗변이 가로보다 길면 오류', () => {
    const stores = setup(HEX, { target: 'outer' })
    expect(field('가로').value).toBe('260')
    expect(field('세로').value).toBe('225')
    expect(field('윗·아랫변').value).toBe('130')
    typeEnter(field('윗·아랫변'), '140')
    expect(stores.doc.getState().layout.tent.outerTemplate).toEqual({ kind: 'hexagon', w: 260, h: 225, edge: 140 })
    act(() => field('윗·아랫변').blur())
    typeEnter(field('윗·아랫변'), '300')
    expect(within(editor()).getByRole('alert').textContent).toBe('윗·아랫변은 가로보다 길 수 없어요')
  })

  it('육각형 외곽이면 이너에 [벽에 붙이기: 뒤 · 앞]', () => {
    setup({ ...HEX, inners: [rectInner('i1', '이너 1', 100, 60, 0, 0)] }, { target: 'i1' })
    const group = within(editor()).getByRole('group', { name: '벽에 붙이기' })
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['뒤', '앞'])
  })
})

describe('상하좌우로만 이동 토글(텐트 시트)', () => {
  it('시트에는 [상하좌우] 토글이 있고 PC 패널에는 없다(PC는 Shift)', () => {
    const stores = setup(TWO_INNERS, { variant: 'sheet', target: 'i1' })
    fireEvent.click(within(editor()).getByRole('button', { name: '상하좌우로만 이동' }))
    expect(stores.ui.getState().axisLock).toBe(true)
  })

  it('PC 패널에는 토글이 없다', () => {
    setup(TWO_INNERS, { target: 'i1' })
    expect(within(editor()).queryByRole('button', { name: '상하좌우로만 이동' })).toBeNull()
  })
})
