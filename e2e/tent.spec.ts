// PC(1440×900, 마우스) 텐트 흐름: 고르기·내 배치·만들기 화면·텐트 편집 모드·텐트 바꾸기·이너 없는 텐트.
// playwright.config.ts의 desktop 프로젝트가 editor.spec.ts와 함께 돌립니다.
import { expect, test, type Page } from '@playwright/test'
import type { Item } from '../src/core/model'
import { computeStats } from '../src/core/stats'
import { previewVertexDrag } from '../src/view/tentEdit'
import {
  dragBetween,
  getAppLayouts,
  getDoc,
  getUi,
  nextFrames,
  openEditorWith,
  statRowPattern,
  waitReady,
  worldToClient,
} from './helpers'
import {
  DOME,
  LIVING_SHELL,
  TIPI,
  TUNNEL,
  browserBack,
  enterTentModeByUi,
  exitTentModeByUi,
  getTent,
  horizontalOverflowPx,
  innerNamed,
  makeCard,
  makerConfirm,
  makerField,
  mouseDragHolding,
  near,
  onMakerHistoryEntry,
  openPickScreen,
  openTentMaker,
  pickCard,
  pickScreen,
  selectOuter,
  setMakerNumber,
  swapDialog,
  tentEditStatus,
  tentEditor,
  tentMaker,
  toast,
  vertexClient,
  vertexWorld,
} from './tentFlows'

/** presets/items.json의 items/mat-single-200x60 */
const MAT = '캠핑 매트 1인'

const library = (page: Page) => page.getByRole('complementary', { name: '라이브러리' })
const areaSummary = (page: Page) => page.getByRole('region', { name: '면적 현황' })

/** 왼쪽 라이브러리에서 매트를 눌러 추가하고, 추가된 물건을 돌려줍니다. */
async function addMat(page: Page): Promise<Item> {
  const before = (await getDoc(page)).layout.items.length
  await library(page).getByText(MAT, { exact: true }).click()
  await expect.poll(async () => (await getDoc(page)).layout.items.length).toBe(before + 1)
  const item = (await getDoc(page)).layout.items.at(-1)
  if (item === undefined) throw new Error('추가된 물건이 없습니다')
  // Konva는 다음 프레임에 히트 캔버스를 다시 그립니다.
  await nextFrames(page)
  return item
}

