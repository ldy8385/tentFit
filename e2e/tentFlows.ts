// 텐트 흐름(고르기·만들기·텐트 편집·텐트 바꾸기, Plan 4·4.1) 화면 테스트가 함께 쓰는 조작.
// 버튼은 프로젝트에 맞춰 누르고(터치 프로젝트는 tap, PC는 click), 캔버스는 마우스(PC) 또는 CDP 터치(휴대폰)로 누릅니다.
// 텐트 꼭짓점·이너의 화면 좌표는 문서(window.__tentfit.getDoc)에서 월드 좌표를 읽어 worldToClient로 바꿉니다.
import { expect, test, type Locator, type Page } from '@playwright/test'
import type { Inner, Pt, Tent } from '../src/core/model'
import { targetWorldRing, type TentTarget } from '../src/core/ops/tent'
import {
  dragBetween,
  EDITOR_HOOK,
  Fingers,
  getDoc,
  getUi,
  MAKER_HOOK,
  nextFrames,
  touchDrag,
  worldToClient,
  type ClientPt,
  type HookKey,
} from './helpers'

/** 펼친 시트 위로 남기는 캔버스 높이(sheets.css: 요약 칩 56 + 보일 영역 88 + 여백 32) */
export const MIN_CANVAS_ABOVE_SHEET_PX = 176

/** presets/tents/generic.json의 예시 텐트 이름 */
export const TUNNEL = '터널 4인 예시' // 외곽 620×320, 이너 1(220×300) 중심 (−200, 0)
export const LIVING_SHELL = '리빙쉘 예시' // 외곽 500×400
export const DOME = '돔 2인 예시' // 외곽 210×210
export const TIPI = '티피 6각 예시' // 정육각형, 이너 없음

/** 터널 4인 예시에서 이너를 피한 전실 바닥 한 점(월드 cm). 텐트 모드에서 누르면 외곽이 대상이 됩니다. */
export const TUNNEL_FLOOR: Pt = [150, 0]

/** 지금 프로젝트가 터치(휴대폰)인지 */
export function isTouchProject(): boolean {
  return test.info().project.use.hasTouch === true
}

/** 버튼·카드 누르기: 터치 프로젝트는 tap, PC는 click */
export async function press(target: Locator): Promise<void> {
  if (isTouchProject()) await target.tap()
  else await target.click()
}

/** 브라우저 뒤로 가기(history.back). 해시·pushState 항목을 오가므로 페이지를 다시 읽지 않습니다. */
export async function browserBack(page: Page): Promise<void> {
  await page.evaluate(() => window.history.back())
}

/** 지금 history 항목이 텐트 만들기 오버레이가 쌓은 항목인지(남아 있으면 뒤로 가기가 한 번 헛돎) */
export async function onMakerHistoryEntry(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const s: unknown = window.history.state
    return typeof s === 'object' && s !== null && 'tentMaker' in s
  })
}

// ── 고르기 화면 ────────────────────────────────────────────

export const pickScreen = (page: Page) => page.getByTestId('pick-screen')
export const pickCard = (page: Page, name: string) => pickScreen(page).getByRole('button', { name, exact: true })
export const makeCard = (page: Page) => pickScreen(page).getByTestId('make-tent-card')

/** 빈 앱('/')을 열어 고르기 화면(#/pick)과 텐트 목록이 보일 때까지 기다립니다. */
export async function openPickScreen(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page).toHaveURL(/#\/pick$/, { timeout: 15_000 })
  // 텐트 목록은 동적 import 청크라 처음 띄운 개발 서버에서는 늦게 나올 수 있습니다.
  await expect(pickCard(page, TUNNEL)).toBeVisible({ timeout: 15_000 })
}

/**
 * 요소와 그 안의 스크롤 영역이 가로로 넘치는 양(px). 0이면 가로 스크롤 없음. 문서 전체 폭도 함께 봅니다.
 * allow: 일부러 가로 스크롤하는 영역(만들기 화면 도구 줄, 설계 §1.2)의 선택자 — 그 안은 보지 않습니다.
 */
export async function horizontalOverflowPx(target: Locator, allow?: string): Promise<number> {
  return target.evaluate((root, allowed) => {
    let worst = document.documentElement.scrollWidth - window.innerWidth
    for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
      if (allowed !== null && el.closest(allowed) !== null) continue
      const style = getComputedStyle(el)
      if (el === root || style.overflowX === 'auto' || style.overflowX === 'scroll') {
        worst = Math.max(worst, el.scrollWidth - el.clientWidth)
      }
    }
    return worst
  }, allow ?? null)
}

// ── 텐트 만들기 화면 ───────────────────────────────────────

