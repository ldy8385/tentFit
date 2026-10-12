// 텐트 고르기 목록(스펙 §4.7-1): 맨 앞 [직접 만들기] 카드, 일반 예시·브랜드 구역(소제목 + 안내 문구) 아래 프리셋 카드.
// 고르기 화면(PickScreen)과 텐트 바꾸기 대화상자(Task 11)가 같이 씁니다. 카드를 누르면 확인 없이 onPick(§4.7-1).
// 미니 평면도는 core thumbnailSvg 문자열이고, 목록 안 모든 카드가 같은 축척(extentCm = 목록 최대 외곽 변)입니다.
// PC는 4열 카드, 휴대폰은 1열(직접 만들기는 행 카드)이고 오른쪽 끝에 ›를 둡니다.
import { useId, useMemo, type JSX } from 'react'
import type { TentCatalog } from '../../app/tentCatalog'
import type { TentPreset } from '../../core/model'
import { thumbnailSvg } from '../../core/thumbnail'
import { ChevronRightIcon, PlusIcon } from '../shell/icons'
import { useIsDesktop } from '../shell/useIsDesktop'
import { commonExtentCm, outerSizeText, sectionsOf } from './pickSections'
import './pick.css'

export { outerSizeText, sectionsOf, type PickSection } from './pickSections'

export const MAKE_CARD_TITLE = '직접 만들기'
export const MAKE_CARD_SUBTITLE = '사각·사다리꼴·정N각·원·자유 다각형'
export const CATALOG_LOADING_TEXT = '텐트 목록을 불러오는 중…'

/** 카드 썸네일 SVG의 기본 크기(px). 실제 크기는 CSS가 칸에 맞춥니다(viewBox가 정사각형이라 가운데 정렬). */
const THUMB_PX = 160

function MakeCard(p: { onMake(): void; desktop: boolean }): JSX.Element {
  return (
    <button type="button" className="tf-makecard" data-testid="make-tent-card" onClick={p.onMake}>
      <span className="tf-makecard__plus" aria-hidden="true">
        <PlusIcon size={p.desktop ? 26 : 22} />
      </span>
      <span className="tf-makecard__text">
        <span className="tf-makecard__title">{MAKE_CARD_TITLE}</span>
        <span className="tf-makecard__sub">{MAKE_CARD_SUBTITLE}</span>
      </span>
      {!p.desktop && (
        <span className="tf-makecard__chevron" aria-hidden="true">
          <ChevronRightIcon size={18} />
        </span>
      )}
    </button>
  )
}

function PresetCard(p: { preset: TentPreset; extentCm: number; desktop: boolean; onPick(preset: TentPreset): void }): JSX.Element {
  const nameId = useId()
  const metaId = useId()
  const { preset, extentCm } = p
  const svg = useMemo(
    () => thumbnailSvg({ tent: preset.tent }, { size: THUMB_PX, extentCm: extentCm > 0 ? extentCm : undefined }),
    [preset.tent, extentCm],
  )
  return (
    <button
      type="button"
      className="tf-tentcard"
      data-preset-id={preset.id}
      aria-labelledby={nameId}
      aria-describedby={metaId}
      onClick={() => p.onPick(preset)}
    >
      <span className="tf-tentcard__thumb" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />
      <span className="tf-tentcard__info">
        <span className="tf-tentcard__text">
          <span id={nameId} className="tf-tentcard__name">
            {preset.tent.name}
          </span>
          <span id={metaId} className="tf-tentcard__meta">
            {preset.brand !== undefined && (
              <>
                <span className="tf-tentcard__brand">{preset.brand}</span>
                <span className="tf-tentcard__dot" aria-hidden="true" />
              </>
            )}
            <span className="tf-tentcard__size">{outerSizeText(preset.tent)}</span>
          </span>
        </span>
        {!p.desktop && (
          <span className="tf-tentcard__chevron" aria-hidden="true">
            <ChevronRightIcon size={18} />
          </span>
        )}
      </span>
    </button>
  )
}

function Section(p: {
  title: string
  note: string
  sectionKey: string
  presets: readonly TentPreset[]
  extentCm: number
  desktop: boolean
  onPick(preset: TentPreset): void
}): JSX.Element {
  const titleId = useId()
  return (
    <section className="tf-picker__section" aria-labelledby={titleId} data-section={p.sectionKey}>
      <h2 id={titleId} className="tf-picker__title">
        {p.title}
      </h2>
      <p className="tf-picker__note">{p.note}</p>
      <ul className="tf-picker__grid">
        {p.presets.map((preset) => (
          <li key={preset.id}>
            <PresetCard preset={preset} extentCm={p.extentCm} desktop={p.desktop} onPick={p.onPick} />
          </li>
        ))}
      </ul>
    </section>
  )
}

export function TentPickerList(p: {
  catalog: TentCatalog | null
  error?: string
  onPick(preset: TentPreset): void
  onMake(): void
  /** 오류일 때 [다시 시도]를 누르면 부르는 함수(부모가 다시 불러옴). 없으면 버튼을 그리지 않습니다. */
  onRetry?(): void
}): JSX.Element {
  const desktop = useIsDesktop()
  const sections = useMemo(() => (p.catalog === null ? [] : sectionsOf(p.catalog)), [p.catalog])
  const extentCm = useMemo(() => commonExtentCm(sections.flatMap((s) => s.presets)), [sections])
  const hasError = p.error !== undefined && p.error !== ''

  return (
    <div className="tf-picker" data-layout={desktop ? 'desktop' : 'mobile'}>
      <ul className="tf-picker__grid tf-picker__grid--make">
        <li>
          <MakeCard onMake={p.onMake} desktop={desktop} />
        </li>
      </ul>
      {hasError ? (
        <div className="tf-picker__error" role="alert">
          <p className="tf-picker__error-text">{p.error}</p>
          {p.onRetry !== undefined && (
            <button type="button" className="tf-picker__retry" onClick={p.onRetry}>
              다시 시도
            </button>
          )}
        </div>
      ) : p.catalog === null ? (
        <p className="tf-picker__loading" role="status">
          {CATALOG_LOADING_TEXT}
        </p>
      ) : (
        sections.map((s) => (
          <Section
            key={s.key}
            sectionKey={s.key}
            title={s.title}
            note={s.note}
            presets={s.presets}
            extentCm={extentCm}
            desktop={desktop}
            onPick={p.onPick}
          />
        ))
      )}
    </div>
  )
}
