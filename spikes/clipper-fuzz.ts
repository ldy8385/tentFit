/// <reference types="node" />
// clipper2-ts 내구성 스파이크(스펙 §14 1번, 계획 P1 Task 5). 확인용으로 쓰고 버리는 코드라 lint 대상이 아니다.
//
// 실행(저장소 루트에서):
//   node --expose-gc --import tsx spikes/clipper-fuzz.ts [--seed 20261007] [--iterations 1000] [--timeout 10000]
// 진행 상황은 stderr, 결과 마크다운은 stdout으로 나온다. 통과면 종료 코드 0, 실패면 1.
//
// 구조: 이 파일이 자기 자신을 자식 프로세스로 띄워 사례를 돌린다(--child). 부모는 사례마다 감시 시간을 재고,
// 시간을 넘기거나(무한 반복) 자식이 죽으면(힙 고갈 — clipper2-ts 이슈 #36 같은 경우) 그 사례를 기록한 뒤
// 다음 사례부터 새 자식으로 이어서 돌린다. 사례는 (seed, 번호)만으로 다시 만들 수 있어서 부모가 입력을 재현한다.
import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  area,
  inflate,
  intersect,
  labelPoint,
  pieces,
  region,
  regionOf,
  regionRings,
  ringArea,
  ringSelfIntersects,
  subtract,
  unionAll,
} from '../src/core/geom'
import type { Region } from '../src/core/geom'
import { EPS_AREA } from '../src/core/model'
import type { Pt } from '../src/core/model'

type CaseKind = 'regression' | 'simple' | 'tangled' | 'thin' | 'collinear'
type FuzzCase = { kind: CaseKind; label: string; rings: Pt[][] }
type CheckFail = { i: number; kind: CaseKind; check: string; detail: string }
type ChildMsg =
  | { t: 'ok'; i: number; ms: number; drift: number }
  | { t: 'error'; i: number; kind: CaseKind; message: string }
  | { t: 'check'; fail: CheckFail }
  | { t: 'heap'; at: number; heapUsed: number }
  | { t: 'done' }

const COORD = 2500
const HEAP_LIMIT_MB = 5
const CHILD_HEAP_MB = 512
const MAX_RESTARTS = 20
/** 정수 격자(0.01cm)로 반올림한 교차점이 움직일 수 있는 최대 거리. 넓이 오차 상한 = 이 값 × 경계 길이. */
const GRID_ERR = 0.005 * Math.SQRT2

// ── 시드 고정 난수(mulberry32) ─────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const between = (rng: () => number, lo: number, hi: number): number => lo + (hi - lo) * rng()
const intBetween = (rng: () => number, lo: number, hi: number): number => Math.floor(between(rng, lo, hi + 1))
const clamp = (v: number): number => Math.max(-COORD, Math.min(COORD, v))
const cm2 = (v: number): number => Math.round(v * 100) / 100

// ── 입력 생성 ─────────────────────────────────────────────────

/** 순서 없는 무작위 꼭짓점(자기교차가 흔함). */
function tangledRing(rng: () => number): Pt[] {
  const k = intBetween(rng, 3, 40)
  const out: Pt[] = []
  for (let i = 0; i < k; i++) out.push([between(rng, -COORD, COORD), between(rng, -COORD, COORD)])
  return out
}

/** 중심 둘레로 각도를 정렬한 단순 다각형(오목할 수 있음). */
function simpleRing(rng: () => number): Pt[] {
  const k = intBetween(rng, 3, 40)
  const cx = between(rng, -1500, 1500)
  const cy = between(rng, -1500, 1500)
  const angles: number[] = []
  for (let i = 0; i < k; i++) angles.push(between(rng, 0, 2 * Math.PI))
  angles.sort((a, b) => a - b)
  return angles.map((t): Pt => {
    const r = between(rng, 10, 1000)
    return [clamp(cx + r * Math.cos(t)), clamp(cy + r * Math.sin(t))]
  })
}

