// [PNG로 저장](스펙 §11, 2026-10-15): 지금 배치를 그림으로 만들어 미리 보고 내려받거나(휴대폰은) 공유합니다. ui.editorDialog === 'png'.
import { useEffect, useState, type JSX } from 'react'
import { measurementRows } from '../../app/measureActions'
import { useDoc, useStores, useUi } from '../../app/stores'
import { computeStats } from '../../core/stats'
import { renderLayoutPng } from '../../view/exportPng'
import { Dialog } from '../common/Dialog'
import '../panels/panels.css'

export const PNG_TITLE = '배치 그림 저장'

function fileName(name: string, now: Date): string {
  const safe = name.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '') || '배치'
  const d = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  return `tentfit-${safe}-${d}.png`
}

export function PngDialog(): JSX.Element | null {
  const stores = useStores()
  const open = useUi((s) => s.editorDialog === 'png')
  if (!open) return null
  return <PngDialogBody onClose={() => stores.ui.getState().patch({ editorDialog: null })} />
}

function PngDialogBody(p: { onClose(): void }): JSX.Element {
  const layout = useDoc((s) => s.layout)
  const measuring = useUi((s) => s.measuring)
  const measurements = useUi((s) => s.measurements)
  const [png, setPng] = useState<{ url: string; file: File } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    let url: string | null = null
    const now = new Date()
    renderLayoutPng(layout, computeStats(layout), { measurements: measuring ? measurementRows(layout, measurements) : [], now }).then(
      (blob) => {
        if (!alive) return
        url = URL.createObjectURL(blob)
        setPng({ url, file: new File([blob], fileName(layout.name, now), { type: 'image/png' }) })
      },
      () => alive && setError('그림을 만들지 못했어요'),
    )
    return () => {
      alive = false
      if (url !== null) URL.revokeObjectURL(url)
    }
    // 열 때의 배치로 한 번만 만듭니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const canShare = png !== null && typeof navigator.canShare === 'function' && navigator.canShare({ files: [png.file] })
  const share = async () => {
    if (png === null) return
    try {
      await navigator.share({ files: [png.file], title: layout.name })
    } catch {
      // 취소(AbortError)·거부는 무시합니다. 내려받기 버튼이 있습니다.
    }
  }

  return (
    <Dialog
      title={PNG_TITLE}
      open
      onClose={p.onClose}
      testId="png-dialog"
      footer={
        <>
          {canShare && (
            <button type="button" className="tf-btn" onClick={() => void share()}>
              공유
            </button>
          )}
          {png !== null && (
            <a className="tf-btn tf-btn--primary tf-png__download" href={png.url} download={png.file.name}>
              내려받기
            </a>
          )}
        </>
      }
    >
      {error !== null ? (
        <p role="alert">{error}</p>
      ) : png === null ? (
        <p role="status">그림을 만드는 중…</p>
      ) : (
        <img className="tf-png__preview" src={png.url} alt="배치 그림 미리보기" />
      )}
    </Dialog>
  )
}
