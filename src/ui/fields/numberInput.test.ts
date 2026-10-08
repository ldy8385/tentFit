import { describe, expect, it } from 'vitest'
import {
  ERROR_MS,
  INPUT_FONT_PX,
  checkNumber,
  checkText,
  flipSignText,
  formatNumber,
  parseNumberInput,
  stepText,
} from './numberInput'

describe('상수', () => {
  it('오류는 1.5초, 입력칸 글자는 16px(스펙 §4.2)', () => {
    expect(ERROR_MS).toBe(1500)
    expect(INPUT_FONT_PX).toBe(16)
  })
})

describe('parseNumberInput', () => {
  it('공백·천 단위 쉼표·유니코드 마이너스를 받는다', () => {
    expect(parseNumberInput(' 250 ')).toBe(250)
    expect(parseNumberInput('1,200')).toBe(1200)
    expect(parseNumberInput('−120')).toBe(-120)
    expect(parseNumberInput('90.5')).toBe(90.5)
  })

  it('빈 글자·숫자 아님·무한대는 NaN', () => {
    expect(parseNumberInput('')).toBeNaN()
    expect(parseNumberInput('   ')).toBeNaN()
    expect(parseNumberInput('12cm')).toBeNaN()
    expect(parseNumberInput('-')).toBeNaN()
    expect(parseNumberInput('Infinity')).toBeNaN()
  })
})

describe('formatNumber', () => {
  it('소수 둘째 자리까지, -0과 무한대는 남기지 않는다', () => {
    expect(formatNumber(200)).toBe('200')
    expect(formatNumber(33.33)).toBe('33.33')
    expect(formatNumber(0.1 + 0.2)).toBe('0.3')
    expect(formatNumber(-0)).toBe('0')
    expect(formatNumber(Number.NaN)).toBe('')
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('')
  })
})

describe('checkNumber', () => {
  it('범위 안이면 값, 경계 포함', () => {
    expect(checkNumber('1', 1, 5000)).toEqual({ ok: true, value: 1 })
    expect(checkNumber('5000', 1, 5000)).toEqual({ ok: true, value: 5000 })
    expect(checkNumber('-0', -10, 10)).toEqual({ ok: true, value: 0 })
  })

  it('범위 밖이면 천 단위 쉼표로 범위를 알려 준다', () => {
    expect(checkNumber('6000', 1, 5000)).toEqual({ ok: false, error: '1~5,000 사이로 입력해 주세요' })
    expect(checkNumber('0', 1, 5000)).toEqual({ ok: false, error: '1~5,000 사이로 입력해 주세요' })
    expect(checkNumber('-10001', -10000, 10000)).toEqual({ ok: false, error: '-10,000~10,000 사이로 입력해 주세요' })
  })

  it('숫자가 아니면 숫자를 달라고 한다', () => {
    expect(checkNumber('', 1, 5000)).toEqual({ ok: false, error: '숫자를 입력해 주세요' })
    expect(checkNumber('abc', 1, 5000)).toEqual({ ok: false, error: '숫자를 입력해 주세요' })
  })

  it('범위가 무한이면 모든 유한한 수를 받는다(회전 입력)', () => {
    expect(checkNumber('400', Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY)).toEqual({ ok: true, value: 400 })
    expect(checkNumber('-90', Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY)).toEqual({ ok: true, value: -90 })
  })
})

describe('checkText', () => {
  it('앞뒤 공백을 떼고, 비면 오류', () => {
    expect(checkText('  롤테이블 ')).toEqual({ ok: true, value: '롤테이블' })
    expect(checkText('   ')).toEqual({ ok: false, error: '비워 둘 수 없어요' })
    expect(checkText('')).toEqual({ ok: false, error: '비워 둘 수 없어요' })
  })
})

describe('flipSignText·stepText', () => {
  it('부호를 바꾸고, 0은 0, 숫자가 아니면 null', () => {
    expect(flipSignText('120')).toBe('-120')
    expect(flipSignText('-35.5')).toBe('35.5')
    expect(flipSignText('0')).toBe('0')
    expect(flipSignText('')).toBeNull()
  })

  it('step을 더하고 범위 안으로 자른다', () => {
    expect(stepText('90', 1, 1, 5000)).toBe('91')
    expect(stepText('4995', 10, 1, 5000)).toBe('5000')
    expect(stepText('1', -10, 1, 5000)).toBe('1')
    expect(stepText('0.2', 0.1, 0, 10)).toBe('0.3')
    expect(stepText('x', 1, 1, 5000)).toBeNull()
  })
})