/** 밑변 1~3,000cm, 높이 0.001~0.5cm인 얇은 삼각형. */
function thinTriangle(rng: () => number): Pt[] {
  const x0 = between(rng, -COORD, COORD)
  const y0 = between(rng, -COORD, COORD)
  const t = between(rng, 0, 2 * Math.PI)
  const len = between(rng, 1, 3000)
  const h = between(rng, 0.001, 0.5)
  const x1 = clamp(x0 + len * Math.cos(t))
  const y1 = clamp(y0 + len * Math.sin(t))
  return [
    [x0, y0],
    [x1, y1],
    [(x0 + x1) / 2 - h * Math.sin(t), (y0 + y1) / 2 + h * Math.cos(t)],
  ]
}

/**
 * 수평선(절반은 수직선) 위에 꼭짓점을 여러 개 놓고 앞뒤로 오가게(되접힘) 만든 고리.
 * 절반은 높이가 0.01~0.05cm로 거의 납작하다(clipper2-ts 이슈 #36과 같은 모양).
 */
function collinearRing(rng: () => number): Pt[] {
  const x0 = cm2(between(rng, -2000, 1000))
  const y0 = cm2(between(rng, -2000, 2000))
  const height = rng() < 0.5 ? intBetween(rng, 1, 5) / 100 : cm2(between(rng, 10, 500))
  const chain: Pt[] = [[x0, y0]]
  let x = x0
  const k = intBetween(rng, 3, 30)
  for (let i = 0; i < k; i++) {
    x = clamp(cm2(x + between(rng, -150, 300)))
    chain.push([x, y0])
  }
  const xEnd = clamp(Math.max(...chain.map((p) => p[0])) + 1)
  const ring: Pt[] = [...chain, [xEnd, y0], [xEnd, clamp(y0 + height)], [x0 + 0.5, clamp(y0 + height)]]
  return rng() < 0.5 ? ring : ring.map(([px, py]): Pt => [py, px])
}

const REGRESSION: FuzzCase[] = [
  {
    kind: 'regression',
    label: 'clipper2-ts #36 고리(y −2,460,000 이동, cm) + 큰 사각형',
    rings: [
      [
        [7612.06, 30.86],
        [7612.52, 30.86],
        [7612.58, 30.86],
        [7612.09, 30.87],
        [7612.13, 30.87],
        [7612.81, 30.86],
        [7613.23, 30.86],
        [7613.68, 30.86],
      ],
      [
        [7000, 0],
        [8000, 0],
        [8000, 100],
        [7000, 100],
      ],
    ],
  },
  {
    kind: 'regression',
    label: 'clipper2-ts #35 삼각형 3개(이슈의 정수 좌표를 cm로)',
    rings: [
      [
        [91, 7],
        [-145, -11],
        [-141, -15],
      ],
      [
        [-28, 75],
        [-33, 76],
        [1, 0],
      ],
      [
        [-22, 51],
        [-39, 76],
        [-25, -2],
      ],
    ],
  },
  {
    kind: 'regression',
    label: '큰 사각형 + 되접힌 수평 뾰족점',
    rings: [
      [
        [0, 0],
        [100, 0],
        [100, 50],
        [160, 50],
        [120, 50],
        [100, 50.5],
        [100, 100],
        [0, 100],
      ],
      [
        [50, 20],
        [150, 20],
        [150, 80],
        [50, 80],
      ],
    ],
  },
]

/** 사례 번호 i(0부터)의 입력. 앞의 REGRESSION.length개는 고정 회귀 사례. */
function makeCase(seed: number, i: number): FuzzCase {
  const fixed = REGRESSION[i]
  if (fixed) return fixed
  const rng = mulberry32((seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0)
  const u = rng()
  const kind: CaseKind = u < 0.05 ? 'thin' : u < 0.1 ? 'collinear' : u < 0.55 ? 'simple' : 'tangled'
  const m = intBetween(rng, 2, 5)
  const rings: Pt[][] = []
  for (let j = 0; j < m; j++) {
    if (kind === 'thin' && j < 2) rings.push(thinTriangle(rng))
    else if (kind === 'collinear' && j === 0) rings.push(collinearRing(rng))
    else if (kind === 'tangled') rings.push(tangledRing(rng))
    else rings.push(simpleRing(rng))
  }
  return { kind, label: `무작위 #${i - REGRESSION.length + 1}`, rings }
}

// ── 사례 하나 실행(geom 수준) ───────────────────────────────────

function perimeter(ring: Pt[]): number {
  let s = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i] as Pt
    const b = ring[(i + 1) % ring.length] as Pt
    s += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  return s
}

