// PC 상단 바(스펙 §4.1): 로고, 배치 이름, 실행 취소·다시 실행, [보기] 메뉴(격자 보이기, 맞춤 보기).
// 굵은 포인터 기기에서만 [선택] 토글을 더합니다. 모드 토글·[측정]·[파일]·스냅 항목은 Plan 4·5·7에서 붙입니다.
import { useDoc, useStores, useUi } from '../../app/stores'
import { fitToLayout } from '../../app/viewActions'
import { LogoIcon, PointerIcon, RedoIcon, UndoIcon } from './icons'
import { LayoutNameField } from './LayoutNameField'
import { MenuButton } from './MenuButton'
import { useCoarsePointer } from './useIsDesktop'
import './shell.css'

export function TopBar() {
  const stores = useStores()
  const canUndo = useDoc((s) => s.canUndo)
  const canRedo = useDoc((s) => s.canRedo)
  const gridVisible = useUi((s) => s.gridVisible)
  const selectToggle = useUi((s) => s.selectToggle)
  const coarse = useCoarsePointer()

  return (
    <header className="shell-topbar" data-testid="top-bar">
      <div className="shell-logo">
        <LogoIcon size={22} />
        <span>tentFit</span>
      </div>
      <LayoutNameField className="shell-name--desktop" />
      <div className="shell-spacer" />
      {coarse && (
        <button
          type="button"
          className="shell-btn"
          aria-pressed={selectToggle}
          onClick={() => stores.ui.getState().patch({ selectToggle: !stores.ui.getState().selectToggle })}
        >
          <PointerIcon size={18} />
          <span>선택</span>
        </button>
      )}
      <button
        type="button"
        className="shell-icon-btn"
        aria-label="실행 취소"
        title="실행 취소 (Ctrl/⌘+Z)"
        disabled={!canUndo}
        onClick={() => stores.doc.getState().undo()}
      >
        <UndoIcon />
      </button>
      <button
        type="button"
        className="shell-icon-btn"
        aria-label="다시 실행"
        title="다시 실행 (Ctrl/⌘+Shift+Z)"
        disabled={!canRedo}
        onClick={() => stores.doc.getState().redo()}
      >
        <RedoIcon />
      </button>
      <MenuButton
        label="보기"
        showLabel
        items={[
          {
            label: '격자 보이기',
            checked: gridVisible,
            onSelect: () => stores.ui.getState().patch({ gridVisible: !stores.ui.getState().gridVisible }),
          },
          { label: '맞춤 보기', onSelect: () => fitToLayout(stores) },
        ]}
      />
    </header>
  )
}
