// @vitest-environment happy-dom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadGenericTents } from '../../test/genericTents'
import type { TentCatalog } from '../../app/tentCatalog'
import type { TentPreset } from '../../core/model'
import { installFakeMatchMedia, type FakeMedia } from '../shell/fakeMatchMedia'
import { DESKTOP_QUERY } from '../shell/useIsDesktop'
import { CATALOG_LOADING_TEXT, TentPickerList } from './TentPickerList'

let media: FakeMedia

beforeEach(() => {
  media = installFakeMatchMedia({ [DESKTOP_QUERY]: true })
})

afterEach(() => {
  media.restore()
})

const BRAND_A: TentPreset = {
  id: 'gana/shelter',
  brand: '가나텐트',
  model: '쉘터 L',
  tent: { name: '쉘터 L', outer: { kind: 'rect', w: 460, h: 330 }, outerTemplate: { kind: 'rect', w: 460, h: 330 }, inners: [] },
}
const BRAND_B: TentPreset = {
  id: 'dara/bell',
  brand: '다라',
  model: '벨 5m',
  tent: { name: '벨 5m', outer: { kind: 'circle', d: 500 }, outerTemplate: { kind: 'circle', d: 500 }, inners: [] },
}

function genericOnly(): TentCatalog {
  return { generic: loadGenericTents(), brands: [] }
}

function withBrands(): TentCatalog {
  return {
    generic: loadGenericTents(),
    brands: [
      { brand: '가나텐트', presets: [BRAND_A] },
      { brand: '다라', presets: [BRAND_B] },
    ],
  }
}

function renderList(p: Partial<Parameters<typeof TentPickerList>[0]> = {}) {
  const onPick = vi.fn()
  const onMake = vi.fn()
  const view = render(<TentPickerList catalog={genericOnly()} onPick={onPick} onMake={onMake} {...p} />)
  return { onPick, onMake, view }
}

function viewBoxSize(svg: Element): [number, number] {
  const parts = (svg.getAttribute('viewBox') ?? '').split(' ').map(Number)
  return [parts[2]!, parts[3]!]
}

