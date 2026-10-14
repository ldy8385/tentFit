// PC 3단(스펙 §4.1): 상단 바 / 왼쪽 라이브러리(352px, 1366 미만 300px, 1024 미만 240px — 매트 이름이 보이게, 2026-10-14) / 가운데 캔버스 /
// 오른쪽(320px, 1024 미만 280px). 라이브러리는 접어서 얇은 띠로 둘 수 있고, 접음은 이 브라우저에 기억합니다.
// 오른쪽 위 자리는 desktopPanel에 따라 속성 패널·새 도형 폼·경고 패널, 아래는 면적 현황입니다.
// 텐트 편집 모드면 오른쪽 위 자리는 텐트 편집 패널(구성 목록·대상 편집, §4.4-3)입니다. 경고 패널을 열었으면 경고 패널이 먼저입니다.
// 캔버스에서 직접 선택하면 경고 패널 대신 속성 패널로 바꾸는 규칙(§4.6)은 Board가 선택할 때 합니다.
import { useState } from 'react'
import { useStores, useUi } from '../../app/stores'
import { CANVAS_HOST_TEST_ID } from '../../app/testHook'
import { Board } from '../../view/canvas/Board'
import { AreaSummary } from '../area/AreaSummary'
import { WarningPanel } from '../area/WarningPanel'
import { LibraryPanel } from '../library/LibraryPanel'
import { NewShapeForm } from '../library/NewShapeForm'
import { PropertiesPanel } from '../panels/PropertiesPanel'
import { TentEditor } from '../tent/TentEditor'
import { CanvasOverlay } from './CanvasOverlay'
import { TopBar } from './TopBar'
import './shell.css'

/**
 * 새 도형 폼과 경고 패널은 자기 제목 줄(×)을 그립니다. ×·완료는 속성 자리(auto)로 돌아갑니다.
 * 텐트 편집 모드에서는 속성 패널·새 도형 폼 대신 텐트 편집 패널입니다(새 도형 폼은 모드 전환 때 auto로 돌아감).
 */
function RightTopPanel() {
  const stores = useStores()
  const panel = useUi((s) => s.desktopPanel)
  const mode = useUi((s) => s.mode)
  const back = () => stores.ui.getState().patch({ desktopPanel: 'auto' })

  if (panel === 'warnings') return <WarningPanel />
  if (mode === 'tent') return <TentEditor variant="panel" />
  if (panel === 'newShape') return <NewShapeForm onDone={back} onCancel={back} />
  return <PropertiesPanel />
}

const LIB_COLLAPSED_KEY = 'tentfit.libraryCollapsed'

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(LIB_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function writeCollapsed(v: boolean): void {
  try {
    window.localStorage.setItem(LIB_COLLAPSED_KEY, v ? '1' : '0')
  } catch {
    // 저장소를 못 쓰면(사생활 보호 창 등) 이번 화면에서만 기억합니다.
  }
}

export function DesktopShell() {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const toggle = (v: boolean) => {
    setCollapsed(v)
    writeCollapsed(v)
  }
  return (
    <div className="shell-desktop" data-testid="desktop-shell" data-lib-collapsed={collapsed ? 'true' : undefined}>
      <TopBar />
      <aside className="shell-desktop__left" aria-label="라이브러리">
        {collapsed ? (
          <button type="button" className="shell-libtab" aria-label="라이브러리 펼치기" title="라이브러리 펼치기" onClick={() => toggle(false)}>
            <span aria-hidden="true">›</span>
            <span className="shell-libtab__text" aria-hidden="true">
              라이브러리
            </span>
          </button>
        ) : (
          <LibraryPanel onCollapse={() => toggle(true)} />
        )}
      </aside>
      <main className="shell-desktop__center">
        <div className="canvas-host shell-canvas" data-testid={CANVAS_HOST_TEST_ID}>
          <Board />
        </div>
        <CanvasOverlay variant="desktop" />
      </main>
      <aside className="shell-desktop__right" aria-label="속성과 면적">
        <section className="shell-desktop__panel" data-testid="right-panel">
          <RightTopPanel />
        </section>
        <section className="shell-desktop__area">
          <AreaSummary />
        </section>
      </aside>
    </div>
  )
}
