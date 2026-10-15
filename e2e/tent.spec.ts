// PC(1440×900, 마우스) 텐트 흐름: 고르기·내 배치·만들기 화면(그리기 두 단계, Plan 4.1)·텐트 편집 모드·텐트 바꾸기·이너 없는 텐트.
// playwright.config.ts의 desktop 프로젝트가 editor.spec.ts와 함께 돌립니다.
import { expect, test, type Page } from '@playwright/test'
import type { Item, Pt } from '../src/core/model'
import { computeStats } from '../src/core/stats'
import { previewVertexDrag } from '../src/view/tentEdit'
import {
  createItem,
  dragBetween,
  getAppLayouts,
  getDoc,
  getUi,
  MAKER_HOOK,
  MAT_ITEM,
  nextFrames,
  openEditorWith,
  statRowPattern,
  waitMakerReady,
  waitReady,
  worldToClient,
} from './helpers'
import {
  DOME,
  LIVING_SHELL,
  TIPI,
  TUNNEL,
  browserBack,
  drawDoneButton,
  drawPoints,
  enterTentModeByUi,
  exitTentModeByUi,
  getTent,
  horizontalOverflowPx,
  innerNamed,
  makeCard,
  makerConfirm,
  makerField,
  makerNext,
  makerNextButton,
  makerPanel,
  makerStep,
  makerTools,
  mouseDragHolding,
  near,
  onMakerHistoryEntry,
  openPickScreen,
  openTentMaker,
  pickCard,
  pickExample,
  pickScreen,
  selectOuter,
  setPanelNumber,
  startMakerDrawing,
  swapDialog,
  tapWorld,
  tentEditStatus,
  tentEditor,
  tentMaker,
  toast,
  vertexClient,
  vertexWorld,
} from './tentFlows'

const areaSummary = (page: Page) => page.getByRole('region', { name: '면적 현황' })