const regionPerimeter = (r: Region): number => regionRings(r).reduce((s, ring) => s + perimeter(ring), 0)

function bboxRing(rings: Pt[][]): Pt[] {
  const xs = rings.flatMap((r) => r.map((p) => p[0]))
  const ys = rings.flatMap((r) => r.map((p) => p[1]))
  const minX = Math.min(...xs) - 10
  const minY = Math.min(...ys) - 10
  const maxX = Math.max(...xs) + 10
  const maxY = Math.max(...ys) + 10
  return [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ]
}

function sumPieces(r: Region): { sum: number; count: number } {
  const ps = pieces(r)
  return { sum: ps.reduce((s, p) => s + p.area, 0), count: ps.length }
}

/**
 * 불변식 위반 목록과 포함-배제 오차(참고 지표)를 돌려준다. 예외는 호출한 쪽이 잡는다.
 * 허용 오차: ε + GRID_ERR × (관련 입력의 경계 길이 합). 교차점을 0.01cm 격자로 반올림해서 생기는 넓이 오차의 상한이다.
 */
function runCase(c: FuzzCase): { fails: { check: string; detail: string }[]; drift: number } {
  const fails: { check: string; detail: string }[] = []
  const fail = (check: string, detail: string): void => {
    fails.push({ check, detail })
  }
  const regions = c.rings.map(region)
  const sum = regions.reduce((s, r) => s + area(r), 0)
  const perims = regions.map(regionPerimeter)
  const tolAll = EPS_AREA + GRID_ERR * perims.reduce((s, p) => s + p, 0)

  // 1) 합집합 넓이 ≤ 개별 합(스펙 §14 기준)
  const u = unionAll(regions)
  const au = area(u)
  if (au > sum + tolAll) fail('합집합 ≤ 개별 합', `union ${au} > sum ${sum} (+허용 ${tolAll.toFixed(3)})`)
  // 방향 통일(D18): 자기교차가 없는 고리들이면 한 번에 합친 것과 하나씩 정리해 합친 것이 같다
  if (c.rings.every((ring) => !ringSelfIntersects(ring))) {
    const a2 = area(regionOf(c.rings))
    if (Math.abs(a2 - au) > tolAll) fail('regionOf = unionAll', `regionOf ${a2} vs unionAll ${au}`)
  }

  // 2) 차집합·교집합 상한
  const [first = [], ...rest] = regions
  const restU = unionAll(rest)
  const d = subtract(first, restU)
  const i = intersect(first, restU)
  const ad = area(d)
  const ai = area(i)
  const af = area(first)
  if (ad > af + tolAll) fail('차집합 ≤ 원래', `subtract ${ad} > ${af} (+허용 ${tolAll.toFixed(3)})`)
  if (ai > Math.min(af, area(restU)) + tolAll) fail('교집합 ≤ 둘 중 작은 것', `intersect ${ai}`)
  const drift = Math.abs(ad + ai - af)

  // 3) inflate 단조성(합집합과 차집합 결과 둘 다 — 차집합 결과가 이슈 #36 모양을 만들 수 있음)
  for (const [name, r] of [
    ['U', u],
    ['D', d],
  ] as const) {
    const a0 = area(r)
    const tol = EPS_AREA + GRID_ERR * regionPerimeter(r)
    const ap = area(inflate(r, 0.5))
    const am = area(inflate(r, -0.5))
    if (ap < a0 - tol) fail(`inflate(+0.5) ≥ ${name}`, `${ap} < ${a0}`)
    if (am > a0 + tol) fail(`inflate(−0.5) ≤ ${name}`, `${am} > ${a0}`)
  }

  // 4) 조각 넓이 합 = 영역 넓이(§6.3, 섬 이중 계산 없음). 같은 정수 경로라 ε 안에서 같아야 한다.
  const dp = sumPieces(d)
  if (Math.abs(dp.sum - ad) > EPS_AREA * (dp.count + 1)) fail('조각 합 = 차집합', `${dp.sum} vs ${ad}`)
  const floor = subtract(region(bboxRing(c.rings)), u)
  const fp = sumPieces(floor)
  if (Math.abs(fp.sum - area(floor)) > EPS_AREA * (fp.count + 1)) fail('조각 합 = 바닥', `${fp.sum} vs ${area(floor)}`)

  // 5) 라벨 위치가 유한함
  const lp = labelPoint(floor)
  if (!Number.isFinite(lp[0]) || !Number.isFinite(lp[1])) fail('labelPoint 유한', JSON.stringify(lp))

  // 6) 얇은 삼각형은 반올림 오차 안에서 넓이 보존(#35류 구멍 메움·조각 사라짐 감지)
  if (c.kind === 'thin') {
    for (const ring of c.rings.slice(0, 2)) {
      const exact = ringArea(ring)
      const got = area(region(ring))
      if (Math.abs(got - exact) > EPS_AREA + GRID_ERR * perimeter(ring))
        fail('얇은 삼각형 넓이', `region ${got} vs 해석값 ${exact}`)
    }
  }
  return { fails, drift }
}

