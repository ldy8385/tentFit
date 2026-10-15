// 격자 간격 칩(소유자 요청 2026-10-15): 캔버스 오른쪽 위 [격자 10cm]. 누르면 간격(1~1000cm) 입력과 빠른 선택.
// 가는 선 = 간격, 굵은 선 = 그 10배. 그리기·꼭짓점·물건 맞춤이 같은 간격을 씁니다(app/gridActions).
import { useState, type JSX } from 'react'
import { GRID_STEP_PRESETS, setGridStep } from '../../app/gridActions'
import { useStores, useUi } from '../../app/stores'
import { GRID_STEP_RANGE } from '../../core/snap'
import { NumberField } from '../fields/NumberField'
import { BackdropControl } from './BackdropControl'
import '../panels/panels.css'
import './backdrop.css'

export function GridStepControl(): JSX.Element {
  const stores = useStores()
  const step = useUi((s) => s.gridStep)
  const [open, setOpen] = useState(false)
  return (
    <div className="tf-gridstep">
      <button type="button" className="tf-backdrop__toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {`격자 ${String(step)}cm`}
      </button>
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
        </div>
      )}
    </div>
  )
}

/** 캔버스 오른쪽 위 묶음: [격자 ○cm] [배경 이미지] */
export function CornerControls(): JSX.Element {
  return (
    <div className="tf-corner" data-canvas-ui="">
      <GridStepControl />
      <BackdropControl />
    </div>
  )
}
