// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLayout, type Tent } from '../core/model'
import { addItem, makeItem } from '../core/ops/items'
import { clearLayoutRepo, createLayoutFromTent } from './layoutRepo'
import { createStores } from './stores'
import {
  CANVAS_HOST_TEST_ID,
  installAppTestHook,
  installTestHook,
  type TentfitAppHook,
  type TentfitTestHook,
} from './testHook'

const TENT: Tent = { name: '시험 텐트', outer: { kind: 'rect', w: 400, h: 300 }, inners: [] }

function hookOf(): TentfitTestHook | undefined {
  return (window as unknown as { __tentfit?: TentfitTestHook }).__tentfit
}

function appHookOf(): TentfitAppHook | undefined {
  return (window as unknown as { __tentfitApp?: TentfitAppHook }).__tentfitApp
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

  it('Plan 4.1: 이름·캔버스 test id를 받으면 그 이름으로 설치하고(편집기 훅은 그대로) 그 캔버스 기준으로 좌표를 바꾼다', () => {
    const editor = installTestHook(createStores(createLayout(TENT, { name: '편집기' })))
    const stores = createStores(createLayout(TENT, { name: '만들기' }))
    const host = document.createElement('div')
    host.dataset.testid = 'maker-canvas-host'
    document.body.appendChild(host)
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 300, 300))
    const remove = installTestHook(stores, { key: '__tentfitMaker', hostTestId: 'maker-canvas-host' })
    const maker = (window as unknown as { __tentfitMaker?: TentfitTestHook }).__tentfitMaker
    expect(maker?.getDoc().layout.name).toBe('만들기')
    expect(hookOf()!.getDoc().layout.name).toBe('편집기')
    expect(maker?.worldToClient(0, 0)).toEqual({ x: 10, y: 20 })
    remove()
    expect((window as unknown as { __tentfitMaker?: TentfitTestHook }).__tentfitMaker).toBeUndefined()
    expect(hookOf()).toBeDefined()
    editor()
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

describe('installAppTestHook', () => {
  it('window.__tentfitApp.layouts()는 보관소 배치 요약(데이터만)을 돌려주고, 해제하면 지운다', () => {
    clearLayoutRepo()
    const remove = installAppTestHook()
    expect(appHookOf()!.layouts()).toEqual([])
    const layout = createLayoutFromTent(TENT)
    const layouts = appHookOf()!.layouts()
    expect(layouts).toEqual([{ id: layout.id, name: '시험 텐트 배치', updatedAt: layout.updatedAt, itemCount: 0 }])
    expect(JSON.parse(JSON.stringify(layouts))).toEqual(layouts)
    remove()
    expect(appHookOf()).toBeUndefined()
    clearLayoutRepo()
  })

  it('돌려준 목록을 고쳐도 보관소는 그대로다(복사본)', () => {
    clearLayoutRepo()
    const remove = installAppTestHook()
    createLayoutFromTent(TENT)
    const first = appHookOf()!.layouts()
    first[0]!.name = '바꿈'
    expect(appHookOf()!.layouts()[0]!.name).toBe('시험 텐트 배치')
    remove()
    clearLayoutRepo()
  })

  it('다른 앱 훅이 이미 바꿔 놓았으면 지우지 않는다', () => {
    const a = installAppTestHook()
    const removeB = installAppTestHook()
    const b = appHookOf()
    a()
    expect(appHookOf()).toBe(b)
    removeB()
    expect(appHookOf()).toBeUndefined()
  })
})
