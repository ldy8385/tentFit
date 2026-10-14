// 배경 이미지 컨트롤(소유자 요청 2026-10-14): 캔버스 오른쪽 위 [배경 이미지]. 없으면 파일 고르기, 있으면 투명도·크기·맞추기·바꾸기·빼기.
// 맞추기 중에는 위쪽 띠에 안내와 [완료]. 문서 동작이 아니라 화면 상태만 바꿉니다(app/backdropActions).
import { useRef, useState, type JSX } from 'react'
import {
  placeBackdropFile,
  removeBackdrop,
  setBackdropAdjusting,
  setBackdropOpacity,
  setBackdropWidth,
} from '../../app/backdropActions'
import { useStores, useUi } from '../../app/stores'
import { LIMITS, round1 } from '../../core/model'
import { NumberField } from '../fields/NumberField'
import '../panels/panels.css'
import './backdrop.css'

export const BACKDROP_LABEL = '배경 이미지'
export const ADJUST_HINT = '끌어서 옮기고, 휠·두 손가락으로 크기를 맞추세요'

export function BackdropControl(): JSX.Element {
  const stores = useStores()
  const bd = useUi((s) => s.backdrop)
  const [open, setOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const pick = () => fileRef.current?.click()

  return (
    <div className="tf-backdrop" data-canvas-ui="">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        data-testid="backdrop-file"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f !== undefined) {
            placeBackdropFile(stores, f)
            setOpen(true)
          }
          e.target.value = ''
        }}
      />
      <button
        type="button"
        className="tf-backdrop__toggle"
        aria-expanded={bd === null ? undefined : open}
        onClick={() => (bd === null ? pick() : setOpen((o) => !o))}
      >
        {BACKDROP_LABEL}
      </button>
      {bd !== null && open && (
        <div className="tf-backdrop__panel" role="group" aria-label={`${BACKDROP_LABEL} 설정`}>
          <label className="tf-backdrop__row">
            <span>투명도</span>
            <input
              type="range"
              min={5}
              max={100}
              step={5}
              value={Math.round(bd.opacity * 100)}
              aria-label="투명도"
              onChange={(e) => setBackdropOpacity(stores, Number(e.target.value) / 100)}
            />
          </label>
          <NumberField
            label="이미지 가로"
            unit="cm"
            value={round1(bd.w)}
            targetId="backdrop"
            min={LIMITS.length[0]}
            max={LIMITS.length[1]}
            onCommit={(_id, w) => setBackdropWidth(stores, w)}
          />
          <button type="button" className="tf-btn" aria-pressed={bd.adjusting} onClick={() => setBackdropAdjusting(stores, !bd.adjusting)}>
            위치·크기 맞추기
          </button>
          <div className="tf-row2">
            <button type="button" className="tf-btn" onClick={pick}>
              다른 이미지
            </button>
            <button type="button" className="tf-btn tf-btn--danger" onClick={() => removeBackdrop(stores)}>
              빼기
            </button>
          </div>
        </div>
      )}
      {bd?.adjusting === true && (
        <div className="tf-backdrop__banner" role="status">
          <span>{ADJUST_HINT}</span>
          <button type="button" className="tf-btn tf-btn--primary" onClick={() => setBackdropAdjusting(stores, false)}>
            완료
          </button>
        </div>
      )}
    </div>
  )
}
