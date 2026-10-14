// 휴대폰(390×844, 터치) 텐트 흐름. playwright.config.ts의 mobile 프로젝트가 mobile.spec.ts와 함께 돌립니다.
// 캔버스 터치는 CDP(helpers.ts의 Fingers)로, 버튼은 locator.tap()으로 누릅니다.
import { expect, test, type Page } from '@playwright/test'
import type { Pt } from '../src/core/model'
import {
  Fingers,
  fitView,
  getAppLayouts,
  getDoc,
  getUi,
  isCanvasAt,
  MAKER_HOOK,
  nextFrames,
  openEditorWith,
  pickOpenPoint,
  touchDrag,
  touchSecondFinger,
  waitMakerReady,
  waitReady,
  worldToClient,
  type ClientPt,
} from './helpers'
import {
  MIN_CANVAS_ABOVE_SHEET_PX,
  DOME,
  TIPI,
  browserBack,
  drawDoneButton,
  drawPoints,
  enterTentModeByUi,
  exitTentModeByUi,
  getTent,
  horizontalOverflowPx,
  innerNamed,
  makerConfirm,
  makerNext,
  makerNextButton,
  makerPanel,
  makerSheet,
  makerTools,
  onMakerHistoryEntry,
  openPickScreen,
  openTentMaker,
  pickExample,
  pickScreen,
  selectOuter,
  startMakerDrawing,
  tapCanvas,
  tentMaker,
  tentSheet,
  toast,
  toolbar,
  vertexClient,
} from './tentFlows'

/** 휴대폰 툴바 [+이너 ▾] → 메뉴 항목 */
async function toolbarInner(page: Page, item: '사각형' | '사다리꼴' | '정N각형' | '원' | '자유 그리기'): Promise<void> {
  await toolbar(page).getByRole('button', { name: '+이너', exact: true }).tap()
  await toolbar(page).getByRole('menuitem', { name: item, exact: true }).tap()
  await nextFrames(page)
}

/** 텐트 시트가 열리고 셸이 시트 높이를 insets.bottom에 넣은 뒤, 시트 위 영역에 맞춤 보기를 합니다. */
async function frameAboveTentSheet(page: Page): Promise<void> {
  await expect(tentSheet(page)).toBeVisible()
  await expect.poll(async () => (await getUi(page)).insets.bottom).toBeGreaterThan(0)
  await fitView(page)
}

