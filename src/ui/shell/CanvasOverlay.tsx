// 캔버스 위 컨트롤(화면에만 있고 PNG에는 넣지 않음, 스펙 §4.1·§4.3·§4.6·§4.7-10).
// 모드 안내 칩(모바일은 3초 뒤 접힘), 축척 막대, PC 확대·축소·맞춤 버튼, 물건 0개 안내 카드, 토스트(「빈 공간이 부족해요」 등),
// 텐트 바꾸기 대화상자·만들기 오버레이 자리(SwapTentDialog, body로 포털), PC 그리기 막대(Plan 4.1). 스냅 상태 칩은 Plan 5.
// 축척 막대·확대 버튼·토스트는 만들기 화면도 씁니다(export).
// 안내 카드의 [텐트 바꾸기]는 물건 0개·배치 모드·측정 아님에서만 보입니다(§4.7-8 예외, §4.7-10).
// 아래쪽 컨트롤은 시트 높이(insets.bottom)만큼 올려서 시트에 가리지 않게 합니다.
// 휴대폰 안내 카드는 가운데가 아니라 아래쪽(겹치면 위쪽)에 붙여 텐트를 가리지 않게 합니다(emptyCardPlacement).
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useDoc, useStores, useUi } from '../../app/stores'
import { fitToLayout, zoomByStep, ZOOM_STEP } from '../../app/viewActions'
import type { Mode } from '../../store/ui'
import { ZOOM_MAX, ZOOM_MIN } from '../../view/viewport'
import { ToastView } from '../common/Toast'
import { DrawTools } from '../tent/DrawTools'
import { openSwapTent, SwapTentDialog } from '../tent/SwapTentDialog'
import { MeasurePanel } from '../area/MeasurePanel'
import { BackdropControl } from './BackdropControl'
import { ItemMakerHost } from './ItemMakerHost'
import { emptyCardPlacement, tentScreenBox } from './emptyCardPlacement'
import { FitIcon, MinusIcon, PlusIcon, PlusSquareIcon, PointerIcon } from './icons'
import { scaleBar } from './scaleBar'
import './shell.css'
import './modeShell.css'

export const MODE_CHIP_TEXT: Readonly<Record<Mode, string>> = {
  place: '배치 모드 · 텐트는 잠겨 있어요',
  tent: '텐트 편집 · 물건은 잠겨 있어요',
}

/** 거리 재기 중 안내 칩(§4.3) */
export const MEASURE_CHIP_TEXT = {
  desktop: '측정 중 · 대상 두 개를 누르면 최단 거리가 나와요 · Esc로 끝내기',
  mobile: '측정 중 · 대상 두 개를 탭하세요',
} as const

/** 모바일 모드 안내 칩이 접히기까지(ms). 요약 칩을 가리지 않게 합니다(스펙 §4.3). */
export const MODE_CHIP_COLLAPSE_MS = 3000

export const EMPTY_TITLE = '아직 놓은 물건이 없어요'
/** 스펙 §4.7-10은 「라이브러리에서 누르거나 끌어다 놓으면 추가돼요」. 라이브러리 끌어다 놓기가 아직 없어 앞부분만 씁니다. */
export const EMPTY_BODY_DESKTOP = '라이브러리에서 누르면 추가돼요'
export const EMPTY_BODY_MOBILE = '아래 [+물건]으로 매트나 의자를 놓아 보세요'
/** 빈 안내 카드의 텐트 바꾸기 버튼(§4.7-10) */
export const SWAP_TENT_BUTTON = '텐트 바꾸기'

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

