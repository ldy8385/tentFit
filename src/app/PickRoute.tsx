// 텐트 고르기 라우트(#/pick, 스펙 §4.7-1·R2·R3).
// - 텐트 목록은 loadTentCatalog()(동적 import 청크, §5.4)로 불러오고, 실패하면 오류 문구와 [다시 시도].
// - 카드를 고르면 확인 없이 새 배치를 만들어 편집기 주소로 push합니다(편집기에서 뒤로 가면 다시 여기, §4.7).
// - "내 배치"는 메모리 배치 최소 목록(R2). [+ 새 배치]를 누르면 대화상자만 닫고 이 화면에 [취소]를 보이며(R3),
//   [취소]는 그 전에 열려 있던 배치로 돌아갑니다.
// - [직접 만들기] → 텐트 만들기 오버레이(mode 'start', 내 텐트 비교 없음 R1). 확정 → 새 배치(sourcePresetId 없음) → 편집기 push(배치 모드).
//   오버레이의 history 항목은 TentMaker가 지운 뒤 onConfirm을 부르므로, 편집기에서 뒤로 가면 바로 고르기 화면입니다.
import { useEffect, useRef, useState, type JSX } from 'react'
import type { Tent, TentPreset } from '../core/model'
import { TentMaker } from '../ui/tentMaker/TentMaker'
import { MyLayoutsDialog } from '../ui/pick/MyLayoutsDialog'
import { PickScreen } from '../ui/pick/PickScreen'
import { createLayoutFromTent, deleteLayout, getLastLayoutId, getLayout, layoutCount, listLayoutSummaries } from './layoutRepo'
import { editHash } from './router'
import { loadTentCatalog, type TentCatalog } from './tentCatalog'

export const CATALOG_ERROR_TEXT = '텐트 목록을 불러오지 못했어요'

/**
 * [취소]로 돌아갈 배치(R3). 모듈 상태라서 고르기 화면 밖(Plan 7의 편집기 "새 배치")에서도 넣을 수 있습니다.
 * [+ 새 배치]를 누를 때 넣고, 배치를 열거나(카드·목록 행) [취소]하면 비웁니다.
 */
let pickReturn: { layoutId: string } | null = null

export function getPickReturn(): { layoutId: string } | null {
  return pickReturn
}

/** 테스트용 */
export function clearPickReturn(): void {
  pickReturn = null
}

export function setPickReturn(layoutId: string | null): void {
  pickReturn = layoutId === null ? null : { layoutId }
}

/** [+ 새 배치] 때 돌아갈 배치: 마지막으로 연 배치, 보관소에 없으면 가장 최근 수정 배치 */
function currentLayoutId(): string | null {
  const last = getLastLayoutId()
  if (last !== null && getLayout(last) !== undefined) return last
  return listLayoutSummaries()[0]?.id ?? null
}

/** 편집기로 push(location.hash 대입). 돌아갈 배치 표시는 비웁니다. */
function openEditor(layoutId: string): void {
  pickReturn = null
  window.location.hash = editHash(layoutId)
}

export function PickRoute(): JSX.Element {
  const [catalog, setCatalog] = useState<TentCatalog | null>(null)
  const [error, setError] = useState<string | undefined>(undefined)
  const [attempt, setAttempt] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [returnTo, setReturnTo] = useState(() => pickReturn)
  // 같은 화면에서 두 번 눌러도(빠른 두 번 탭) 배치를 하나만 만들고 한 번만 옮겨 갑니다.
  const leaving = useRef(false)
  const [making, setMaking] = useState(false)
  // 배치를 지우면 목록·[내 배치] 버튼을 다시 그리려고 셉니다.
  const [, setRemoved] = useState(0)

  useEffect(() => {
    let alive = true
    loadTentCatalog().then(
      (c) => {
        if (alive) setCatalog(c)
      },
      () => {
        if (alive) setError(CATALOG_ERROR_TEXT)
      },
    )
    return () => {
      alive = false
    }
  }, [attempt])

  const leaveTo = (layoutId: string) => {
    if (leaving.current) return
    leaving.current = true
    setDialogOpen(false)
    openEditor(layoutId)
  }

  const pick = (preset: TentPreset) => {
    if (leaving.current) return
    const layout = createLayoutFromTent(preset.tent, { sourcePresetId: preset.id })
    leaveTo(layout.id)
  }

  const startWithTent = (tent: Tent) => {
    setMaking(false)
    if (leaving.current) return
    const layout = createLayoutFromTent(tent)
    leaveTo(layout.id)
  }

  const retry = () => {
    setError(undefined)
    setAttempt((a) => a + 1)
  }

  const startNew = () => {
    setPickReturn(currentLayoutId())
    setReturnTo(pickReturn)
    setDialogOpen(false)
  }

  const cancel = () => {
    const target = pickReturn ?? returnTo
    if (target === null) return
    leaveTo(target.layoutId)
  }

  return (
    <>
      <PickScreen
        catalog={catalog}
        error={error}
        layoutCount={layoutCount()}
        showCancel={returnTo !== null}
        onPick={pick}
        onMake={() => setMaking(true)}
        onOpenMyLayouts={() => setDialogOpen(true)}
        onCancel={cancel}
        onRetry={retry}
      />
      <MyLayoutsDialog
        open={dialogOpen}
        summaries={dialogOpen ? listLayoutSummaries() : []}
        onOpen={leaveTo}
        onNew={startNew}
        onClose={() => setDialogOpen(false)}
        onDelete={(id) => {
          void deleteLayout(id).then(() => {
            if (pickReturn?.layoutId === id) pickReturn = null
            if (returnTo?.layoutId === id) setReturnTo(null)
            setRemoved((n) => n + 1)
          })
        }}
      />
      {making && <TentMaker mode="start" myTentNames={[]} onConfirm={startWithTent} onCancel={() => setMaking(false)} />}
    </>
  )
}
