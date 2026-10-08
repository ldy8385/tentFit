// 작은 휴대폰(375×667, 터치). playwright.config.ts의 mobile-small 프로젝트만 이 파일을 돌립니다.
// 시트를 펼쳐도 캔버스가 남고, 선택한 물건이 그 위 영역에 보이는지 봅니다(최종 리뷰 Important).
import { expect, test } from '@playwright/test'
import { isCanvasAt, waitReady, worldToClient } from './helpers'
import { addMatFromSheet, selectionSheet } from './mobileFlows'

/** 펼친 시트 위로 남기는 캔버스 높이(sheets.css: 요약 칩 56 + 보일 영역 88 + 여백 32) */
const MIN_CANVAS_ABOVE_SHEET_PX = 176

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await waitReady(page)
})

test('선택 시트를 펼쳐도 캔버스가 176px 이상 남고, 선택한 물건이 시트 위에 보인다', async ({ page }) => {
  const item = await addMatFromSheet(page)
  await selectionSheet(page).getByRole('button', { name: '펼치기' }).tap()
  await expect(selectionSheet(page)).toHaveAttribute('data-expanded', 'true')

  const canvas = page.locator('.konvajs-content')
  await expect
    .poll(async () => {
      const c = (await canvas.boundingBox())!
      const sh = (await selectionSheet(page).boundingBox())!
      return Math.round(sh.y - c.y)
    })
    .toBeGreaterThanOrEqual(MIN_CANVAS_ABOVE_SHEET_PX - 1)
  // 셸이 시트 높이를 반영해 물건을 시트 위로 옮길 때까지
  await expect.poll(async () => isCanvasAt(page, await worldToClient(page, item.x, item.y))).toBe(true)
  const at = await worldToClient(page, item.x, item.y)
  expect(at.y).toBeLessThan((await selectionSheet(page).boundingBox())!.y)
})
