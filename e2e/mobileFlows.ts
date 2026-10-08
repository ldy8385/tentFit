// 휴대폰 셸(모바일 프로젝트들)이 함께 쓰는 화면 조작. 버튼·시트는 locator.tap()으로 누릅니다.
import { expect, type Page } from '@playwright/test'
import type { Item } from '../src/core/model'
import { getDoc, getUi } from './helpers'

/** presets/items.json의 items/mat-single-200x60 */
export const MAT = '캠핑 매트 1인'

export const addButton = (page: Page) => page.getByTestId('toolbar').getByRole('button', { name: '+물건' })
export const undoButton = (page: Page) => page.getByTestId('mobile-top-bar').getByRole('button', { name: '실행 취소' })
export const librarySheet = (page: Page) => page.getByTestId('library-sheet')
export const selectionSheet = (page: Page) => page.getByTestId('selection-sheet')

export async function itemById(page: Page, id: string): Promise<Item | undefined> {
  return (await getDoc(page)).layout.items.find((i) => i.id === id)
}

/** [+물건] → 라이브러리 시트의 매트 카드. 시트가 선택 시트로 바뀌고, 추가된 물건을 돌려줍니다. */
export async function addMatFromSheet(page: Page): Promise<Item> {
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
