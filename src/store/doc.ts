// 문서 스토어(스펙 §7·§8). 배치(Layout)의 유일한 원본이고, immer 패치로 실행 취소·다시 실행을 기록합니다.
// - 모든 문서 변경은 commit(recipe) 한 곳으로 들어옵니다. recipe는 src/core/ops/** 함수를 부릅니다.
// - 실행 취소 대상은 tent·items·groups 경로의 패치뿐입니다. name·updatedAt·sourcePresetId는 바꾸되 기록하지 않습니다.
// - 기록(패치 목록)은 상태 밖(클로저)에 두고, 화면에는 canUndo·canRedo만 내보냅니다.
import { applyPatches, enablePatches, produce, produceWithPatches, type Patch } from 'immer'
import { createStore, type StoreApi } from 'zustand/vanilla'
import type { Layout } from '../core/model'

enablePatches()

/** 실행 취소 최대 단계(§8). */
export const HISTORY_LIMIT = 200
/** 같은 coalesceKey 커밋을 1칸으로 합치는 간격(ms). 마지막 커밋 뒤부터 잽니다(§8 화살표 이동). */
export const COALESCE_MS = 500

/** coalesceKey: 같은 키로 COALESCE_MS 안에 연달아 커밋하면 실행 취소 1칸으로 합칩니다(예: 'nudge:<선택 id들>'). */
export type CommitOptions = { coalesceKey?: string }

export type DocState = {
  layout: Layout
  canUndo: boolean
  canRedo: boolean
  inGesture: boolean
  /** 배치를 통째로 바꾸고 실행 취소 기록을 비웁니다(배치 전환·새 배치). */
  load(layout: Layout): void
  /**
   * recipe로 배치를 바꿉니다(immer draft). 바뀐 게 없으면 false이고 아무것도 남기지 않습니다.
   * 바뀌면 updatedAt을 지금 시각으로 바꾸고(기록 밖) true입니다. recipe의 반환값은 버립니다.
   */
  commit(recipe: (d: Layout) => void, opts?: CommitOptions): boolean
  /** 배치 이름 바꾸기. 실행 취소 기록 밖입니다(§8). */
  rename(name: string): void
  /** 제스처 중(inGesture)이면 무시하고 false. */
  undo(): boolean
  /** 제스처 중(inGesture)이면 무시하고 false. */
  redo(): boolean
  /** 끌기·변형 시작. 끝날 때까지 실행 취소·다시 실행을 막습니다. */
  beginGesture(): void
  endGesture(): void
}

export type DocStore = StoreApi<DocState>

/** 실행 취소 1칸. patches는 앞으로, inverse는 뒤로 적용할 순서 그대로 둡니다. */
type Entry = { patches: Patch[]; inverse: Patch[] }

/** 실행 취소 대상 경로(배치 최상위 키). */
const UNDO_ROOTS: ReadonlySet<string | number> = new Set(['tent', 'items', 'groups'])

function undoable(patches: Patch[]): Patch[] {
  return patches.filter((p) => p.path.length > 0 && UNDO_ROOTS.has(p.path[0]))
}

export function createDocStore(initial: Layout, opts: { now?: () => number; historyLimit?: number } = {}): DocStore {
  const now = opts.now ?? Date.now
  const limit = Math.max(0, Math.floor(opts.historyLimit ?? HISTORY_LIMIT))
  let past: Entry[] = []
  let future: Entry[] = []
  /** 합칠 수 있는 맨 위 칸의 키와 마지막 커밋 시각. 다른 기록 조작이 끼면 null. */
  let open: { key: string; at: number } | null = null

  const stamp = (layout: Layout, at: number): Layout =>
    produce(layout, (d) => {
      d.updatedAt = new Date(at).toISOString()
    })

  return createStore<DocState>()((set, get) => {
    const flags = () => ({ canUndo: past.length > 0, canRedo: future.length > 0 })

    /** from 맨 위 칸을 꺼내 적용하고 to에 쌓습니다. */
    const travel = (from: Entry[], to: Entry[], pick: (e: Entry) => Patch[]): boolean => {
      if (get().inGesture) return false
      const entry = from.pop()
      if (entry === undefined) return false
      to.push(entry)
      open = null
      set({ layout: stamp(applyPatches(get().layout, pick(entry)), now()), ...flags() })
      return true
    }

    return {
      layout: initial,
      canUndo: false,
      canRedo: false,
      inGesture: false,

      load(layout) {
        past = []
        future = []
        open = null
        set({ layout, canUndo: false, canRedo: false, inGesture: false })
      },

      commit(recipe, commitOpts) {
        const [next, patches, inverse] = produceWithPatches(get().layout, (d) => {
          recipe(d)
        })
        if (patches.length === 0) return false
        const at = now()
        const recorded = undoable(patches)
        if (recorded.length > 0) {
          const key = commitOpts?.coalesceKey
          const top = past[past.length - 1]
          if (key !== undefined && top !== undefined && open !== null && open.key === key && at - open.at <= COALESCE_MS) {
            top.patches.push(...recorded)
            top.inverse.unshift(...undoable(inverse))
          } else {
            past.push({ patches: recorded, inverse: undoable(inverse) })
            if (past.length > limit) past.splice(0, past.length - limit)
          }
          future = []
          open = key !== undefined ? { key, at } : null
        }
        set({ layout: stamp(next, at), ...flags() })
        return true
      },

      rename(name) {
        const layout = get().layout
        if (layout.name === name) return
        set({
          layout: produce(layout, (d) => {
            d.name = name
            d.updatedAt = new Date(now()).toISOString()
          }),
        })
      },

      undo: () => travel(past, future, (e) => e.inverse),
      redo: () => travel(future, past, (e) => e.patches),

      beginGesture() {
        if (!get().inGesture) set({ inGesture: true })
      },
      endGesture() {
        if (get().inGesture) set({ inGesture: false })
      },
    }
  })
}
