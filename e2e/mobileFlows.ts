// 휴대폰 셸(모바일 프로젝트들)이 함께 쓰는 화면 조작. 버튼·시트는 locator.tap()으로 누릅니다.
import { expect, type Page } from '@playwright/test'
import type { Item } from '../src/core/model'
import { createItem, getDoc, getUi, MAT_ITEM } from './helpers'

/** 시험용 매트 이름(새 도형으로 만듦, 200×60) */
export const MAT = MAT_ITEM.name

export const addButton = (page: Page) => page.getByTestId('toolbar').getByRole('button', { name: '+물건' })
export const undoButton = (page: Page) => page.getByTestId('mobile-top-bar').getByRole('button', { name: '실행 취소' })
export const librarySheet = (page: Page) => page.getByTestId('library-sheet')
export const selectionSheet = (page: Page) => page.getByTestId('selection-sheet')

export async function itemById(page: Page, id: string): Promise<Item | undefined> {
  return (await getDoc(page)).layout.items.find((i) => i.id === id)
}

/** [+물건] → [+ 새 도형 만들기]로 매트(200×60)를 만듭니다. 끝나면 선택 시트가 열리고, 추가된 물건을 돌려줍니다. */
export async function addMatFromSheet(page: Page): Promise<Item> {
  const item = await createItem(page, MAT_ITEM)
  await expect(selectionSheet(page)).toBeVisible()
  await expect(librarySheet(page)).toBeHidden()
  expect((await getUi(page)).mobileSheet).toBe('selection')
  return item
}
