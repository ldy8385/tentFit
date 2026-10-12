// 모바일 하단 툴바(스펙 §4.2, §4.4-3, D29). 시트가 열려도 늘 보입니다.
// 배치 모드: [+물건] [텐트] [선택]. 텐트 편집 모드: [+이너 ▾](예시·자유 그리기 메뉴, 위로 열림) [완료](가운데 [측정] 자리는 Plan 5, R13).
// 그리는 중(Plan 4.1): [점 되돌리기] [그리기 완료] [그리기 취소](DrawTools).
// 텐트 컨트롤([텐트]·[+이너]·[완료])은 tentControlsEnabled가 false(측정 중)면 비활성입니다.
import { useStores, useUi } from '../../app/stores'
import { enterTentMode, exitTentMode, tentControlsEnabled } from '../../app/tentActions'
import { DrawTools } from '../tent/DrawTools'
import { innerShapeMenu } from '../tent/shapeMenu'
import { CheckIcon, LogoIcon, PlusSquareIcon, PointerIcon } from './icons'
import { MenuButton } from './MenuButton'
import './shell.css'
import './modeShell.css'

function PlaceTools() {
  const stores = useStores()
  const sheet = useUi((s) => s.mobileSheet)
  const selectToggle = useUi((s) => s.selectToggle)
  const measuring = useUi((s) => s.measuring)
  const libraryOpen = sheet === 'library' || sheet === 'newShape'
  return (
    <>
      <button
        type="button"
        className="shell-tool"
        aria-label="+물건"
        aria-expanded={libraryOpen}
        onClick={() => stores.ui.getState().patch({ mobileSheet: libraryOpen ? 'none' : 'library' })}
      >
        <PlusSquareIcon size={22} />
        <span>물건</span>
      </button>
      <button
        type="button"
        className="shell-tool"
        disabled={!tentControlsEnabled({ measuring })}
        onClick={() => enterTentMode(stores)}
      >
        <LogoIcon size={22} />
        <span>텐트</span>
      </button>
      <button
        type="button"
        className="shell-tool"
        aria-pressed={selectToggle}
        onClick={() => stores.ui.getState().patch({ selectToggle: !stores.ui.getState().selectToggle })}
      >
        <PointerIcon size={22} />
        <span>선택</span>
      </button>
    </>
  )
}

function TentTools() {
  const stores = useStores()
  const measuring = useUi((s) => s.measuring)
  const drawing = useUi((s) => s.drawing !== null)
  const enabled = tentControlsEnabled({ measuring })
  if (drawing) return <DrawTools variant="toolbar" />
  return (
    <>
      <MenuButton
        label="+이너"
        text="이너"
        icon={<PlusSquareIcon size={22} />}
        align="left"
        placement="up"
        buttonClassName="shell-tool"
        disabled={!enabled}
        items={innerShapeMenu(stores)}
      />
      <button type="button" className="shell-tool" disabled={!enabled} onClick={() => exitTentMode(stores)}>
        <CheckIcon size={22} />
        <span>완료</span>
      </button>
    </>
  )
}

export function Toolbar() {
  const mode = useUi((s) => s.mode)
  return (
    <nav className="shell-toolbar" aria-label="도구" data-testid="toolbar" data-mode={mode}>
      {mode === 'tent' ? <TentTools /> : <PlaceTools />}
    </nav>
  )
}