export const tentMaker = (page: Page) => page.getByTestId('tent-maker')
/** 단계 ②의 확정 버튼(접근 이름 = 전체 문구. 휴대폰은 짧은 글자만 보임) */
export const makerConfirm = (page: Page, name: '이 텐트로 시작' | '이 텐트로 바꾸기' = '이 텐트로 시작') =>
  tentMaker(page).getByRole('button', { name, exact: true })
/** 단계 ①의 주 버튼 [다음] */
export const makerNextButton = (page: Page) => tentMaker(page).getByRole('button', { name: '다음', exact: true })
/** 만들기 화면의 입력칸(라벨, 예: '텐트 이름', '변 1') */
export const makerField = (page: Page, label: string) => tentMaker(page).getByLabel(label, { exact: true })
/** 도구 줄(예시 4종·자유 그리기) */
export const makerTools = (page: Page) => tentMaker(page).getByRole('toolbar', { name: '모양 도구' })
/** 만들기 화면의 텐트 패널(PC 오른쪽 패널, 휴대폰 시트 안) */
export const makerPanel = (page: Page) => tentMaker(page).getByTestId('tent-editor')
/** 휴대폰 만들기 화면의 늘 보이는 시트 */
export const makerSheet = (page: Page) => page.getByTestId('tent-maker-sheet')

/** 고르기 화면 [직접 만들기] → 만들기 화면이 열릴 때까지 */
export async function openTentMaker(page: Page): Promise<void> {
  await press(makeCard(page))
  await expect(tentMaker(page)).toBeVisible()
}

/** 지금 단계('1' 외곽 · '2' 이너) */
export async function makerStep(page: Page): Promise<string | null> {
  return tentMaker(page).getAttribute('data-step')
}

/** 도구 줄의 예시 모양 하나를 누릅니다(단계 ① = 외곽, 단계 ② = 이너 추가). */
export async function pickExample(page: Page, name: '사각형' | '사다리꼴' | '육각형' | '정N각형' | '원'): Promise<void> {
  await press(makerTools(page).getByRole('button', { name, exact: true }))
  await nextFrames(page)
}

/** 도구 줄 [자유 그리기] */
export async function startMakerDrawing(page: Page): Promise<void> {
  await press(makerTools(page).getByRole('button', { name: '자유 그리기', exact: true }))
  await expect.poll(async () => (await getUi(page, MAKER_HOOK)).drawing).not.toBeNull()
  // 휴대폰은 그리기 버튼 줄이 생겨 캔버스가 줄고 자동 맞춤 보기가 한 번 더 돕니다. 끝난 뒤 점을 찍습니다.
  await waitViewStable(page, MAKER_HOOK)
}

/** 보기(view)가 더 바뀌지 않을 때까지(시트·그리기 줄로 캔버스 크기가 바뀐 뒤 자동 맞춤 보기가 끝날 때까지) 기다립니다. */
export async function waitViewStable(page: Page, key: HookKey = EDITOR_HOOK): Promise<void> {
  let prev = ''
  await expect
    .poll(
      async () => {
        await nextFrames(page)
        const v = JSON.stringify((await getUi(page, key)).view)
        const same = v === prev
        prev = v
        return same
      },
      { intervals: [50, 100, 100, 200, 300] },
    )
    .toBe(true)
}

/** [다음] → 단계 ② */
export async function makerNext(page: Page): Promise<void> {
  await press(makerNextButton(page))
  await expect.poll(() => makerStep(page)).toBe('2')
}

/** 패널(또는 시트) 숫자 칸에 값을 넣고 Enter로 반영합니다. */
export async function setPanelNumber(scope: Locator, label: string, value: number): Promise<void> {
  const field = scope.getByLabel(label, { exact: true })
  await field.fill(String(value))
  await field.press('Enter')
  await expect(field).toHaveValue(String(value))
}

/** 월드 점(cm)을 캔버스에서 짧게 누름(PC 클릭, 휴대폰 CDP 탭). key = 어느 캔버스(편집기·만들기 화면) */
export async function tapWorld(page: Page, pt: Pt, key: HookKey = EDITOR_HOOK): Promise<void> {
  await tapCanvas(page, await worldToClient(page, pt[0], pt[1], key))
}

/** 그리는 중 점들을 차례로 찍습니다(탭 = 점). */
export async function drawPoints(page: Page, pts: readonly Pt[], key: HookKey = EDITOR_HOOK): Promise<void> {
  for (const p of pts) await tapWorld(page, p, key)
}

/** [그리기 완료](PC 그리기 막대·휴대폰 툴바 공통 이름) */
export const drawDoneButton = (page: Page) => page.getByRole('button', { name: '그리기 완료', exact: true })

// ── 편집기: 모드·텐트 대상 ───────────────────────────────────

