// 모바일 상단 바(스펙 §4.2): ☰ 메뉴(다시 실행, 격자 보이기, 맞춤 보기), 배치 이름, 실행 취소.
// 메뉴의 파일 항목·스냅 켜기·설치 안내는 Plan 5·7·8에서 붙입니다.
import { useDoc, useStores, useUi } from '../../app/stores'
import { fitToLayout } from '../../app/viewActions'
import { MenuIcon, UndoIcon } from './icons'
import { LayoutNameField } from './LayoutNameField'
import { MenuButton } from './MenuButton'
import './shell.css'

export function MobileTopBar() {
  const stores = useStores()
  const canUndo = useDoc((s) => s.canUndo)
  const canRedo = useDoc((s) => s.canRedo)
  const gridVisible = useUi((s) => s.gridVisible)

  return (
    <header className="shell-mtopbar" data-testid="mobile-top-bar">
      <MenuButton
        label="메뉴"
        icon={<MenuIcon size={22} />}
        align="left"
        items={[
          { label: '다시 실행', disabled: !canRedo, onSelect: () => stores.doc.getState().redo() },
          {
            label: '격자 보이기',
            checked: gridVisible,
            onSelect: () => stores.ui.getState().patch({ gridVisible: !stores.ui.getState().gridVisible }),
          },
          { label: '맞춤 보기', onSelect: () => fitToLayout(stores) },
        ]}
      />
      <LayoutNameField className="shell-name--mobile" />
      <button
        type="button"
        className="shell-icon-btn"
        aria-label="실행 취소"
        disabled={!canUndo}
        onClick={() => stores.doc.getState().undo()}
      >
        <UndoIcon size={22} />
      </button>
    </header>
  )
}
