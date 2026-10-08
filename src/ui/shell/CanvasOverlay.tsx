// 캔버스 위 컨트롤(화면에만 있고 PNG에는 넣지 않음, 스펙 §4.1·§4.3·§4.6·§4.7-10).
// 모드 안내 칩(모바일은 3초 뒤 접힘), 축척 막대, PC 확대·축소·맞춤 버튼, 물건 0개 안내 카드.
// 스냅 상태 칩은 Plan 5, 안내 카드의 [텐트 바꾸기]는 Plan 4에서 더합니다.
// 아래쪽 컨트롤은 시트 높이(insets.bottom)만큼 올려서 시트에 가리지 않게 합니다.
import { useEffect, useState, type CSSProperties } from 'react'
import { useDoc, useStores, useUi } from '../../app/stores'
import { fitToLayout, zoomByStep, ZOOM_STEP } from '../../app/viewActions'
import type { Mode } from '../../store/ui'
import { ZOOM_MAX, ZOOM_MIN } from '../../view/viewport'
import { FitIcon, MinusIcon, PlusIcon, PlusSquareIcon, PointerIcon } from './icons'
import { scaleBar } from './scaleBar'
import './shell.css'

export const MODE_CHIP_TEXT: Readonly<Record<Mode, string>> = {
  place: '배치 모드 · 텐트는 잠겨 있어요',
  tent: '텐트 편집 · 물건은 잠겨 있어요',
}

/** 모바일 모드 안내 칩이 접히기까지(ms). 요약 칩을 가리지 않게 합니다(스펙 §4.3). */
export const MODE_CHIP_COLLAPSE_MS = 3000

export const EMPTY_TITLE = '아직 놓은 물건이 없어요'
export const EMPTY_BODY_DESKTOP = '왼쪽 라이브러리에서 물건을 골라 보세요'
export const EMPTY_BODY_MOBILE = '아래 [+물건]으로 매트나 의자를 놓아 보세요'

type Variant = 'desktop' | 'mobile'

function ModeChip(p: { text: string; collapsible: boolean }) {
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    if (!p.collapsible || collapsed) return
    const timer = window.setTimeout(() => setCollapsed(true), MODE_CHIP_COLLAPSE_MS)
    return () => window.clearTimeout(timer)
  }, [p.collapsible, collapsed])

  if (collapsed) {
    return (
      <button
        type="button"
        className="shell-modechip shell-modechip--mobile shell-modechip--collapsed"
        aria-label={p.text}
        onClick={() => setCollapsed(false)}
      >
        <PointerIcon size={16} />
      </button>
    )
  }
  return (
    <div className={p.collapsible ? 'shell-modechip shell-modechip--mobile' : 'shell-modechip'} role="status">
      <PointerIcon size={14} />
      <span>{p.text}</span>
    </div>
  )
}

function ScaleBarView(p: { zoom: number }) {
  const bar = scaleBar(p.zoom)
  return (
    <div className="shell-scalebar" data-testid="scale-bar" style={{ width: bar.widthPx }}>
      <div className="shell-scalebar__bar">
        <span className="shell-scalebar__seg" />
        <span className="shell-scalebar__seg" />
      </div>
      <div className="shell-scalebar__ticks">
        {bar.ticks.map((t) => (
          <span key={t.label} className="shell-scalebar__tick" style={{ left: t.px }}>
            {t.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function ZoomControls(p: { zoom: number }) {
  const stores = useStores()
  return (
    <div className="shell-zoom" role="group" aria-label="확대·축소">
      <button
        type="button"
        className="shell-zoom__btn"
        aria-label="확대"
        disabled={p.zoom >= ZOOM_MAX}
        onClick={() => zoomByStep(stores, ZOOM_STEP)}
      >
        <PlusIcon />
      </button>
      <button
        type="button"
        className="shell-zoom__btn"
        aria-label="축소"
        disabled={p.zoom <= ZOOM_MIN}
        onClick={() => zoomByStep(stores, 1 / ZOOM_STEP)}
      >
        <MinusIcon />
      </button>
      <button type="button" className="shell-zoom__btn" aria-label="맞춤 보기" onClick={() => fitToLayout(stores)}>
        <FitIcon />
      </button>
    </div>
  )
}

function EmptyCard(p: { variant: Variant }) {
  const stores = useStores()
  return (
    <div className="shell-empty" data-testid="empty-card">
      <span className="shell-empty__icon">
        <PlusSquareIcon size={22} />
      </span>
      <p className="shell-empty__title">{EMPTY_TITLE}</p>
      <p className="shell-empty__body">{p.variant === 'desktop' ? EMPTY_BODY_DESKTOP : EMPTY_BODY_MOBILE}</p>
      {p.variant === 'mobile' && (
        <button
          type="button"
          className="shell-empty__btn"
          onClick={() => stores.ui.getState().patch({ mobileSheet: 'library' })}
        >
          <PlusIcon size={18} />
          물건 추가
        </button>
      )}
    </div>
  )
}

export function CanvasOverlay(p: { variant: Variant }) {
  const mode = useUi((s) => s.mode)
  const measuring = useUi((s) => s.measuring)
  const zoom = useUi((s) => s.view.zoom)
  const insetTop = useUi((s) => s.insets.top)
  const insetBottom = useUi((s) => s.insets.bottom)
  const sheet = useUi((s) => s.mobileSheet)
  const itemCount = useDoc((s) => s.layout.items.length)

  const showEmpty =
    itemCount === 0 && mode === 'place' && !measuring && (p.variant === 'desktop' || sheet === 'none')
  const style = { '--overlay-top': `${insetTop}px`, '--overlay-bottom': `${insetBottom}px` } as CSSProperties

  return (
    <div className="shell-overlay" style={style} data-testid="canvas-overlay">
      <ModeChip key={mode} text={MODE_CHIP_TEXT[mode]} collapsible={p.variant === 'mobile'} />
      <ScaleBarView zoom={zoom} />
      {p.variant === 'desktop' && <ZoomControls zoom={zoom} />}
      {showEmpty && <EmptyCard variant={p.variant} />}
    </div>
  )
}
