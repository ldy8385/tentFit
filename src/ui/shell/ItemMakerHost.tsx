// 물건 그리기·모양 편집 화면 자리(소유자 요청 2026-10-14). ui.itemMaker가 있으면 텐트 만들기 화면을 물건 모드로 띄웁니다(body로 포털).
// 결과 모양(임시 문서의 외곽)은 새 물건(매트)이 되거나, 고른 물건의 모양을 바꿉니다(보이는 자리 그대로, 실행 취소 1칸).
import type { JSX } from 'react'
import { createPortal } from 'react-dom'
import { addDrawnItem, replaceItemShape } from '../../app/actions'
import { useDoc, useStores, useUi } from '../../app/stores'
import { TentMaker } from '../tentMaker/TentMaker'

export function ItemMakerHost(): JSX.Element | null {
  const stores = useStores()
  const maker = useUi((s) => s.itemMaker)
  const editId = maker?.editId ?? null
  const item = useDoc((s) => (editId === null ? undefined : s.layout.items.find((it) => it.id === editId)))
  if (maker === null || (editId !== null && item === undefined)) return null
  const close = () => stores.ui.getState().patch({ itemMaker: null })
  return createPortal(
    <TentMaker
      key={editId ?? 'new'}
      mode={editId === null ? 'item' : 'itemEdit'}
      myTentNames={[]}
      initialShape={item?.shape}
      onCancel={close}
      onConfirm={(tent) => {
        close()
        if (editId === null) addDrawnItem(stores, tent.name, tent.outer)
        else replaceItemShape(stores, editId, tent.outer)
      }}
    />,
    document.body,
  )
}
