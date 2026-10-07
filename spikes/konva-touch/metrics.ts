// Konva 터치 스파이크 계측(버리는 코드). 스펙 §14 ①·③의 판정을 순수 함수로 둔다.

export type NodeAttrs = { x: number; y: number; rotation: number; scaleX: number; scaleY: number }

export const ATTR_EPS = 1e-3
export const REQUIRED_ATTEMPTS = 20
export const P95_LIMIT_MS = 20
export const DRAG_SECONDS_REQUIRED = 10
const MAX_FRAME_GAP_MS = 1000 // 이보다 긴 간격은 탭 숨김 등으로 보고 버린다

/** 다섯 값(x, y, rotation, scaleX, scaleY) 차이의 최댓값. NaN이 섞이면 NaN. */
export function attrsDeviation(a: NodeAttrs, b: NodeAttrs): number {
  return Math.max(
    Math.abs(a.x - b.x),
    Math.abs(a.y - b.y),
    Math.abs(a.rotation - b.rotation),
    Math.abs(a.scaleX - b.scaleX),
    Math.abs(a.scaleY - b.scaleY),
  )
}

/** nearest-rank 백분위수. 빈 배열은 null. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length)))
  return sorted[rank - 1] ?? null
}

export type FrameStats = {
  allP95: number | null // 최근 10초(벽시계)의 모든 rAF 간격
  allCount: number
  dragP95: number | null // 끌기 중이던 rAF 간격, 끌기 시간 합 최근 10초
  dragCount: number
  dragSeconds: number
}

export class FrameWindow {
  private readonly windowMs: number
  private last: number | null = null
  private lastDragging = false
  private all: Array<{ t: number; dt: number }> = []
  private drag: number[] = []
  private dragSum = 0

  constructor(windowMs = 10_000) {
    this.windowMs = windowMs
  }

  tick(now: number, dragging: boolean): void {
    if (this.last !== null) {
      const dt = now - this.last
      if (dt > 0 && dt <= MAX_FRAME_GAP_MS) {
        this.all.push({ t: now, dt })
        if (dragging && this.lastDragging) {
          this.drag.push(dt)
          this.dragSum += dt
          // 가장 오래된 표본을 빼도 창(10초) 이상이 남을 때만 뺀다. 그래야 계속 끌면 판정 기준(10초)에 닿는다.
          while (this.drag.length > 0 && this.dragSum - (this.drag[0] ?? 0) >= this.windowMs) this.dragSum -= this.drag.shift() ?? 0
        }
      }
    }
    this.last = now
    this.lastDragging = dragging
    const cutoff = now - this.windowMs
    while (this.all.length > 0 && (this.all[0]?.t ?? Infinity) <= cutoff) this.all.shift()
  }

  stats(): FrameStats {
    return {
      allP95: percentile(this.all.map((f) => f.dt), 95),
      allCount: this.all.length,
      dragP95: percentile(this.drag, 95),
      dragCount: this.drag.length,
      dragSeconds: this.dragSum / 1000,
    }
  }

  reset(): void {
    this.last = null
    this.lastDragging = false
    this.all = []
    this.drag = []
    this.dragSum = 0
  }
}

export type AttemptKind = 'drag' | 'ready' | 'transform' // ready = 잡았지만 아직 3px 안 움직임
export type AttemptObservation = {
  start: NodeAttrs // 잡은 순간(= 모델) 값
  finalNode: NodeAttrs // 모든 손가락을 뗀 뒤 Konva 노드 값
  finalModel: NodeAttrs // 모든 손가락을 뗀 뒤 모델 값
  maxDeviation: number // 두 번째 손가락 이후 노드가 시작 값에서 벗어난 최댓값
  commits: number // 시도 중 모델 커밋 수
  remaining: number // 모든 손가락을 뗀 뒤 남은 끌기·변형 수
}
export type AttemptVerdict = { a: boolean; b: boolean; c: boolean; pass: boolean }
export type AttemptRecord = AttemptObservation & AttemptVerdict & { n: number; kind: AttemptKind; itemId: string }

/** ⓐ 손 뗀 뒤 위치 = 시작 위치(노드·모델 모두, 커밋 0) ⓑ 두 번째 손가락 뒤 움직임 없음 ⓒ 남은 끌기 0 */
export function judgeAttempt(o: AttemptObservation): AttemptVerdict {
  const a = attrsDeviation(o.start, o.finalNode) <= ATTR_EPS && attrsDeviation(o.start, o.finalModel) <= ATTR_EPS && o.commits === 0
  const b = o.maxDeviation <= ATTR_EPS
  const c = o.remaining === 0
  return { a, b, c, pass: a && b && c }
}

export type AttemptSummary = { total: number; passed: number; a: number; b: number; c: number }

export function summarize(records: readonly AttemptRecord[]): AttemptSummary {
  return {
    total: records.length,
    passed: records.filter((r) => r.pass).length,
    a: records.filter((r) => r.a).length,
    b: records.filter((r) => r.b).length,
    c: records.filter((r) => r.c).length,
  }
}

export function verdictTouch(s: AttemptSummary): '통과' | '실패' | '시도 부족' {
  if (s.passed < s.total) return '실패'
  if (s.total < REQUIRED_ATTEMPTS) return '시도 부족'
  return '통과'
}

export function verdictPerf(f: FrameStats): '통과' | '실패' | '측정 부족' {
  if (f.dragP95 === null || f.dragSeconds < DRAG_SECONDS_REQUIRED) return '측정 부족'
  return f.dragP95 <= P95_LIMIT_MS ? '통과' : '실패'
}

export type HandleCheck = '미확인' | '가능' | '불가'

export type ReportInput = {
  date: string // YYYY-MM-DD
  device: string // 기기 모델명(사용자 입력)
  userAgent: string
  screen: string
  versions: string
  handles: HandleCheck
  frames: FrameStats
  attempts: readonly AttemptRecord[]
}

export function formatMs(v: number | null): string {
  return v === null ? '—' : `${v.toFixed(1)}ms`
}

const mark = (ok: boolean): string => (ok ? 'O' : 'X')

/** docs/plans/spike-results.md에 그대로 붙여 넣는 마크다운 절. */
export function formatReport(r: ReportInput): string {
  const s = summarize(r.attempts)
  const f = r.frames
  const lines = [
    `### Konva 터치 — ${r.device.trim() || '(기기 미입력)'} (${r.date})`,
    `- UA: ${r.userAgent}`,
    `- 화면: ${r.screen}`,
    `- 버전: ${r.versions}`,
    `- ① 두 번째 손가락: 시도 ${s.total} · 통과 ${s.passed} (ⓐ ${s.a} · ⓑ ${s.b} · ⓒ ${s.c}) → ${verdictTouch(s)}`,
    `- ② 40cm 스툴 24px 핸들: ${r.handles}`,
    `- ③ 끌기 rAF p95: ${formatMs(f.dragP95)} (끌기 ${f.dragSeconds.toFixed(1)}초 · 표본 ${f.dragCount}) → ${verdictPerf(f)}`,
    `- 참고: 전체 rAF p95(최근 10초) ${formatMs(f.allP95)} · 표본 ${f.allCount}`,
    '- 시도 기록:',
    ...r.attempts.map(
      (a) =>
        `  - #${a.n} ${a.kind} ${a.itemId} ⓐ${mark(a.a)} ⓑ${mark(a.b)} ⓒ${mark(a.c)} 편차 ${a.maxDeviation.toFixed(3)} 커밋 ${a.commits} 남은 끌기 ${a.remaining}`,
    ),
  ]
  return lines.join('\n')
}