export const toolbar = (page: Page) => page.getByTestId('toolbar')
export const tentEditor = (page: Page) => page.getByTestId('tent-editor')
export const tentSheet = (page: Page) => page.getByTestId('sheet-tent')
export const swapDialog = (page: Page) => page.getByTestId('swap-tent-dialog')
export const toast = (page: Page) => page.getByTestId('toast')
export const tentEditStatus = (page: Page) => page.getByTestId('tent-edit-status')

/** 텐트 편집 모드로: PC는 상단 바 토글 [배치 | 텐트 편집], 휴대폰은 툴바 [텐트] */
export async function enterTentModeByUi(page: Page): Promise<void> {
  if (isTouchProject()) {
    await toolbar(page).getByRole('button', { name: '텐트', exact: true }).tap()
  } else {
    await page.getByRole('radiogroup', { name: '편집 모드' }).getByRole('radio', { name: '텐트 편집', exact: true }).click()
  }
  await expect.poll(async () => (await getUi(page)).mode).toBe('tent')
  await nextFrames(page)
}

/** 배치 모드로: PC는 토글 [배치], 휴대폰은 툴바 [완료] */
export async function exitTentModeByUi(page: Page): Promise<void> {
  if (isTouchProject()) {
    await toolbar(page).getByRole('button', { name: '완료', exact: true }).tap()
  } else {
    await page.getByRole('radiogroup', { name: '편집 모드' }).getByRole('radio', { name: '배치', exact: true }).click()
  }
  await expect.poll(async () => (await getUi(page)).mode).toBe('place')
}

/** 지금 문서의 텐트 */
export async function getTent(page: Page): Promise<Tent> {
  return (await getDoc(page)).layout.tent
}

/** 이름으로 이너 찾기 */
export async function innerNamed(page: Page, name: string): Promise<Inner> {
  const inner = (await getTent(page)).inners.find((i) => i.name === name)
  if (inner === undefined) throw new Error(`이너 '${name}'가 없습니다`)
  return inner
}

/** 대상(외곽·이너)의 꼭짓점 월드 좌표(번호는 0부터, core targetWorldRing 순서 — 사각형은 왼쪽 위부터 시계 방향) */
export async function vertexWorld(page: Page, target: TentTarget, index: number): Promise<Pt> {
  const ring = targetWorldRing((await getDoc(page)).layout, target)
  const p = ring[index]
  if (p === undefined) throw new Error(`꼭짓점 ${index}이 없습니다(꼭짓점 ${ring.length}개)`)
  return p
}

/** 대상 꼭짓점의 창 좌표 */
export async function vertexClient(page: Page, target: TentTarget, index: number): Promise<ClientPt> {
  const [x, y] = await vertexWorld(page, target, index)
  return worldToClient(page, x, y)
}

/** 캔버스 한 점을 짧게 누름(PC 클릭, 휴대폰 CDP 한 손가락 탭) */
export async function tapCanvas(page: Page, at: ClientPt): Promise<void> {
  if (isTouchProject()) {
    const fingers = await Fingers.open(page)
    try {
      await fingers.down(1, at)
      await fingers.up(1)
    } finally {
      await fingers.detach()
    }
  } else {
    await page.mouse.click(at.x, at.y)
  }
  await nextFrames(page)
}

/** 캔버스에서 from → to로 끌기(PC 마우스, 휴대폰 CDP 한 손가락) */
export async function dragCanvas(page: Page, from: ClientPt, to: ClientPt): Promise<void> {
  if (isTouchProject()) await touchDrag(page, from, to, 10)
  else await dragBetween(page, from, to, 12)
  await nextFrames(page)
}

/** 텐트 모드에서 바닥(이너가 아닌 외곽 안) 한 점을 눌러 외곽을 편집 대상으로 고릅니다. */
export async function selectOuter(page: Page, floor: Pt = TUNNEL_FLOOR): Promise<void> {
  await tapCanvas(page, await worldToClient(page, floor[0], floor[1]))
  await expect.poll(async () => (await getUi(page)).tentTarget).toBe('outer')
  await nextFrames(page)
}

/**
 * 마우스로 from을 누르고 to까지 나눠 옮긴 뒤, 누른 채로 whileHolding을 부르고 뗍니다(PC 전용).
 * 끄는 중의 상태(제스처 중 여부, 「놓으면 취소돼요」)를 확인할 때 씁니다.
 */
export async function mouseDragHolding(
  page: Page,
  from: ClientPt,
  to: ClientPt,
  whileHolding: () => Promise<void>,
  steps = 12,
): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  try {
    await page.mouse.move(to.x, to.y, { steps })
    await nextFrames(page)
    await whileHolding()
  } finally {
    await page.mouse.up()
  }
  await nextFrames(page)
}

/** 두 점이 tol 안에서 같은지(cm) */
export function near(a: Pt, b: Pt, tol = 1): boolean {
  return Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol
}
