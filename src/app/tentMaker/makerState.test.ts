import { describe, expect, it } from 'vitest'
import { TentSchema, type Pt } from '../../core/model'
import { attachedInner } from '../../core/templates'
import { validateTent } from '../../core/validate'
import {
  addMakerInner,
  checkMaker,
  deleteFreePoint,
  floorAreaText,
  initialMakerState,
  insertFreePoint,
  makerTent,
  outerShapeOf,
  outerTemplateOf,
  removeMakerInner,
  setFreePoint,
  setKind,
  setTemplateField,
  updateMakerInner,
  type MakerInner,
  type MakerState,
} from './makerState'

function first(s: MakerState): MakerInner {
  const inner = s.inners[0]
  if (inner === undefined) throw new Error('이너 없음')
  return inner
}

function added(s: MakerState): MakerState {
  const res = addMakerInner(s)
  if (!res.ok) throw new Error('이너 추가 실패')
  return res.state
}

/** 1000×1000 사각형 + 이너 없음: 네 벽에 200cm 이너를 모두 붙일 수 있는 크기 */
function bigSquare(): MakerState {
  const s = setTemplateField(initialMakerState({ myTentNames: [] }), { w: 1000, h: 1000 })
  return removeMakerInner(s, first(s).id)
}

describe('initialMakerState (R6)', () => {
  it('이름 「내 텐트」, 사각형 400×300, 이너 1개(180×180, 뒤 벽 가운데)', () => {
    const s = initialMakerState({ myTentNames: [] })
    expect(s.name).toBe('내 텐트')
    expect(s.kind).toBe('rect')
    expect(s.rect).toEqual({ w: 400, h: 300, square: false })
    expect(s.free).toEqual([])
    expect(s.inners).toHaveLength(1)
    expect(first(s)).toMatchObject({ name: '이너 1', width: 180, depth: 180, side: 'back', x: 0, y: -60 })
    expect(first(s).id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('내 텐트에 같은 이름이 있으면 번호를 붙인다(§4.7-7)', () => {
    expect(initialMakerState({ myTentNames: ['내 텐트'] }).name).toBe('내 텐트 2')
    expect(initialMakerState({ myTentNames: ['내 텐트', '내 텐트 2'] }).name).toBe('내 텐트 3')
  })

  it('다른 모양의 기본 치수도 들어 있다(모양을 바꿔도 칸이 비지 않음)', () => {
    const s = initialMakerState({ myTentNames: [] })
    expect(s.trapezoid).toEqual({ front: 400, back: 300, depth: 300, offset: 0 })
    expect(s.ngon).toEqual({ n: 6, sizeBy: 'diameter', size: 400 })
    expect(s.circle).toEqual({ d: 400 })
  })
})

describe('외곽 템플릿·도형·텐트', () => {
  it('outerTemplateOf: 모양마다 템플릿, 자유는 null', () => {
    const s = initialMakerState({ myTentNames: [] })
    expect(outerTemplateOf(s)).toEqual({ kind: 'rect', w: 400, h: 300 })
    expect(outerTemplateOf(setTemplateField(s, { square: true }))).toEqual({ kind: 'rect', w: 400, h: 400, square: true })
    expect(outerTemplateOf(setKind(s, 'trapezoid'))).toEqual({ kind: 'trapezoid', front: 400, back: 300, depth: 300, offset: 0 })
    expect(outerTemplateOf(setKind(s, 'ngon'))).toEqual({ kind: 'ngon', n: 6, sizeBy: 'diameter', size: 400 })
    expect(outerTemplateOf(setKind(s, 'circle'))).toEqual({ kind: 'circle', d: 400 })
    expect(outerTemplateOf(setKind(s, 'free'))).toBeNull()
  })

  it('outerShapeOf: 템플릿 도형, 자유는 꼭짓점 다각형', () => {
    const s = initialMakerState({ myTentNames: [] })
    expect(outerShapeOf(s)).toEqual({ kind: 'rect', w: 400, h: 300 })
    expect(outerShapeOf(setKind(s, 'circle'))).toEqual({ kind: 'circle', d: 400 })
    expect(outerShapeOf(setKind(s, 'free'))).toEqual({
      kind: 'polygon',
      points: [
        [-200, -150],
        [200, -150],
        [200, 150],
        [-200, 150],
      ],
    })
  })

  it('makerTent: 정상 입력은 스키마·validateTent를 통과하고, 이너는 사각 템플릿', () => {
    const s = initialMakerState({ myTentNames: [] })
    const tent = makerTent(s)
    expect(TentSchema.safeParse(tent).success).toBe(true)
    expect(validateTent(tent)).toEqual([])
    expect(tent).toEqual({
      name: '내 텐트',
      outer: { kind: 'rect', w: 400, h: 300 },
      outerTemplate: { kind: 'rect', w: 400, h: 300 },
      inners: [
        {
          id: first(s).id,
          name: '이너 1',
          shape: { kind: 'rect', w: 180, h: 180 },
          template: { kind: 'rect', w: 180, h: 180 },
          x: 0,
          y: -60,
          rotation: 0,
        },
      ],
    })
  })

  it('makerTent: 이름 앞뒤 공백을 정리하고, 비면 「내 텐트」', () => {
    const s = initialMakerState({ myTentNames: [] })
    expect(makerTent({ ...s, name: '  우리 쉘터 ' }).name).toBe('우리 쉘터')
    expect(makerTent({ ...s, name: '   ' }).name).toBe('내 텐트')
  })

  it('makerTent: 자유 모양은 outerTemplate 없이 다각형', () => {
    const tent = makerTent(setKind(initialMakerState({ myTentNames: [] }), 'free'))
    expect(tent.outer.kind).toBe('polygon')
    expect('outerTemplate' in tent).toBe(false)
    expect(validateTent(tent)).toEqual([])
  })

  it('620×320 사각형에 폭 300·깊이 220 뒤 붙임 결과가 attachedInner와 같다', () => {
    const base = setTemplateField(initialMakerState({ myTentNames: [] }), { w: 620, h: 320 })
    const s = updateMakerInner(base, first(base).id, { width: 300, depth: 220, side: 'back' })
    const expected = attachedInner({ kind: 'rect', w: 620, h: 320 }, 'back', 300, 220)
    expect(expected).not.toBeNull()
    const inner = makerTent(s).inners[0]
    expect(inner).toMatchObject({ ...expected })
    expect(first(s)).toMatchObject({ x: 0, y: -50 })
  })

  it('왼쪽 벽에 붙인 이너는 텐트에서 w = 깊이·h = 폭', () => {
    const base = setTemplateField(initialMakerState({ myTentNames: [] }), { w: 620, h: 320 })
    const s = updateMakerInner(base, first(base).id, { width: 300, depth: 220, side: 'left' })
    expect(first(s)).toMatchObject({ x: -200, y: 0, side: 'left' })
    expect(makerTent(s).inners[0]).toMatchObject({ shape: { kind: 'rect', w: 220, h: 300 }, template: { kind: 'rect', w: 220, h: 300 } })
  })
})

describe('setTemplateField — 외곽 치수가 바뀌면 붙인 이너가 따라간다(§4.4-1)', () => {
  it('사각형 세로를 바꾸면 뒤 벽 이너가 새 뒤 벽에 다시 붙는다', () => {
    const s = initialMakerState({ myTentNames: [] })
    const next = setTemplateField(s, { h: 500 })
    expect(next.rect).toEqual({ w: 400, h: 500, square: false })
    expect(first(next)).toMatchObject({ side: 'back', x: 0, y: -160 })
  })

  it('정사각형을 켜면 세로 = 가로, 켠 채 가로를 바꾸면 세로도 따라감', () => {
    const s = setTemplateField(initialMakerState({ myTentNames: [] }), { square: true })
    expect(s.rect).toEqual({ w: 400, h: 400, square: true })
    expect(setTemplateField(s, { w: 500 }).rect).toEqual({ w: 500, h: 500, square: true })
    expect(setTemplateField(s, { h: 350 }).rect).toEqual({ w: 350, h: 350, square: true })
  })

  it('범위 밖 값은 자르고 0.1cm로 반올림, n은 정수 5~12', () => {
    const s = initialMakerState({ myTentNames: [] })
    expect(setTemplateField(s, { w: 0, h: 9000.04 }).rect).toMatchObject({ w: 1, h: 5000 })
    expect(setTemplateField(s, { offset: -6000 }).trapezoid.offset).toBe(-5000)
    expect(setTemplateField(s, { n: 4 }).ngon.n).toBe(5)
    expect(setTemplateField(s, { n: 12.6 }).ngon.n).toBe(12)
    expect(setTemplateField(s, { d: 333.333 }).circle.d).toBe(333.3)
  })

  it('정N각형 sizeBy만 바꾸면 같은 도형이 되게 크기를 환산한다', () => {
    const s = setKind(initialMakerState({ myTentNames: [] }), 'ngon')
    const bySide = setTemplateField(s, { sizeBy: 'side' })
    expect(bySide.ngon).toEqual({ n: 6, sizeBy: 'side', size: 200 })
    expect(setTemplateField(bySide, { sizeBy: 'diameter' }).ngon).toEqual({ n: 6, sizeBy: 'diameter', size: 400 })
    // 크기를 함께 주면 환산하지 않음
    expect(setTemplateField(s, { sizeBy: 'side', size: 150 }).ngon).toEqual({ n: 6, sizeBy: 'side', size: 150 })
  })

  it('사다리꼴 치수를 바꾸면 뒤 이너가 뒷변 중점으로 따라간다', () => {
    const s = setKind(initialMakerState({ myTentNames: [] }), 'trapezoid')
    expect(first(s)).toMatchObject({ side: 'back', x: 0, y: -60 })
    const next = setTemplateField(s, { offset: 40 })
    expect(next.trapezoid.offset).toBe(40)
    // 꼭짓점: 뒷변 (−110,−150)~(190,−150) → 중점 x 40
    expect(first(next)).toMatchObject({ side: 'back', x: 40, y: -60 })
  })

  it('붙이지 않은 이너(side null)는 외곽 치수를 바꿔도 제자리', () => {
    const circle = setKind(initialMakerState({ myTentNames: [] }), 'circle')
    const before = first(circle)
    const next = setTemplateField(circle, { d: 600 })
    expect(first(next)).toEqual(before)
  })
})

describe('setKind', () => {
  it('같은 모양이면 그대로', () => {
    const s = initialMakerState({ myTentNames: [] })
    expect(setKind(s, 'rect')).toBe(s)
  })

  it('사다리꼴로 바꾸면 앞·뒤 이너는 사다리꼴 벽에 다시 붙고, 왼쪽 이너는 side null(지금 자리)', () => {
    const base = setTemplateField(initialMakerState({ myTentNames: [] }), { w: 800, h: 400 })
    const left = updateMakerInner(base, first(base).id, { side: 'left', width: 200, depth: 100 })
    const leftPos = first(left)
    expect(leftPos).toMatchObject({ side: 'left', x: -350, y: 0 })
    const trap = setKind(left, 'trapezoid')
    expect(first(trap)).toMatchObject({ side: null, x: -350, y: 0 })

    const back = setKind(base, 'trapezoid')
    expect(first(back)).toMatchObject({ side: 'back', x: 0, y: -60 })
  })

  it('원으로 바꾸면 모든 이너 side null(자리 유지)', () => {
    const s = added(bigSquare())
    const two = added(s)
    const circle = setKind(two, 'circle')
    expect(circle.inners.map((it) => it.side)).toEqual([null, null])
    expect(circle.inners.map((it) => [it.x, it.y])).toEqual(two.inners.map((it) => [it.x, it.y]))
  })

  it('정N각형으로 바꿔도 side null', () => {
    expect(first(setKind(initialMakerState({ myTentNames: [] }), 'ngon')).side).toBeNull()
  })

  it('자유로 바꾸면 지금 모양의 꼭짓점으로 채운다: 사각형 4점, 사다리꼴 4점, 정N각형 n점, 원은 지름 정사각형 4점', () => {
    const s = initialMakerState({ myTentNames: [] })
    expect(setKind(s, 'free').free).toEqual([
      [-200, -150],
      [200, -150],
      [200, 150],
      [-200, 150],
    ])
    const trap = setKind(setKind(s, 'trapezoid'), 'free')
    expect(trap.free).toEqual([
      [-150, -150],
      [150, -150],
      [200, 150],
      [-200, 150],
    ])
    const ngon = setKind(setTemplateField(setKind(s, 'ngon'), { n: 8 }), 'free')
    expect(ngon.free).toHaveLength(8)
    const circle = setKind(setKind(s, 'circle'), 'free')
    expect(circle.free).toEqual([
      [-200, -200],
      [200, -200],
      [200, 200],
      [-200, 200],
    ])
    expect(first(setKind(s, 'free')).side).toBeNull()
  })

  it('자유에서 사각형으로 돌아오면 사각형 치수는 그대로이고 이너는 붙이지 않은 채 제자리', () => {
    const s = initialMakerState({ myTentNames: [] })
    const free = setKind(s, 'free')
    const back = setKind(free, 'rect')
    expect(back.rect).toEqual(s.rect)
    expect(first(back)).toMatchObject({ side: null, x: 0, y: -60 })
  })
})

describe('addMakerInner (R7)', () => {
  it('사각형은 아직 안 쓴 벽을 뒤 → 앞 → 왼쪽 → 오른쪽 순으로, 크기는 §4.4-4 한 변', () => {
    let s = bigSquare()
    const sides: Array<string | null> = []
    for (let k = 0; k < 4; k++) {
      s = added(s)
      sides.push(s.inners[s.inners.length - 1]?.side ?? null)
    }
    expect(sides).toEqual(['back', 'front', 'left', 'right'])
    expect(s.inners.map((it) => it.name)).toEqual(['이너 1', '이너 2', '이너 3', '이너 4'])
    expect(s.inners.map((it) => [it.width, it.depth])).toEqual([
      [200, 200],
      [200, 200],
      [200, 200],
      [200, 200],
    ])
    expect(s.inners.map((it) => [it.x, it.y])).toEqual([
      [0, -400],
      [0, 400],
      [-400, 0],
      [400, 0],
    ])
  })

  it('네 벽을 모두 썼으면 뒤에 붙이고, 겹치면 추가하지 않고 no-space', () => {
    let s = bigSquare()
    for (let k = 0; k < 4; k++) s = added(s)
    expect(addMakerInner(s)).toEqual({ ok: false, reason: 'no-space' })
  })

  it('소유자 확인 1: 기본 상태(400×300 + 뒤 이너)에서는 앞 벽에 깊이를 줄여 180×120으로 붙인다', () => {
    const s = added(initialMakerState({ myTentNames: [] }))
    expect(s.inners[1]).toMatchObject({ name: '이너 2', side: 'front', width: 180, depth: 120 })
    expect(checkMaker(s).canConfirm).toBe(true)
  })

  it('소유자 확인 1: 그 벽에 깊이 50도 안 들어가면 다음 안 쓴 벽에 붙인다(왼쪽, 깊이 110)', () => {
    const base = initialMakerState({ myTentNames: [] })
    const s = added(updateMakerInner(base, first(base).id, { depth: 260 }))
    expect(s.inners[1]).toMatchObject({ side: 'left', width: 180, depth: 110 })
    expect(checkMaker(s).canConfirm).toBe(true)
  })

  it('소유자 확인 1: 어느 벽에도 깊이 50이 안 들어가면 no-space', () => {
    const base = initialMakerState({ myTentNames: [] })
    const s = updateMakerInner(base, first(base).id, { width: 400, depth: 300 })
    expect(addMakerInner(s)).toEqual({ ok: false, reason: 'no-space' })
  })

  it('사다리꼴은 뒤 → 앞', () => {
    const s = setTemplateField(setKind(bigSquare(), 'trapezoid'), { front: 1000, back: 1000, depth: 1000 })
    const one = added(s)
    const two = added(one)
    expect(two.inners.map((it) => it.side)).toEqual(['back', 'front'])
  })

  it('원·정N각형·자유는 붙이지 않고 가장 큰 바닥 조각의 polylabel에 놓는다(§4.4-4)', () => {
    const circle = setKind(bigSquare(), 'circle')
    const s = added(setTemplateField(circle, { d: 600 }))
    expect(first(s)).toMatchObject({ side: null, width: 200, depth: 200 })
    expect(Math.abs(first(s).x)).toBeLessThan(1)
    expect(Math.abs(first(s).y)).toBeLessThan(1)
  })

  it('이름은 비어 있는 가장 작은 「이너 N」', () => {
    const s = added(bigSquare())
    const renamed = updateMakerInner(s, first(s).id, { name: '이너 2' })
    const next = added(renamed)
    expect(next.inners.map((it) => it.name)).toEqual(['이너 2', '이너 3'])
  })
})

describe('updateMakerInner·removeMakerInner', () => {
  it('폭·깊이를 바꾸면 붙인 벽에 다시 붙고, 범위 밖 값은 자른다', () => {
    const s = initialMakerState({ myTentNames: [] })
    const next = updateMakerInner(s, first(s).id, { width: 0, depth: 100 })
    expect(first(next)).toMatchObject({ width: 1, depth: 100, x: 0, y: -100 })
  })

  it('붙일 위치를 바꾸면 그 벽으로 옮긴다', () => {
    const s = initialMakerState({ myTentNames: [] })
    expect(first(updateMakerInner(s, first(s).id, { side: 'front' }))).toMatchObject({ side: 'front', x: 0, y: 60 })
    expect(first(updateMakerInner(s, first(s).id, { side: 'right' }))).toMatchObject({ side: 'right', x: 110, y: 0 })
  })

  it('그 모양에 없는 벽(사다리꼴 왼쪽, 원)은 무시한다', () => {
    const trap = setKind(initialMakerState({ myTentNames: [] }), 'trapezoid')
    expect(first(updateMakerInner(trap, first(trap).id, { side: 'left' }))).toEqual(first(trap))
    const circle = setKind(initialMakerState({ myTentNames: [] }), 'circle')
    expect(first(updateMakerInner(circle, first(circle).id, { side: 'back' })).side).toBeNull()
  })

  it('side null로 바꾸면 지금 자리에 남는다', () => {
    const s = initialMakerState({ myTentNames: [] })
    const next = updateMakerInner(s, first(s).id, { side: null })
    expect(first(next)).toMatchObject({ side: null, x: 0, y: -60 })
    // 붙이지 않은 이너는 외곽 치수를 바꿔도 제자리
    expect(first(setTemplateField(next, { h: 600 }))).toMatchObject({ x: 0, y: -60 })
  })

  it('없는 id는 그대로, removeMakerInner는 그 이너만 지운다', () => {
    const s = added(bigSquare())
    const two = added(s)
    expect(updateMakerInner(two, 'zz', { width: 10 })).toBe(two)
    const keep = two.inners[1]
    if (keep === undefined) throw new Error('이너 없음')
    expect(removeMakerInner(two, first(two).id).inners).toEqual([keep])
    expect(removeMakerInner(two, 'zz')).toBe(two)
  })
})

describe('자유 모양 꼭짓점(§4.4-7)', () => {
  const free = (): MakerState => setKind(initialMakerState({ myTentNames: [] }), 'free')

  it('setFreePoint: 0.1cm 반올림·좌표 범위로 자르고, 없는 번호는 무시', () => {
    const s = free()
    expect(setFreePoint(s, 1, [250.04, -20000]).free[1]).toEqual([250, -10000])
    expect(setFreePoint(s, 9, [0, 0])).toBe(s)
    expect(setFreePoint(s, -1, [0, 0])).toBe(s)
  })

  it('insertFreePoint: 선택 꼭짓점 다음 변의 중점, null이면 마지막 변(n→1)', () => {
    const s = free()
    const afterFirst = insertFreePoint(s, 0)
    expect(afterFirst.free).toEqual([
      [-200, -150],
      [0, -150],
      [200, -150],
      [200, 150],
      [-200, 150],
    ])
    const last = insertFreePoint(s, null)
    expect(last.free).toHaveLength(5)
    expect(last.free[4]).toEqual([-200, 0])
    expect(insertFreePoint(s, 7)).toBe(s)
  })

  it('deleteFreePoint: 지우되 3개면 그대로', () => {
    const s = free()
    const three = deleteFreePoint(s, 0)
    expect(three.free).toEqual([
      [200, -150],
      [200, 150],
      [-200, 150],
    ])
    expect(deleteFreePoint(three, 0)).toBe(three)
    expect(deleteFreePoint(s, 9)).toBe(s)
  })
})

describe('checkMaker·floorAreaText', () => {
  it('정상 입력은 확정 가능, 문제 없음', () => {
    expect(checkMaker(initialMakerState({ myTentNames: [] }))).toEqual({ canConfirm: true, problems: [], escapedInnerIds: [] })
  })

  it('이너가 겹치면 확정 불가, 문구는 Issue.message', () => {
    const s = added(added(bigSquare()))
    const second = s.inners[1]
    if (second === undefined) throw new Error('이너 없음')
    const overlapped = updateMakerInner(s, second.id, { side: 'back' })
    const check = checkMaker(overlapped)
    expect(check.canConfirm).toBe(false)
    expect(check.problems).toEqual(['이너 1과(와) 이너 2이(가) 5mm 넘게 겹쳐요'])
  })

  it('자유 모양이 자기교차하면 확정 불가', () => {
    const s = setKind(initialMakerState({ myTentNames: [] }), 'free')
    const bow = setFreePoint(setFreePoint(s, 1, [200, 150]), 2, [200, -150])
    const check = checkMaker(bow)
    expect(check.canConfirm).toBe(false)
    expect(check.problems).toEqual(['외곽: 변끼리 교차해요'])
  })

  it('이너 이탈은 확정 가능하고 escapedInnerIds에만 들어간다', () => {
    const s = initialMakerState({ myTentNames: [] })
    const deep = updateMakerInner(s, first(s).id, { depth: 500 })
    const check = checkMaker(deep)
    expect(check.canConfirm).toBe(true)
    expect(check.problems).toEqual([])
    expect(check.escapedInnerIds).toEqual([first(s).id])
  })

  it('floorAreaText: 외곽 넓이를 m² 소수 둘째 자리로', () => {
    const s = initialMakerState({ myTentNames: [] })
    expect(floorAreaText(s)).toBe('바닥 면적 12.00m²')
    expect(floorAreaText(setTemplateField(s, { w: 620, h: 320 }))).toBe('바닥 면적 19.84m²')
    expect(floorAreaText(setKind(setTemplateField(s, { d: 500 }), 'circle'))).toBe('바닥 면적 19.63m²')
  })
})

describe('불변(입력 상태를 고치지 않음)', () => {
  it('모든 갱신 함수는 새 상태를 돌려주고 원래 상태는 그대로', () => {
    const s = initialMakerState({ myTentNames: [] })
    const snapshot = structuredClone(s)
    setTemplateField(s, { w: 900 })
    setKind(s, 'free')
    updateMakerInner(s, first(s).id, { width: 50 })
    removeMakerInner(s, first(s).id)
    addMakerInner(s)
    const free = setKind(s, 'free')
    const freeSnap = structuredClone(free)
    setFreePoint(free, 0, [1, 1] as Pt)
    insertFreePoint(free, 0)
    deleteFreePoint(free, 0)
    expect(s).toEqual(snapshot)
    expect(free).toEqual(freeSnap)
  })
})