test.describe('고르기·만들기 화면(390×844)', () => {
  test('만들기 화면: ‹·단계·도구 줄·시트·[다음]이 보이고, 탭 = 점(끌기·두 손가락은 화면만), 변 길이 칸에 포커스해도 그 칸과 [다음]이 보인다', async ({
    page,
  }) => {
    await openPickScreen(page)
    await expect(pickScreen(page)).toHaveAttribute('data-layout', 'mobile')
    expect(await horizontalOverflowPx(pickScreen(page))).toBeLessThanOrEqual(0)

    await openTentMaker(page)
    await waitMakerReady(page)
    await expect(tentMaker(page)).toHaveAttribute('data-layout', 'mobile')
    // 휴대폰은 [취소] 없이 ‹와 주 버튼. 도구 줄은 가로 스크롤(설계 §1.2)이라 그 안은 보지 않습니다.
    await expect(tentMaker(page).getByRole('button', { name: '뒤로', exact: true })).toBeInViewport({ ratio: 1 })
    await expect(makerNextButton(page)).toBeInViewport({ ratio: 1 })
    await expect(tentMaker(page).getByRole('button', { name: '취소', exact: true })).toHaveCount(0)
    await expect(makerTools(page)).toBeInViewport()
    // 최종 리뷰: 도구 다섯 개가 스크롤 없이 모두 보임([자유 그리기] 포함)
    for (const name of ['사각형', '사다리꼴', '육각형', '정N각형', '원', '자유 그리기']) {
      await expect(makerTools(page).getByRole('button', { name, exact: true })).toBeInViewport({ ratio: 1 })
    }
    await expect(makerSheet(page)).toBeVisible()
    expect(await horizontalOverflowPx(tentMaker(page), '.tf-maker__tools')).toBeLessThanOrEqual(0)

    await startMakerDrawing(page)
    await expect(makerSheet(page)).toHaveCount(0) // 그리는 중에는 시트를 숨김
    const pts: Pt[] = [
      [-150, -100],
      [150, -100],
      [150, 100],
    ]
    await drawPoints(page, pts.slice(0, 2), MAKER_HOOK)

    // 한 손가락 끌기 = 화면 이동, 점 없음
    const view0 = (await getUi(page, MAKER_HOOK)).view
    const a = await worldToClient(page, 0, 0, MAKER_HOOK)
    await touchDrag(page, a, { x: a.x + 40, y: a.y + 30 }, 10)
    await nextFrames(page)
    expect((await getUi(page, MAKER_HOOK)).drawing?.points).toEqual(pts.slice(0, 2))
    expect((await getUi(page, MAKER_HOOK)).view).not.toEqual(view0)

    // 두 손가락 = 확대, 점 없음
    const zoom0 = (await getUi(page, MAKER_HOOK)).view.zoom
    const c = await worldToClient(page, 0, 0, MAKER_HOOK)
    const fingers = await Fingers.open(page)
    try {
      await fingers.down(1, { x: c.x - 40, y: c.y })
      await fingers.down(2, { x: c.x + 40, y: c.y })
      await fingers.move({ 1: { x: c.x - 80, y: c.y }, 2: { x: c.x + 80, y: c.y } }, 8)
      await fingers.up(2)
      await fingers.up(1)
    } finally {
      await fingers.detach()
    }
    await nextFrames(page)
    expect((await getUi(page, MAKER_HOOK)).view.zoom).toBeGreaterThan(zoom0)
    expect((await getUi(page, MAKER_HOOK)).drawing?.points).toEqual(pts.slice(0, 2))

    // 확대로 다음 점이 화면 밖에 있을 수 있어 맞춤 보기로 되돌린 뒤 찍습니다(보기는 기록 밖).
    await fitView(page, MAKER_HOOK)
    await drawPoints(page, pts.slice(2), MAKER_HOOK)
    await drawDoneButton(page).tap()
    await expect.poll(async () => (await getDoc(page, MAKER_HOOK)).layout.tent.outer.kind).toBe('polygon')
    await expect(makerSheet(page)).toBeVisible()

    await makerPanel(page).getByRole('button', { name: '변 길이 표' }).tap()
    const edge = makerPanel(page).getByLabel('변 1', { exact: true })
    await edge.tap()
    await expect(edge).toBeFocused()
    await expect(edge).toBeInViewport({ ratio: 1 })
    await expect(makerNextButton(page)).toBeInViewport({ ratio: 1 })
  })

  test('‹는 배치를 만들지 않고, 예시 → [다음] → [✓ 시작]은 새 배치를 연 뒤 뒤로 가기 한 번에 고르기 화면', async ({ page }) => {
    await openPickScreen(page)
    await openTentMaker(page)
    await tentMaker(page).getByRole('button', { name: '뒤로', exact: true }).tap()
    await expect(tentMaker(page)).toHaveCount(0)
    expect(await onMakerHistoryEntry(page)).toBe(false)
    expect(await getAppLayouts(page)).toHaveLength(0)

    await openTentMaker(page)
    await pickExample(page, '사각형')
    await makerNext(page)
    await expect(makerConfirm(page)).toHaveText('✓ 시작')
    await makerConfirm(page).tap()
    await waitReady(page)
    const doc = await getDoc(page)
    expect(doc.layout.name).toBe('내 텐트 배치')
    expect(doc.layout.tent.outer).toEqual({ kind: 'rect', w: 400, h: 300 })
    expect(doc.canUndo).toBe(false)
    expect((await getUi(page)).mode).toBe('place')
    expect(await getAppLayouts(page)).toHaveLength(1)

    await browserBack(page)
    await expect(page).toHaveURL(/#\/pick$/)
    await expect(pickScreen(page)).toBeVisible()
    await expect(tentMaker(page)).toHaveCount(0)
    expect(await onMakerHistoryEntry(page)).toBe(false) // 만들기 화면 항목에 멈춰 헛돌지 않음
  })
})

test.describe('텐트 편집 모드(터치)', () => {
  test.beforeEach(async ({ page }) => {
    await openEditorWith(page)
    await enterTentModeByUi(page)
  })

  test('툴바는 [+이너 ▾] [완료]뿐이고, 대상을 고르면 텐트 시트(× 「선택 해제」)가 열린다. [완료]로 배치 모드', async ({ page }) => {
    await expect(toolbar(page)).toHaveAttribute('data-mode', 'tent')
    await expect(toolbar(page).getByRole('button')).toHaveText(['이너', '완료'])
    await expect(toolbar(page).getByRole('button', { name: '+이너', exact: true })).toBeVisible()

    await selectOuter(page)
    await expect(tentSheet(page)).toBeVisible()
    expect((await getUi(page)).mobileSheet).toBe('tent')
    await tentSheet(page).getByRole('button', { name: '선택 해제', exact: true }).tap()
    await expect(tentSheet(page)).toHaveCount(0)
    const cleared = await getUi(page)
    expect(cleared.tentTarget).toBeNull()
    expect(cleared.mode).toBe('tent')

    await toolbarInner(page, '사각형')
    await expect.poll(async () => (await getTent(page)).inners.length).toBe(2)
    const added = (await getTent(page)).inners[1]!
    expect((await getUi(page)).tentTarget).toEqual({ innerId: added.id })
    await expect(tentSheet(page)).toBeVisible()

    await exitTentModeByUi(page)
    await expect(tentSheet(page)).toHaveCount(0)
    await expect(toolbar(page).getByRole('button', { name: '+물건', exact: true })).toBeVisible()
  })

  test('툴바 [+이너 ▾] → 자유 그리기: 툴바가 [점 되돌리기][완료][그리기 취소]로 바뀌고 시트가 닫히며, 탭 4번 + [완료] = 새 이너(1칸)', async ({
    page,
  }) => {
    await toolbarInner(page, '자유 그리기')
    await expect(toolbar(page).getByRole('button')).toHaveText(['점 되돌리기', '완료', '그리기 취소'])
    await expect(tentSheet(page)).toHaveCount(0)
    const pts: Pt[] = [
      [100, -100],
      [250, -100],
      [250, 100],
      [100, 100],
    ]
    await drawPoints(page, pts)
    expect((await getUi(page)).drawing?.points).toEqual(pts)
    expect((await getDoc(page)).canUndo).toBe(false)
    // Review Focus 1: 누르는 중 터치가 취소되면 점이 생기지 않고 찍은 점은 남음
    const cancelAt = await worldToClient(page, 180, 0)
    const fingers = await Fingers.open(page)
    try {
      await fingers.down(1, cancelAt)
      await fingers.cancel()
    } finally {
      await fingers.detach()
    }
    await nextFrames(page)
    expect((await getUi(page)).drawing?.points).toEqual(pts)
    await toolbar(page).getByRole('button', { name: '점 되돌리기', exact: true }).tap()
    expect((await getUi(page)).drawing?.points).toEqual(pts.slice(0, 3))
    await drawPoints(page, pts.slice(3))
    await drawDoneButton(page).tap()
    await expect.poll(async () => (await getTent(page)).inners.length).toBe(2)
    const added = (await getTent(page)).inners[1]!
    expect(added).toMatchObject({ x: 175, y: 0 })
    await expect(tentSheet(page)).toBeVisible()
    await expect(toolbar(page).getByRole('button')).toHaveText(['이너', '완료'])
    expect((await getDoc(page)).canUndo).toBe(true)
  })

  test('Review Focus 1: 꼭짓점을 끄는 중 두 번째 손가락이 닿으면 시작 위치로 되돌리고 기록을 남기지 않는다', async ({ page }) => {
    const original = await getTent(page)
    await selectOuter(page)
    await frameAboveTentSheet(page)
    const first = await vertexClient(page, 'outer', 1) // 오른쪽 위 꼭짓점
    expect(await isCanvasAt(page, first)).toBe(true)
    const second = await pickOpenPoint(page, { avoid: [first], minDist: 120 })
    let draggingTent = original

    await touchSecondFinger(page, {
      first,
      dragBy: { x: -30, y: 40 },
      second,
      spreadBy: 80,
      thenPanBy: { x: -20, y: 10 },
      whileDragging: async () => {
        // 끌기가 실제로 시작됐는지 먼저 확인합니다(아니면 이 시험은 아무것도 확인하지 못함).
        await expect.poll(async () => (await getDoc(page)).inGesture).toBe(true)
        draggingTent = await getTent(page)
      },
      afterSecondDown: async () => {
        await expect.poll(async () => (await getDoc(page)).inGesture).toBe(false)
        expect(await getTent(page)).toEqual(original)
      },
    })
    await nextFrames(page)

    expect(draggingTent).toEqual(original) // 끄는 동안에도 문서는 그대로(미리보기는 문서 밖)
    const doc = await getDoc(page)
    expect(doc.layout.tent).toEqual(original)
    expect(doc.canUndo).toBe(false)
    expect(doc.inGesture).toBe(false)
    const ui = await getUi(page)
    expect(ui.tentTarget).toBe('outer')
    expect(ui.vertexIndex).toBeNull() // 누를 때 고른 꼭짓점도 누르기 전으로
  })

  test('꼭짓점을 끄는 중 터치가 취소되면 시작 위치로 되돌리고 기록을 남기지 않는다', async ({ page }) => {
    const original = await getTent(page)
    await selectOuter(page)
    await frameAboveTentSheet(page)
    const from = await vertexClient(page, 'outer', 1)
    const fingers = await Fingers.open(page)
    try {
      await fingers.down(1, from)
      await fingers.move({ 1: { x: from.x - 30, y: from.y + 40 } }, 8)
      expect((await getDoc(page)).inGesture).toBe(true)
      await fingers.cancel()
    } finally {
      await fingers.detach()
    }
    await nextFrames(page)
    const doc = await getDoc(page)
    expect(doc.layout.tent).toEqual(original)
    expect(doc.canUndo).toBe(false)
    expect(doc.inGesture).toBe(false)
  })

  test('Review Focus 1: 선택 안 된 이너 위에서 핀치를 시작해도 편집 대상이 바뀌지 않는다', async ({ page }) => {
    const original = await getTent(page)
    await selectOuter(page)
    await frameAboveTentSheet(page)
    const inner = await innerNamed(page, '이너 1')
    const onInner = await worldToClient(page, inner.x, inner.y)
    expect(await isCanvasAt(page, onInner)).toBe(true)
    const other = await pickOpenPoint(page, { avoid: [onInner], minDist: 140 })
    const zoomBefore = (await getUi(page)).view.zoom

    const fingers = await Fingers.open(page)
    try {
      await fingers.down(1, onInner)
      await fingers.down(2, other)
      const dx = other.x - onInner.x
      const dy = other.y - onInner.y
      const len = Math.hypot(dx, dy)
      const ux = (dx / len) * 40
      const uy = (dy / len) * 40
      await fingers.move({ 1: { x: onInner.x - ux, y: onInner.y - uy }, 2: { x: other.x + ux, y: other.y + uy } }, 8)
      await fingers.up(2)
      await fingers.up(1)
    } finally {
      await fingers.detach()
    }
    await nextFrames(page)

    expect((await getUi(page)).view.zoom).toBeGreaterThan(zoomBefore) // 핀치는 확대로 처리됨
    const ui = await getUi(page)
    expect(ui.tentTarget).toBe('outer')
    expect(ui.vertexIndex).toBeNull()
    const doc = await getDoc(page)
    expect(doc.layout.tent).toEqual(original)
    expect(doc.canUndo).toBe(false)
  })

  test('작업 간 상호작용: 선택 안 된 이너를 눌러 바로 끌면 텐트 시트가 열려도 끈 만큼만 움직인다', async ({ page }) => {
    expect((await getUi(page)).tentTarget).toBeNull()
    const inner = await innerNamed(page, '이너 1')
    const { zoom } = (await getUi(page)).view
    const from: ClientPt = await worldToClient(page, inner.x, inner.y)
    expect(await isCanvasAt(page, from)).toBe(true)

    await touchDrag(page, from, { x: from.x + 40, y: from.y + 30 }, 10)
    await expect.poll(async () => (await innerNamed(page, '이너 1')).x).not.toBe(inner.x)
    const moved = await innerNamed(page, '이너 1')
    expect(Math.abs(moved.x - inner.x - 40 / zoom)).toBeLessThan(1)
    expect(Math.abs(moved.y - inner.y - 30 / zoom)).toBeLessThan(1)
    expect((await getUi(page)).tentTarget).toEqual({ innerId: inner.id })
    await expect(tentSheet(page)).toBeVisible()
    expect((await getDoc(page)).canUndo).toBe(true)

    await page.getByTestId('mobile-top-bar').getByRole('button', { name: '실행 취소' }).tap()
    await expect.poll(async () => {
      const back = await innerNamed(page, '이너 1')
      return [back.x, back.y]
    }).toEqual([inner.x, inner.y])
    expect((await getDoc(page)).canUndo).toBe(false)
  })

  test('작업 간 상호작용: 탭으로 연 텐트 시트가 그 손가락 아래로 와도, 그 탭이 시트를 누르지 않는다(고스트 클릭 없음)', async ({
    page,
  }) => {
    const inner = await innerNamed(page, '이너 1')
    const at = await worldToClient(page, inner.x, inner.y + 140) // 이너 아래쪽(시트가 열릴 자리)
    expect(await isCanvasAt(page, at)).toBe(true)
    await page.evaluate(() => {
      const w = window as unknown as { __sheetPresses?: string[] }
      w.__sheetPresses = []
      for (const type of ['mousedown', 'mouseup', 'click']) {
        document.addEventListener(
          type,
          (e) => {
            const t = e.target
            if (t instanceof Element && t.closest('[data-testid="sheet-tent"]') !== null) w.__sheetPresses!.push(type)
          },
          true,
        )
      }
    })

    await tapCanvas(page, at)
    await expect(tentSheet(page)).toBeVisible()
    expect((await getUi(page)).tentTarget).toEqual({ innerId: inner.id })
    // 시험이 뜻이 있으려면 누른 점이 열린 시트 안이어야 합니다.
    expect(at.y).toBeGreaterThan((await tentSheet(page).boundingBox())!.y)
    await nextFrames(page, 3)
    expect(await page.evaluate(() => (window as unknown as { __sheetPresses?: string[] }).__sheetPresses)).toEqual([])
    await expect(tentSheet(page)).toHaveAttribute('data-expanded', 'false')
    expect(await getTent(page)).toEqual((await getDoc(page)).layout.tent)
  })

  test('펼친 텐트 시트 위로 캔버스가 176px 이상 남고, 편집 대상이 시트 위에 보인다', async ({ page }) => {
    const inner = await innerNamed(page, '이너 1')
    await tapCanvas(page, await worldToClient(page, inner.x, inner.y))
    await expect(tentSheet(page)).toBeVisible()
    expect((await getUi(page)).tentTarget).toEqual({ innerId: inner.id })
    await tentSheet(page).getByRole('button', { name: '펼치기' }).tap()
    await expect(tentSheet(page)).toHaveAttribute('data-expanded', 'true')

    const canvas = page.locator('.konvajs-content')
    await expect
      .poll(async () => {
        const c = (await canvas.boundingBox())!
        const sh = (await tentSheet(page).boundingBox())!
        return Math.round(sh.y - c.y)
      })
      .toBeGreaterThanOrEqual(MIN_CANVAS_ABOVE_SHEET_PX - 1)
    await expect.poll(async () => isCanvasAt(page, await worldToClient(page, inner.x, inner.y))).toBe(true)
    const shown = await worldToClient(page, inner.x, inner.y)
    expect(shown.y).toBeLessThan((await tentSheet(page).boundingBox())!.y)
  })
})

test('이너 0개 텐트(티피): 요약 칩은 「이너 — · 바닥 0%」이고 텐트 모드·시트도 깨지지 않는다', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await openEditorWith(page, TIPI)
  expect((await getDoc(page)).layout.tent.inners).toEqual([])
  await expect(page.getByRole('button', { name: '면적 현황 열기, 이너 —, 바닥 0%', exact: true })).toBeVisible()

  await enterTentModeByUi(page)
  await selectOuter(page, [0, 0])
  await expect(tentSheet(page)).toBeVisible()
  // 휴대폰 시트에는 [+ 이너]가 없습니다(툴바 [+이너 ▾]가 맡음, 설계 §3)
  await expect(tentSheet(page).getByRole('list', { name: '텐트 구성' }).getByRole('button')).toHaveText([/^외곽/])
  expect(errors).toEqual([])
})

