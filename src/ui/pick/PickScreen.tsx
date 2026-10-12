// 텐트 고르기 화면(#/pick, 스펙 §4.7-1, 시안 01). 화면 자체가 세로 스크롤 영역입니다(html·body는 스크롤하지 않음).
// 상단 바: 로고 tentFit + 부제, 오른쪽 "내 배치"(배치가 1개 이상일 때만, 휴대폰은 아이콘 아래 글자), [취소](R3).
// 도움말 `?`는 두지 않습니다(D25). 목록은 TentPickerList.
import type { JSX } from 'react'
import type { TentCatalog } from '../../app/tentCatalog'
import type { TentPreset } from '../../core/model'
import { FolderIcon, LogoIcon } from '../shell/icons'
import { useIsDesktop } from '../shell/useIsDesktop'
import { TentPickerList } from './TentPickerList'
import './pick.css'

export const PICK_TITLE = '어떤 텐트로 시작할까요?'
export const PICK_SUBTITLE = '텐트를 고르면 바닥 평면이 만들어져요. 모든 데이터는 이 브라우저에만 저장됩니다.'
export const APP_TAGLINE = '텐트 배치 시뮬레이터'

export function PickScreen(p: {
  catalog: TentCatalog | null
  error?: string
  layoutCount: number
  showCancel: boolean
  onPick(preset: TentPreset): void
  onMake(): void
  onOpenMyLayouts(): void
  onCancel(): void
  /** 목록 오류의 [다시 시도](TentPickerList.onRetry로 넘김) */
  onRetry?(): void
}): JSX.Element {
  const desktop = useIsDesktop()
  return (
    <div className="tf-pick" data-testid="pick-screen" data-layout={desktop ? 'desktop' : 'mobile'}>
      <header className="tf-pick__bar">
        <div className="tf-pick__brand">
          <span className="tf-pick__logo">
            <LogoIcon size={22} />
            <span>tentFit</span>
          </span>
          <span className="tf-pick__tagline">{APP_TAGLINE}</span>
        </div>
        <div className="tf-pick__actions">
          {p.layoutCount >= 1 && (
            <button type="button" className="tf-pick__mine" onClick={p.onOpenMyLayouts}>
              <FolderIcon size={desktop ? 18 : 22} />
              <span>내 배치</span>
            </button>
          )}
          {p.showCancel && (
            <button type="button" className="tf-pick__cancel" onClick={p.onCancel}>
              취소
            </button>
          )}
        </div>
      </header>
      <main className="tf-pick__scroll">
        <div className="tf-pick__body">
          <h1 className="tf-pick__title">{PICK_TITLE}</h1>
          <p className="tf-pick__subtitle">{PICK_SUBTITLE}</p>
          <TentPickerList catalog={p.catalog} error={p.error} onPick={p.onPick} onMake={p.onMake} onRetry={p.onRetry} />
        </div>
      </main>
    </div>
  )
}
