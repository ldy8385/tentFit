// 작은 휴대폰(375×667, 터치) 텐트 흐름. playwright.config.ts의 mobile-small 프로젝트가 mobile-small.spec.ts와 함께 돌립니다.
// 가장 낮은 세로 화면이라 고르기 카드·만들기 화면 확정 버튼·키보드용 미리보기 축소·텐트 시트 위 캔버스 띠를 여기서 봅니다.
import { expect, test } from '@playwright/test'
import { getUi, isCanvasAt, openEditorWith, waitMakerReady, worldToClient } from './helpers'
import {
  MIN_CANVAS_ABOVE_SHEET_PX,
  TUNNEL,
  enterTentModeByUi,
  horizontalOverflowPx,
  innerNamed,
  makerConfirm,
  makerField,
  makerNext,
  makerNextButton,
  makerPanel,
  makerSheet,
  makerTools,
  openPickScreen,
  openTentMaker,
  pickCard,
  pickExample,
  pickScreen,
  tapCanvas,
  tentMaker,
  tentSheet,
  toolbar,
} from './tentFlows'

test('고르기 화면은 가로 스크롤이 없고 카드를 누를 수 있으며, 만들기 화면 확정 버튼이 보인다', async ({ page }) => {
  await openPickScreen(page)
  await expect(pickScreen(page)).toHaveAttribute('data-layout', 'mobile')
  expect(await horizontalOverflowPx(pickScreen(page))).toBeLessThanOrEqual(0)
  const card = pickCard(page, TUNNEL)
  const box = (await card.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(375)
  expect(box.height).toBeGreaterThanOrEqual(44)

  await openTentMaker(page)
  await waitMakerReady(page)
  await expect(tentMaker(page).getByRole('button', { name: '뒤로', exact: true })).toBeInViewport({ ratio: 1 })
  await expect(tentMaker(page).getByRole('list', { name: '단계' })).toBeInViewport()
  await expect(makerNextButton(page)).toBeInViewport({ ratio: 1 })
  await expect(makerTools(page)).toBeInViewport()
  await expect(makerSheet(page)).toBeVisible()
  expect(await horizontalOverflowPx(tentMaker(page), '.tf-maker__tools')).toBeLessThanOrEqual(0)
})

test('만들기 화면 시트의 입력칸(이름·치수)에 포커스하면 그 칸과 주 버튼이 보이고, 단계 ②의 [✓ 시작]도 보인다', async ({ page }) => {
  await openPickScreen(page)
  await openTentMaker(page)
  const name = makerField(page, '텐트 이름')
  await name.tap()
  await expect(name).toBeFocused()
  await expect(name).toBeInViewport({ ratio: 1 })
  await expect(makerNextButton(page)).toBeInViewport({ ratio: 1 })
  await name.blur()

  await pickExample(page, '사각형')
  const width = makerPanel(page).getByLabel('가로', { exact: true })
  await width.tap()
  await expect(width).toBeFocused()
  await expect(width).toBeInViewport({ ratio: 1 })
  await expect(makerNextButton(page)).toBeInViewport({ ratio: 1 })
  await width.blur()
  await makerNext(page)
  await expect(makerConfirm(page)).toBeInViewport({ ratio: 1 })
})

test('텐트 시트를 펼쳐도 캔버스가 176px 이상 남고, 편집 대상 이너가 시트 위에 보이며 툴바는 그대로다', async ({ page }) => {
  await openEditorWith(page)
  await enterTentModeByUi(page)
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
  // 셸이 시트 높이를 반영해 대상을 시트 위로 옮길 때까지
  await expect.poll(async () => isCanvasAt(page, await worldToClient(page, inner.x, inner.y))).toBe(true)
  expect((await worldToClient(page, inner.x, inner.y)).y).toBeLessThan((await tentSheet(page).boundingBox())!.y)
  // 시트가 열려도 툴바([+이너] [완료])는 늘 보입니다(D29).
  await expect(toolbar(page).getByRole('button', { name: '완료', exact: true })).toBeInViewport({ ratio: 1 })
})
