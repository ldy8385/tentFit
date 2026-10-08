// 테스트 전용: window.matchMedia를 질의별 고정값으로 바꾸고, 값을 바꾸면 change 이벤트를 보냅니다.
// 앱 코드는 이 파일을 import하지 않습니다.
type Listener = () => void

export type FakeMedia = {
  set(query: string, matches: boolean): void
  restore(): void
}

export function installFakeMatchMedia(initial: Record<string, boolean>): FakeMedia {
  const state = new Map(Object.entries(initial))
  const listeners = new Map<string, Set<Listener>>()
  const original = window.matchMedia
  const fake = (query: string): MediaQueryList => {
    const set = listeners.get(query) ?? new Set<Listener>()
    listeners.set(query, set)
    const mql = {
      media: query,
      get matches() {
        return state.get(query) ?? false
      },
      onchange: null,
      addEventListener: (_type: string, cb: Listener) => set.add(cb),
      removeEventListener: (_type: string, cb: Listener) => set.delete(cb),
      addListener: (cb: Listener) => set.add(cb),
      removeListener: (cb: Listener) => set.delete(cb),
      dispatchEvent: () => true,
    }
    return mql as unknown as MediaQueryList
  }
  window.matchMedia = fake as typeof window.matchMedia
  return {
    set(query, matches) {
      state.set(query, matches)
      for (const cb of listeners.get(query) ?? []) cb()
    },
    restore() {
      window.matchMedia = original
    },
  }
}
