// @vitest-environment happy-dom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Layout } from '../../core/model'
import { createStores, StoresProvider } from '../../app/stores'
import { AreaDetail } from './AreaDetail'
import { rectItem, tipiLayout, tunnelLayout } from './testLayouts'

function renderDetail(layout: Layout) {
  render(
    <StoresProvider stores={createStores(layout)}>
      <AreaDetail />
    </StoresProvider>,
  )
}

const rowOf = (name: string) => screen.getByText(name).closest('li')?.textContent ?? ''

describe('AreaDetail', () => {
  it('구역마다 그 안의 물건 면적을, 점유 면적 제외 물건은 "제외"로 보여 준다', () => {
    renderDetail(
      tunnelLayout([
        rectItem('m', '매트', -200, 0),
        rectItem('r', '러그', 100, 0, { w: 200, h: 140, countsArea: false }),
        rectItem('c', '걸친 의자', -90, 100, { w: 60, h: 40 }),
      ]),
    )
    const innerSection = screen.getByRole('region', { name: '이너 구역' })
    const innerItems = within(innerSection).getByRole('list', { name: '이너 1 물건' })
    expect(within(innerItems).getByText('매트').closest('li')?.textContent).toContain('1.20m²')
    // 이너 벽(x=−90)에 걸친 의자는 이너와 전실에 반씩(30×40 = 0.12m²) 나온다
    expect(within(innerItems).getByText('걸친 의자').closest('li')?.textContent).toContain('0.12m²')

    const floorSection = screen.getByRole('region', { name: '전실 구역' })
    expect(within(floorSection).getByText('전실 조각 1개')).toBeTruthy()
    const floorItems = within(floorSection).getByRole('list', { name: '전실 1 물건' })
    expect(within(floorItems).getByText('러그').closest('li')?.textContent).toContain('제외')
    expect(within(floorItems).getByText('걸친 의자').closest('li')?.textContent).toContain('0.12m²')
    expect(rowOf('러그')).not.toContain('m²')
  })

  it('합계 3행(이너 전체·전실 전체·텐트 전체)과 겹침 안내가 있다', () => {
    renderDetail(tunnelLayout([rectItem('m', '매트', -200, 0)]))
    const totals = screen.getByRole('region', { name: '합계' })
    const names = Array.from(totals.querySelectorAll('.tf-zone__name')).map((el) => el.textContent)
    expect(names).toEqual(['이너 전체', '전실 전체', '텐트 전체'])
    expect(screen.getByText('겹친 부분은 한 번만 세서 합과 다를 수 있어요')).toBeTruthy()
  })

  it('이너가 없는 텐트는 이너 구역 없이 "바닥 1" 조각만 있다', () => {
    renderDetail(tipiLayout())
    expect(screen.queryByRole('region', { name: '이너 구역' })).toBeNull()
    const floor = screen.getByRole('region', { name: '바닥 구역' })
    expect(within(floor).getByText('바닥 조각 1개')).toBeTruthy()
    expect(within(floor).getByText('바닥 1')).toBeTruthy()
    // 물건이 없는 구역은 물건 목록을 그리지 않는다
    expect(within(floor).queryByRole('list')).toBeNull()
  })
})
