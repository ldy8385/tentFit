// 가로로 돌린 휴대폰(844×390, 터치) 텐트 흐름. playwright.config.ts의 mobile-landscape 프로젝트가 mobile-landscape.spec.ts와 함께 돌립니다.
// 폭은 768px 이상이지만 높이가 낮아 고르기·만들기 화면과 텐트 편집 모드 모두 휴대폰 배치여야 합니다(스펙 D8).
import { expect, test } from '@playwright/test'
import { getUi, isCanvasAt, openEditorWith, waitMakerReady, worldToClient } from './helpers'
import {
  enterTentModeByUi,
  horizontalOverflowPx,
  innerNamed,
  makerConfirm,
  makerField,
  makerNext,
  makerNextButton,
  makerPanel,
  makerSheet,
  openPickScreen,
  openTentMaker,
  pickExample,
  pickScreen,
  tapCanvas,
  tentMaker,
  tentSheet,
  toolbar,
} from './tentFlows'

test('고르기·만들기 화면은 휴대폰 배치이고 가로 스크롤이 없으며, 주 버튼과 포커스한 칸이 보인다', async ({ page }) => {
  await openPickScreen(page)
  await expect(pickScreen(page)).toHaveAttribute('data-layout', 'mobile')
  expect(await horizontalOverflowPx(pickScreen(page))).toBeLessThanOrEqual(0)

  await openTentMaker(page)
  await waitMakerReady(page)
  await expect(tentMaker(page)).toHaveAttribute('data-layout', 'mobile')
  await expect(makerNextButton(page)).toBeInViewport({ ratio: 1 })
  await expect(makerSheet(page)).toBeVisible()
  expect(await horizontalOverflowPx(tentMaker(page), '.tf-maker__tools')).toBeLessThanOrEqual(0)

  const name = makerField(page, '텐트 이름')
  await name.tap()
  await expect(name).toBeFocused()
  await expect(name).toBeInViewport({ ratio: 1 })
  await expect(makerNextButton(page)).toBeInViewport({ ratio: 1 })
  await name.blur()

  await pickExample(page, '원')
  const d = makerPanel(page).getByLabel('지름', { exact: true })
  await d.tap()
  await expect(d).toBeFocused()
  await expect(d).toBeInViewport({ ratio: 1 })
  await d.blur()
  await makerNext(page)
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

test('최종 리뷰: 낮은 텐트 시트에서도 [모양 바꾸기] 버튼 줄은 시트를 스크롤해 끝까지 보이고 누를 수 있다', async ({ page }) => {
  await openEditorWith(page)
  await enterTentModeByUi(page)
  const inner = await innerNamed(page, '이너 1')
  await tapCanvas(page, await worldToClient(page, inner.x, inner.y))
  await expect(tentSheet(page)).toBeVisible()
  const circle = tentSheet(page).getByRole('group', { name: '모양 바꾸기' }).getByRole('button', { name: '원', exact: true })
  await circle.scrollIntoViewIfNeeded()
  await expect(circle).toBeInViewport({ ratio: 1 })
  await circle.tap()
  await expect.poll(async () => (await innerNamed(page, '이너 1')).shape.kind).toBe('circle')
})
