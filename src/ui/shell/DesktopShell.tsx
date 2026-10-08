// PC 3단(스펙 §4.1): 상단 바 / 왼쪽 라이브러리(240px, 1024 미만 200px) / 가운데 캔버스 / 오른쪽(320px, 1024 미만 280px).
// 오른쪽 위 자리는 desktopPanel에 따라 속성 패널·새 도형 폼·경고 패널, 아래는 면적 현황입니다.
// 캔버스에서 직접 선택하면 경고 패널 대신 속성 패널로 바꾸는 규칙(§4.6)은 Board(Task 10)가 선택할 때 합니다.
import { useStores, useUi } from '../../app/stores'
import { CANVAS_HOST_TEST_ID } from '../../app/testHook'
import { Board } from '../../view/canvas/Board'
import { AreaSummary } from '../area/AreaSummary'
import { WarningPanel } from '../area/WarningPanel'
import { LibraryPanel } from '../library/LibraryPanel'
import { NewShapeForm } from '../library/NewShapeForm'
import { PropertiesPanel } from '../panels/PropertiesPanel'
import { CanvasOverlay } from './CanvasOverlay'
import { TopBar } from './TopBar'
import './shell.css'

/** 새 도형 폼과 경고 패널은 자기 제목 줄(×)을 그립니다. ×·완료는 속성 자리(auto)로 돌아갑니다. */
function RightTopPanel() {
  const stores = useStores()
  const panel = useUi((s) => s.desktopPanel)
  const back = () => stores.ui.getState().patch({ desktopPanel: 'auto' })

  if (panel === 'newShape') return <NewShapeForm onDone={back} onCancel={back} />
  if (panel === 'warnings') return <WarningPanel />
  return <PropertiesPanel />
}

export function DesktopShell() {
  return (
    <div className="shell-desktop" data-testid="desktop-shell">
      <TopBar />
      <aside className="shell-desktop__left" aria-label="라이브러리">
        <LibraryPanel />
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
