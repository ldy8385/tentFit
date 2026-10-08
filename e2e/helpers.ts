// Playwright 화면 테스트 공용 도구.
// 앱 상태는 테스트 빌드(`vite --mode test`)만 노출하는 window.__tentfit(스펙 §13.4, Task 12 testHook.ts)으로 읽고,
// 입력은 실제 사용자처럼 마우스·키보드·터치(CDP)로 넣습니다.
import { expect, type CDPSession, type Page } from '@playwright/test'
import type { DocSnapshot, TentfitTestHook, UiSnapshot } from '../src/app/testHook'
import { formatPercent, type StatRow } from '../src/core/stats'

export type { DocSnapshot, UiSnapshot }

/** 브라우저 창 기준 CSS px 좌표(clientX·clientY와 같음) */
export type ClientPt = { x: number; y: number }

type TentfitWindow = { __tentfit?: TentfitTestHook }

/** requestAnimationFrame n번을 기다립니다. Konva는 다음 프레임에 그리므로 화면을 읽기 전에 부릅니다. */
export async function nextFrames(page: Page, n = 2): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let left = count
        const tick = () => {
          left -= 1
          if (left <= 0) resolve()
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
    n,
  )
}

/**
 * 편집 화면(#/edit/<id>)이 뜨고, 캔버스 크기가 잡혀 첫 맞춤 보기를 마치고(__tentfit.ready), Konva 캔버스가 생겨
 * 첫 그림이 그려질 때까지 기다립니다.
 */
export async function waitReady(page: Page): Promise<void> {
  // 처음 띄운 개발 서버는 첫 요청 때 모듈을 변환하느라 느릴 수 있어 기본(5초)보다 넉넉히 기다립니다.
  await expect(page).toHaveURL(/#\/edit\/[^/]+$/, { timeout: 15_000 })
  await page.waitForFunction(
    () =>
      (window as unknown as TentfitWindow).__tentfit?.ready === true &&
      document.querySelector('.konvajs-content canvas') !== null,
  )
  await nextFrames(page)
}

/** 문서 스토어의 데이터({ layout, canUndo, canRedo, inGesture }) */
export async function getDoc(page: Page): Promise<DocSnapshot> {
  return page.evaluate(() => (window as unknown as TentfitWindow).__tentfit!.getDoc())
}

/** 화면 스토어의 데이터({ mode, selection, view, size, insets, mobileSheet, desktopPanel, … }) */
export async function getUi(page: Page): Promise<UiSnapshot> {
  return page.evaluate(() => (window as unknown as TentfitWindow).__tentfit!.getUi())
}

/** 월드 좌표(cm) → 브라우저 창 좌표(px) */
export async function worldToClient(page: Page, x: number, y: number): Promise<ClientPt> {
  return page.evaluate(([wx, wy]) => (window as unknown as TentfitWindow).__tentfit!.worldToClient(wx, wy), [x, y] as const)
}

/** 맞춤 보기(시트·배너 높이를 뺀 영역)로 되돌립니다. */
export async function fitView(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as TentfitWindow).__tentfit!.fitView())
  await nextFrames(page)
}

/**
 * 면적 행 하나(행 이름 바로 뒤에 점유율)와 맞는 정규식. 예: `{ name: '전실 전체', percent: 8 }` → /전실 전체\s*8%/.
 * 이름과 숫자 사이에 다른 숫자가 끼면('전실 전체 18%') 맞지 않습니다.
 */
export function statRowPattern(row: Pick<StatRow, 'name' | 'percent'>): RegExp {
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`${escape(row.name)}\\s*${escape(formatPercent(row.percent))}`)
}

/**
 * 캔버스 레이어(.konvajs-content 안의 canvas)를 DOM 순서대로 흰 바탕에 겹쳐 그린 뒤,
 * 창 좌표 `at` 둘레 radius px 안에서 가장 어두운 픽셀의 밝기(0~255, Rec.601 luma)를 돌려줍니다.
 * 텐트 외곽선(--tent-outline #23261F, 약 36)은 어둡고, 격자(--grid-strong #BBB7A6, 약 182)와 바닥 면은 밝습니다.
 */
