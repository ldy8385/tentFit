// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLayout, type ItemPreset } from '../../core/model'
import { addPresetItem } from '../../app/actions'
import { defaultTentPreset } from '../../app/presets'
import { createStores, StoresProvider, type Stores } from '../../app/stores'
import { NewShapeForm } from './NewShapeForm'

const MAT: ItemPreset = {
  id: 'items/mat-single-200x60',
  name: '캠핑 매트 1인',
  category: 'MAT',
  shape: { kind: 'rect', w: 200, h: 60 },
  color: 'green',
  countsArea: true,
}

let stores: Stores

beforeEach(() => {
  stores = createStores(createLayout(defaultTentPreset().tent, { name: '테스트 배치', id: 'L1' }))
  stores.ui.getState().setSize({ width: 800, height: 600 })
  stores.ui.getState().setView({ zoom: 1, panX: 400, panY: 300 })
})
function renderForm(inSheet?: boolean) {
  const onDone = vi.fn()
  const onCancel = vi.fn()
  render(
    <StoresProvider stores={stores}>
      <NewShapeForm onDone={onDone} onCancel={onCancel} inSheet={inSheet} />
    </StoresProvider>,
  )
  return { onDone, onCancel }
}

const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement
const countsSwitch = () => screen.getByRole('switch', { name: '점유 면적에 포함' }) as HTMLInputElement
const submit = () => screen.getByRole('button', { name: '+ 캔버스에 추가' }) as HTMLButtonElement
const type = (label: string, value: string) => fireEvent.change(input(label), { target: { value } })

