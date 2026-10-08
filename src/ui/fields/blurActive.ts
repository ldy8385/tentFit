/**
 * 포커스된 요소의 포커스를 놓아 입력칸의 값을 반영하게 합니다(스펙 §4.2: 캔버스 pointerdown에서 먼저 부름).
 * 입력칸은 blur 때 포커스 시점의 대상 id에 반영하므로, 이 뒤에 선택이 바뀌어도 값이 엉뚱한 물건에 가지 않습니다.
 * document가 없는 환경(node 테스트)에서는 아무것도 하지 않습니다.
 */
export function blurActiveInput(): void {
  if (typeof document === 'undefined') return
  const el = document.activeElement
  if (el instanceof HTMLElement && el !== document.body) el.blur()
}