test.describe('고르기 화면·내 배치', () => {
  test('카드를 고르면 새 배치(이름 「<텐트> 배치」, 실행 취소 없음)로 편집기, 뒤로 가기 = 고르기, 내 배치로 그 배치를 다시 연다', async ({
    page,
  }) => {
    await openPickScreen(page)
    // 배치가 0개면 '내 배치'가 없고 [취소]도 없습니다(R2·R3).
    await expect(pickScreen(page).getByRole('button', { name: '내 배치' })).toHaveCount(0)
    await expect(pickScreen(page).getByRole('button', { name: '취소', exact: true })).toHaveCount(0)
    expect(await horizontalOverflowPx(pickScreen(page))).toBeLessThanOrEqual(0)

    await pickCard(page, TUNNEL).click()
    await waitReady(page)
    const opened = await getDoc(page)
    expect(opened.layout.name).toBe(`${TUNNEL} 배치`)
    expect(opened.layout.sourcePresetId).toBe('generic/tunnel-4p')
    expect(opened.canUndo).toBe(false)
    expect((await getUi(page)).mode).toBe('place')
    const editUrl = page.url()

    // 편집기는 push로 열렸으므로 뒤로 가기 한 번이면 고르기 화면입니다(§4.7).
    await browserBack(page)
    await expect(page).toHaveURL(/#\/pick$/)
    await expect(pickScreen(page)).toBeVisible()
    expect(await getAppLayouts(page)).toHaveLength(1)

    await pickScreen(page).getByRole('button', { name: '내 배치' }).click()
    const dialog = page.getByTestId('my-layouts-dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: `${TUNNEL} 배치`, exact: true }).click()
    await waitReady(page)
    expect(page.url()).toBe(editUrl)
    expect((await getDoc(page)).layout.id).toBe(opened.layout.id)
    expect(await getAppLayouts(page)).toHaveLength(1)
  })
})

test.describe('텐트 만들기 화면', () => {
  test('사각형 + 뒤 이너 → 치수를 바꾸면 이너가 따라가고, [이 텐트로 시작] → 배치 모드 새 배치 → 물건을 벽 밖으로 끌면 나감 경고', async ({
    page,
  }) => {
    await openPickScreen(page)
    await openTentMaker(page)
    // 확정·취소 버튼이 화면 안에 보입니다(4개 크기 규칙).
    await expect(makerConfirm(page)).toBeInViewport({ ratio: 1 })
    await expect(tentMaker(page).getByRole('button', { name: '취소', exact: true })).toBeInViewport({ ratio: 1 })

    // R6 초기값: 사각형 400×300, 이너 1(180×180)이 뒤 벽에 붙음. 사각형은 붙일 위치 4칸(R7).
    await expect(makerField(page, '가로')).toHaveValue('400')
    await expect(makerField(page, '세로')).toHaveValue('300')
    const side = tentMaker(page).getByRole('radiogroup', { name: '이너 1 붙일 위치' })
    await expect(side.getByRole('radio')).toHaveText(['뒤', '앞', '왼쪽', '오른쪽'])
    await expect(side.getByRole('radio', { name: '뒤', exact: true })).toHaveAttribute('aria-checked', 'true')

    // 외곽 치수를 바꾸면 붙인 이너가 새 뒤 벽을 따라갑니다(§4.4-1).
    await setMakerNumber(page, '가로', 500)
    await setMakerNumber(page, '세로', 400)
    await expect(makerConfirm(page)).toBeEnabled()
    expect(await getAppLayouts(page)).toHaveLength(0) // 만들기 화면은 문서 밖(§8)

    await makerConfirm(page).click()
    await waitReady(page)
    await expect(tentMaker(page)).toHaveCount(0)
    const doc = await getDoc(page)
    expect(doc.layout.name).toBe('내 텐트 배치')
    expect(doc.layout.sourcePresetId).toBeUndefined()
    expect(doc.canUndo).toBe(false) // 새 배치는 빈 기록
    expect(doc.layout.tent.outer).toEqual({ kind: 'rect', w: 500, h: 400 })
    expect(doc.layout.tent.inners).toHaveLength(1)
    // 뒤 벽 y = −200, 깊이 180 → 이너 중심 y = −110
    expect(doc.layout.tent.inners[0]).toMatchObject({ x: 0, y: -110, rotation: 0, shape: { kind: 'rect', w: 180, h: 180 } })
    expect((await getUi(page)).mode).toBe('place')
    expect(await getAppLayouts(page)).toHaveLength(1)
    // 확정 뒤 만들기 화면 항목이 history에 남지 않습니다.
    expect(await onMakerHistoryEntry(page)).toBe(false)

    // 물건 추가 → 오른쪽 벽(x = 250)에 걸치게 끌기 → 텐트 밖으로 나감 경고(§13.4)
    // (새 물건은 화면 가운데에 놓여 이너 벽에 걸칠 수 있습니다 — 나감 여부만 봅니다.)
    const item = await addMat(page)
    expect(computeStats((await getDoc(page)).layout).warnings[item.id]?.outside ?? false).toBe(false)
    const from = await worldToClient(page, item.x, item.y)
    const to = await worldToClient(page, 250, 120)
    await dragBetween(page, from, to)
    await expect
      .poll(async () => computeStats((await getDoc(page)).layout).warnings[item.id]?.outside ?? false)
      .toBe(true)
    const stats = computeStats((await getDoc(page)).layout)
    expect(stats.warnings[item.id]?.straddles).toEqual([]) // 이너(y −200~−20)와는 떨어져 있음
    await areaSummary(page).getByRole('button', { name: `경고 ${stats.warningCount}건 보기` }).click()
    await expect(page.getByRole('region', { name: '경고 목록' }).getByText('텐트 밖으로 나감')).toBeVisible()

    // 편집기에서 뒤로 가기 한 번이면 고르기 화면 항목입니다(만들기 화면 항목이 끼어 있으면 같은 #/pick의 그 항목에 멈춰 헛돎).
    await browserBack(page)
    await expect(page).toHaveURL(/#\/pick$/)
    await expect(pickScreen(page)).toBeVisible()
    await expect(tentMaker(page)).toHaveCount(0)
    expect(await onMakerHistoryEntry(page)).toBe(false)
  })

  test('[취소]·‹·브라우저 뒤로 가기는 배치를 만들지 않고, history에 만들기 화면 항목을 남기지 않는다', async ({ page }) => {
    await openPickScreen(page)

    await openTentMaker(page)
    await setMakerNumber(page, '가로', 450)
    await tentMaker(page).getByRole('button', { name: '취소', exact: true }).click()
    await expect(tentMaker(page)).toHaveCount(0)
    await expect(page).toHaveURL(/#\/pick$/)
    expect(await onMakerHistoryEntry(page)).toBe(false)
    expect(await getAppLayouts(page)).toHaveLength(0)

    await openTentMaker(page)
    await tentMaker(page).getByRole('button', { name: '뒤로', exact: true }).click()
    await expect(tentMaker(page)).toHaveCount(0)
    expect(await onMakerHistoryEntry(page)).toBe(false)
    expect(await getAppLayouts(page)).toHaveLength(0)

    await openTentMaker(page)
    await browserBack(page)
    await expect(tentMaker(page)).toHaveCount(0)
    await expect(page).toHaveURL(/#\/pick$/)
    expect(await onMakerHistoryEntry(page)).toBe(false)
    expect(await getAppLayouts(page)).toHaveLength(0)
    await expect(pickScreen(page).getByRole('button', { name: '내 배치' })).toHaveCount(0)

    // 세 번 열고 닫은 뒤에도 카드 → 편집기 → 뒤로 가기 한 번 = 고르기 화면
    await pickCard(page, TUNNEL).click()
    await waitReady(page)
    await browserBack(page)
    await expect(page).toHaveURL(/#\/pick$/)
    await expect(makeCard(page)).toBeVisible()
  })
})

test.describe('텐트 편집 모드', () => {
  test.beforeEach(async ({ page }) => {
    await openEditorWith(page)
    await enterTentModeByUi(page)
    await expect(tentEditor(page)).toBeVisible()
  })

  test('모드 토글로 들어가고 나온다. 바닥을 누르면 외곽, 이너를 누르면 그 이너가 대상', async ({ page }) => {
    expect((await getUi(page)).tentTarget).toBeNull()
    await expect(tentEditor(page).getByText('편집할 곳을 고르세요')).toBeVisible()
    await selectOuter(page)
    await expect(tentEditor(page).getByRole('button', { name: /^외곽/ })).toHaveAttribute('aria-pressed', 'true')

    const inner = await innerNamed(page, '이너 1')
    await page.mouse.click(...xy(await worldToClient(page, inner.x, inner.y)))
    await expect.poll(async () => (await getUi(page)).tentTarget).toEqual({ innerId: inner.id })

    await exitTentModeByUi(page)
    const ui = await getUi(page)
    expect(ui.tentTarget).toBeNull()
    expect(ui.vertexIndex).toBeNull()
    await expect(tentEditor(page)).toHaveCount(0)
    expect((await getDoc(page)).canUndo).toBe(false)
  })

  test('외곽 꼭짓점 끌기 = 기록 1칸(끄는 중에는 제스처 중), Ctrl+Z 한 번에 원래 사각형', async ({ page }) => {
    const original = await getTent(page)
    await selectOuter(page)
    const { zoom } = (await getUi(page)).view
    const from = await vertexClient(page, 'outer', 1) // 오른쪽 위 (310, −160)
    await mouseDragHolding(page, from, { x: from.x + 40, y: from.y - 30 }, async () => {
      expect((await getDoc(page)).inGesture).toBe(true)
      await expect(tentEditStatus(page)).toHaveText('')
      // 끄는 동안 문서는 그대로(미리보기는 문서 밖, §8)
      expect((await getTent(page)).outer).toEqual(original.outer)
    })

    await expect.poll(async () => (await getDoc(page)).canUndo).toBe(true)
    const doc = await getDoc(page)
    expect(doc.inGesture).toBe(false)
    expect(doc.layout.tent.outer.kind).toBe('polygon') // 꼭짓점을 끌면 자유 다각형(§4.4-6)
    expect(doc.layout.tent.outerTemplate).toBeUndefined()
    expect(near(await vertexWorld(page, 'outer', 1), [310 + 40 / zoom, -160 - 30 / zoom])).toBe(true)
    expect((await getUi(page)).vertexIndex).toBe(1)

    await page.keyboard.press('ControlOrMeta+z')
    await expect.poll(async () => (await getTent(page)).outer).toEqual(original.outer)
    expect((await getTent(page)).outerTemplate).toEqual(original.outerTemplate)
    expect((await getDoc(page)).canUndo).toBe(false)
  })

  test('「+」을 누르면 그 변 가운데에 꼭짓점이 생기고 새 꼭짓점이 선택된다', async ({ page }) => {
    await selectOuter(page)
    // 1번 변(오른쪽 위 → 오른쪽 아래)의 가운데 (310, 0)
    await page.mouse.click(...xy(await worldToClient(page, 310, 0)))
    await expect.poll(async () => (await getTent(page)).outer.kind).toBe('polygon')
    const tent = await getTent(page)
    expect(tent.outer.kind === 'polygon' ? tent.outer.points : []).toHaveLength(5)
    expect(await vertexWorld(page, 'outer', 2)).toEqual([310, 0])
    expect((await getUi(page)).vertexIndex).toBe(2)
    expect((await getDoc(page)).canUndo).toBe(true)
  })

  test('자기교차가 되게 끄는 동안 「놓으면 취소돼요」, 놓으면 그대로·기록 없음', async ({ page }) => {
    const original = await getTent(page)
    await selectOuter(page)
    // 왼쪽 위 꼭짓점(0번)을 아래 변 너머 (0, 220)으로: 0번 변이 아래 변과 엇갈려 자기교차
    const drop: [number, number] = [0, 220]
    expect(previewVertexDrag((await getDoc(page)).layout, 'outer', 0, drop).issues.length).toBeGreaterThan(0)
    const from = await vertexClient(page, 'outer', 0)
    const to = await worldToClient(page, drop[0], drop[1])
    await mouseDragHolding(page, from, to, async () => {
      await expect(tentEditStatus(page)).toHaveText('놓으면 취소돼요')
      expect((await getDoc(page)).inGesture).toBe(true)
    })

    await expect(tentEditStatus(page)).toHaveText('')
    const doc = await getDoc(page)
    expect(doc.inGesture).toBe(false)
    expect(doc.canUndo).toBe(false)
    expect(doc.layout.tent).toEqual(original)
  })

  test('이너를 눌러 끌면 끈 만큼 옮겨지고(기록 1칸) Ctrl+Z로 제자리', async ({ page }) => {
    const inner = await innerNamed(page, '이너 1')
    const { zoom } = (await getUi(page)).view
    const from = await worldToClient(page, inner.x, inner.y)
    await dragBetween(page, from, { x: from.x + 60, y: from.y + 30 })
    await expect.poll(async () => (await innerNamed(page, '이너 1')).x).not.toBe(inner.x)
    const moved = await innerNamed(page, '이너 1')
    expect(near([moved.x, moved.y], [inner.x + 60 / zoom, inner.y + 30 / zoom])).toBe(true)
    expect(moved.shape).toEqual(inner.shape)
    expect((await getUi(page)).tentTarget).toEqual({ innerId: inner.id })

    await page.keyboard.press('ControlOrMeta+z')
    await expect.poll(async () => {
      const back = await innerNamed(page, '이너 1')
      return [back.x, back.y]
    }).toEqual([inner.x, inner.y])
    expect((await getDoc(page)).canUndo).toBe(false)
  })

  test('Delete로 선택한 꼭짓점을 지우고, 3개면 지우지 않고 알린다. Ctrl+Z로 원래 외곽', async ({ page }) => {
    const original = await getTent(page)
    await selectOuter(page)
    await page.mouse.click(...xy(await vertexClient(page, 'outer', 3))) // 왼쪽 아래 (−310, 160)
    await expect.poll(async () => (await getUi(page)).vertexIndex).toBe(3)

    await page.keyboard.press('Delete')
    await expect.poll(async () => {
      const t = await getTent(page)
      return t.outer.kind === 'polygon' ? t.outer.points.length : 4
    }).toBe(3)
    expect((await getUi(page)).vertexIndex).toBeNull()
    expect((await getUi(page)).tentTarget).toBe('outer')

    // 남은 꼭짓점이 3개면 지우지 않습니다(§6.9).
    await page.mouse.click(...xy(await vertexClient(page, 'outer', 0)))
    await expect.poll(async () => (await getUi(page)).vertexIndex).toBe(0)
    const triangle = await getTent(page)
    await page.keyboard.press('Delete')
    await expect(toast(page)).toHaveText('꼭짓점이 3개면 지울 수 없어요')
    expect(await getTent(page)).toEqual(triangle)

    await page.keyboard.press('ControlOrMeta+z')
    await expect.poll(async () => (await getTent(page)).outer).toEqual(original.outer)
    expect((await getDoc(page)).canUndo).toBe(false)
  })
})

test.describe('텐트 바꾸기', () => {
  test('텐트 편집 패널 [텐트 바꾸기] → 카드: 물건은 그대로·기록 1칸, Ctrl+Z 한 번에 원래 텐트', async ({ page }) => {
    await openEditorWith(page)
    const item = await addMat(page)
    const original = await getTent(page)
    await enterTentModeByUi(page)
    await selectOuter(page)

    await tentEditor(page).getByRole('button', { name: '텐트 바꾸기', exact: true }).click()
    await expect(swapDialog(page)).toBeVisible()
    await expect(swapDialog(page).getByRole('button', { name: LIVING_SHELL, exact: true })).toBeVisible({ timeout: 15_000 })
    await swapDialog(page).getByRole('button', { name: LIVING_SHELL, exact: true }).click()
    await expect(swapDialog(page)).toHaveCount(0)

    const doc = await getDoc(page)
    expect(doc.layout.tent.name).toBe(LIVING_SHELL)
    expect(doc.layout.sourcePresetId).toBe('generic/living-shell')
    expect(doc.layout.items).toEqual([item]) // 물건 좌표 그대로(§4.7-8)
    const ui = await getUi(page)
    expect(ui.mode).toBe('tent') // 모드 그대로, 대상은 비움(R9)
    expect(ui.tentTarget).toBeNull()
    expect(ui.vertexIndex).toBeNull()

    await page.keyboard.press('ControlOrMeta+z')
    await expect.poll(async () => (await getTent(page)).name).toBe(TUNNEL)
    const back = await getDoc(page)
    expect(back.layout.tent).toEqual(original)
    expect(back.layout.items).toEqual([item]) // 한 번 되돌림 = 바꾸기만(물건 추가는 그대로)
    expect(back.canUndo).toBe(true)
  })

  test('[텐트 바꾸기] → [직접 만들기] → [이 텐트로 바꾸기]도 기록 1칸, 만들기 화면 항목은 남지 않는다', async ({ page }) => {
    await openEditorWith(page)
    const original = await getTent(page)
    const editUrl = page.url()
    await enterTentModeByUi(page)
    await tentEditor(page).getByRole('button', { name: '텐트 바꾸기', exact: true }).click()
    await swapDialog(page).getByTestId('make-tent-card').click()
    await expect(swapDialog(page)).toHaveCount(0)
    await expect(tentMaker(page)).toBeVisible()
    await expect(makerConfirm(page, '이 텐트로 바꾸기')).toBeInViewport({ ratio: 1 })

    await makerConfirm(page, '이 텐트로 바꾸기').click()
    await expect(tentMaker(page)).toHaveCount(0)
    await expect.poll(async () => (await getTent(page)).name).toBe('내 텐트')
    expect(page.url()).toBe(editUrl)
    expect(await onMakerHistoryEntry(page)).toBe(false)
    const doc = await getDoc(page)
    expect(doc.layout.sourcePresetId).toBeUndefined()
    expect(doc.canUndo).toBe(true)

    await page.keyboard.press('ControlOrMeta+z')
    await expect.poll(async () => (await getTent(page)).name).toBe(TUNNEL)
    expect(await getTent(page)).toEqual(original)
    expect((await getDoc(page)).canUndo).toBe(false)
  })

  test('물건이 없는 배치 모드의 빈 안내 카드 [텐트 바꾸기] → 카드: 배치 모드 그대로 1칸', async ({ page }) => {
    await openEditorWith(page)
    const card = page.getByTestId('empty-card')
    await expect(card).toBeVisible()
    await card.getByRole('button', { name: '텐트 바꾸기', exact: true }).click()
    await swapDialog(page).getByRole('button', { name: DOME, exact: true }).click()
    await expect(swapDialog(page)).toHaveCount(0)
    await expect.poll(async () => (await getTent(page)).name).toBe(DOME)
    expect((await getUi(page)).mode).toBe('place')
    expect((await getDoc(page)).canUndo).toBe(true)
    await page.keyboard.press('ControlOrMeta+z')
    await expect.poll(async () => (await getTent(page)).name).toBe(TUNNEL)
    expect((await getDoc(page)).canUndo).toBe(false)
  })
})

test('이너 0개 텐트(티피): 면적 현황은 「이너 전체 —」·「바닥 전체」이고, 물건·텐트 모드에서도 깨지지 않는다', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await openEditorWith(page, TIPI)
  const empty = await getDoc(page)
  expect(empty.layout.tent.inners).toEqual([])
  const stats = computeStats(empty.layout)
  expect(stats.totalInner.percent).toBeNull()
  expect(stats.totalFloor.name).toBe('바닥 전체')
  await expect(areaSummary(page)).toHaveText(statRowPattern(stats.totalInner))
  await expect(areaSummary(page)).toHaveText(statRowPattern(stats.totalFloor))

  await addMat(page)
  const added = computeStats((await getDoc(page)).layout)
  expect(added.totalFloor.percent).toBeGreaterThan(0)
  await expect(areaSummary(page)).toHaveText(statRowPattern(added.totalFloor))

  await enterTentModeByUi(page)
  await selectOuter(page, [0, 0])
  await expect(tentEditor(page).getByRole('list', { name: '텐트 구성' }).getByRole('button')).toHaveText([/^외곽/, '+ 이너'])
  expect(errors).toEqual([])
})

test('화면 크기: 고르기 화면 가로 스크롤 없음, 만들기 화면 확정 버튼이 보인다(1440×900)', async ({ page }) => {
  await openPickScreen(page)
  expect(await horizontalOverflowPx(pickScreen(page))).toBeLessThanOrEqual(0)
  await expect(pickScreen(page)).toHaveAttribute('data-layout', 'desktop')
  await openTentMaker(page)
  await expect(tentMaker(page)).toHaveAttribute('data-layout', 'desktop')
  await expect(makerConfirm(page)).toBeInViewport({ ratio: 1 })
  expect(await horizontalOverflowPx(tentMaker(page))).toBeLessThanOrEqual(0)
})

function xy(p: { x: number; y: number }): [number, number] {
  return [p.x, p.y]
}
