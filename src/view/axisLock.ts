// 상하좌우로만 이동(소유자 요청): PC는 끄는 동안 Shift, 휴대폰은 시트의 [상하좌우] 토글(ui.axisLock).
// 시작점 기준 이동량이 큰 축(가로 또는 세로)만 남깁니다. 같으면 가로. 끄는 중에 큰 축이 바뀌면 고정 축도 바뀝니다.
import type { Vector2d } from 'konva/lib/types'

/** 이동량 (dx, dy)에서 큰 축만 남깁니다. */
export function lockToAxis(dx: number, dy: number): [number, number] {
  return Math.abs(dx) >= Math.abs(dy) ? [dx, 0] : [0, dy]
}

/** Konva dragBoundFunc용: 끌기 시작 절대 위치 start 기준으로 pos를 한 축으로 고정합니다. */
export function axisBoundPosition(start: Vector2d, pos: Vector2d): Vector2d {
  const [dx, dy] = lockToAxis(pos.x - start.x, pos.y - start.y)
  return { x: start.x + dx, y: start.y + dy }
}
