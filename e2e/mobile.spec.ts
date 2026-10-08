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

// ── 최종 리뷰 회귀(2026-10-08) ────────────────────────────────────────────

/** 먼저 빈 곳을 터치해 pointer='touch'로 만들고(첫 터치 문제와 분리), 매트를 추가한 뒤 선택을 풉니다. */
async function addMatDeselected(page: Page): Promise<Item> {
  const s = await pickOpenPoint(page, { margin: 100 })
  await touchDrag(page, s, { x: s.x + 1, y: s.y + 20 })
  const item = await addMatFromSheet(page)
  await selectionSheet(page).getByRole('button', { name: '닫기' }).tap()
  await expect(selectionSheet(page)).toBeHidden()
  await nextFrames(page, 3)
  return item
}

test('리뷰 Critical: 화면 아래쪽의 선택 안 된 물건을 눌러 바로 끌면 끈 만큼만 움직인다', async ({ page }) => {
  const item = await addMatDeselected(page)
  // 매트가 캔버스 아래쪽(시트에 가려질 자리)에 오도록 화면을 옮깁니다.
  let c = await worldToClient(page, item.x, item.y)
  const box = (await page.locator('.konvajs-content').boundingBox())!
  const targetY = box.y + box.height - 60
  const s = await pickOpenPoint(page, { avoid: [c], minDist: 80, margin: 100 })
  await touchDrag(page, s, { x: s.x, y: s.y + (targetY - c.y) }, 12)
  await nextFrames(page, 3)
  c = await worldToClient(page, item.x, item.y)
  expect(await isCanvasAt(page, c)).toBe(true)
  const zoom = (await getUi(page)).view.zoom

  await touchDrag(page, c, { x: c.x + 20, y: c.y }, 6)
  await page.waitForTimeout(300)
  const after = (await itemById(page, item.id))!
  expect(Math.abs(after.y - item.y)).toBeLessThan(1)
  expect(Math.abs(after.x - item.x - 20 / zoom)).toBeLessThan(2)
})

test('리뷰 Important: 시트로 추가한 물건을 첫 터치로 중심 밖에서 끌면 크기가 아니라 위치가 바뀐다', async ({ page }) => {
  const item = await addMatFromSheet(page)
  await nextFrames(page, 3)
  const c = await worldToClient(page, item.x, item.y)
  const start = { x: c.x, y: c.y - 9 }
  await touchDrag(page, start, { x: start.x, y: start.y - 40 })
  await page.waitForTimeout(200)
  const after = (await itemById(page, item.id))!
  expect(after.shape).toEqual(item.shape)
  expect(after.y).toBeLessThan(item.y - 5)
  expect((await getUi(page)).pointer).toBe('touch')
})

test('리뷰 Important: 선택 안 된 물건 위에서 핀치를 시작해도 선택이 바뀌지 않는다', async ({ page }) => {
  const item = await addMatDeselected(page)
  const c = await worldToClient(page, item.x, item.y)
  const second = await pickOpenPoint(page, { avoid: [c], minDist: 120, margin: 60 })
  const z0 = (await getUi(page)).view.zoom
  const f = await Fingers.open(page)
  await f.down(1, c)
  await f.down(2, second)
  await f.move({ 1: { x: c.x - 40, y: c.y - 40 }, 2: { x: second.x + 40, y: second.y + 40 } }, 8)
  await f.up(2)
  await f.up(1)
  await f.detach()
  await page.waitForTimeout(300)
  const ui = await getUi(page)
  expect(ui.view.zoom).not.toBe(z0)
  expect(ui.selection).toEqual([])
  expect(ui.mobileSheet).toBe('none')
  expect((await getDoc(page)).canUndo).toBe(true) // 매트 추가 1칸뿐(핀치는 기록 없음)
})

test('리뷰 Important: 확대한 상태에서 라이브러리로 추가하면 화면 가운데(시트를 빼지 않은)에 놓인다', async ({ page }) => {
  const box = (await page.locator('.konvajs-content').boundingBox())!
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const f = await Fingers.open(page)
  const a = { x: center.x - 20, y: center.y - 20 }
  const b = { x: center.x + 20, y: center.y + 20 }
  await f.down(1, a)
  await f.down(2, b)
  await f.move({ 1: { x: a.x - 100, y: a.y - 100 }, 2: { x: b.x + 100, y: b.y + 100 } }, 12)
  await f.up(2)
  await f.up(1)
  await f.detach()
  await page.waitForTimeout(200)
  const ui0 = await getUi(page)
  const v = ui0.view
  const cw = [(ui0.size.width / 2 - v.panX) / v.zoom, (ui0.size.height / 2 - v.panY) / v.zoom]

  const item = await addMatFromSheet(page)
  expect(Math.abs(item.x - cw[0]!)).toBeLessThan(1)
  expect(Math.abs(item.y - cw[1]!)).toBeLessThan(1)
})
