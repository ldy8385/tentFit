// 모바일 하단 툴바(스펙 §4.2, D29). 시트가 열려도 늘 보입니다. [텐트]·[측정]은 Plan 4·5에서 더합니다.
import { useStores, useUi } from '../../app/stores'
import { PlusSquareIcon, PointerIcon } from './icons'
import './shell.css'

export function Toolbar() {
  const stores = useStores()
  const sheet = useUi((s) => s.mobileSheet)
  const selectToggle = useUi((s) => s.selectToggle)
  const libraryOpen = sheet === 'library' || sheet === 'newShape'

  return (
    <nav className="shell-toolbar" aria-label="도구" data-testid="toolbar">
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
        aria-pressed={selectToggle}
        onClick={() => stores.ui.getState().patch({ selectToggle: !stores.ui.getState().selectToggle })}
      >
        <PointerIcon size={22} />
        <span>선택</span>
      </button>
    </nav>
  )
}
