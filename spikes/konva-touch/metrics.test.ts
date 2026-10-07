import { describe, expect, it } from 'vitest'
import {
  attrsDeviation,
  FrameWindow,
  formatReport,
  judgeAttempt,
  percentile,
  summarize,
  verdictPerf,
  verdictTouch,
  type AttemptRecord,
  type NodeAttrs,
} from './metrics'

const START: NodeAttrs = { x: 0, y: -60, rotation: 0, scaleX: 1, scaleY: 1 }

function record(n: number, patch: Partial<AttemptRecord> = {}): AttemptRecord {
  const obs = { start: START, finalNode: START, finalModel: START, maxDeviation: 0, commits: 0, remaining: 0 }
  return { ...obs, ...judgeAttempt(obs), n, kind: 'drag', itemId: 'c2', ...patch }
}

describe('percentile (nearest-rank)', () => {
  it('1..100의 p95는 95', () => {
    expect(percentile(Array.from({ length: 100 }, (_, i) => i + 1), 95)).toBe(95)
  })
  it('20프레임 중 느린 프레임 1개는 p95에 안 잡히고, 2개면 잡힌다', () => {
    expect(percentile([...Array<number>(19).fill(16), 40], 95)).toBe(16)
    expect(percentile([...Array<number>(18).fill(16), 40, 40], 95)).toBe(40)
  })
  it('빈 배열은 null', () => {
    expect(percentile([], 95)).toBeNull()
  })
})

describe('FrameWindow', () => {
  it('전체 창은 최근 10초(벽시계)만 남긴다: 16ms × 1250 → 625개, p95 16', () => {
    const w = new FrameWindow(10_000)
    for (let k = 0; k <= 1250; k++) w.tick(k * 16, false)
    const s = w.stats()
    expect(s.allCount).toBe(625)
    expect(s.allP95).toBe(16)
    expect(s.dragCount).toBe(0)
    expect(s.dragP95).toBeNull()
    expect(s.dragSeconds).toBe(0)
  })

  it('끌기 창은 끌기 시간 합 10초만 남기고, 손을 뗀 뒤에도 유지된다', () => {
    const w = new FrameWindow(10_000)
    for (let k = 0; k <= 700; k++) w.tick(k * 16, true)
    expect(w.stats()).toMatchObject({ dragCount: 625, dragSeconds: 10, dragP95: 16 })
    for (let k = 701; k <= 800; k++) w.tick(k * 16, false)
    expect(w.stats()).toMatchObject({ dragCount: 625, dragSeconds: 10, dragP95: 16 })
  })

  it('양 끝 프레임이 모두 끌기일 때만 끌기 간격으로 센다', () => {
    const w = new FrameWindow(10_000)
    w.tick(0, false)
    w.tick(16, true)
    w.tick(32, true)
    w.tick(48, false)
    expect(w.stats()).toMatchObject({ allCount: 3, dragCount: 1 })
  })

  it('1초 넘는 간격(탭 숨김)은 버린다', () => {
    const w = new FrameWindow(10_000)
    w.tick(0, false)
    w.tick(16, false)
    w.tick(5000, false)
    w.tick(5016, false)
    expect(w.stats().allCount).toBe(2)
  })

  it('reset은 모두 비운다', () => {
    const w = new FrameWindow(10_000)
    for (let k = 0; k <= 10; k++) w.tick(k * 16, true)
    w.reset()
    expect(w.stats()).toEqual({ allP95: null, allCount: 0, dragP95: null, dragCount: 0, dragSeconds: 0 })
  })
})

describe('judgeAttempt (스펙 §14 ①)', () => {
  const ok = { start: START, finalNode: START, finalModel: START, maxDeviation: 0, commits: 0, remaining: 0 }

  it('그대로면 ⓐⓑⓒ 모두 통과', () => {
    expect(judgeAttempt(ok)).toEqual({ a: true, b: true, c: true, pass: true })
  })
  it('ⓐ: 노드가 0.5cm 어긋나거나, 모델이 바뀌었거나, 커밋이 있으면 실패', () => {
    expect(judgeAttempt({ ...ok, finalNode: { ...START, x: 0.5 } }).a).toBe(false)
    expect(judgeAttempt({ ...ok, finalModel: { ...START, y: -59 } }).a).toBe(false)
    expect(judgeAttempt({ ...ok, commits: 1 }).a).toBe(false)
    expect(judgeAttempt({ ...ok, finalNode: { ...START, x: Number.NaN } }).a).toBe(false)
  })
  it('ⓑ: 두 번째 손가락 뒤 3cm 움직였으면 실패', () => {
    expect(judgeAttempt({ ...ok, maxDeviation: 3 })).toEqual({ a: true, b: false, c: true, pass: false })
  })
  it('ⓒ: 남은 끌기가 있으면 실패', () => {
    expect(judgeAttempt({ ...ok, remaining: 1 })).toEqual({ a: true, b: true, c: false, pass: false })
  })
  it('attrsDeviation은 다섯 값 차이의 최댓값', () => {
    expect(attrsDeviation(START, { x: 1, y: -62, rotation: 0.5, scaleX: 1, scaleY: 1.25 })).toBe(2)
  })
})

