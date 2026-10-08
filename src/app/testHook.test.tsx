// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLayout, type Tent } from '../core/model'
import { addItem, makeItem } from '../core/ops/items'
import { createStores } from './stores'
import { CANVAS_HOST_TEST_ID, installTestHook, type TentfitTestHook } from './testHook'

const TENT: Tent = { name: '시험 텐트', outer: { kind: 'rect', w: 400, h: 300 }, inners: [] }

function hookOf(): TentfitTestHook | undefined {
  return (window as unknown as { __tentfit?: TentfitTestHook }).__tentfit
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('installTestHook', () => {
  it('getDoc·getUi는 함수 없는 일반 객체(JSON 왕복 가능)를 돌려준다', () => {
    const stores = createStores(createLayout(TENT, { name: '배치' }))
    const remove = installTestHook(stores)
    const doc = hookOf()!.getDoc()
    expect(doc.layout.tent.name).toBe('시험 텐트')
    expect(doc.canUndo).toBe(false)
    expect(Object.values(doc).some((v) => typeof v === 'function')).toBe(false)
    const ui = hookOf()!.getUi()
    expect(ui.selection).toEqual([])
    expect(ui.mode).toBe('place')
    expect(Object.values(ui).some((v) => typeof v === 'function')).toBe(false)
    expect(JSON.parse(JSON.stringify(doc))).toEqual(doc)
    remove()
    expect(hookOf()).toBeUndefined()
  })

  it('getDoc은 커밋 뒤 최신 문서와 canUndo를 보여 준다', () => {
    const stores = createStores(createLayout(TENT, { name: '배치' }))
    const remove = installTestHook(stores)
    const item = makeItem({ name: '매트', shape: { kind: 'rect', w: 200, h: 60 }, color: 'blue', category: 'MAT', countsArea: true }, [0, 0])
    stores.doc.getState().commit((d) => addItem(d, item))
    expect(hookOf()!.getDoc().layout.items).toHaveLength(1)
    expect(hookOf()!.getDoc().canUndo).toBe(true)
    remove()
  })

  it('ready는 캔버스 크기가 잡히고 보기가 한 번 맞춰진 뒤에 true', () => {
    const stores = createStores(createLayout(TENT, { name: '배치' }))
    const remove = installTestHook(stores)
    expect(hookOf()!.ready).toBe(false)
    stores.ui.getState().setSize({ width: 800, height: 600 })
    expect(hookOf()!.ready).toBe(false)
    hookOf()!.fitView()
    expect(hookOf()!.ready).toBe(true)
    remove()
  })

  it('보기를 먼저 맞춘 뒤에 설치해도 ready가 true(설치 순서와 무관)', () => {
    const stores = createStores(createLayout(TENT, { name: '배치' }))
    stores.ui.getState().setSize({ width: 390, height: 600 })
    stores.ui.getState().fitTo({ minX: 0, minY: 0, maxX: 400, maxY: 300 })
    const remove = installTestHook(stores)
    expect(hookOf()!.ready).toBe(true)
    remove()
  })

  it('worldToClient는 Konva 그리기 영역의 client 위치에 화면 좌표를 더한다', () => {
    const stores = createStores(createLayout(TENT, { name: '배치' }))
    const host = document.createElement('div')
    host.dataset.testid = CANVAS_HOST_TEST_ID
    const content = document.createElement('div')
    content.className = 'konvajs-content'
    host.appendChild(content)
    document.body.appendChild(host)
    vi.spyOn(content, 'getBoundingClientRect').mockReturnValue(new DOMRect(240, 56, 880, 844))
    stores.ui.getState().setView({ zoom: 2, panX: 100, panY: 50 })
    const remove = installTestHook(stores)
    expect(hookOf()!.worldToClient(10, 20)).toEqual({ x: 240 + 100 + 20, y: 56 + 50 + 40 })
    remove()
  })

  it('다른 훅이 이미 바꿔 놓았으면 지우지 않는다', () => {
    const a = installTestHook(createStores(createLayout(TENT, { name: 'A' })))
    const removeB = installTestHook(createStores(createLayout(TENT, { name: 'B' })))
    a()
    expect(hookOf()!.getDoc().layout.name).toBe('B')
    removeB()
    expect(hookOf()).toBeUndefined()
  })
})