// ── 자식 프로세스 ─────────────────────────────────────────────

function runChild(start: number, total: number, seed: number, heapAt: number[]): void {
  const send = (m: ChildMsg): void => {
    process.send?.(m)
  }
  const gc = (globalThis as { gc?: () => void }).gc
  for (let i = start; i < total; i++) {
    const c = makeCase(seed, i)
    const t0 = performance.now()
    let drift = 0
    try {
      const res = runCase(c)
      drift = res.drift
      for (const f of res.fails) send({ t: 'check', fail: { i, kind: c.kind, ...f } })
    } catch (e) {
      send({ t: 'error', i, kind: c.kind, message: e instanceof Error ? e.message : String(e) })
    }
    send({ t: 'ok', i, ms: performance.now() - t0, drift })
    if (heapAt.includes(i + 1)) {
      if (gc) {
        gc()
        gc()
      }
      send({ t: 'heap', at: i + 1, heapUsed: gc ? process.memoryUsage().heapUsed : Number.NaN })
    }
  }
  // IPC 채널이 열려 있으면 자식이 끝나지 않으므로, 마지막 메시지를 보낸 뒤 채널을 닫는다.
  process.send?.({ t: 'done' } satisfies ChildMsg, () => process.disconnect?.())
}

// ── 부모 프로세스 ─────────────────────────────────────────────

type Stopped = { i: number; reason: string; c: FuzzCase }
type RunOutcome = { done: boolean; lastOk: number; reason: string }

function arg(name: string, fallback: number): number {
  const k = process.argv.indexOf(`--${name}`)
  const v = k >= 0 ? Number(process.argv[k + 1]) : Number.NaN
  return Number.isFinite(v) ? v : fallback
}

function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0
}

