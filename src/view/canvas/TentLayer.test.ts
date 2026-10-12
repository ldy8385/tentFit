import { describe, expect, it } from 'vitest'
import { THEME } from '../../ui/theme'
import { themeColor } from './TentLayer'

describe('themeColor', () => {
  it("'var(--danger)'을 THEME 값으로, 색 값은 그대로, 모르는 변수는 그대로", () => {
    expect(themeColor('var(--danger)')).toBe(THEME['danger'])
    expect(themeColor('#123456')).toBe('#123456')
    expect(themeColor('var(--no-such-token)')).toBe('var(--no-such-token)')
  })
})
