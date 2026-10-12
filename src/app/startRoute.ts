// 앱 시작 규칙(스펙 §4.7 앞머리, Plan 4 R16). 순수 함수입니다.
import { compareRecent, type LayoutSummary } from './layoutRepo'
import type { Route } from './router'

/**
 * lastLayoutId가 목록에 있으면 그 배치, 없으면 가장 최근에 수정한 배치, 하나도 없으면 고르기 화면.
 * 빈 해시·'#/'·없는 배치의 '#/edit/<id>'가 모두 이 규칙을 따릅니다(새 배치를 자동으로 만들지 않음).
 */
export function startRoute(summaries: readonly LayoutSummary[], lastLayoutId: string | null): Route {
  if (lastLayoutId !== null && summaries.some((s) => s.id === lastLayoutId)) {
    return { name: 'edit', layoutId: lastLayoutId }
  }
  const recent = [...summaries].sort(compareRecent)[0]
  return recent !== undefined ? { name: 'edit', layoutId: recent.id } : { name: 'pick' }
}
