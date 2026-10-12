import { describe, expect, it } from 'vitest'
import { FORM_MIN_PX, MAKER_TOP_BAR_PX, PREVIEW_FOCUSED_PX, PREVIEW_MAX_PX, overlayBoxFor, previewHeightFor } from './makerLayout'

describe('previewHeightFor', () => {
  it('입력 포커스 중에는 140px(폼이 남을 만큼 보이는 높이가 있으면)', () => {
    for (const h of [407, 544, 667, 844, 1200]) expect(previewHeightFor(h, true)).toBe(PREVIEW_FOCUSED_PX)
  })

  it('최종 리뷰: 가로 휴대폰에서 키보드가 올라와 보이는 높이가 작으면 미리보기를 줄이거나 접어 입력 폼 높이를 남긴다', () => {
    expect(previewHeightFor(300, true)).toBe(300 - MAKER_TOP_BAR_PX - FORM_MIN_PX)
    expect(previewHeightFor(170, true)).toBe(0)
  })

  it('포커스가 없으면 보이는 높이의 38%를 140~320으로 자른다(화면 크기 4종)', () => {
    expect(previewHeightFor(844, false)).toBe(PREVIEW_MAX_PX)
    expect(previewHeightFor(667, false)).toBe(253)
    expect(previewHeightFor(390, false)).toBe(148)
    expect(previewHeightFor(300, false)).toBe(PREVIEW_FOCUSED_PX)
  })
})

describe('overlayBoxFor', () => {
  it('키보드가 없으면 null', () => {
    expect(overlayBoxFor({ height: 844, offsetTop: 0, keyboardInset: 0 })).toBeNull()
  })

  it('키보드가 떠 있으면 보이는 영역(위 밀림 포함)에 맞춘다', () => {
    expect(overlayBoxFor({ height: 500, offsetTop: 40, keyboardInset: 304 })).toEqual({ top: 40, height: 500 })
  })

  it('보이는 높이를 모르면(0) null', () => {
    expect(overlayBoxFor({ height: 0, offsetTop: 0, keyboardInset: 10 })).toBeNull()
  })
})
