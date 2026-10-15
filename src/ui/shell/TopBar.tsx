// PC 상단 바(스펙 §4.1): 로고, 배치 이름, 모드 토글(배치│텐트 편집), 실행 취소·다시 실행, [보기] 메뉴(격자 보이기, 맞춤 보기).
// 굵은 포인터 기기에서만 [선택] 토글을 더합니다. [측정]·[파일]·스냅 항목은 Plan 5·7에서 붙입니다.
import { endMeasuring, startMeasuring } from '../../app/measureActions'
import { setGuidesVisible } from '../../app/gridActions'
import { goHome } from '../../app/PickRoute'
import { useDoc, useStores, useUi } from '../../app/stores'
import { downloadBackup, pickAndImport } from '../../app/persist/files'
import { enterTentMode, exitTentMode, tentControlsEnabled } from '../../app/tentActions'
import { fitToLayout } from '../../app/viewActions'
import type { Mode } from '../../store/ui'
import { SegmentedControl } from '../common/SegmentedControl'
import { LogoIcon, PointerIcon, RedoIcon, UndoIcon } from './icons'
import { LayoutNameField } from './LayoutNameField'
import { MenuButton } from './MenuButton'
import { useCoarsePointer } from './useIsDesktop'
import './shell.css'
import './modeShell.css'

/** 모드 토글 항목(스펙 §4.1 순서: 배치 → 텐트 편집) */
export const MODE_OPTIONS: readonly { value: Mode; label: string }[] = [
  { value: 'place', label: '배치' },
  { value: 'tent', label: '텐트 편집' },
]

/** 모드 토글의 이름(radiogroup aria-label) */
export const MODE_TOGGLE_LABEL = '편집 모드'

export function TopBar() {
  const stores = useStores()
  // 그리는 중에는 문서 실행 취소·다시 실행을 끕니다(점 되돌리기는 그리기 버튼·Ctrl/⌘+Z, 판단 Q5).
  const drawing = useUi((s) => s.drawing !== null)
  const canUndo = useDoc((s) => s.canUndo) && !drawing
  const canRedo = useDoc((s) => s.canRedo) && !drawing
  const gridVisible = useUi((s) => s.gridVisible)
  const snapEnabled = useUi((s) => s.snapEnabled)
  const guidesVisible = useUi((s) => s.guidesVisible)
  const selectToggle = useUi((s) => s.selectToggle)
  const mode = useUi((s) => s.mode)
  const measuring = useUi((s) => s.measuring)
  const coarse = useCoarsePointer()
  const enabled = tentControlsEnabled({ measuring })

  return (
    <header className="shell-topbar" data-testid="top-bar">
      <button
        type="button"
        className="shell-logo"
        aria-label="처음 화면으로"
        title="처음 화면(텐트 고르기)으로"
        onClick={() => goHome(stores.doc.getState().layout.id)}
      >
        <LogoIcon size={22} />
        <span>tentFit</span>
      </button>
      <LayoutNameField className="shell-name--desktop" />
      <div className="shell-spacer" />
      <div className="shell-modetoggle" data-testid="mode-toggle">
        <SegmentedControl
          label={MODE_TOGGLE_LABEL}
          options={MODE_OPTIONS}
          value={mode}
          disabled={!enabled}
          onChange={(next) => (next === 'tent' ? enterTentMode(stores) : exitTentMode(stores))}
        />
      </div>
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
        className="shell-btn"
        aria-pressed={measuring}
        title="거리 재기 (Esc로 끝내기)"
        onClick={() => (measuring ? endMeasuring(stores) : startMeasuring(stores))}
      >
        <span>측정</span>
      </button>
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
        label="파일"
        showLabel
        items={[
          { label: '전체 백업(파일로 내려받기)', onSelect: () => downloadBackup() },
          { label: '파일 불러오기', onSelect: () => pickAndImport(stores) },
          { label: 'PNG로 저장', onSelect: () => stores.ui.getState().patch({ editorDialog: 'png' }) },
        ]}
      />
      <MenuButton
        label="보기"
        showLabel
        items={[
          {
            label: '격자 보이기',
            checked: gridVisible,
            onSelect: () => stores.ui.getState().patch({ gridVisible: !stores.ui.getState().gridVisible }),
          },
          {
            label: '자석 맞춤(Alt로 잠깐 반대)',
            checked: snapEnabled,
            onSelect: () => stores.ui.getState().patch({ snapEnabled: !stores.ui.getState().snapEnabled }),
          },
          { label: '정렬 안내선', checked: guidesVisible, onSelect: () => setGuidesVisible(stores, !stores.ui.getState().guidesVisible) },
          { label: '맞춤 보기', onSelect: () => fitToLayout(stores) },
        ]}
      />
    </header>
  )
}
