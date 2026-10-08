// 휴대폰(390×844, 터치) 편집기 흐름. playwright.config.ts의 mobile 프로젝트만 이 파일을 돌립니다.
// 캔버스 터치는 CDP Input.dispatchTouchEvent(helpers.ts의 Fingers)로, 버튼은 locator.tap()으로 누릅니다.
import { expect, test, type Page } from '@playwright/test'
import type { Item } from '../src/core/model'
import {
  Fingers,
  fitView,
  getDoc,
  getUi,
  isCanvasAt,
  nextFrames,
  pickOpenPoint,
  touchDrag,
  touchSecondFinger,
  visibleInputFontSizes,
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

const addButton = (page: Page) => page.getByTestId('toolbar').getByRole('button', { name: '+물건' })
const undoButton = (page: Page) => page.getByTestId('mobile-top-bar').getByRole('button', { name: '실행 취소' })
const librarySheet = (page: Page) => page.getByTestId('library-sheet')
const selectionSheet = (page: Page) => page.getByTestId('selection-sheet')

async function itemById(page: Page, id: string): Promise<Item | undefined> {
  return (await getDoc(page)).layout.items.find((i) => i.id === id)
}

/** [+물건] → 라이브러리 시트의 매트 카드. 시트가 선택 시트로 바뀌고, 추가된 물건을 돌려줍니다. */
async function addMatFromSheet(page: Page): Promise<Item> {
  const before = (await getDoc(page)).layout.items.length
  await addButton(page).tap()
  await expect(librarySheet(page)).toBeVisible()
  expect((await getUi(page)).mobileSheet).toBe('library')

  await librarySheet(page).getByText(MAT, { exact: true }).tap()
  await expect(selectionSheet(page)).toBeVisible()
  await expect(librarySheet(page)).toBeHidden()
  const { layout } = await getDoc(page)
  expect(layout.items).toHaveLength(before + 1)
  const item = layout.items.at(-1)
  if (item === undefined) throw new Error('추가된 물건이 없습니다')
  return item
}

/** 매트를 추가해 선택한 채로, 선택 시트 위 영역에 맞춤 보기를 하고 매트 가운데의 창 좌표를 돌려줍니다. */
async function addMatAndFrame(page: Page): Promise<{ item: Item; at: ClientPt }> {
  const item = await addMatFromSheet(page)
  // 셸이 시트 높이를 insets.bottom에 넣은 뒤(Task 12) 시트 위 영역에 다시 맞춥니다.
  await expect.poll(async () => (await getUi(page)).insets.bottom).toBeGreaterThan(0)
  await fitView(page)
  const at = await worldToClient(page, item.x, item.y)
  expect(await isCanvasAt(page, at)).toBe(true)
  return { item, at }
}

test('[+물건] → 라이브러리 시트 카드 → 선택 시트, 시트의 ×는 선택만 푼다', async ({ page }) => {
  const item = await addMatFromSheet(page)
  expect(item.name).toBe(MAT)
  await expect(selectionSheet(page)).toContainText(MAT)
  const ui = await getUi(page)
  expect(ui.selection).toEqual([item.id])
  expect(ui.mobileSheet).toBe('selection')

  await selectionSheet(page).getByRole('button', { name: '닫기' }).tap()
  await expect(selectionSheet(page)).toBeHidden()
  const closed = await getUi(page)
  expect(closed.selection).toEqual([])
  expect(closed.mobileSheet).toBe('none')
  expect((await getDoc(page)).layout.items.map((i) => i.id)).toEqual([item.id])
})

test('빈 곳을 한 손가락으로 끌면 화면이 그만큼 이동하고 문서는 그대로다', async ({ page }) => {
  const start = await pickOpenPoint(page, { margin: 100 })
  const before = (await getUi(page)).view

  await touchDrag(page, start, { x: start.x + 60, y: start.y + 80 })
  await nextFrames(page)

  const after = (await getUi(page)).view
  expect(after.zoom).toBe(before.zoom)
  // 탭 경계(8px) 안의 첫 움직임은 빠질 수 있다
  expect(Math.abs(after.panX - before.panX - 60)).toBeLessThanOrEqual(10)
  expect(Math.abs(after.panY - before.panY - 80)).toBeLessThanOrEqual(10)
  const doc = await getDoc(page)
  expect(doc.canUndo).toBe(false)
  expect(doc.inGesture).toBe(false)
  expect((await getUi(page)).selection).toEqual([])
})

test('물건을 끄는 중 두 번째 손가락이 닿으면 시작 위치로 되돌리고 기록을 남기지 않는다(Review Focus 1)', async ({
  page,
}) => {
  const { item, at: start } = await addMatAndFrame(page)
  const second = await pickOpenPoint(page, { avoid: [start], minDist: 120, margin: 90 })
  const zoomBefore = (await getUi(page)).view.zoom

  await touchSecondFinger(page, {
    first: start,
    dragBy: { x: 40, y: 30 },
    second,
    spreadBy: 80,
    thenPanBy: { x: 20, y: 20 },
    whileDragging: async () => {
      // 끌기가 실제로 시작됐는지 먼저 확인합니다(아니면 이 시험은 아무것도 확인하지 못함).
      await expect.poll(async () => (await getDoc(page)).inGesture).toBe(true)
    },
    afterSecondDown: async () => {
      await expect.poll(async () => (await getDoc(page)).inGesture).toBe(false)
    },
  })
  await nextFrames(page, 3)

  const doc = await getDoc(page)
  const mat = doc.layout.items.find((i) => i.id === item.id)
  expect([mat?.x, mat?.y]).toEqual([item.x, item.y])
  expect(doc.inGesture).toBe(false)
  expect(doc.canRedo).toBe(false)
  // 두 손가락은 확대로 쓰였다
  expect((await getUi(page)).view.zoom).toBeGreaterThan(zoomBefore)

  // 되돌린 물건은 화면에서도 제자리다: 문서 위치를 다시 끌면 손가락 이동량만큼만 움직인다
  await fitView(page)
  const { zoom } = (await getUi(page)).view
  const from = await worldToClient(page, item.x, item.y)
  expect(await isCanvasAt(page, from)).toBe(true)
  await touchDrag(page, from, { x: from.x + 50, y: from.y })
  await expect.poll(async () => (await itemById(page, item.id))?.x).not.toBe(item.x)
  const moved = await itemById(page, item.id)
  expect(Math.abs((moved?.x ?? 0) - (item.x + 50 / zoom))).toBeLessThan(1)
  expect(moved?.y).toBe(item.y)

  // 기록은 '추가'와 '다시 끌기' 2칸뿐이다: 두 손가락 제스처는 실행 취소 기록을 남기지 않았다
  await undoButton(page).tap()
  await expect.poll(async () => {
    const back = await itemById(page, item.id)
    return [back?.x, back?.y]
  }).toEqual([item.x, item.y])
  await undoButton(page).tap()
  await expect.poll(async () => (await getDoc(page)).layout.items.length).toBe(0)
  expect((await getDoc(page)).canUndo).toBe(false)
})

test('물건을 끄는 중 터치가 취소되면 시작 위치로 되돌리고 기록을 남기지 않는다', async ({ page }) => {
  const { item, at: start } = await addMatAndFrame(page)

  const fingers = await Fingers.open(page)
  try {
    await fingers.down(1, start)
    await fingers.move({ 1: { x: start.x + 40, y: start.y + 30 } }, 8)
    await expect.poll(async () => (await getDoc(page)).inGesture).toBe(true)
    await fingers.cancel()
  } finally {
    await fingers.detach()
  }
  await nextFrames(page, 3)

  const doc = await getDoc(page)
  const mat = doc.layout.items.find((i) => i.id === item.id)
  expect([mat?.x, mat?.y]).toEqual([item.x, item.y])
  expect(doc.inGesture).toBe(false)
  // 기록은 '추가' 1칸뿐: 실행 취소 한 번에 물건이 사라진다
  await undoButton(page).tap()
  await expect.poll(async () => (await getDoc(page)).layout.items.length).toBe(0)
  expect((await getDoc(page)).canUndo).toBe(false)
})

test('입력칸 글자는 16px 이상이다(iOS 포커스 확대 방지)', async ({ page }) => {
  for (const size of await visibleInputFontSizes(page)) expect(size).toBeGreaterThanOrEqual(16)

  await addButton(page).tap()
  await librarySheet(page).getByRole('button', { name: /새 도형 만들기/ }).tap()
  await expect.poll(async () => (await getUi(page)).mobileSheet).toBe('newShape')

  const sizes = await visibleInputFontSizes(page)
  // 새 도형 폼: 이름·가로·세로
  expect(sizes.length).toBeGreaterThanOrEqual(3)
  for (const size of sizes) expect(size).toBeGreaterThanOrEqual(16)
})
