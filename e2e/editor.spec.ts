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
  type ClientPt,
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

/** 왼쪽 라이브러리에서 물건(기본은 매트)을 눌러 추가하고, 추가된 물건을 돌려줍니다. */
async function addMatFromLibrary(page: Page, name = MAT): Promise<Item> {
  const before = (await getDoc(page)).layout.items.length
  await library(page).getByText(name, { exact: true }).click()
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

// ── 최종 리뷰 회귀(2026-10-08) ────────────────────────────────────────────

/** at에서 Ctrl+휠로 배율이 maxZoom 이하가 될 때까지 줄이고, 줄인 배율을 돌려줍니다(at 아래 점은 고정). */
async function zoomOutTo(page: Page, at: ClientPt, maxZoom: number): Promise<number> {
  await page.mouse.move(at.x, at.y)
  for (let i = 0; i < 60 && (await getUi(page)).view.zoom > maxZoom; i++) {
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, 40)
    await page.keyboard.up('Control')
    await nextFrames(page, 1)
  }
  await nextFrames(page, 3)
  const { zoom } = (await getUi(page)).view
  expect(zoom).toBeLessThanOrEqual(maxZoom)
  return zoom
}

for (const name of ['수납 박스', '원형 스툴']) {
  test(`리뷰 회귀: 축소해서 작아진 ${name}도 몸통을 끌면 크기가 아니라 위치가 바뀐다`, async ({ page }) => {
    const item = await addMatFromLibrary(page, name)
    // 배율 0.6이면 수납 박스 30×21px, 원형 스툴 지름 21px(핸들 잡는 영역 24px에 몸통이 덮이던 크기)
    const zoom = await zoomOutTo(page, await worldToClient(page, item.x, item.y), 0.6)
    const from = await worldToClient(page, item.x, item.y)
    await dragBetween(page, from, { x: from.x + 60, y: from.y })
    await expect.poll(async () => (await itemById(page, item.id))?.x).not.toBe(item.x)
    const moved = (await itemById(page, item.id))!
    expect(moved.shape).toEqual(item.shape)
    expect(Math.abs(moved.x - item.x - 60 / zoom)).toBeLessThan(1)
    expect(Math.abs(moved.y - item.y)).toBeLessThan(1)
  })
}

test('재검증 회귀: 조금 축소한 매트(짧은 변 72px 미만)도 오른쪽 가운데 핸들로 길이만 바꾼다(D31)', async ({ page }) => {
  const item = await addMatFromLibrary(page)
  // 매트 200×60 → 배율 1.1 이하면 화면 높이 66px 이하(축별 기준 48px 이상이라 좌·우 핸들은 남아야 함)
  const zoom = await zoomOutTo(page, await worldToClient(page, item.x, item.y), 1.1)
  expect(60 * zoom).toBeGreaterThanOrEqual(48)
  const right = await worldToClient(page, item.x + 100, item.y)
  await dragBetween(page, right, { x: right.x + 40, y: right.y })
  await expect.poll(async () => (await itemById(page, item.id))?.shape).not.toEqual(item.shape)
  const after = (await itemById(page, item.id))!
  if (after.shape.kind !== 'rect') throw new Error('사각형이어야 합니다')
  expect(after.shape.h).toBe(60)
  expect(Math.abs(after.shape.w - (200 + 40 / zoom))).toBeLessThan(2)
})

test('리뷰 회귀: 새 도형 폼의 입력칸·스위치·select에서 Enter를 눌러도 물건이 생기지 않고, 입력칸은 다음 칸으로 간다', async ({ page }) => {
  await library(page).getByRole('button', { name: '+ 새 도형' }).click()
  const form = page.getByRole('form', { name: '새 도형 만들기' })
  await form.getByLabel('이름').fill('접이식 테이블')
  await form.getByLabel('이름').press('Enter')
  await expect(form.getByLabel('가로')).toBeFocused()
  await form.getByLabel('세로').press('Enter')
  await expect(form.getByLabel('세로')).not.toBeFocused()
  // 재검증: 스위치·select에 포커스가 있을 때의 Enter도 제출하지 않습니다.
  await form.getByRole('switch', { name: '점유 면적에 포함' }).press('Enter')
  await form.getByLabel('카테고리').press('Enter')
  await nextFrames(page)
  expect((await getDoc(page)).layout.items).toEqual([])
  await expect(form).toBeVisible()
})
