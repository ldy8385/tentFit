// 가로로 돌린 휴대폰(844×390, 터치). playwright.config.ts의 mobile-landscape 프로젝트만 이 파일을 돌립니다.
// 폭은 768px 이상이지만 높이가 낮아 PC 3단이 아니라 모바일 셸이어야 합니다(스펙 D8, 최종 리뷰 Important).
import { expect, test } from '@playwright/test'
import { isCanvasAt, waitReady, worldToClient } from './helpers'
import { addMatFromSheet } from './mobileFlows'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await waitReady(page)
})

test('가로로 돌린 휴대폰은 모바일 셸이고, 시트로 추가한 물건이 캔버스에 보인다', async ({ page }) => {
  await expect(page.getByTestId('mobile-shell')).toBeVisible()
  await expect(page.getByTestId('desktop-shell')).toHaveCount(0)
  const item = await addMatFromSheet(page)
  await expect.poll(async () => isCanvasAt(page, await worldToClient(page, item.x, item.y))).toBe(true)
})
