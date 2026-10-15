// 격자 간격 칩(소유자 요청 2026-10-15): 캔버스 오른쪽 위 [격자 10cm]. 누르면 간격(1~1000cm) 입력과 빠른 선택.
// 휴대폰 편집 화면은 위쪽 가운데 요약 칩과 겹치므로 칩 없이 ☰ 메뉴「격자 간격」으로 같은 창을 엽니다(ui.gridPanelOpen).
// 가는 선 = 간격, 굵은 선 = 그 10배. 그리기·꼭짓점·물건 맞춤이 같은 간격을 씁니다(app/gridActions).
import type { JSX } from 'react'
import { GRID_STEP_PRESETS, setGridStep } from '../../app/gridActions'
import { useStores, useUi } from '../../app/stores'
import { GRID_STEP_RANGE } from '../../core/snap'
import { NumberField } from '../fields/NumberField'
import { BackdropControl } from './BackdropControl'
import '../panels/panels.css'
import './backdrop.css'

export function GridStepControl(p: { chip: boolean }): JSX.Element {
  const stores = useStores()
  const step = useUi((s) => s.gridStep)
  const open = useUi((s) => s.gridPanelOpen)
  const setOpen = (v: boolean) => stores.ui.getState().patch({ gridPanelOpen: v })
  return (
    <div className={p.chip ? 'tf-gridstep' : 'tf-gridstep tf-gridstep--nochip'}>
      {p.chip && (
        <button type="button" className="tf-backdrop__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {`격자 ${String(step)}cm`}
        </button>
      )}
      {open && (
        <div className="tf-backdrop__panel tf-gridstep__panel" role="group" aria-label="격자 간격 설정">
          <NumberField
            label="격자 간격"
            unit="cm"
            value={step}
            targetId="grid-step"
            min={GRID_STEP_RANGE[0]}
            max={GRID_STEP_RANGE[1]}
            onCommit={(_id, v) => setGridStep(stores, v)}
          />
          <div className="tf-gridstep__presets">
            {GRID_STEP_PRESETS.map((v) => (
              <button key={v} type="button" className="tf-btn" aria-pressed={v === step} onClick={() => setGridStep(stores, v)}>
                {`${String(v)}cm`}
              </button>
            ))}
          </div>
          <p className="tf-gridstep__hint">{`굵은 선은 ${String(step * 10)}cm마다`}</p>
          <button type="button" className="tf-btn" onClick={() => setOpen(false)}>
            닫기
          </button>
        </div>
      )}
    </div>
  )
}

/** 캔버스 오른쪽 위 묶음: [격자 ○cm] [배경 이미지]. gridChip=false면 격자 칩 없이 창만(휴대폰 편집 화면) */
export function CornerControls(p: { gridChip?: boolean }): JSX.Element {
  return (
    <div className="tf-corner" data-canvas-ui="">
      <GridStepControl chip={p.gridChip ?? true} />
      <BackdropControl />
    </div>
  )
}
