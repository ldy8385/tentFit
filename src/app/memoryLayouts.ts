// 배치를 이 탭의 메모리에만 보관합니다. 새로고침하면 사라집니다(Plan 7이 IndexedDB로 바꿉니다).
import type { Layout } from '../core/model'

const layouts = new Map<string, Layout>()

export function getMemoryLayout(id: string): Layout | undefined {
  return layouts.get(id)
}

export function putMemoryLayout(layout: Layout): void {
  layouts.set(layout.id, layout)
}

/** 보관한 순서대로 */
export function listMemoryLayouts(): Layout[] {
  return [...layouts.values()]
}

export function clearMemoryLayouts(): void {
  layouts.clear()
}
