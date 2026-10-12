// 앱 진입 화면과 라우팅(스펙 §4.7, R16).
// - '#/pick': 텐트 고르기(PickRoute). 배치가 있어도 자동으로 편집기로 보내지 않습니다(편집기에서 뒤로 가기의 도착지).
// - '#/edit/<id>': 그 배치가 보관소에 있으면 편집기. 없으면(새로고침 등) 새 배치를 만들지 않고 시작 규칙으로 갑니다.
// - 그 밖(빈 해시, '#/', 모르는 경로): 시작 규칙 = 마지막으로 연 배치 → 가장 최근 수정 배치 → 없으면 '#/pick'.
//   location.replace라서 뒤로 가기에 시작 주소가 남지 않습니다. 고르기 화면에서 편집기로 갈 때는 push입니다.
// 보관소는 layoutRepo(지금은 메모리, Plan 7이 IndexedDB로 바꿉니다).
import { useEffect, useState } from 'react'
import type { Layout } from '../core/model'
import { toPointerKind } from '../store/ui'
import { DesktopShell } from '../ui/shell/DesktopShell'
import { MobileShell } from '../ui/shell/MobileShell'
import { useIsDesktop } from '../ui/shell/useIsDesktop'
import { getLastLayoutId, getLayout, listLayoutSummaries, putLayout, setLastLayoutId } from './layoutRepo'
import { PickRoute } from './PickRoute'
import { editHash, PICK_HASH, useRoute } from './router'
import { useShortcuts } from './shortcuts'
import { startRoute } from './startRoute'
import { createStores, StoresProvider } from './stores'
import { installAppTestHook, installTestHook } from './testHook'
import '../ui/shell/shell.css'

/** 시작 규칙(R16)으로 갈 주소. 편집기 또는 고르기 화면입니다. */
function startHash(): string {
  const target = startRoute(listLayoutSummaries(), getLastLayoutId())
  return target.name === 'edit' ? editHash(target.layoutId) : PICK_HASH
}

/**
 * 시작 규칙으로 주소를 바꿉니다(location.replace). 배치를 만들지 않으므로 StrictMode에서 효과가 두 번 돌아도
 * 같은 주소로 두 번 바꿀 뿐입니다.
 */
function StartRedirect() {
  useEffect(() => {
    window.location.replace(startHash())
  }, [])
  return (
    <div className="shell-start" role="status">
      여는 중…
    </div>
  )
}

function EditorShell() {
  useShortcuts()
  return useIsDesktop() ? <DesktopShell /> : <MobileShell />
}

function Editor(p: { layout: Layout }) {
  const [stores] = useState(() => createStores(p.layout))

  // 시작 규칙의 "마지막으로 연 배치"(§4.7)
  useEffect(() => {
    setLastLayoutId(p.layout.id)
  }, [p.layout.id])

  // 문서가 바뀔 때마다 보관본을 최신으로(같은 탭에서 해시를 오가도 이어서 편집)
  useEffect(() => stores.doc.subscribe((s) => putLayout(s.layout)), [stores])

  // 시트·버튼(DOM)을 눌러도 마지막 포인터 종류를 기억합니다. 캔버스를 누르기 전에도 핸들 모양이 입력에 맞게.
  useEffect(() => {
    const onDown = (e: PointerEvent) => stores.ui.getState().setPointer(toPointerKind(e.pointerType))
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [stores])

  useEffect(() => {
    if (import.meta.env.MODE !== 'test') return
    return installTestHook(stores)
  }, [stores])

  return (
    <StoresProvider stores={stores}>
      <EditorShell />
    </StoresProvider>
  )
}

export default function App() {
  const route = useRoute()

  // 앱 수준 테스트 훅(라우트와 무관): 고르기·만들기 화면에서도 배치 목록을 읽을 수 있게
  useEffect(() => {
    if (import.meta.env.MODE !== 'test') return
    return installAppTestHook()
  }, [])

  if (route.name === 'pick') return <PickRoute />
  const layout = route.name === 'edit' ? getLayout(route.layoutId) : undefined
  if (layout === undefined) return <StartRedirect key={route.name === 'edit' ? `edit:${route.layoutId}` : route.name} />
  return <Editor key={layout.id} layout={layout} />
}
