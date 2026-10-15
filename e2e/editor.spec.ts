// PC(1440×900, 마우스) 편집기 흐름. playwright.config.ts의 desktop 프로젝트만 이 파일을 돌립니다.
import { expect, test, type Page } from '@playwright/test'
import type { Item } from '../src/core/model'
import { computeStats } from '../src/core/stats'
import {
  BOX_ITEM,
  createItem,
  darkestAround,
  dragBetween,
  getDoc,
  getUi,
  nextFrames,
  openEditorWith,
  statRowPattern,
  MAT_ITEM,
  setSnap,
  STOOL_ITEM,
  worldToClient,
  type ClientPt,
  type NewItemSpec,
} from './helpers'

/** 시험용 매트 이름(새 도형으로 만듦, 200×60) */
const MAT = MAT_ITEM.name

// 빈 앱 → 고르기 화면 → '터널 4인 예시' 카드 → 편집기(스펙 §4.7). 아래 좌표는 터널 4인(620×320)을 가정합니다.
test.beforeEach(async ({ page }) => {
  await openEditorWith(page)
})

const library = (page: Page) => page.getByRole('complementary', { name: '라이브러리' })
const properties = (page: Page) => page.getByTestId('properties-panel')
const areaSummary = (page: Page) => page.getByRole('region', { name: '면적 현황' })

