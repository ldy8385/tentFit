import { describe, expect, it } from 'vitest'
import * as actions from '../../app/actions'
import * as commands from './commands'

describe('commands — app/actions 다시 내보내기만(보류 Minor #23)', () => {
  it('패널·시트가 쓰는 동작은 actions.ts의 같은 함수다', () => {
    expect(commands.deleteAndDeselect).toBe(actions.deleteAndDeselect)
    expect(commands.duplicateAndSelect).toBe(actions.duplicateAndSelect)
    expect(commands.resize).toBe(actions.resize)
    expect(commands.rotateBy90).toBe(actions.rotateBy90)
    expect(commands.setProps).toBe(actions.setProps)
    expect(commands.setRotation).toBe(actions.setRotation)
  })

  it('다른 것은 내보내지 않는다', () => {
    expect(Object.keys(commands).sort()).toEqual([
      'deleteAndDeselect',
      'duplicateAndSelect',
      'resize',
      'rotateBy90',
      'setProps',
      'setRotation',
    ])
  })
})