export async function darkestAround(page: Page, at: ClientPt, radius = 3): Promise<number> {
  return page.evaluate(
    ({ x, y, r }) => {
      const canvases = Array.from(document.querySelectorAll<HTMLCanvasElement>('.konvajs-content canvas'))
      const first = canvases[0]
      if (first === undefined) throw new Error('.konvajs-content canvas가 없습니다')
      const rect = first.getBoundingClientRect()
      const ratio = first.width / rect.width
      const off = document.createElement('canvas')
      off.width = first.width
      off.height = first.height
      const ctx = off.getContext('2d')
      if (ctx === null) throw new Error('2d 컨텍스트를 만들 수 없습니다')
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, off.width, off.height)
      for (const c of canvases) ctx.drawImage(c, 0, 0)
      const rr = Math.ceil(r * ratio)
      const cx = Math.round((x - rect.left) * ratio)
      const cy = Math.round((y - rect.top) * ratio)
      const data = ctx.getImageData(cx - rr, cy - rr, 2 * rr + 1, 2 * rr + 1).data
      let min = 255
      for (let i = 0; i < data.length; i += 4) {
        const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
        if (luma < min) min = luma
      }
      return min
    },
    { x: at.x, y: at.y, r: radius },
  )
}

/** 마우스로 from에서 to까지 끕니다(누름 → steps번 나눠 이동 → 뗌). */
export async function dragBetween(page: Page, from: ClientPt, to: ClientPt, steps = 12): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps })
  await page.mouse.up()
}

/**
 * 캔버스가 맨 위에 보이는 창 좌표들(칩·시트·버튼·안내 카드에 가리지 않은 곳).
 * 캔버스 영역 안쪽 margin px만큼을 step px 간격으로 훑습니다.
 */
export async function openCanvasPoints(page: Page, opts: { step?: number; margin?: number } = {}): Promise<ClientPt[]> {
  return page.evaluate(
    ({ step, margin }) => {
      const host = document.querySelector('.konvajs-content')
      if (host === null) return []
      const r = host.getBoundingClientRect()
      const out: { x: number; y: number }[] = []
      for (let y = r.top + margin; y <= r.bottom - margin; y += step) {
        for (let x = r.left + margin; x <= r.right - margin; x += step) {
          const el = document.elementFromPoint(x, y)
          if (el instanceof HTMLCanvasElement && host.contains(el)) out.push({ x, y })
        }
      }
      return out
    },
    { step: opts.step ?? 16, margin: opts.margin ?? 24 },
  )
}

/** 창 좌표 at에서 맨 위 요소가 캔버스(.konvajs-content 안의 canvas)인지. 아니면 그 점의 터치는 Stage에 닿지 않습니다. */
export async function isCanvasAt(page: Page, at: ClientPt): Promise<boolean> {
  return page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y)
    return el instanceof HTMLCanvasElement && el.closest('.konvajs-content') !== null
  }, at)
}

/** openCanvasPoints 중 avoid의 모든 점에서 minDist px 이상 떨어진, 캔버스 가운데에 가장 가까운 점 */
export async function pickOpenPoint(
  page: Page,
  opts: { avoid?: ClientPt[]; minDist?: number; margin?: number } = {},
): Promise<ClientPt> {
  const avoid = opts.avoid ?? []
  const minDist = opts.minDist ?? 0
  const points = await openCanvasPoints(page, { margin: opts.margin ?? 24 })
  const box = await page.locator('.konvajs-content').boundingBox()
  if (box === null) throw new Error('.konvajs-content가 보이지 않습니다')
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const ok = points.filter((p) => avoid.every((a) => Math.hypot(p.x - a.x, p.y - a.y) >= minDist))
  ok.sort((a, b) => Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y))
  const best = ok[0]
  if (best === undefined) throw new Error(`가리지 않은 캔버스 점이 없습니다(후보 ${points.length}개, minDist ${minDist})`)
  return best
}

/** 보이는 입력칸(input·select·textarea)의 계산된 글자 크기(px) 목록 */
export async function visibleInputFontSizes(page: Page): Promise<number[]> {
  return page
    .locator('input:not([type="hidden"]), select, textarea')
    .filter({ visible: true })
    .evaluateAll((els) => els.map((el) => Number.parseFloat(getComputedStyle(el).fontSize)))
}

/**
 * CDP `Input.dispatchTouchEvent`로 손가락 여러 개를 흉내 냅니다(Chromium 전용, hasTouch 컨텍스트).
 * Chromium 156(Playwright 1.64)에서 확인한 동작:
 * - touchStart·touchMove의 touchPoints에는 닿아 있는 손가락을 모두 넣습니다. 새 id는 누름, 아는 id는 이동입니다.
 * - touchMove에서 손가락을 빼도 떼어지지 않습니다. 하나만 뗄 때는 touchEnd에 **그 손가락만** 넣습니다
 *   (프로토콜 설명의 "TouchEnd에는 점을 넣지 않는다"와 달리 이렇게 해야 pointerup이 그 손가락에만 갑니다).
 * - 빈 touchEnd는 남은 손가락을 모두 떼고, 빈 touchCancel은 모두 취소합니다(pointercancel → touchcancel 순).
 */
export class Fingers {
  private readonly points = new Map<number, ClientPt>()

  private constructor(private readonly cdp: CDPSession) {}