export function ScaleBarView(p: { zoom: number }) {
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

export function ZoomControls(p: { zoom: number }) {
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

/** 휴대폰 카드의 인라인 위치(top 또는 bottom, 폭). 보기·시트 높이·텐트가 바뀔 때마다 다시 정합니다. */
function useDockedStyle(): CSSProperties {
  const view = useUi((s) => s.view)
  const size = useUi((s) => s.size)
  const insets = useUi((s) => s.insets)
  const tent = useDoc((s) => s.layout.tent)
  return useMemo(() => {
    const placement = emptyCardPlacement({ width: size.width, height: size.height, insets }, tentScreenBox(tent, view))
    return placement.anchor === 'bottom'
      ? { bottom: placement.offsetPx, width: placement.widthPx }
      : { top: placement.offsetPx, width: placement.widthPx }
  }, [view, size, insets, tent])
}

function EmptyCard(p: { variant: Variant }) {
  const stores = useStores()
  const dockedStyle = useDockedStyle()
  if (p.variant === 'desktop') {
    return (
      <div className="shell-empty" data-testid="empty-card">
        <span className="shell-empty__icon">
          <PlusSquareIcon size={22} />
        </span>
        <p className="shell-empty__title">{EMPTY_TITLE}</p>
        <p className="shell-empty__body">{EMPTY_BODY_DESKTOP}</p>
        <div className="shell-empty__actions">
          <button type="button" className="shell-empty__btn shell-empty__btn--secondary" onClick={() => openSwapTent(stores)}>
            {SWAP_TENT_BUTTON}
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="shell-empty shell-empty--docked" data-testid="empty-card" style={dockedStyle}>
      <p className="shell-empty__title">{EMPTY_TITLE}</p>
      <p className="shell-empty__body">{EMPTY_BODY_MOBILE}</p>
      <div className="shell-empty__actions">
        <button
          type="button"
          className="shell-empty__btn"
          onClick={() => stores.ui.getState().patch({ mobileSheet: 'library' })}
        >
          <PlusIcon size={18} />
          물건 추가
        </button>
        <button type="button" className="shell-empty__btn shell-empty__btn--secondary" onClick={() => openSwapTent(stores)}>
          {SWAP_TENT_BUTTON}
        </button>
      </div>
    </div>
  )
}

/** ui.toast를 그립니다. 2500ms 뒤 ToastView가 dismissToast(id)를 부릅니다(그사이 새 토스트면 그 id는 무시). */
export function ToastHost() {
  const stores = useStores()
  const toast = useUi((s) => s.toast)
  const onDismiss = useCallback((id: number) => stores.ui.getState().dismissToast(id), [stores])
  return <ToastView toast={toast} onDismiss={onDismiss} />
}

export function CanvasOverlay(p: { variant: Variant }) {
  const mode = useUi((s) => s.mode)
  const measuring = useUi((s) => s.measuring)
  const zoom = useUi((s) => s.view.zoom)
  const insetTop = useUi((s) => s.insets.top)
  const insetBottom = useUi((s) => s.insets.bottom)
  const sheet = useUi((s) => s.mobileSheet)
  const itemCount = useDoc((s) => s.layout.items.length)
  const drawing = useUi((s) => s.drawing !== null)

  const showEmpty =
    itemCount === 0 && mode === 'place' && !measuring && (p.variant === 'desktop' || sheet === 'none')
  const style = { '--overlay-top': `${insetTop}px`, '--overlay-bottom': `${insetBottom}px` } as CSSProperties

  return (
    <div className="shell-overlay" style={style} data-testid="canvas-overlay">
      {/* PC 그리는 중에는 그리기 막대가 모드 안내를 대신합니다(좁은 캔버스에서 겹치지 않게, 최종 리뷰). */}
      {!(p.variant === 'desktop' && drawing) && (
        <ModeChip
          key={measuring ? 'measure' : mode}
          text={measuring ? (p.variant === 'mobile' ? MEASURE_CHIP_TEXT.mobile : MEASURE_CHIP_TEXT.desktop) : MODE_CHIP_TEXT[mode]}
          collapsible={p.variant === 'mobile'}
        />
      )}
      <ScaleBarView zoom={zoom} />
      <BackdropControl />
      {p.variant === 'desktop' && <ZoomControls zoom={zoom} />}
      {/* 그리는 중 PC 그리기 막대(휴대폰은 툴바가 같은 버튼, Plan 4.1) */}
      {p.variant === 'desktop' && drawing && <DrawTools variant="bar" />}
      {showEmpty && <EmptyCard variant={p.variant} />}
      {p.variant === 'mobile' && measuring && <MeasurePanel variant="bar" />}
      <div className="shell-toast">
        <ToastHost />
      </div>
      <SwapTentDialog />
      <ItemMakerHost />
    </div>
  )
}
