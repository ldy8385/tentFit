// PC(1440×900, 마우스) 편집기 흐름. playwright.config.ts의 desktop 프로젝트만 이 파일을 돌립니다.
import { expect, test, type Page } from '@playwright/test'
import type { Item } from '../src/core/model'
import { computeStats } from '../src/core/stats'
import {
  darkestAround,
  dragBetween,
  getDoc,
  getUi,
  nextFrames,
  statRowPattern,
  waitReady,
  worldToClient,
} from './helpers'

/** presets/items.json의 items/mat-single-200x60 */
const MAT = '캠핑 매트 1인'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await waitReady(page)
})

const library = (page: Page) => page.getByRole('complementary', { name: '라이브러리' })
const properties = (page: Page) => page.getByTestId('properties-panel')
const areaSummary = (page: Page) => page.getByRole('region', { name: '면적 현황' })

/** 왼쪽 라이브러리에서 매트를 눌러 추가하고, 추가된 물건을 돌려줍니다. */
async function addMatFromLibrary(page: Page): Promise<Item> {
  const before = (await getDoc(page)).layout.items.length
  await library(page).getByText(MAT, { exact: true }).click()
  await expect.poll(async () => (await getDoc(page)).layout.items.length).toBe(before + 1)
  const item = (await getDoc(page)).layout.items.at(-1)
  if (item === undefined) throw new Error('추가된 물건이 없습니다')
  // Konva는 다음 프레임에 히트 캔버스를 다시 그립니다. 그 전에 누르면 새 물건을 못 맞힙니다.
  await nextFrames(page)
  return item
}

async function itemById(page: Page, id: string): Promise<Item | undefined> {
  return (await getDoc(page)).layout.items.find((i) => i.id === id)
}

/** 지금 문서로 계산한 이너 전체·전실 전체 점유율이 면적 현황에 보일 때까지 기다립니다. */
async function expectAreaSummaryMatchesDoc(page: Page): Promise<void> {
  const stats = computeStats((await getDoc(page)).layout)
  await expect(areaSummary(page)).toContainText(statRowPattern(stats.totalInner))
  await expect(areaSummary(page)).toContainText(statRowPattern(stats.totalFloor))
}

test('시작하면 새 배치를 만들어 편집 화면으로 가고 기본 텐트를 그린다', async ({ page }) => {
  const doc = await getDoc(page)
  expect(page.url()).toMatch(new RegExp(`#/edit/${doc.layout.id}$`))
  expect(doc.layout.tent.name).toBe('터널 4인 예시')
  expect(doc.layout.name).toBe('터널 4인 예시 배치')
  expect(doc.layout.items).toHaveLength(0)
  expect(doc.canUndo).toBe(false)

  // 터널 4인 예시: 외곽 rect 620×320 @원점 → 왼쪽 벽 x = −310, 위쪽 벽 y = −160
  expect(await darkestAround(page, await worldToClient(page, -310, 55))).toBeLessThan(120)
  expect(await darkestAround(page, await worldToClient(page, 205, -160))).toBeLessThan(120)
  // 위쪽 벽에서 55cm 바깥에는 텐트 선이 없다(밝은 격자뿐)
  expect(await darkestAround(page, await worldToClient(page, 205, -215))).toBeGreaterThan(160)
})

test('라이브러리에서 누르면 물건이 추가·선택되고 속성 패널과 면적 현황이 따라 바뀐다', async ({ page }) => {
  const empty = computeStats((await getDoc(page)).layout)
  expect(empty.totalFloor.percent).toBe(0)
  await expectAreaSummaryMatchesDoc(page)

  const item = await addMatFromLibrary(page)
  expect(item.name).toBe(MAT)
  expect(item.shape).toEqual({ kind: 'rect', w: 200, h: 60 })
  expect((await getUi(page)).selection).toEqual([item.id])
  await expect(properties(page).getByLabel('이름', { exact: true })).toHaveValue(MAT)

  const added = computeStats((await getDoc(page)).layout)
  expect(added.totalFloor.percent).toBeGreaterThan(0)
  await expectAreaSummaryMatchesDoc(page)

  const width = properties(page).getByLabel('가로', { exact: true })
  await width.fill('250')
  await width.press('Enter')
  await expect.poll(async () => (await itemById(page, item.id))?.shape).toEqual({ kind: 'rect', w: 250, h: 60 })
  await expect(width).toHaveValue('250')
  await expectAreaSummaryMatchesDoc(page)
})

test('물건을 끌면 위치가 바뀌고 Ctrl+Z 한 번으로 제자리에 돌아온다', async ({ page }) => {
  const item = await addMatFromLibrary(page)
  const { zoom } = (await getUi(page)).view
  const from = await worldToClient(page, item.x, item.y)

  await dragBetween(page, from, { x: from.x + 80, y: from.y + 40 })
  await expect.poll(async () => (await itemById(page, item.id))?.x).not.toBe(item.x)
  const moved = await itemById(page, item.id)
  expect(Math.abs((moved?.x ?? 0) - item.x - 80 / zoom)).toBeLessThan(1)
  expect(Math.abs((moved?.y ?? 0) - item.y - 40 / zoom)).toBeLessThan(1)
  expect((await getDoc(page)).inGesture).toBe(false)

  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => {
    const back = await itemById(page, item.id)
    return [back?.x, back?.y]
  }).toEqual([item.x, item.y])
  expect((await getDoc(page)).layout.items).toHaveLength(1)
})

test('Delete로 지우고 Ctrl+Z로 되살린다', async ({ page }) => {
  const item = await addMatFromLibrary(page)
  const at = await worldToClient(page, item.x, item.y)
  // 캔버스에서 눌러 선택한다(입력칸에 남은 포커스도 이때 풀린다, 스펙 §4.2)
  await page.mouse.click(at.x, at.y)
  await expect.poll(async () => (await getUi(page)).selection).toEqual([item.id])

  await page.keyboard.press('Delete')
  await expect.poll(async () => (await getDoc(page)).layout.items.length).toBe(0)
  expect((await getUi(page)).selection).toEqual([])

  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await getDoc(page)).layout.items.map((i) => i.id)).toEqual([item.id])
  expect(await itemById(page, item.id)).toEqual(item)
})

test('Ctrl+휠은 포인터 아래 점을 고정한 채 확대하고, 그냥 휠은 화면을 옮긴다', async ({ page }) => {
  const item = await addMatFromLibrary(page)
  const anchor = await worldToClient(page, item.x, item.y)
  const before = (await getUi(page)).view

  await page.mouse.move(anchor.x, anchor.y)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -200)
  await page.keyboard.up('Control')
  await expect.poll(async () => (await getUi(page)).view.zoom).toBeGreaterThan(before.zoom)
  const after = await worldToClient(page, item.x, item.y)
  expect(Math.abs(after.x - anchor.x)).toBeLessThan(1)
  expect(Math.abs(after.y - anchor.y)).toBeLessThan(1)

  const zoomed = (await getUi(page)).view
  await page.mouse.wheel(0, 120)
  await expect.poll(async () => (await getUi(page)).view.panY).not.toBe(zoomed.panY)
  expect((await getUi(page)).view.zoom).toBe(zoomed.zoom)
  // 화면 조작은 문서를 바꾸지 않는다
  expect((await getDoc(page)).layout.items).toEqual([item])
})