describe('NewShapeForm', () => {
  it('기본값: 새 도형, 사각형 100×50, 기타, 점유 면적 포함, 색은 팔레트 다음 색', () => {
    addPresetItem(stores, MAT)
    addPresetItem(stores, MAT)
    renderForm()
    expect(input('이름').value).toBe('새 도형')
    expect(input('가로').value).toBe('100')
    expect(input('세로').value).toBe('50')
    expect((screen.getByLabelText('카테고리') as HTMLSelectElement).value).toBe('ETC')
    expect(countsSwitch().checked).toBe(true)
    expect(screen.getByRole('button', { name: '사각형' }).getAttribute('aria-pressed')).toBe('true')
    // 물건 2개 → COLOR_KEYS[2] = green
    expect(screen.getByRole('button', { name: '초록' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('figure', { name: '미리보기' }).textContent).toBe('새 도형100×50')
    expect(submit().disabled).toBe(false)
  })

  it('깔개를 고르면 점유 면적 포함이 꺼지고 미리보기가 긴 대시가 된다', () => {
    renderForm()
    fireEvent.change(screen.getByLabelText('카테고리'), { target: { value: 'RUG' } })
    expect(countsSwitch().checked).toBe(false)
    const preview = screen.getByRole('figure', { name: '미리보기' })
    expect((preview.querySelector('[data-shape="rect"]') as SVGElement).style.strokeDasharray).toBe('6 4')
  })

  it('원을 고르면 지름 칸만 남고, 사각형으로 돌아가면 지름이 가로·세로 둘 다에 들어간다', () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: '원' }))
    expect(screen.queryByLabelText('가로')).toBeNull()
    expect(screen.queryByLabelText('세로')).toBeNull()
    expect(input('지름').value).toBe('50')
    expect(screen.getByRole('figure', { name: '미리보기' }).querySelector('[data-shape="circle"]')).not.toBeNull()
    type('지름', '80')
    fireEvent.click(screen.getByRole('button', { name: '사각형' }))
    expect(screen.queryByLabelText('지름')).toBeNull()
    expect(input('가로').value).toBe('80')
    expect(input('세로').value).toBe('80')
  })

  it('범위 밖·숫자 아님·빈 이름이면 [캔버스에 추가]가 꺼지고 그 칸에 이유를 보여 준다', () => {
    renderForm()
    for (const [bad, message] of [
      ['0', '1~5,000 사이로 입력해 주세요'],
      ['5001', '1~5,000 사이로 입력해 주세요'],
      ['abc', '숫자를 입력해 주세요'],
      ['', '숫자를 입력해 주세요'],
    ] as const) {
      type('가로', bad)
      expect(submit().disabled).toBe(true)
      expect(screen.getByRole('alert').textContent).toBe(message)
      expect(input('가로').getAttribute('aria-invalid')).toBe('true')
    }
    type('가로', '120')
    expect(submit().disabled).toBe(false)
    expect(screen.queryByRole('alert')).toBeNull()
    type('이름', '   ')
    expect(submit().disabled).toBe(true)
    expect(screen.getByRole('alert').textContent).toBe('비워 둘 수 없어요')
  })

  it('[캔버스에 추가]는 입력대로(0.1cm 반올림) 화면 가운데에 놓고 선택한 뒤 onDone을 부른다', () => {
    const { onDone, onCancel } = renderForm()
    type('이름', ' 롤테이블 ')
    type('가로', '90')
    type('세로', '60.04')
    fireEvent.click(screen.getByRole('button', { name: '갈색' }))
    fireEvent.change(screen.getByLabelText('카테고리'), { target: { value: 'TABLE' } })
    expect(screen.getByRole('figure', { name: '미리보기' }).textContent).toBe('롤테이블90×60')
    fireEvent.click(submit())
    const items = stores.doc.getState().layout.items
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      name: '롤테이블',
      shape: { kind: 'rect', w: 90, h: 60 },
      color: 'brown',
      category: 'TABLE',
      countsArea: true,
      x: 0,
      y: 0,
    })
    expect(stores.ui.getState().selection).toEqual([items[0]?.id])
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('리뷰 회귀: 입력칸의 Enter는 추가하지 않고 다음 칸으로, 마지막 칸이면 키보드를 내린다', () => {
    const { onDone } = renderForm()
    input('이름').focus()
    // fireEvent는 preventDefault되면 false(브라우저의 암시적 제출이 일어나지 않음)
    expect(fireEvent.keyDown(input('이름'), { key: 'Enter' })).toBe(false)
    expect(document.activeElement).toBe(input('가로'))
    expect(fireEvent.keyDown(input('가로'), { key: 'Enter' })).toBe(false)
    expect(document.activeElement).toBe(input('세로'))
    expect(fireEvent.keyDown(input('세로'), { key: 'Enter' })).toBe(false)
    expect(document.activeElement).not.toBe(input('세로'))
    expect(onDone).not.toHaveBeenCalled()
    expect(stores.doc.getState().layout.items).toEqual([])
    expect(input('이름').getAttribute('enterkeyhint')).toBe('next')
    expect(input('가로').getAttribute('enterkeyhint')).toBe('next')
    expect(input('세로').getAttribute('enterkeyhint')).toBe('done')
  })

  it('리뷰 회귀: 원이면 지름 칸이 마지막 칸이다', () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: '원' }))
    input('이름').focus()
    fireEvent.keyDown(input('이름'), { key: 'Enter' })
    expect(document.activeElement).toBe(input('지름'))
    expect(input('지름').getAttribute('enterkeyhint')).toBe('done')
  })

  it('리뷰 회귀: 한글 조합을 끝내는 Enter는 칸을 옮기지 않고, 제출도 하지 않는다', () => {
    const { onDone } = renderForm()
    input('이름').focus()
    expect(fireEvent.keyDown(input('이름'), { key: 'Enter', isComposing: true })).toBe(false)
    expect(document.activeElement).toBe(input('이름'))
    expect(onDone).not.toHaveBeenCalled()
  })

  it('원으로 추가하면 circle 물건이 된다', () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: '원' }))
    type('지름', '45')
    fireEvent.click(submit())
    expect(stores.doc.getState().layout.items[0]?.shape).toEqual({ kind: 'circle', d: 45 })
  })

  it('패널에서는 제목 줄의 ×가 onCancel이고, 시트 안(inSheet)에서는 제목 줄을 그리지 않는다', () => {
    const { onCancel, onDone } = renderForm()
    expect(screen.getByRole('heading', { name: '새 도형 만들기' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '새 도형 닫기' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onDone).not.toHaveBeenCalled()
    expect(stores.doc.getState().layout.items).toHaveLength(0)
    cleanup()
    renderForm(true)
    expect(screen.queryByRole('heading', { name: '새 도형 만들기' })).toBeNull()
    expect(screen.queryByRole('button', { name: '새 도형 닫기' })).toBeNull()
  })

  it('입력칸 글자는 16px이고 길이 칸은 소수 키패드다', () => {
    renderForm()
    for (const el of [input('이름'), input('가로'), input('세로'), screen.getByLabelText('카테고리') as HTMLSelectElement]) {
      expect(el.style.fontSize).toBe('16px')
    }
    expect(input('가로').getAttribute('inputmode')).toBe('decimal')
    expect(input('이름').getAttribute('inputmode')).toBeNull()
  })
})
