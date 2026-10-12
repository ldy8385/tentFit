// 텐트 바꾸기(스펙 §4.7-8, O4, R9). 편집기 위 대화상자에 고르기 목록(TentPickerList)을 띄우고,
// 카드를 고르면 확인 없이 layout.tent만 바꿉니다(물건 좌표 그대로, 실행 취소 1칸 — swapTentAction).
// [직접 만들기]는 대화상자를 닫고 텐트 만들기 화면(mode 'swap', 확정 문구 '이 텐트로 바꾸기')을 엽니다.
// 만들기 화면의 history 항목(뒤로 가기로 닫기)은 TentMaker가 관리하고, 취소면 아무것도 바꾸지 않습니다.
// 여는 곳: ui.editorDialog = 'swapTent'(텐트 편집 패널·시트, 빈 캔버스 안내 카드). 측정 중이면 열지 않습니다.
// 캔버스 위 컨트롤 층(pointer-events 없음, z-index 4) 밖에 그리도록 document.body로 포털합니다.
import { useCallback, useEffect, useState, type JSX } from 'react'
import { createPortal } from 'react-dom'
import { useStores, useUi, type Stores } from '../../app/stores'
import { loadTentCatalog, type TentCatalog } from '../../app/tentCatalog'
import { swapTentAction, tentControlsEnabled } from '../../app/tentActions'
import type { Tent, TentPreset } from '../../core/model'
import { Dialog } from '../common/Dialog'
import { TentPickerList } from '../pick/TentPickerList'
import { TentMaker } from '../tentMaker/TentMaker'
import './swapTent.css'

export const SWAP_TENT_TITLE = '텐트 바꾸기'
export const SWAP_TENT_LOAD_ERROR = '텐트 목록을 불러오지 못했어요'

/** 텐트 바꾸기 대화상자를 엽니다. 측정 중(tentControlsEnabled false)이면 아무것도 하지 않습니다. */
export function openSwapTent(stores: Stores): void {
  if (!tentControlsEnabled(stores.ui.getState())) return
  stores.ui.getState().patch({ editorDialog: 'swapTent' })
}

type CatalogState = { catalog: TentCatalog | null; error?: string }

/** 대화상자가 처음 열릴 때 목록을 불러옵니다(같은 Promise 재사용은 loadTentCatalog 몫). retry로 다시 시도. */
function useCatalog(open: boolean): CatalogState & { retry(): void } {
  const [state, setState] = useState<CatalogState>({ catalog: null })
  const [attempt, setAttempt] = useState(0)
  const loaded = state.catalog !== null
  const failed = state.error !== undefined
  useEffect(() => {
    if (!open || loaded || failed) return
    let alive = true
    loadTentCatalog().then(
      (catalog) => {
        if (alive) setState({ catalog })
      },
      () => {
        if (alive) setState({ catalog: null, error: SWAP_TENT_LOAD_ERROR })
      },
    )
    return () => {
      alive = false
    }
  }, [open, loaded, failed, attempt])
  const retry = useCallback(() => {
    setState({ catalog: null })
    setAttempt((n) => n + 1)
  }, [])
  return { ...state, retry }
}

export function SwapTentDialog(): JSX.Element | null {
  const stores = useStores()
  const editorDialog = useUi((s) => s.editorDialog)
  const measuring = useUi((s) => s.measuring)
  const open = editorDialog === 'swapTent' && tentControlsEnabled({ measuring })
  const [making, setMaking] = useState(false)
  const { catalog, error, retry } = useCatalog(open)

  const close = useCallback(() => stores.ui.getState().patch({ editorDialog: null }), [stores])
  const pick = useCallback(
    (preset: TentPreset) => {
      swapTentAction(stores, preset.tent, preset.id)
      close()
    },
    [stores, close],
  )
  const make = useCallback(() => {
    close()
    setMaking(true)
  }, [close])
  const confirmMade = useCallback(
    (tent: Tent) => {
      setMaking(false)
      // 직접 만든 텐트는 프리셋이 아니므로 sourcePresetId 없이(지움) 바꿉니다.
      swapTentAction(stores, tent)
    },
    [stores],
  )
  const cancelMade = useCallback(() => setMaking(false), [])

  if (!open && !making) return null
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="tf-swap-host" data-editor-modal="" data-testid="swap-tent-host">
      <Dialog
        title={SWAP_TENT_TITLE}
        open={open}
        onClose={close}
        testId="swap-tent-dialog"
        footer={
          <button type="button" className="tf-swap__cancel" onClick={close}>
            취소
          </button>
        }
      >
        <TentPickerList catalog={catalog} error={error} onPick={pick} onMake={make} />
        {error !== undefined && (
          <button type="button" className="tf-swap__retry" onClick={retry}>
            다시 시도
          </button>
        )}
      </Dialog>
      {making && <TentMaker mode="swap" myTentNames={[]} onConfirm={confirmMade} onCancel={cancelMade} />}
    </div>,
    document.body,
  )
}