test('최종 리뷰: 텐트 모드 토스트는 요약 칩에 가리지 않고 화면 안, 툴바 위에 보인다', async ({ page }) => {
  await openEditorWith(page, DOME)
  await enterTentModeByUi(page)
  for (let i = 0; i < 4 && !(await toast(page).isVisible()); i++) {
    await toolbarInner(page, '사각형')
    await nextFrames(page, 2)
  }
  await expect(toast(page)).toHaveText('빈 공간이 부족해요')
  const t = (await toast(page).boundingBox())!
  const chip = (await page.getByRole('group', { name: '면적 요약' }).boundingBox())!
  const bar = (await toolbar(page).boundingBox())!
  const overlaps = t.x < chip.x + chip.width && chip.x < t.x + t.width && t.y < chip.y + chip.height && chip.y < t.y + t.height
  expect(overlaps).toBe(false)
  expect(t.y).toBeGreaterThanOrEqual(0)
  expect(t.y + t.height).toBeLessThanOrEqual(bar.y)
})


test('휴대폰 [상하좌우] 토글: 켜면 이너를 비스듬히 끌어도 한 축으로만 움직인다', async ({ page }) => {
  await openEditorWith(page)
  await enterTentModeByUi(page)
  const inner = await innerNamed(page, '이너 1')
  await tapCanvas(page, await worldToClient(page, inner.x, inner.y))
  await expect(tentSheet(page)).toBeVisible()
  const toggle = tentSheet(page).getByRole('button', { name: '상하좌우로만 이동', exact: true })
  await toggle.tap()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => isCanvasAt(page, await worldToClient(page, inner.x, inner.y))).toBe(true)
  const from = await worldToClient(page, inner.x, inner.y)
  await touchDrag(page, from, { x: from.x + 45, y: from.y + 12 }, 10)
  await expect.poll(async () => (await innerNamed(page, '이너 1')).x).not.toBe(inner.x)
  expect((await innerNamed(page, '이너 1')).y).toBe(inner.y)
})