describe('TentPickerList', () => {
  it('구역 순서는 일반 예시 → 브랜드마다 한 구역(제목 = 브랜드 이름), 공개 자료 안내는 첫 브랜드 구역에', () => {
    renderList({ catalog: withBrands() })
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['일반 예시', '가나텐트', '다라'])
    const generic = screen.getByRole('region', { name: '일반 예시' })
    const gana = screen.getByRole('region', { name: '가나텐트' })
    const dara = screen.getByRole('region', { name: '다라' })
    expect(within(generic).getByText('흔한 크기로 만든 예시예요')).toBeTruthy()
    expect(within(gana).getByText('치수는 제조사 공개 자료 기준이며 실제와 다를 수 있어요')).toBeTruthy()
    expect(within(dara).queryByText('치수는 제조사 공개 자료 기준이며 실제와 다를 수 있어요')).toBeNull()
    expect(within(generic).getAllByRole('button')).toHaveLength(5)
    expect(within(gana).getAllByRole('button').map((b) => b.getAttribute('data-preset-id'))).toEqual(['gana/shelter'])
    expect(within(dara).getAllByRole('button').map((b) => b.getAttribute('data-preset-id'))).toEqual(['dara/bell'])
  })

  it('브랜드 필터(소유자 요청 2026-10-15): 고른 브랜드 구역만, 「브랜드 전체」로 되돌림', () => {
    renderList({ catalog: withBrands() })
    const select = screen.getByRole('combobox', { name: '브랜드' }) as HTMLSelectElement
    expect(Array.from(select.options, (o) => o.textContent)).toEqual(['브랜드 전체', '가나텐트', '다라'])
    fireEvent.change(select, { target: { value: '다라' } })
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['다라'])
    fireEvent.change(select, { target: { value: '' } })
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['일반 예시', '가나텐트', '다라'])
  })

  it('브랜드 프리셋이 없으면 브랜드 구역도 안내 문구도 필터도 없다(검색도 없음)', () => {
    renderList()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['일반 예시'])
    expect(screen.queryByText('치수는 제조사 공개 자료 기준이며 실제와 다를 수 있어요')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('카드 이름은 텐트 이름이고, 누르면 확인 없이 onPick(그 프리셋)', () => {
    const catalog = genericOnly()
    const { onPick } = renderList({ catalog })
    const tunnel = catalog.generic.find((t) => t.id === 'generic/tunnel-4p')!
    fireEvent.click(screen.getByRole('button', { name: '터널 4인 예시' }))
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick.mock.calls[0]![0]).toBe(tunnel)
  })

  it('일반 예시 카드는 브랜드 자리가 비어 있고 외곽 크기만, 브랜드 카드는 브랜드 · 크기', () => {
    renderList({ catalog: withBrands() })
    const tunnel = screen.getByRole('button', { name: '터널 4인 예시' })
    expect(tunnel.querySelector('.tf-tentcard__brand')).toBeNull()
    expect(tunnel.querySelector('.tf-tentcard__meta')?.textContent).toBe('620 × 320 cm')
    const bell = screen.getByRole('button', { name: '벨텐트 4m 예시' })
    expect(bell.querySelector('.tf-tentcard__meta')?.textContent).toBe('지름 400 cm')
    const shelter = screen.getByRole('button', { name: '쉘터 L' })
    expect(shelter.querySelector('.tf-tentcard__brand')?.textContent).toBe('가나텐트')
    expect(shelter.querySelector('.tf-tentcard__size')?.textContent).toBe('460 × 330 cm')
    expect(shelter.getAttribute('aria-describedby')).toBe(shelter.querySelector('.tf-tentcard__meta')?.id)
  })

  it('맨 앞은 [직접 만들기] 카드(부제 포함)이고 누르면 onMake', () => {
    const { onMake } = renderList()
    const buttons = screen.getAllByRole('button')
    expect(buttons[0]!.getAttribute('data-testid')).toBe('make-tent-card')
    expect(buttons[0]!.textContent).toContain('직접 만들기')
    expect(buttons[0]!.textContent).toContain('사각·사다리꼴·정N각·원·자유 다각형')
    fireEvent.click(buttons[0]!)
    expect(onMake).toHaveBeenCalledTimes(1)
  })

  it('미니 평면도는 목록 안에서 같은 축척이다(viewBox 크기가 모두 같고, 가장 큰 외곽 변 기준)', () => {
    const { view } = renderList({ catalog: withBrands() })
    const svgs = Array.from(view.container.querySelectorAll('.tf-tentcard__thumb svg'))
    expect(svgs).toHaveLength(7)
    const sizes = svgs.map(viewBoxSize)
    for (const s of sizes) expect(s).toEqual(sizes[0])
    // 가장 큰 변 = 터널 4인 620cm(+ 여백). 한 변 620 이상이면 모든 외곽이 들어갑니다.
    expect(sizes[0]![0]).toBeGreaterThanOrEqual(620)
    // 썸네일은 장식(이름은 카드 글자가 맡음)
    expect(view.container.querySelector('.tf-tentcard__thumb')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('catalog가 null이면 불러오는 중(role=status), 직접 만들기는 그대로 누를 수 있다', () => {
    const { onMake } = renderList({ catalog: null })
    expect(screen.getByRole('status').textContent).toBe(CATALOG_LOADING_TEXT)
    expect(CATALOG_LOADING_TEXT).toBe('텐트 목록을 불러오는 중…')
    expect(screen.queryAllByRole('heading')).toHaveLength(0)
    fireEvent.click(screen.getByTestId('make-tent-card'))
    expect(onMake).toHaveBeenCalledTimes(1)
  })

  it('error가 있으면 오류 문구(role=alert), onRetry가 있으면 [다시 시도]', () => {
    const onRetry = vi.fn()
    const { view } = renderList({ catalog: null, error: '텐트 목록을 불러오지 못했어요', onRetry })
    expect(screen.getByRole('alert').textContent).toContain('텐트 목록을 불러오지 못했어요')
    expect(screen.queryByRole('status')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    view.rerender(<TentPickerList catalog={null} error="실패" onPick={vi.fn()} onMake={vi.fn()} />)
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull()
  })

  it('PC는 4열 카드(data-layout desktop), 휴대폰은 1열 행 카드에 › 표시', () => {
    const { view } = renderList()
    expect(view.container.querySelector('.tf-picker')?.getAttribute('data-layout')).toBe('desktop')
    expect(view.container.querySelectorAll('.tf-tentcard__chevron')).toHaveLength(0)
    media.set(DESKTOP_QUERY, false)
    view.rerender(<TentPickerList catalog={genericOnly()} onPick={vi.fn()} onMake={vi.fn()} />)
    expect(view.container.querySelector('.tf-picker')?.getAttribute('data-layout')).toBe('mobile')
    expect(view.container.querySelectorAll('.tf-tentcard__chevron')).toHaveLength(5)
    expect(view.container.querySelectorAll('.tf-makecard__chevron')).toHaveLength(1)
  })
})
