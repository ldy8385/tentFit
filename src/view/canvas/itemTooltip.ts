// 캔버스 물건 이름 툴팁(소유자 요청 2026-10-15): 라벨이 말줄임으로 잘렸거나 숨었으면 마우스를 올렸을 때 전체 라벨을 보입니다.
// 캔버스 글자는 DOM이 아니라서 캔버스 상자(stage container)의 title로 띄웁니다(화면 글자의 ui/autoTitle과 같은 툴팁).
import type Konva from 'konva'

/** 보이는 라벨 줄(숨었으면 null)이 전체 라벨과 다르면 전체 라벨, 같으면 null */
export function itemLabelTooltip(label: string, shownLines: readonly string[] | null): string | null {
  return shownLines !== null && shownLines.join('') === label ? null : label
}

/** 캔버스 상자의 title을 바꿉니다(null = 뗌). */
export function setCanvasTitle(node: Konva.Node, title: string | null): void {
  const c = node.getStage()?.container()
  if (c === undefined) return
  if (title === null) c.removeAttribute('title')
  else c.title = title
}
