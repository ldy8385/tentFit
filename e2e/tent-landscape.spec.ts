// 가로로 돌린 휴대폰(844×390, 터치) 텐트 흐름. playwright.config.ts의 mobile-landscape 프로젝트가 mobile-landscape.spec.ts와 함께 돌립니다.
// 폭은 768px 이상이지만 높이가 낮아 고르기·만들기 화면과 텐트 편집 모드 모두 휴대폰 배치여야 합니다(스펙 D8).
import { expect, test } from '@playwright/test'
import { getUi, isCanvasAt, openEditorWith, worldToClient } from './helpers'
import {
  MAKER_PREVIEW_FOCUSED_MAX_PX,
  enterTentModeByUi,
  horizontalOverflowPx,
  innerNamed,
  makerConfirm,
  makerField,
  makerPreview,
  openPickScreen,
  openTentMaker,
  pickScreen,
  tapCanvas,
  tentMaker,
  tentSheet,
  toolbar,
} from './tentFlows'

test('고르기·만들기 화면은 휴대폰 배치이고 가로 스크롤이 없으며, 확정 버튼과 포커스한 칸이 보인다(미리보기 축소)', async ({
  page,
}) => {
  await openPickScreen(page)
  await expect(pickScreen(page)).toHaveAttribute('data-layout', 'mobile')
  expect(await horizontalOverflowPx(pickScreen(page))).toBeLessThanOrEqual(0)

  await openTentMaker(page)
  await expect(tentMaker(page)).toHaveAttribute('data-layout', 'mobile')
  await expect(makerConfirm(page)).toBeInViewport({ ratio: 1 })
  expect(await horizontalOverflowPx(tentMaker(page))).toBeLessThanOrEqual(0)

  const depth = makerField(page, '이너 1 깊이')
  await depth.tap()
  await expect(depth).toBeFocused()
  await expect.poll(async () => (await makerPreview(page).boundingBox())!.height).toBeLessThanOrEqual(MAKER_PREVIEW_FOCUSED_MAX_PX)
  await expect(depth).toBeInViewport({ ratio: 1 })
  await expect(makerConfirm(page)).toBeInViewport({ ratio: 1 })
})

test('텐트 편집 모드도 모바일 셸(툴바 [+이너] [완료])이고, 탭한 이너가 텐트 시트 위에 보인다', async ({ page }) => {
  await openEditorWith(page)
  await enterTentModeByUi(page)
  await expect(page.getByTestId('mobile-shell')).toBeVisible()
  await expect(page.getByTestId('desktop-shell')).toHaveCount(0)
  await expect(toolbar(page)).toHaveAttribute('data-mode', 'tent')
  await expect(toolbar(page).getByRole('button')).toHaveText(['이너', '완료'])

  const inner = await innerNamed(page, '이너 1')
  await tapCanvas(page, await worldToClient(page, inner.x, inner.y))
  await expect(tentSheet(page)).toBeVisible()
  expect((await getUi(page)).tentTarget).toEqual({ innerId: inner.id })
  await expect(tentSheet(page)).toHaveAttribute('data-expanded', 'false')
  // 셸이 시트 높이를 반영해 대상을 시트 위 띠로 옮길 때까지
  await expect.poll(async () => isCanvasAt(page, await worldToClient(page, inner.x, inner.y))).toBe(true)
  expect((await worldToClient(page, inner.x, inner.y)).y).toBeLessThan((await tentSheet(page).boundingBox())!.y)
  await expect(toolbar(page).getByRole('button', { name: '완료', exact: true })).toBeInViewport({ ratio: 1 })
})