describe('판정과 보고서', () => {
  it('summarize는 항목별 통과 수를 센다', () => {
    const recs = [record(1), record(2, { b: false, pass: false }), record(3, { a: false, c: false, pass: false })]
    expect(summarize(recs)).toEqual({ total: 3, passed: 1, a: 2, b: 2, c: 2 })
  })

  it('verdictTouch: 20회 모두 통과여야 통과', () => {
    expect(verdictTouch(summarize(Array.from({ length: 20 }, (_, i) => record(i + 1))))).toBe('통과')
    expect(verdictTouch(summarize(Array.from({ length: 19 }, (_, i) => record(i + 1))))).toBe('시도 부족')
    expect(verdictTouch(summarize([record(1, { a: false, pass: false })]))).toBe('실패')
  })

  it('verdictPerf: 끌기 10초 이상 측정하고 p95 ≤ 20ms', () => {
    const base = { allP95: 17, allCount: 600, dragCount: 600, dragSeconds: 10 }
    expect(verdictPerf({ ...base, dragP95: 20 })).toBe('통과')
    expect(verdictPerf({ ...base, dragP95: 20.1 })).toBe('실패')
    expect(verdictPerf({ ...base, dragP95: 16, dragSeconds: 9.9 })).toBe('측정 부족')
  })

  it('formatReport는 붙여 넣을 마크다운 절을 만든다', () => {
    const attempts = Array.from({ length: 20 }, (_, i) => record(i + 1))
    attempts[1] = record(2, { kind: 'transform', itemId: 'r3' })
    const text = formatReport({
      date: '2026-10-08',
      device: 'iPhone 13 mini',
      userAgent: 'Mozilla/5.0 (iPhone)',
      screen: '375×812 @3x',
      versions: 'konva 10.7.1 · react-konva 19.3.0 · react 19.3.0',
      handles: '가능',
      frames: { allP95: 16.9, allCount: 590, dragP95: 16.7, dragCount: 600, dragSeconds: 10 },
      attempts,
    })
    const lines = text.split('\n')
    expect(lines[0]).toBe('### Konva 터치 — iPhone 13 mini (2026-10-08)')
    expect(lines).toContain('- ① 두 번째 손가락: 시도 20 · 통과 20 (ⓐ 20 · ⓑ 20 · ⓒ 20) → 통과')
    expect(lines).toContain('- ② 40cm 스툴 24px 핸들: 가능')
    expect(lines).toContain('- ③ 끌기 rAF p95: 16.7ms (끌기 10.0초 · 표본 600) → 통과')
    expect(lines).toContain('- 참고: 전체 rAF p95(최근 10초) 16.9ms · 표본 590')
    expect(lines).toContain('  - #1 drag c2 ⓐO ⓑO ⓒO 편차 0.000 커밋 0 남은 끌기 0')
    expect(lines).toContain('  - #2 transform r3 ⓐO ⓑO ⓒO 편차 0.000 커밋 0 남은 끌기 0')
  })

  it('실패한 시도는 X로 표시하고 ①이 실패가 된다', () => {
    const text = formatReport({
      date: '2026-10-08',
      device: '',
      userAgent: 'UA',
      screen: '360×800 @2x',
      versions: 'v',
      handles: '미확인',
      frames: { allP95: null, allCount: 0, dragP95: null, dragCount: 0, dragSeconds: 0 },
      attempts: [record(1, { commits: 1, a: false, pass: false })],
    })
    expect(text).toContain('### Konva 터치 — (기기 미입력) (2026-10-08)')
    expect(text).toContain('- ① 두 번째 손가락: 시도 1 · 통과 0 (ⓐ 0 · ⓑ 1 · ⓒ 1) → 실패')
    expect(text).toContain('- ③ 끌기 rAF p95: — (끌기 0.0초 · 표본 0) → 측정 부족')
    expect(text).toContain('  - #1 drag c2 ⓐX ⓑO ⓒO 편차 0.000 커밋 1 남은 끌기 0')
  })
})
