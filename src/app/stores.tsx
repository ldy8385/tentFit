// 스토어를 React에 연결합니다(스펙 §7). 문서 스토어와 화면 스토어를 한 묶음(Stores)으로 내려 줍니다.
import { createContext, useContext, type JSX, type ReactNode } from 'react'
import { useStore } from 'zustand'
import type { Layout } from '../core/model'
import { createDocStore, type DocState, type DocStore } from '../store/doc'
import { createUiStore, type PointerKind, type UiState, type UiStore } from '../store/ui'

export type Stores = { doc: DocStore; ui: UiStore }

const StoresContext = createContext<Stores | null>(null)

export function StoresProvider(props: { stores: Stores; children: ReactNode }): JSX.Element {
  return <StoresContext value={props.stores}>{props.children}</StoresContext>
}

export function useStores(): Stores {
  const stores = useContext(StoresContext)
  if (stores === null) throw new Error('useStores는 StoresProvider 안에서만 쓸 수 있어요')
  return stores
}

/**
 * 문서 스토어 구독(zustand useStore). selector는 매번 새 객체·배열을 만들지 말고 스토어 안의 값(참조)을 그대로
 * 돌려주세요. 새 객체를 돌려주면 React가 무한히 다시 그립니다(여러 값이 필요하면 useDoc을 여러 번 부르세요).
 */
export function useDoc<T>(selector: (s: DocState) => T): T {
  return useStore(useStores().doc, selector)
}

/** 화면 스토어 구독. selector 규칙은 useDoc과 같습니다. */
export function useUi<T>(selector: (s: UiState) => T): T {
  return useStore(useStores().ui, selector)
}

/** 첫 입력 전의 포인터 추정: 터치가 주 입력인 기기면 'touch'(첫 조작에 마우스용 핸들이 붙지 않게) */
export function initialPointer(): PointerKind {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'mouse'
  return window.matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse'
}

/**
 * 배치 하나의 스토어 묶음. 문서가 바뀔 때마다(실행 취소·다시 실행·load 포함) 선택에서 없는 id를 뺍니다(§8).
 * 구독은 스토어와 수명이 같아서 따로 풀지 않습니다(배치를 바꾸면 묶음을 새로 만듦).
 */
export function createStores(layout: Layout): Stores {
  const doc = createDocStore(layout)
  const ui = createUiStore({ pointer: initialPointer() })
  doc.subscribe((state, prev) => {
    if (state.layout !== prev.layout) ui.getState().pruneSelection(state.layout)
  })
  return { doc, ui }
}