/** 매트(200×60)를 새 도형으로 만들어 놓고, 추가된 물건을 돌려줍니다. */
async function addMat(page: Page): Promise<Item> {
  return createItem(page, MAT_ITEM)
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

/** 만들기 화면 문서의 외곽 */
async function makerOuter(page: Page) {
  return (await getDoc(page, MAKER_HOOK)).layout.tent.outer
}

test.describe('텐트 만들기 화면(그리기 두 단계, Plan 4.1)', () => {
  test('점 4개로 외곽 → 변 620·620으로 정확한 620×320 → 사각형으로 → [다음] → 예시 이너 → 뒤 벽 → [이 텐트로 시작] → 편집기 → 물건 벽 밖 경고', async ({
    page,
  }) => {
    await openPickScreen(page)
    await openTentMaker(page)
    await waitMakerReady(page)
    expect(await makerStep(page)).toBe('1')
    // 처음에는 외곽이 없어 [다음]이 꺼져 있고, 단계 버튼·도구 줄·패널이 화면 안에 보입니다(4개 크기 규칙).
    await expect(makerNextButton(page)).toBeDisabled()
    await expect(makerNextButton(page)).toBeInViewport({ ratio: 1 })
    await expect(tentMaker(page).getByRole('button', { name: '취소', exact: true })).toBeInViewport({ ratio: 1 })
    await expect(makerTools(page)).toBeInViewport({ ratio: 1 })
    await expect(makerField(page, '텐트 이름')).toBeInViewport({ ratio: 1 })

    // 자유 그리기: 탭 = 점(첫 점 10cm 격자, 다음 점 15°·10cm), 마우스 hover 고무줄 + 길이 배지
    await startMakerDrawing(page)
    await expect(page.getByRole('toolbar', { name: '그리기' })).toBeVisible()
    const pts: Pt[] = [
      [-300, -150],
      [300, -150],
      [300, 170],
      [-290, 170],
    ]
    await drawPoints(page, pts.slice(0, 3), MAKER_HOOK)
    const hover = await worldToClient(page, -290, 170, MAKER_HOOK)
    await page.mouse.move(hover.x, hover.y)
    await expect(page.getByTestId('draw-length-badge')).toHaveText('590 cm')
    await tapWorld(page, pts[3]!, MAKER_HOOK)
    expect((await getUi(page, MAKER_HOOK)).drawing?.points).toEqual(pts)
    expect((await getDoc(page, MAKER_HOOK)).canUndo).toBe(false) // 그리는 점은 기록 밖
    // 첫 점을 다시 누르면 닫힘 → 첫 외곽은 bbox 가운데가 월드 원점
    await tapWorld(page, pts[0]!, MAKER_HOOK)
    await expect.poll(async () => (await getUi(page, MAKER_HOOK)).drawing).toBeNull()
    expect(await makerOuter(page)).toEqual({ kind: 'polygon', points: [[-300, -160], [300, -160], [300, 160], [-290, 160]] })
    await expect(makerNextButton(page)).toBeEnabled()

    // cm로 정확히(비율 유지 끔, 변 길이 표): 변 1 = 620, 변 3 = 620(변 2 = 320 그대로) → 닫는 변이 흡수해 정확한 620×320
    await makerPanel(page).getByRole('switch', { name: '비율 유지' }).uncheck()
    await makerPanel(page).getByRole('button', { name: '변 길이 표' }).click()
    await expect(makerPanel(page).getByLabel('변 3', { exact: true })).toHaveValue('590')
    await setPanelNumber(makerPanel(page), '변 1', 620)
    await setPanelNumber(makerPanel(page), '변 3', 620)
    await expect.poll(() => makerOuter(page)).toEqual({ kind: 'polygon', points: [[-300, -160], [320, -160], [320, 160], [-300, 160]] })
    await expect(makerPanel(page).getByLabel('변 4', { exact: true })).toHaveValue('320')

    // 벽에 붙이기는 외곽 템플릿이 사각형·사다리꼴일 때(설계 §2.4) → 모양 바꾸기로 사각형(bbox 620×320 이어받음)
    await makerPanel(page).getByRole('button', { name: '모양 바꾸기', exact: true }).click()
    await makerPanel(page).getByRole('menuitem', { name: '사각형', exact: true }).click()
    await expect.poll(() => makerOuter(page)).toEqual({ kind: 'rect', w: 620, h: 320 })

    await makerNext(page)
    await pickExample(page, '사각형')
    await expect.poll(async () => (await getDoc(page, MAKER_HOOK)).layout.tent.inners.length).toBe(1)
    await makerPanel(page).getByRole('group', { name: '벽에 붙이기' }).getByRole('button', { name: '뒤', exact: true }).click()
    await expect
      .poll(async () => (await getDoc(page, MAKER_HOOK)).layout.tent.inners[0])
      .toMatchObject({ x: 0, y: -65, rotation: 0, shape: { kind: 'rect', w: 190, h: 190 } })
    expect(await getAppLayouts(page)).toHaveLength(0) // 만들기 화면은 보관소 밖

    await makerConfirm(page).click()
    await waitReady(page)
    await expect(tentMaker(page)).toHaveCount(0)
    const doc = await getDoc(page)
    expect(doc.layout.name).toBe('내 텐트 배치')
    expect(doc.layout.sourcePresetId).toBeUndefined()
    expect(doc.canUndo).toBe(false) // 새 배치는 빈 기록
    expect(doc.layout.tent.outer).toEqual({ kind: 'rect', w: 620, h: 320 })
    expect(doc.layout.tent.inners).toHaveLength(1)
    expect(doc.layout.tent.inners[0]).toMatchObject({ x: 0, y: -65, rotation: 0, shape: { kind: 'rect', w: 190, h: 190 } })
    expect((await getUi(page)).mode).toBe('place')
    expect(await getAppLayouts(page)).toHaveLength(1)
    expect(await onMakerHistoryEntry(page)).toBe(false)

    // 물건 추가 → 오른쪽 벽(x = 310)에 걸치게 끌기 → 텐트 밖으로 나감 경고(§13.4)
    const item = await addMat(page)
    expect(computeStats((await getDoc(page)).layout).warnings[item.id]?.outside ?? false).toBe(false)
    const from = await worldToClient(page, item.x, item.y)
    const to = await worldToClient(page, 310, 100)
    await dragBetween(page, from, to)
    await expect
      .poll(async () => computeStats((await getDoc(page)).layout).warnings[item.id]?.outside ?? false)
      .toBe(true)
    const stats = computeStats((await getDoc(page)).layout)
    expect(stats.warnings[item.id]?.straddles).toEqual([]) // 이너(y −160~30, x −95~95)와는 떨어져 있음
    await areaSummary(page).getByRole('button', { name: `경고 ${stats.warningCount}건 보기` }).click()
    await expect(page.getByRole('region', { name: '경고 목록' }).getByText('텐트 밖으로 나감')).toBeVisible()

    // 편집기에서 뒤로 가기 한 번이면 고르기 화면 항목입니다(만들기 화면 항목이 남아 있으면 헛돎).
    await browserBack(page)
    await expect(page).toHaveURL(/#\/pick$/)
    await expect(pickScreen(page)).toBeVisible()
    await expect(tentMaker(page)).toHaveCount(0)
    expect(await onMakerHistoryEntry(page)).toBe(false)
  })

  test('업체 도면대로: 외곽 [육각형] 가로 260·세로 225·윗·아랫변 130 → [다음] → 이너 [사다리꼴] 윗변 123·아랫변 243·세로 103 → 뒤 벽 → 이탈 없음 → 시작', async ({
    page,
  }) => {
    await openPickScreen(page)
    await openTentMaker(page)
    await pickExample(page, '육각형')
    // 도면 숫자를 하나씩 넣으므로 비율 유지를 끕니다(켜 두면 가로를 바꿀 때 세로·윗변도 같이 바뀜).
    await makerPanel(page).getByRole('switch', { name: '비율 유지' }).uncheck()
    await setPanelNumber(makerPanel(page), '가로', 260)
    await setPanelNumber(makerPanel(page), '세로', 225)
    await setPanelNumber(makerPanel(page), '윗·아랫변', 130)
    await expect
      .poll(() => makerOuter(page))
      .toEqual({ kind: 'polygon', points: [[-65, -112.5], [65, -112.5], [130, 0], [65, 112.5], [-65, 112.5], [-130, 0]] })

    await makerNext(page)
    await pickExample(page, '사다리꼴')
    await setPanelNumber(makerPanel(page), '윗변(뒤)', 123)
    await setPanelNumber(makerPanel(page), '아랫변(앞)', 243)
    await setPanelNumber(makerPanel(page), '세로', 103)
    await makerPanel(page).getByRole('group', { name: '벽에 붙이기' }).getByRole('button', { name: '뒤', exact: true }).click()
    await expect.poll(async () => (await getDoc(page, MAKER_HOOK)).layout.tent.inners[0]).toMatchObject({ x: 0, y: -61, rotation: 0 })
    const made = (await getDoc(page, MAKER_HOOK)).layout
    expect(made.tent.inners[0]?.template).toEqual({ kind: 'trapezoid', front: 243, back: 123, depth: 103, offset: 0 })
    expect(computeStats(made).innerEscapes).toEqual([]) // 도면처럼 육각형 위쪽 절반 안에 들어감

    await makerConfirm(page).click()
    await waitReady(page)
    const tent = (await getDoc(page)).layout.tent
    expect(tent.outerTemplate).toEqual({ kind: 'hexagon', w: 260, h: 225, edge: 130 })
    expect(tent.inners[0]).toMatchObject({ x: 0, y: -61 })
  })

  test('[취소]·‹(단계 ①)·브라우저 뒤로 가기(단계 ②에서도)는 배치를 만들지 않고 항목을 남기지 않는다. 단계 ②의 ‹는 단계 ①로', async ({
    page,
  }) => {
    await openPickScreen(page)

    await openTentMaker(page)
    await pickExample(page, '사각형')
    await tentMaker(page).getByRole('button', { name: '취소', exact: true }).click()
    await expect(tentMaker(page)).toHaveCount(0)
    await expect(page).toHaveURL(/#\/pick$/)
    expect(await onMakerHistoryEntry(page)).toBe(false)
    expect(await getAppLayouts(page)).toHaveLength(0)

    await openTentMaker(page)
    await pickExample(page, '원')
    await makerNext(page)
    await pickExample(page, '사각형')
    await tentMaker(page).getByRole('button', { name: '외곽으로', exact: true }).click()
    expect(await makerStep(page)).toBe('1')
    expect((await getDoc(page, MAKER_HOOK)).layout.tent.inners).toHaveLength(1) // 이너 유지
    expect(await onMakerHistoryEntry(page)).toBe(true) // 단계 이동은 history를 건드리지 않음
    await tentMaker(page).getByRole('button', { name: '뒤로', exact: true }).click()
    await expect(tentMaker(page)).toHaveCount(0)
    expect(await onMakerHistoryEntry(page)).toBe(false)
    expect(await getAppLayouts(page)).toHaveLength(0)

    await openTentMaker(page)
    await pickExample(page, '사다리꼴')
    await makerNext(page)
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

test.describe('텐트 편집 모드 — 자유 그리기·모양 바꾸기(Plan 4.1)', () => {
  test.beforeEach(async ({ page }) => {
    await openEditorWith(page)
    await enterTentModeByUi(page)
    await expect(tentEditor(page)).toBeVisible()
  })

  test('[+ 이너 ▾] → 자유 그리기: 그리는 중 끌기는 화면 이동(점 없음)·실행 취소 꺼짐, 점 4개 + [그리기 완료] = 새 이너 1칸, 원으로 바꾸기 1칸, Ctrl+Z 두 번이면 원래', async ({
    page,
  }) => {
    const original = await getTent(page)
    await tentEditor(page).getByRole('button', { name: '+ 이너', exact: true }).click()
    await tentEditor(page).getByRole('menuitem', { name: '자유 그리기', exact: true }).click()
    expect((await getUi(page)).drawing).toEqual({ goal: 'newInner', points: [] })
    const bar = page.getByRole('toolbar', { name: '그리기' })
    await expect(bar).toBeVisible()
    await expect(page.getByTestId('top-bar').getByRole('button', { name: '실행 취소' })).toBeDisabled()
    // 최종 리뷰: 막대 버튼 글자가 쪼개지지 않고 안내가 잘리지 않으며, 모드 칩과 겹치지 않음(그리는 중 숨김)
    for (const name of ['점 되돌리기', '그리기 완료', '그리기 취소']) {
      expect(await bar.getByRole('button', { name, exact: true }).locator('span').evaluate((el) => el.getClientRects().length)).toBe(1)
    }
    expect(await bar.locator('.tf-drawbar__hint').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    await expect(page.getByText('텐트 편집 · 물건은 잠겨 있어요')).toHaveCount(0)

    // 끌기 = 화면 이동, 점은 찍히지 않음
    const pan0 = (await getUi(page)).view.panX
    const a = await worldToClient(page, 150, 100)
    await dragBetween(page, a, { x: a.x + 80, y: a.y + 40 })
    expect((await getUi(page)).drawing?.points).toEqual([])
    expect((await getUi(page)).view.panX).not.toBe(pan0)

    const pts: Pt[] = [
      [100, -100],
      [250, -100],
      [250, 100],
      [100, 100],
    ]
    await drawPoints(page, pts)
    expect((await getUi(page)).drawing?.points).toEqual(pts)
    await drawDoneButton(page).click()
    await expect.poll(async () => (await getTent(page)).inners.length).toBe(2)
    const added = (await getTent(page)).inners[1]!
    expect(added).toMatchObject({ x: 175, y: 0, rotation: 0, shape: { kind: 'polygon', points: [[-75, -100], [75, -100], [75, 100], [-75, 100]] } })
    expect((await getUi(page)).tentTarget).toEqual({ innerId: added.id })
    await expect(page.getByRole('toolbar', { name: '그리기' })).toHaveCount(0)

    // 모양 바꾸기 → 원(지름 = 짧은 변 150, 가운데 그대로)
    await tentEditor(page).getByRole('button', { name: '모양 바꾸기', exact: true }).click()
    await tentEditor(page).getByRole('menuitem', { name: '원', exact: true }).click()
    await expect.poll(async () => (await getTent(page)).inners[1]?.shape).toEqual({ kind: 'circle', d: 150 })
    expect((await getTent(page)).inners[1]).toMatchObject({ x: 175, y: 0 })

    await page.keyboard.press('ControlOrMeta+z')
    await expect.poll(async () => (await getTent(page)).inners[1]?.shape.kind).toBe('polygon')
    await page.keyboard.press('ControlOrMeta+z')
    await expect.poll(async () => (await getTent(page)).inners.length).toBe(1)
    expect(await getTent(page)).toEqual(original)
    expect((await getDoc(page)).canUndo).toBe(false)
  })

  test('그리는 중 Ctrl+Z는 점 하나만, Esc는 그리기 취소(문서 그대로)', async ({ page }) => {
    await tentEditor(page).getByRole('button', { name: '+ 이너', exact: true }).click()
    await tentEditor(page).getByRole('menuitem', { name: '자유 그리기', exact: true }).click()
    await drawPoints(page, [
      [100, -100],
      [250, -100],
    ])
    await page.keyboard.press('ControlOrMeta+z')
    expect((await getUi(page)).drawing?.points).toEqual([[100, -100]])
    await page.keyboard.press('Escape')
    await expect.poll(async () => (await getUi(page)).drawing).toBeNull()
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

  test('[텐트 바꾸기] → [직접 만들기]에서 외곽을 그려 [이 텐트로 바꾸기]도 기록 1칸, 편집기 문서·훅은 그대로, 만들기 화면 항목은 남지 않는다', async ({
    page,
  }) => {
    await openEditorWith(page)
    const original = await getTent(page)
    const editUrl = page.url()
    await enterTentModeByUi(page)
    await tentEditor(page).getByRole('button', { name: '텐트 바꾸기', exact: true }).click()
    await swapDialog(page).getByTestId('make-tent-card').click()
    await expect(swapDialog(page)).toHaveCount(0)
    await expect(tentMaker(page)).toBeVisible()
    await waitMakerReady(page)

    // 편집기 캔버스가 뒤에 있어도 만들기 화면 캔버스에 그려집니다(캔버스 두 개, 훅 두 개).
    await startMakerDrawing(page)
    await drawPoints(
      page,
      [
        [-250, -150],
        [250, -150],
        [250, 150],
      ],
      MAKER_HOOK,
    )
    await tentMaker(page).getByRole('toolbar', { name: '그리기' }).getByRole('button', { name: '그리기 완료' }).click()
    await expect.poll(async () => (await getDoc(page, MAKER_HOOK)).layout.tent.outer.kind).toBe('polygon')
    expect(await getTent(page)).toEqual(original) // 편집기 문서는 그대로
    await makerNext(page)
    await expect(makerConfirm(page, '이 텐트로 바꾸기')).toBeInViewport({ ratio: 1 })

    await makerConfirm(page, '이 텐트로 바꾸기').click()
    await expect(tentMaker(page)).toHaveCount(0)
    await expect.poll(async () => (await getTent(page)).name).toBe('내 텐트')
    expect((await getTent(page)).outer).toEqual({ kind: 'polygon', points: [[-250, -150], [250, -150], [250, 150]] })
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

test('화면 크기: 고르기 화면 가로 스크롤 없음, 만들기 화면 단계 버튼·도구 줄·패널·주 버튼이 보인다(1440×900)', async ({ page }) => {
  await openPickScreen(page)
  expect(await horizontalOverflowPx(pickScreen(page))).toBeLessThanOrEqual(0)
  await expect(pickScreen(page)).toHaveAttribute('data-layout', 'desktop')
  await openTentMaker(page)
  await expect(tentMaker(page)).toHaveAttribute('data-layout', 'desktop')
  await expect(tentMaker(page).getByRole('list', { name: '단계' })).toBeInViewport({ ratio: 1 })
  await expect(makerTools(page)).toBeInViewport({ ratio: 1 })
  await expect(makerPanel(page)).toBeInViewport()
  await expect(makerNextButton(page)).toBeInViewport({ ratio: 1 })
  expect(await horizontalOverflowPx(tentMaker(page))).toBeLessThanOrEqual(0)
  await pickExample(page, '정N각형')
  await makerNext(page)
  await expect(makerConfirm(page)).toBeInViewport({ ratio: 1 })
  expect(await horizontalOverflowPx(tentMaker(page))).toBeLessThanOrEqual(0)
})

function xy(p: { x: number; y: number }): [number, number] {
  return [p.x, p.y]
}

test.describe('상하좌우로만 이동(Shift, 소유자 요청)', () => {
  test('Shift를 누른 채 비스듬히 끌면 물건은 가로로만, 이너는 세로로만 움직이고(각 1칸), 그리기 점은 0·90°로 맞춘다', async ({ page }) => {
    await openEditorWith(page)
    const item = await addMat(page)
    const from = await worldToClient(page, item.x, item.y)
    await page.keyboard.down('Shift')
    await dragBetween(page, from, { x: from.x + 80, y: from.y + 25 })
    await page.keyboard.up('Shift')
    await expect.poll(async () => (await getDoc(page)).layout.items.find((i) => i.id === item.id)?.x).not.toBe(item.x)
    const moved = (await getDoc(page)).layout.items.find((i) => i.id === item.id)!
    expect(moved.y).toBe(item.y)
    expect(moved.x).toBeGreaterThan(item.x)

    await enterTentModeByUi(page)
    const inner = await innerNamed(page, '이너 1')
    const at = await worldToClient(page, inner.x, inner.y)
    await page.keyboard.down('Shift')
    await dragBetween(page, at, { x: at.x + 12, y: at.y + 50 })
    await page.keyboard.up('Shift')
    await expect.poll(async () => (await innerNamed(page, '이너 1')).y).not.toBe(inner.y)
    expect((await innerNamed(page, '이너 1')).x).toBe(inner.x)

    await tentEditor(page).getByRole('button', { name: '+ 이너', exact: true }).click()
    await tentEditor(page).getByRole('menuitem', { name: '자유 그리기', exact: true }).click()
    await drawPoints(page, [[100, -100]])
    const p2 = await worldToClient(page, 200, -70)
    await page.keyboard.down('Shift')
    await page.mouse.click(p2.x, p2.y)
    await page.keyboard.up('Shift')
    await nextFrames(page)
    expect((await getUi(page)).drawing?.points).toEqual([
      [100, -100],
      [200, -100],
    ])
  })
})

test('로컬 [텐트 프리셋으로 저장]: 제조사·모델·파일 이름으로 보내고 텐트 고르기 「브랜드」에 바로 보임(2026-10-15)', async ({ page }) => {
  let sent: { slug: string; entry: { id: string; brand: string; model: string } } | null = null
  await page.route('**/__tentfit/tent-presets', async (route) => {
    sent = route.request().postDataJSON()
    await route.fulfill({ json: { ok: true, file: 'presets/tents/snow-peak.json' } })
  })
  await openEditorWith(page)
  await enterTentModeByUi(page)
  const form = page.getByTestId('save-tent-preset')
  await form.getByLabel('제조사').fill('Snow Peak')
  await form.getByLabel('모델명').fill('Land Lock')
  await form.getByRole('button', { name: '텐트 프리셋으로 저장' }).click()
  await expect.poll(() => sent?.entry.id).toBe('snow-peak/land-lock')
  expect(sent!.slug).toBe('snow-peak')
  await expect(page.getByText(/텐트 프리셋에 넣었어요/)).toBeVisible()
  // 새로 고치지 않고(메모리 목록) 고르기 화면으로
  await page.evaluate(() => {
    window.location.hash = '#/pick'
  })
  await expect(page.locator('[data-section="brand"]').getByText('Snow Peak')).toBeVisible()
})