/** 물건을 만들어 놓습니다(기본은 매트 200×60). 예시 프리셋을 뺀 뒤로는 「새 도형 만들기」를 씁니다. */
async function addMatFromLibrary(page: Page, spec: NewItemSpec = MAT_ITEM): Promise<Item> {
  return createItem(page, spec)
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

test('고르기 화면에서 텐트를 고르면 새 배치를 만들어 편집 화면으로 가고 그 텐트를 그린다', async ({ page }) => {
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

test('새 도형으로 만들면 물건이 추가·선택되고 속성 패널과 면적 현황이 따라 바뀐다', async ({ page }) => {
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

  // 배치 모드는 이동·회전만(2026-10-15): 크기는 읽기 전용, 바꾸려면 [모양 편집]
  await expect(properties(page).getByTestId('item-size')).toHaveText('200×60 cm')
  await expect(properties(page).getByLabel('가로', { exact: true })).toHaveCount(0)
  await expectAreaSummaryMatchesDoc(page)
})

test('물건을 끌면 위치가 바뀌고 Ctrl+Z 한 번으로 제자리에 돌아온다', async ({ page }) => {
  const item = await addMatFromLibrary(page)
  await setSnap(page, false) // 끈 거리를 그대로 보려고 자석 맞춤은 끔
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

for (const spec of [BOX_ITEM, STOOL_ITEM]) {
  test(`리뷰 회귀: 축소해서 작아진 ${spec.name}도 몸통을 끌면 크기가 아니라 위치가 바뀐다`, async ({ page }) => {
    const item = await addMatFromLibrary(page, spec)
    await setSnap(page, false)
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

test('배치 모드는 이동·회전만(2026-10-15): 가장자리를 끌어도 크기는 그대로 옮겨지고, 두 번 누르면 모양 편집', async ({ page }) => {
  const item = await addMatFromLibrary(page)
  const right = await worldToClient(page, item.x + 95, item.y)
  await dragBetween(page, right, { x: right.x + 40, y: right.y })
  await expect.poll(async () => (await itemById(page, item.id))?.x).not.toBe(item.x)
  expect((await itemById(page, item.id))!.shape).toEqual(item.shape)
  const at = await worldToClient(page, (await itemById(page, item.id))!.x, item.y)
  await page.mouse.click(at.x, at.y)
  await page.mouse.click(at.x, at.y)
  await expect(page.getByTestId('tent-maker').getByRole('heading', { name: '모양 편집' })).toBeVisible()
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

// ── 도형 위 치수·모서리·물건 그리기·배경 이미지·프리셋 저장(소유자 요청 2026-10-14) ──────────────

type ExtraUi = { keepRatio: boolean; backdrop: { x: number; y: number; w: number; opacity: number; adjusting: boolean } | null }

test.describe('도형 도구(2026-10-14)', () => {
  test('[모양 편집] 화면 캔버스 숫자: 가로를 눌러 고치면 비율 유지로 전체 배율, 모서리 둥글기 → R 숫자, 끄면 그 축만, 적용하면 물건에', async ({ page }) => {
    const item = await createItem(page, MAT_ITEM)
    await expect(page.getByTestId('dim-overlay')).toHaveCount(0) // 배치 모드에는 없음
    await page.getByTestId('properties-panel').getByRole('button', { name: '모양 편집' }).click()
    const maker = page.getByTestId('tent-maker')
    const dims = maker.getByTestId('dim-overlay')
    await dims.getByRole('button', { name: /^가로 200cm/ }).click()
    await dims.getByRole('textbox', { name: '가로', exact: true }).fill('300')
    await page.keyboard.press('Enter')
    await expect(dims.getByRole('button', { name: /^세로 90cm/ })).toBeVisible()

    const props = maker.getByTestId('tent-editor')
    await props.getByLabel('모서리 둥글기', { exact: true }).fill('5')
    await props.getByLabel('모서리 둥글기', { exact: true }).press('Enter')
    await expect(dims.locator('[data-kind="radius"]')).toHaveCount(4)

    await dims.getByRole('button', { name: /^세로 90cm/ }).click()
    await dims.getByRole('switch', { name: '비율 유지' }).uncheck()
    await dims.getByRole('textbox', { name: '세로', exact: true }).fill('120')
    await page.keyboard.press('Enter')
    await expect(dims.getByRole('button', { name: /^세로 120cm/ })).toBeVisible()
    await maker.getByRole('button', { name: '이 모양으로 적용' }).click()
    await expect(maker).toHaveCount(0)
    await expect
      .poll(async () => (await getDoc(page)).layout.items.find((it) => it.id === item.id)?.shape)
      .toEqual({ kind: 'rect', w: 300, h: 120, radii: [5, 5, 5, 5] })
  })

  test('[그려서 만들기] → 예시 사각형(190×60) → [캔버스에 추가] = 새 매트, [모양 편집]으로 다시 열기', async ({ page }) => {
    const before = (await getDoc(page)).layout.items.length
    await page.getByRole('button', { name: '그려서 만들기' }).click()
    const maker = page.getByTestId('tent-maker')
    await expect(maker.getByRole('heading', { name: '물건 그리기' })).toBeVisible()
    await maker.getByTestId('maker-shape-tools').getByRole('button', { name: '사각형', exact: true }).click()
    await maker.getByRole('button', { name: '캔버스에 추가' }).click()
    await expect(maker).toHaveCount(0)
    await expect.poll(async () => (await getDoc(page)).layout.items.length).toBe(before + 1)
    const made = (await getDoc(page)).layout.items.at(-1)!
    expect(made).toMatchObject({ name: '새 매트', category: 'MAT', shape: { kind: 'rect', w: 190, h: 60 } })
    expect((await getUi(page)).selection).toEqual([made.id])

    await page.getByTestId('properties-panel').getByRole('button', { name: '모양 편집' }).click()
    await expect(page.getByTestId('tent-maker').getByRole('heading', { name: '모양 편집' })).toBeVisible()
    await page.getByTestId('tent-maker').getByRole('button', { name: '취소', exact: true }).click()
    await expect(page.getByTestId('tent-maker')).toHaveCount(0)
  })

  test('배경 이미지: 깔고 투명도·맞추기(끌기 = 이미지 이동, 화면은 그대로)·빼기', async ({ page }) => {
    // 2×1 PNG
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR42mNk+M9QzwAEjDAGACCDAv8cI7IoAAAAAElFTkSuQmCC', 'base64')
    await page.getByTestId('backdrop-file').setInputFiles({ name: 'mat.png', mimeType: 'image/png', buffer: png })
    await expect.poll(async () => ((await getUi(page)) as unknown as ExtraUi).backdrop?.opacity).toBe(0.5)
    await page.getByRole('slider', { name: '투명도' }).fill('30')
    await page.getByRole('button', { name: '위치·크기 맞추기' }).click()
    const ui0 = (await getUi(page)) as unknown as ExtraUi & { view: unknown }
    const a = await worldToClient(page, 0, 0)
    await dragBetween(page, a, { x: a.x + 50, y: a.y })
    const ui1 = (await getUi(page)) as unknown as ExtraUi & { view: unknown }
    expect(ui1.view).toEqual(ui0.view)
    expect(ui1.backdrop!.x).toBeGreaterThan(ui0.backdrop!.x + 10)
    expect(ui1.backdrop!.opacity).toBe(0.3)
    await page.getByRole('button', { name: '완료' }).click()
    await page.getByRole('button', { name: '빼기' }).click()
    await expect.poll(async () => ((await getUi(page)) as unknown as ExtraUi).backdrop).toBeNull()
  })

  test('로컬 [프리셋으로 저장]: 제조사·이름으로 보내고 라이브러리·제조사 필터에 바로 보임', async ({ page }) => {
    let sent: unknown = null
    await page.route('**/__tentfit/item-presets', async (route) => {
      sent = route.request().postDataJSON()
      await route.fulfill({ json: { ok: true } })
    })
    await createItem(page, MAT_ITEM)
    const form = page.getByTestId('save-preset')
    await form.getByLabel('제조사').fill('써머레스트')
    await form.getByLabel('프리셋 이름').fill('네오에어 R')
    await form.getByRole('button', { name: '프리셋으로 저장' }).click()
    await expect.poll(() => sent).toMatchObject({ preset: { name: '네오에어 R', brand: '써머레스트', shape: { kind: 'rect', w: 200, h: 60 } } })
    const firstId = (sent as { preset: { id: string } }).preset.id
    // 저장한 프리셋에서 온 물건: [프리셋 고치기]는 같은 id, [새 프리셋으로 저장]은 새 id
    await form.getByRole('button', { name: '프리셋 고치기' }).click()
    await expect.poll(() => (sent as { preset: { id: string } }).preset.id).toBe(firstId)
    sent = null
    await form.getByLabel('프리셋 이름').fill('네오에어 R 라지')
    await form.getByRole('button', { name: '새 프리셋으로 저장' }).click()
    await expect.poll(() => (sent as { preset: { id: string } } | null)?.preset.id ?? firstId).not.toBe(firstId)
    const lib = page.getByRole('complementary', { name: '라이브러리' })
    await expect(lib.getByText('네오에어 R', { exact: true })).toBeVisible()
    await expect(lib.getByText('네오에어 R 라지', { exact: true })).toBeVisible()
    await expect(lib.getByLabel('제조사')).toBeVisible()
  })
})

// ── 브라우저 저장(Plan 7, 2026-10-15) ──────────────────────────────

test.describe('브라우저 저장', () => {
  test('배치는 자동 저장돼 새로고침해도 그대로 열리고, 내 텐트는 고르기 화면에 남음', async ({ page }) => {
    const item = await createItem(page, MAT_ITEM)
    const layoutId = (await getDoc(page)).layout.id
    await page.getByRole('radio', { name: '텐트 편집', exact: true }).click()
    await page.getByRole('button', { name: '내 텐트로 저장' }).click()
    await page.waitForTimeout(1300) // 1초 뒤 저장
    await page.reload()
    await expect.poll(async () => (await getDoc(page)).layout.id).toBe(layoutId)
    expect((await getDoc(page)).layout.items.map((it) => it.id)).toEqual([item.id])
    await page.goto('/#/pick')
    const mine = page.locator('[data-section="mine"]')
    await expect(mine.getByRole('heading', { name: '내 텐트' })).toBeVisible()
    await expect(mine.getByRole('button', { name: /지우기$/ })).toHaveCount(1)
  })

  test('전체 백업 내려받기 → 파일 불러오기: 배치가 「(가져옴)」으로 하나 더', async ({ page }) => {
    await createItem(page, MAT_ITEM)
    const name = (await getDoc(page)).layout.name
    await page.getByRole('button', { name: '파일' }).click()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: '전체 백업(파일로 내려받기)' }).click()])
    expect(download.suggestedFilename()).toMatch(/^tentfit-backup-\d{8}\.json$/)
    const path = await download.path()
    await page.getByRole('button', { name: '파일' }).click()
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { name: '파일 불러오기' }).click()])
    await chooser.setFiles(path!)
    await expect(page.getByText(/불러왔어요: 배치 1개/)).toBeVisible()
    await page.goto('/#/pick')
    await page.getByRole('button', { name: /내 배치/ }).click()
    await expect(page.getByText(`${name} (가져옴)`)).toBeVisible()
  })
})

// ── 자석 맞춤·거리 재기(Plan 5, 2026-10-15) ─────────────────────────────

test.describe('자석 맞춤·거리 재기', () => {
  test('벽 가까이 끌어 놓으면 벽에 딱 붙고, Alt를 누른 채면 붙지 않음', async ({ page }) => {
    const item = await createItem(page, MAT_ITEM) // 200×60, 터널 외곽 오른쪽 벽 x = 310
    const { zoom } = (await getUi(page)).view
    const from = await worldToClient(page, item.x, item.y)
    // 오른쪽 변(item.x+100)이 벽에서 화면 4px 안쪽에 오도록
    const target = 310 - 100 - 4 / zoom
    await dragBetween(page, from, { x: from.x + (target - item.x) * zoom, y: from.y })
    await expect.poll(async () => (await itemById(page, item.id))!.x + 100).toBeCloseTo(310, 1)

    // Alt를 누른 채: 30px 떨어뜨렸다가 벽 4px 앞까지 → 붙지 않고 그 자리
    await page.keyboard.down('Alt')
    const at = await worldToClient(page, (await itemById(page, item.id))!.x, item.y)
    await dragBetween(page, at, { x: at.x - 30, y: at.y })
    const at2 = await worldToClient(page, (await itemById(page, item.id))!.x, item.y)
    await dragBetween(page, at2, { x: at2.x + 26, y: at2.y })
    await page.keyboard.up('Alt')
    await expect.poll(async () => (await itemById(page, item.id))!.x + 100).toBeLessThan(309.5)
  })

  test('[측정] → 매트·오른쪽 벽 → 거리, Esc로 끝내면 지워지고 문서는 그대로', async ({ page }) => {
    const item = await createItem(page, MAT_ITEM)
    const before = (await getDoc(page)).layout
    await page.getByRole('button', { name: '측정' }).click()
    await expect(page.getByTestId('measure-panel')).toBeVisible()
    const m = await worldToClient(page, item.x, item.y)
    await page.mouse.click(m.x, m.y)
    const wall = await worldToClient(page, 309, item.y)
    await page.mouse.click(wall.x, wall.y)
    const panel = page.getByTestId('measure-panel')
    await expect(panel.getByRole('heading', { name: '측정 1개' })).toBeVisible()
    await expect(panel.getByText(`${(310 - item.x - 100).toFixed(1)}cm`)).toBeVisible()
    await expect(panel.getByText(`${MAT_ITEM.name} → 외곽 변 2`)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('measure-panel')).toHaveCount(0)
    expect((await getDoc(page)).layout).toEqual(before)
  })
})

test('[파일 → PNG로 저장]: 미리보기(긴 변 2048px)와 내려받기 파일 이름(2026-10-15)', async ({ page }) => {
  await createItem(page, MAT_ITEM)
  const name = (await getDoc(page)).layout.name
  await page.getByRole('button', { name: '파일' }).click()
  await page.getByRole('menuitem', { name: 'PNG로 저장' }).click()
  const dialog = page.getByTestId('png-dialog')
  const img = dialog.getByRole('img', { name: '배치 그림 미리보기' })
  await expect(img).toBeVisible()
  await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(2048)
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('link', { name: '내려받기' }).click()])
  expect(download.suggestedFilename()).toMatch(new RegExp(`^tentfit-${name.replace(/\s+/g, '-')}-\\d{8}\\.png$`))
})
