// 모바일 상단 바(스펙 §4.2): ☰ 메뉴(다시 실행, 격자 보이기, 맞춤 보기), 배치 이름, 실행 취소.
// 메뉴의 파일 항목·스냅 켜기·설치 안내는 Plan 5·7·8에서 붙입니다.
import { endMeasuring, startMeasuring } from '../../app/measureActions'
import { useDoc, useStores, useUi } from '../../app/stores'
import { downloadBackup, pickAndImport } from '../../app/persist/files'
import { fitToLayout } from '../../app/viewActions'
import { MenuIcon, UndoIcon } from './icons'
import { LayoutNameField } from './LayoutNameField'
import { MenuButton } from './MenuButton'
import './shell.css'

export function MobileTopBar() {
  const stores = useStores()
  // 그리는 중에는 문서 실행 취소·다시 실행을 끕니다(판단 Q5).
  const drawing = useUi((s) => s.drawing !== null)
  const canUndo = useDoc((s) => s.canUndo) && !drawing
  const canRedo = useDoc((s) => s.canRedo) && !drawing
  const gridVisible = useUi((s) => s.gridVisible)
  const snapEnabled = useUi((s) => s.snapEnabled)
  const measuring = useUi((s) => s.measuring)

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
          {
            label: '자석 맞춤',
            checked: snapEnabled,
            onSelect: () => stores.ui.getState().patch({ snapEnabled: !stores.ui.getState().snapEnabled }),
          },
          { label: '맞춤 보기', onSelect: () => fitToLayout(stores) },
          { label: measuring ? '거리 재기 끝내기' : '거리 재기', onSelect: () => (measuring ? endMeasuring(stores) : startMeasuring(stores)) },
          { label: '전체 백업(파일로 내려받기)', onSelect: () => downloadBackup() },
          { label: '파일 불러오기', onSelect: () => pickAndImport(stores) },
          { label: 'PNG로 저장', onSelect: () => stores.ui.getState().patch({ editorDialog: 'png' }) },
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