  static async open(page: Page): Promise<Fingers> {
    return new Fingers(await page.context().newCDPSession(page))
  }

  private async send(
    type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel',
    points: ReadonlyMap<number, ClientPt> = this.points,
  ): Promise<void> {
    const touchPoints = [...points].map(([id, p]) => ({ id, x: p.x, y: p.y }))
    await this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints })
  }

  async down(id: number, at: ClientPt): Promise<void> {
    if (this.points.has(id)) throw new Error(`손가락 ${id}는 이미 닿아 있습니다`)
    this.points.set(id, { ...at })
    await this.send('touchStart')
  }

  /** 주어진 손가락들을 함께 steps번 나눠 목표 위치로 옮깁니다. */
  async move(targets: Readonly<Record<number, ClientPt>>, steps = 8): Promise<void> {
    const plan = Object.entries(targets).map(([key, to]) => {
      const id = Number(key)
      const from = this.points.get(id)
      if (from === undefined) throw new Error(`손가락 ${id}는 닿아 있지 않습니다`)
      return { id, from, to }
    })
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps
      for (const { id, from, to } of plan) {
        this.points.set(id, { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t })
      }
      await this.send('touchMove')
    }
  }

  async up(id: number): Promise<void> {
    const at = this.points.get(id)
    if (at === undefined) throw new Error(`손가락 ${id}는 닿아 있지 않습니다`)
    this.points.delete(id)
    await this.send('touchEnd', this.points.size === 0 ? new Map() : new Map([[id, at]]))
  }

  /** 닿아 있는 손가락을 모두 취소합니다(전화가 와서 터치가 끊긴 경우, 스펙 §13.5-1). */
  async cancel(): Promise<void> {
    this.points.clear()
    await this.send('touchCancel', new Map())
  }

  async detach(): Promise<void> {
    await this.cdp.detach()
  }
}

/** 한 손가락으로 from에서 to까지 끕니다. */
export async function touchDrag(page: Page, from: ClientPt, to: ClientPt, steps = 10): Promise<void> {
  const fingers = await Fingers.open(page)
  try {
    await fingers.down(1, from)
    await fingers.move({ 1: to }, steps)
    await fingers.up(1)
  } finally {
    await fingers.detach()
  }
}

export type SecondFingerPlan = {
  /** 첫 손가락이 닿는 곳(보통 물건 위) */
  first: ClientPt
  /** 두 번째 손가락 전에 첫 손가락으로 끄는 양(px). 탭 경계 8px보다 커야 합니다. */
  dragBy: ClientPt
  /** 두 번째 손가락이 닿는 곳(캔버스의 빈 곳) */
  second: ClientPt
  /** 두 손가락을 서로 멀어지게 벌리는 양(px, 손가락마다 절반씩) */
  spreadBy: number
  /** 한 손가락만 남은 뒤 그 손가락으로 더 끄는 양(px) */
  thenPanBy: ClientPt
  /** 첫 손가락으로 끄는 중(두 번째 손가락 전)에 확인할 것 */
  whileDragging?: () => Promise<void>
  /** 두 번째 손가락이 닿은 직후 확인할 것 */
  afterSecondDown?: () => Promise<void>
}

/**
 * 스펙 §4.5 두 번째 손가락 규칙을 재현합니다:
 * 손가락 1 누름 → 끌기 → (whileDragging) → 손가락 2 누름 → (afterSecondDown) → 두 손가락 벌리기(확대)
 * → 손가락 2 뗌 → 손가락 1로 계속 끌기(화면 이동) → 손가락 1 뗌.
 */
export async function touchSecondFinger(page: Page, plan: SecondFingerPlan): Promise<void> {
  const fingers = await Fingers.open(page)
  try {
    await fingers.down(1, plan.first)
    const dragged = { x: plan.first.x + plan.dragBy.x, y: plan.first.y + plan.dragBy.y }
    await fingers.move({ 1: dragged }, 8)
    await plan.whileDragging?.()

    await fingers.down(2, plan.second)
    await plan.afterSecondDown?.()

    const dx = plan.second.x - dragged.x
    const dy = plan.second.y - dragged.y
    const len = Math.hypot(dx, dy) || 1
    const half = plan.spreadBy / 2
    const ux = (dx / len) * half
    const uy = (dy / len) * half
    const spread1 = { x: dragged.x - ux, y: dragged.y - uy }
    await fingers.move({ 1: spread1, 2: { x: plan.second.x + ux, y: plan.second.y + uy } }, 8)

    await fingers.up(2)
    await fingers.move({ 1: { x: spread1.x + plan.thenPanBy.x, y: spread1.y + plan.thenPanBy.y } }, 6)
    await fingers.up(1)
  } finally {
    await fingers.detach()
  }
}
