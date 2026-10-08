// 앱 진입 화면. 해시가 '#/edit/<id>'이고 메모리에 그 배치가 있으면 편집기, 아니면 기본 텐트로 새 배치를 만들어 엽니다.
// Plan 4가 시작 화면을 텐트 고르기(#/pick)로, Plan 7이 메모리 보관을 IndexedDB로 바꿉니다.
import { useEffect, useRef, useState } from 'react'
import { createLayout, type Layout } from '../core/model'
import { uniqueName } from '../core/ops/items'
import { DesktopShell } from '../ui/shell/DesktopShell'
import { MobileShell } from '../ui/shell/MobileShell'
import { useIsDesktop } from '../ui/shell/useIsDesktop'
import { getMemoryLayout, listMemoryLayouts, putMemoryLayout } from './memoryLayouts'
import { defaultTentPreset } from './presets'
import { editHash, useRoute } from './router'
import { useShortcuts } from './shortcuts'
import { createStores, StoresProvider } from './stores'
import { installTestHook } from './testHook'
import '../ui/shell/shell.css'

/** 기본 텐트로 새 배치를 만들어 메모리에 둡니다. 이름은 '<텐트 이름> 배치'에 번호 규칙(스펙 §4.7-7). */
export function createStartLayout(): Layout {
  const preset = defaultTentPreset()
  const names = listMemoryLayouts().map((l) => l.name)
  const name = uniqueName(names, `${preset.tent.name} 배치`)
  const layout = createLayout(preset.tent, { name, sourcePresetId: preset.id })
  putMemoryLayout(layout)
  return layout
}

/**
 * 새 배치를 만들고 그 편집기 주소로 바꿉니다. location.replace라서 뒤로 가기에 시작 주소가 남지 않습니다.
 * StrictMode에서 효과가 두 번 돌아도 ref로 배치를 한 번만 만듭니다.
 */
function StartRedirect() {
  const createdId = useRef<string | null>(null)
  useEffect(() => {
    if (createdId.current === null) createdId.current = createStartLayout().id
    window.location.replace(editHash(createdId.current))
  }, [])
  return (
    <div className="shell-start" role="status">
      새 배치를 여는 중…
    </div>
  )
}

function EditorShell() {
  useShortcuts()
  return useIsDesktop() ? <DesktopShell /> : <MobileShell />
}

function Editor(p: { layout: Layout }) {
  const [stores] = useState(() => createStores(p.layout))

  // 문서가 바뀔 때마다 메모리 보관본을 최신으로(같은 탭에서 해시를 오가도 이어서 편집)
  useEffect(() => stores.doc.subscribe((s) => putMemoryLayout(s.layout)), [stores])

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
  const layout = route.name === 'edit' ? getMemoryLayout(route.layoutId) : undefined
  if (layout === undefined) return <StartRedirect />
  return <Editor key={layout.id} layout={layout} />
}