async function runParent(): Promise<void> {
  const seed = arg('seed', 20261007)
  const iterations = arg('iterations', 1000)
  const timeoutMs = arg('timeout', 10000)
  const R = REGRESSION.length
  const total = R + iterations
  const heapAt = [R + Math.min(100, iterations), total]
  const self = fileURLToPath(import.meta.url)

  const times: number[] = []
  let maxDrift = 0
  const errors: { i: number; kind: CaseKind; message: string }[] = []
  const checks: CheckFail[] = []
  const stopped: Stopped[] = []
  const heap = new Map<number, { run: number; heapUsed: number }>()
  const kinds: Record<CaseKind, number> = { regression: 0, simple: 0, tangled: 0, thin: 0, collinear: 0 }
  for (let i = 0; i < total; i++) kinds[makeCase(seed, i).kind]++

  let start = 0
  let run = 0
  let restarts = 0
  const t0 = performance.now()
  while (start < total) {
    run++
    const thisRun = run
    const outcome = await new Promise<RunOutcome>((resolve) => {
      let lastOk = start - 1
      let finished = false
      const child = fork(self, ['--child', String(start), String(total), String(seed), heapAt.join(',')], {
        execArgv: ['--expose-gc', '--import', 'tsx', `--max-old-space-size=${CHILD_HEAP_MB}`],
        stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
      })
      const onTimeout = (): void => {
        if (finished) return
        finished = true
        child.kill('SIGKILL')
        resolve({ done: false, lastOk, reason: `${timeoutMs}ms 안에 끝나지 않음(멈춤)` })
      }
      let timer = setTimeout(onTimeout, timeoutMs)
      child.on('message', (raw) => {
        const m = raw as ChildMsg
        clearTimeout(timer)
        timer = setTimeout(onTimeout, timeoutMs)
        if (m.t === 'ok') {
          lastOk = m.i
          times.push(m.ms)
          maxDrift = Math.max(maxDrift, m.drift)
          if ((m.i + 1) % 100 === 0) process.stderr.write(`  ${m.i + 1}/${total}\n`)
        } else if (m.t === 'error') errors.push({ i: m.i, kind: m.kind, message: m.message })
        else if (m.t === 'check') checks.push(m.fail)
        else if (m.t === 'heap') heap.set(m.at, { run: thisRun, heapUsed: m.heapUsed })
        else {
          finished = true
          clearTimeout(timer)
          resolve({ done: true, lastOk, reason: '' })
        }
      })
      child.on('exit', (code, signal) => {
        clearTimeout(timer)
        if (finished) return
        finished = true
        resolve({ done: false, lastOk, reason: `자식 프로세스 비정상 종료(code ${code}, signal ${signal})` })
      })
    })
    if (outcome.done) break
    const bad = outcome.lastOk + 1
    stopped.push({ i: bad, reason: outcome.reason, c: makeCase(seed, bad) })
    process.stderr.write(`  사례 ${bad} 중단: ${outcome.reason}\n`)
    restarts++
    if (restarts > MAX_RESTARTS) break
    start = bad + 1
  }
  const elapsed = performance.now() - t0

  const h1 = heap.get(heapAt[0] ?? 0)
  const h2 = heap.get(heapAt[1] ?? 0)
  const heapComparable = h1 !== undefined && h2 !== undefined && h1.run === h2.run && Number.isFinite(h1.heapUsed)
  const heapDiffMb = heapComparable ? (h2.heapUsed - h1.heapUsed) / 1024 / 1024 : Number.NaN
  const unionFails = checks.filter((c) => c.check === '합집합 ≤ 개별 합')
  const otherFails = checks.filter((c) => c.check !== '합집합 ≤ 개별 합')
  const heapOk = heapComparable && heapDiffMb < HEAP_LIMIT_MB
  const pass = errors.length === 0 && stopped.length === 0 && checks.length === 0 && heapOk

  const ok = (b: boolean): string => (b ? '통과' : '**실패**')
  const lines: string[] = []
  lines.push('## clipper2-ts 내구성 스파이크 (P1 Task 5)', '')
  lines.push(`- 실행: ${new Date().toISOString()}, Node ${process.version}, 걸린 시간 ${(elapsed / 1000).toFixed(1)}초`)
  lines.push(
    `- 명령: \`node --expose-gc --import tsx spikes/clipper-fuzz.ts --seed ${seed} --iterations ${iterations} --timeout ${timeoutMs}\``,
  )
  lines.push(
    `- 입력: 고정 회귀 ${R}건 + 무작위 ${iterations}회(고리 2~5개, 꼭짓점 3~40, 좌표 ±${COORD}cm). 단순 다각형 ${kinds.simple} · 자기교차 ${kinds.tangled} · 얇은 삼각형 ${kinds.thin} · 일직선 꼭짓점 ${kinds.collinear}`,
  )
  lines.push(
    '- 사례마다: region ×n, unionAll, regionOf, subtract, intersect, inflate(±0.5) ×4, pieces ×2, labelPoint',
    `- 넓이 허용 오차: ε(${EPS_AREA}cm²) + ${GRID_ERR.toFixed(4)}cm × 관련 경계 길이(교차점의 0.01cm 격자 반올림 상한). 조각 넓이 합만 ε × (조각 수 + 1)`,
    '',
  )
  lines.push('| 항목 | 기준 | 결과 | 판정 |', '|---|---|---|---|')
  lines.push(`| 예외 | 0건 | ${errors.length}건 | ${ok(errors.length === 0)} |`)
  lines.push(
    `| 멈춤·비정상 종료(사례당 ${timeoutMs / 1000}초, 자식 힙 ${CHILD_HEAP_MB}MB) | 0건 | ${stopped.length}건 | ${ok(stopped.length === 0)} |`,
  )
  lines.push(`| 합집합 넓이 ≤ 개별 합 | 위반 0건 | ${unionFails.length}건 | ${ok(unionFails.length === 0)} |`)
  lines.push(
    `| 그 밖의 불변식(방향 통일, 차·교집합 상한, inflate 단조성, 조각 넓이 합, 얇은 삼각형 넓이) | 위반 0건 | ${otherFails.length}건 | ${ok(otherFails.length === 0)} |`,
  )
  lines.push(
    `| gc 후 heapUsed 차이(무작위 ${(heapAt[0] ?? R) - R}회차 → ${iterations}회차) | ${HEAP_LIMIT_MB}MB 미만 | ${heapComparable ? `${heapDiffMb.toFixed(2)}MB` : '측정 불가(중간에 자식이 다시 시작됨)'} | ${ok(heapOk)} |`,
  )
  lines.push('')
  lines.push(
    `- 참고 지표: 사례 1건 처리 시간 p50 ${percentile(times, 50).toFixed(1)}ms · p95 ${percentile(times, 95).toFixed(1)}ms · 최대 ${percentile(times, 100).toFixed(1)}ms, 포함-배제 오차 |area(A−B)+area(A∩B)−area(A)| 최대 ${maxDrift.toFixed(4)}cm²`,
  )
  const shown = [
    ...errors.map((e) => `예외 — 사례 ${e.i}(${e.kind}): ${e.message}`),
    ...stopped.map((s) => `멈춤 — 사례 ${s.i}(${s.c.label}): ${s.reason}\n  입력: \`${JSON.stringify(s.c.rings)}\``),
    ...checks.map((c) => `불변식 — 사례 ${c.i}(${c.kind}) ${c.check}: ${c.detail}`),
  ].slice(0, 20)
  if (shown.length > 0) {
    lines.push('', '실패 사례(최대 20건. 사례 번호는 같은 seed로 다시 만들 수 있음):', '')
    for (const s of shown) lines.push(`- ${s}`)
  }
  lines.push('')
  lines.push(
    pass
      ? '**판정: 통과 — `geom.ts`는 clipper2-ts를 그대로 쓴다. Plan 2를 시작한다.**'
      : '**판정: 실패 — 계획 P1 Task 5의 "실패 시 교체 절차"대로 `geom.ts` 내부를 martinez-polygon-clipping으로 바꾸고, 골든(`pnpm vitest run src/core/geom.test.ts`)과 이 스파이크를 같은 seed로 다시 돌린다.**',
  )
  lines.push('')
  process.stdout.write(lines.join('\n') + '\n')
  process.exitCode = pass ? 0 : 1
}

// ── 진입점 ───────────────────────────────────────────────────

const childAt = process.argv.indexOf('--child')
if (childAt >= 0) {
  const [start, total, seed, heapList] = process.argv.slice(childAt + 1)
  runChild(Number(start), Number(total), Number(seed), (heapList ?? '').split(',').map(Number))
} else {
  await runParent()
}
