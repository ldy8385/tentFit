// @vitest-environment happy-dom
// passive 리스너에서 preventDefault를 무시하는 동작은 node의 EventTarget에 없고 happy-dom(브라우저와 같음)에만 있어 DOM 환경에서 확인합니다.
import { afterEach, describe, expect, it } from 'vitest'
import { BLOCKED_GESTURE_EVENTS, blockBrowserGestures } from './browserGestures'

const releases: Array<() => void> = []

afterEach(() => {
  for (const release of releases.splice(0)) release()
})

function block(target: EventTarget): () => void {
  const release = blockBrowserGestures(target)
  releases.push(release)
  return release
}

/** 취소 가능한 이벤트를 보내고 preventDefault 되었는지 돌려줍니다. */
function fire(target: EventTarget, type: string): boolean {
  const e = new Event(type, { cancelable: true })
  target.dispatchEvent(e)
  return e.defaultPrevented
}

describe('blockBrowserGestures (스펙 §4.5)', () => {
  it('document의 gesturestart·gesturechange를 preventDefault한다', () => {
    block(document)
    expect(BLOCKED_GESTURE_EVENTS).toEqual(['gesturestart', 'gesturechange'])
    expect(fire(document, 'gesturestart')).toBe(true)
    expect(fire(document, 'gesturechange')).toBe(true)
  })

  it('다른 이벤트는 건드리지 않는다', () => {
    block(document)
    expect(fire(document, 'gestureend')).toBe(false)
    expect(fire(document, 'touchmove')).toBe(false)
  })

  it('돌려준 함수로 리스너를 뗀다', () => {
    const release = block(document)
    release()
    expect(fire(document, 'gesturestart')).toBe(false)
    expect(fire(document, 'gesturechange')).toBe(false)
  })

  it('passive가 아닌 리스너로 붙인다(passive 리스너의 preventDefault는 무시됨)', () => {
    const passive = document.createElement('div')
    passive.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: true })
    expect(fire(passive, 'gesturestart')).toBe(false)
    const target = document.createElement('div')
    block(target)
    expect(fire(target, 'gesturestart')).toBe(true)
  })
})
