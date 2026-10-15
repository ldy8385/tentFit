// 편집 캔버스(스펙 §4.5·§4.6·§7 규칙 2). 문서 스토어가 원본이고 Konva 노드는 그리기만 합니다.
// - 물건 끌기·핸들 변형은 Konva(draggable·Transformer)가 하고, 손을 뗄 때 doc.commit 한 번으로 반영합니다.
// - 빈 곳 끌기·두 손가락·탭은 GestureArbiter가 판정합니다. 포인터 이벤트는 캔버스 컨테이너의 캡처 단계에서
//   Konva보다 먼저 받습니다(Konva 스파이크에서 실기기로 검증한 연결 방식).
// - 텐트 편집 모드(§4.4)는 Konva 끌기를 쓰지 않습니다. 누름 대상은 tentGesture.classifyTentPress(순수 판정, R10·R19),
//   이너·꼭짓점 끌기는 컨트롤러가 포인터 이동으로 직접 계산해 미리보기(화면 상태)만 그리고, 손을 뗄 때
//   tentActions로 한 번 커밋합니다. 잘못된 결과·두 번째 손가락·취소는 커밋 0(§4.4-8·§4.5).
// - 자유 그리기(Plan 4.1, 설계 2026-10-12 §2.2): 그리는 중 누름은 텐트 대상 판정을 타지 않고 빈 곳(화면 이동)으로 다룹니다.
//   점은 판정기의 tap 출력으로만 찍고(끌기·두 손가락·취소는 점 없음), 고무줄·길이 배지는 화면 상태(overlay)입니다.
import Konva from 'konva'
import type { Box } from 'konva/lib/shapes/Transformer'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX } from 'react'
import { Circle, Group, Image as KImage, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva'
import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'
import { useStats, useZones } from '../../app/derived'
import { moveBackdrop, scaleBackdropAt } from '../../app/backdropActions'
import { measurementRows, measureTap } from '../../app/measureActions'
import { useDoc, useStores, useUi, type Stores } from '../../app/stores'
import {
  appendDrawPoint,
  commitInnerMove,
  finishDrawing,
  insertTargetVertex,
  selectTentTargetFromCanvas,
  setTargetVertex,
  tentControlsEnabled,
} from '../../app/tentActions'
import { LIMITS, normAngle, round1, type Item, type Layout, type Pt, type Shape } from '../../core/model'
import { drawGridOrigin } from '../../core/polygonEdit'
import type { SymAxis } from '../../core/symmetry'
import { expandSelection } from '../../core/ops/groups'
import { applyTransform, moveItems } from '../../core/ops/items'
import { worldRing } from '../../core/geom'
import { buildSnapContext, snapMove, SNAP_PX, type Seg, type SnapContext, type SnapLock } from '../../core/snap'
import { toPointerKind, type PointerKind } from '../../store/ui'
import { blurActiveInput } from '../../ui/fields/blurActive'
import { THEME } from '../../ui/theme'
import { GestureArbiter, TAP_SLOP, type GestureOutput, type PointerSample } from '../gestures'
import { buildScene } from '../scene'
import { INVALID_EDIT_STYLE } from '../tentEdit'
import { fitBBoxFor, screenToWorld, wheelAction, type View } from '../viewport'
import { axisBoundPosition } from '../axisLock'
import { drawTapEffect, pressMoved, rubberBand, rubberVisible, tentDim } from './drawGesture'
import { DimOverlay } from './DimOverlay'
import { DrawLayer } from './DrawLayer'
import { itemsInRect, rectFromCorners } from './marquee'
import { GridShape, ItemShape, TentContent, WarningMarks } from './nodes'
import {
  classifyTentPress,
  pressGrabs,
  pressSelection,
  tentDragFor,
  tentDragStarted,
  tentDragStep,
  tentTapEffect,
  type TentDrag,
  type TentPressHit,
  type TentPreview,
  type TentSelection,
} from './tentGesture'
import { TentLayer } from './TentLayer'
import { transformerConfig } from './transformerConfig'

/** 회전 핸들 자석: 15°마다(±3°, §6.6 — 벽과 평행한 각은 아직 없음) */
const ROTATION_SNAPS = Array.from({ length: 24 }, (_, i) => i * 15)
/** 같은 물건을 이 시간(ms) 안에 다시 누르면 두 번 누름(모양 편집) */
const DOUBLE_TAP_MS = 400
/** 이보다 작게 움직였으면(cm, 저장 단위 0.1cm의 절반) 끌기를 커밋하지 않습니다. */
const MOVE_EPS_CM = 0.05
/** 핸들로 이보다 작게(화면 px) 줄이지 못하게 합니다. 1cm가 이보다 크게 보이면 1cm가 하한입니다. */
const MIN_BOX_PX = 2
const BADGE_GAP_PX = 10
/** transformend의 skew 검사 허용치(부동소수 잡음) */
const SKEW_EPS = 1e-6
const EMPTY_IDS: ReadonlySet<string> = new Set()
/** 화면에는 안 보이고 보조 기술·화면 테스트만 읽는 글자(캔버스 라벨 「놓으면 취소돼요」의 DOM 사본) */
const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const

type Overlay = {
  marquee: { left: number; top: number; width: number; height: number } | null
  badge: { text: string; x: number; y: number } | null
  /** 텐트 끌기 미리보기(문서 밖 화면 상태, §8). 손을 떼거나 되돌리면 null */
  tentPreview: TentPreview | null
  /** 끄는 동안 붙은 대상 변(자석 맞춤 안내선, 월드 cm). 없으면 [] */
  snapGuides: Seg[]
  /** 그리는 중 고무줄 끝(화면 px — 휠 이동 뒤에도 포인터에 붙어 있게 월드가 아니라 화면 좌표). 안 보이면 null */
  drawPointer: { screen: Pt; pointer: PointerKind; right: boolean } | null
}

type Session = { kind: 'drag'; leadId: string; ids: string[] } | { kind: 'transform'; ids: string[] }

/** 자석 맞춤이 켜졌는지: 설정(snapEnabled)을 Alt를 누르는 동안 반대로(§6.6) */
export function snapOn(enabled: boolean, alt: boolean): boolean {
  return enabled !== alt
}

/** 끌기 시작 때 자석 맞춤 준비: 붙을 대상(끄는 물건 빼고), 끄는 물건 고리(원은 격자용 상자만), 모두 0·90·180·270°인지 */
function snapPrepFor(layout: Layout, ids: string[], gridStep: number): { ctx: SnapContext; rings: Pt[][]; gridRings: Pt[][]; axisAligned: boolean; lock: SnapLock } {
  const set = new Set(ids)
  const moving = layout.items.filter((it) => set.has(it.id))
  const rings: Pt[][] = []
  const gridRings: Pt[][] = []
  for (const it of moving) {
    if (it.shape.kind === 'circle') {
      const r = it.shape.d / 2
      gridRings.push([
        [it.x - r, it.y - r],
        [it.x + r, it.y - r],
        [it.x + r, it.y + r],
        [it.x - r, it.y + r],
      ])
    } else {
      const ring = worldRing(it)
      rings.push(ring)
      gridRings.push(ring)
    }
  }
  const axisAligned = moving.every((it) => it.shape.kind === 'circle' || it.rotation % 90 === 0)
  return { ctx: buildSnapContext(layout, { exclude: set, mode: 'items', gridStep }), rings, gridRings, axisAligned, lock: {} }
}

/** 캔버스 위 DOM 조작 층(치수 숫자·입력 등, [data-canvas-ui]) 안의 이벤트인지. 그 누름은 캔버스 제스처로 보내지 않습니다. */
function inCanvasUi(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-canvas-ui]') !== null
}

function isEditable(el: Element | EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'
}

function sameView(a: View, b: View): boolean {
  return a.zoom === b.zoom && a.panX === b.panX && a.panY === b.panY
}

function fmt(v: number): string {
  return String(round1(v))
}

/** 변형 중 치수 배지 문구(§4.6). 크기는 Konva scale을 곱한 값이고, 커밋 때 applyTransform이 같은 규칙으로 반영합니다. */
function dimsBadge(shape: Shape, scaleX: number, scaleY: number): string {
  const sx = Math.abs(scaleX)
  const sy = Math.abs(scaleY)
  if (shape.kind === 'circle') {
    const k = Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy
    return `⌀${fmt(shape.d * k)} cm`
  }
  let w: number
  let h: number
  if (shape.kind === 'rect') {
    w = shape.w
    h = shape.h
  } else {
    const xs = shape.points.map((p) => p[0])
    const ys = shape.points.map((p) => p[1])
    w = Math.max(...xs) - Math.min(...xs)
    h = Math.max(...ys) - Math.min(...ys)
  }
  return `${fmt(w * sx)} × ${fmt(h * sy)} cm`
}

/** Konva 노드와 포인터를 다루는 부분. React 렌더와 상관없이 스토어의 최신 상태(getState)를 읽습니다. */
class BoardController {
  private host: HTMLDivElement | null = null
  private stage: Konva.Stage | null = null
  private tr: Konva.Transformer | null = null
  private readonly nodes = new Map<string, Konva.Group>()
  private dimmed: ReadonlySet<string> = EMPTY_IDS
  private readonly arbiter = new GestureArbiter()
  private space = false
  private hover = false
  /** 되돌린 제스처의 dragend·transformend가 커밋하지 못하게 합니다. 모든 포인터가 떨어진 뒤 풉니다. */
  private suppress = false
  private locked = false
  private session: Session | null = null
  private gestureOpen = false
  /** 이번 누름이 선택에 넣은 물건(토글 모드의 탭이 바로 빼지 않게) */
  private pressAdded = false
  /** 이번 누름이 선택을 바꾸기 직전의 선택. 핀치·취소로 누름이 무효가 되면 이것으로 되돌립니다. */
  private pressPrevSelection: string[] | null = null
  private pressId: string | null = null
  private marqueeAdd = false
  /** 이번 누름이 텐트 편집 모드에서 시작됐음(탭을 텐트 규칙으로 처리) */
  private pressInTent = false
  /** 텐트 모드 누름 대상. 탭으로 끝나면 tentTapEffect로 처리합니다. */
  private tentHit: TentPressHit | null = null
  /** 이번 누름이 텐트 대상·꼭짓점을 바꾸기 직전 값. 핀치·취소로 누름이 무효가 되면 되돌립니다(Review Focus 1). */
  private tentPrev: TentSelection | null = null
  /** 텐트 끌기 후보(꼭짓점·이너 누름). tentDragLive면 실제로 끄는 중(미리보기를 그림, 제스처 열림) */
  private tentDrag: TentDrag | null = null
  private tentDragLive = false
  /** 마지막 자동 맞춤 보기. 사용자가 보기를 바꾸지 않았으면 크기가 바뀔 때 다시 맞춥니다. */
  private autoFit: View | null = null
  /** 이번 누름이 거리 재기 중에 시작됐음(탭 = 대상 고르기, 끌기 = 화면 이동) */
  private pressInMeasure = false
  /** Alt를 누르고 있음(자석 맞춤 켜짐·꺼짐 반전, §6.6) */
  private altDown = false
  /** 물건을 끄는 동안의 자석 맞춤 준비물(끌기 시작 때 만듦) */
  private snap: { ctx: SnapContext; rings: Pt[][]; gridRings: Pt[][]; axisAligned: boolean; lock: SnapLock } | null = null
  /** 마지막 물건 탭(두 번 누름 = 모양 편집) */
  private lastTap: { id: string; at: number } | null = null
  /** 이번 누름이 배경 이미지 맞추기 중에 시작됐음(끌기 = 이미지 이동, 두 손가락 = 이미지 크기, 탭 = 없음) */
  private pressInBackdrop = false
  /** 이번 누름이 자유 그리기 중에 시작됐음(탭 = 점, 끌기 = 화면 이동, 텐트 대상 판정 안 함) */
  private pressInDraw = false
  /** 첫 포인터를 누른 화면 점(고무줄을 탭/끌기 경계 안에서만 보이게) */
  private pressStart: Pt | null = null
  /** Shift를 누르고 있음(포인터·키 이벤트로 갱신). 끄는 동안 누르면 상하좌우로만 이동 */
  private shiftDown = false
  /** 지금 Konva로 끄는 물건의 끌기 시작 절대 위치(상하좌우로만 이동 기준점) */
  private dragStartAbs: { x: number; y: number } | null = null

  constructor(
    private readonly stores: Stores,
    private readonly overlay: StoreApi<Overlay>,
    private readonly setActive: (ids: ReadonlySet<string>) => void,
  ) {}

  /** 렌더가 끝날 때마다 DOM·Konva 참조와 흐린(조작 불가) 물건 목록을 받습니다. */
  attach(
    refs: { host: HTMLDivElement | null; stage: Konva.Stage | null; tr: Konva.Transformer | null },
    dimmed: ReadonlySet<string>,
  ): void {
    this.host = refs.host
    this.stage = refs.stage
    this.tr = refs.tr
    this.dimmed = dimmed
    this.syncTransformer()
  }

  readonly register = (id: string, node: Konva.Group | null): void => {
    if (node) this.nodes.set(id, node)
    else this.nodes.delete(id)
  }

  // ── 포인터 ────────────────────────────────────────────────────────────

  private local(e: { clientX: number; clientY: number }): Pt {
    const r = this.host?.getBoundingClientRect()
    return r ? [e.clientX - r.left, e.clientY - r.top] : [e.clientX, e.clientY]
  }

  /** 화면 점 아래의 물건 id 또는 Transformer 핸들. Konva의 hit 캔버스(listening 규칙 포함)를 씁니다. */
  private hitAt(p: Pt): { kind: 'item'; id: string } | { kind: 'anchor' } | null {
    const shape = this.stage?.getIntersection({ x: p[0], y: p[1] })
    if (!shape) return null
    if (this.tr && shape.getParent() === this.tr) return { kind: 'anchor' }
    const group = shape.findAncestor('.item')
    return group ? { kind: 'item', id: group.id() } : null
  }

  /** 상하좌우로만 이동할지: PC는 Shift를 누르는 동안, 휴대폰은 시트 [상하좌우] 토글(ui.axisLock) */
  private axisLocked(): boolean {
    return this.shiftDown || this.stores.ui.getState().axisLock
  }

  /** Konva dragBoundFunc: 상하좌우로만이면 끌기 시작 절대 위치 기준 한 축으로 고정(여러 개·그룹은 Transformer가 같은 이동량으로 따라옴) */
  readonly dragBound = (pos: { x: number; y: number }): { x: number; y: number } => {
    const start = this.dragStartAbs
    if (start === null) return pos
    const locked = this.axisLocked()
    const p = locked ? axisBoundPosition(start, pos) : pos
    const snap = this.snap
    const ui = this.stores.ui.getState()
    if (snap === null || !snapOn(ui.snapEnabled, this.altDown)) {
      if (this.overlay.getState().snapGuides.length > 0) this.overlay.setState({ snapGuides: [] })
      return p
    }
    // 자석 맞춤(§6.6): 화면 이동량을 월드로 바꿔 core/snap에 맡기고, 상하좌우 고정이면 다른 축은 다시 0으로
    const z = ui.view.zoom
    const r = snapMove(snap.ctx, {
      rings: snap.rings,
      gridRings: snap.gridRings,
      axisAligned: snap.axisAligned,
      delta: [(p.x - start.x) / z, (p.y - start.y) / z],
      T: SNAP_PX / z,
      lock: snap.lock,
    })
    snap.lock = r.lock
    this.overlay.setState({ snapGuides: r.guides })
    let dx = r.delta[0] * z
    let dy = r.delta[1] * z
    if (locked) {
      if (p.x === start.x) dx = 0
      if (p.y === start.y) dy = 0
    }
    return { x: start.x + dx, y: start.y + dy }
  }

  readonly onPointerDown = (e: PointerEvent): void => {
    this.shiftDown = e.shiftKey
    this.altDown = e.altKey
    if (inCanvasUi(e.target)) return
    // 오른쪽 버튼(겹친 물건 목록)은 이후 계획에서 붙입니다.
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return
    blurActiveInput()
    const kind = toPointerKind(e.pointerType)
    const ui = this.stores.ui.getState()
    ui.setPointer(kind)
    const p = this.local(e)
    const sample: PointerSample = {
      id: e.pointerId,
      pointer: kind,
      x: p[0],
      y: p[1],
      button: e.button,
      shift: e.shiftKey,
      space: this.space,
      isPrimary: e.isPrimary,
    }
    // 앞 제스처의 떼기를 놓쳤으면(보류 Minor #8) 남은 끌기·범위 선택을 되돌리고 새 첫 포인터로 다룹니다.
    if (this.arbiter.pointerCount > 0 && this.arbiter.startsNew(sample)) this.recoverStale()
    const panOverride = this.space || e.button === 1
    const tentMode = ui.mode === 'tent'
    let onNode = false
    if (this.arbiter.pointerCount === 0) {
      // 누르는 동안 시트가 열려도 화면을 옮기지 않게 알립니다(옮기면 그 이동량이 끌기에 섞임).
      ui.setCanvasPressed(true)
      this.pressAdded = false
      this.pressPrevSelection = null
      this.pressId = null
      this.marqueeAdd = e.shiftKey
      this.pressInTent = tentMode
      this.tentHit = null
      this.tentPrev = null
      this.tentDrag = null
      this.tentDragLive = false
      this.pressInBackdrop = ui.backdrop?.adjusting === true
      this.pressInMeasure = !this.pressInBackdrop && ui.measuring
      this.pressInDraw = !this.pressInBackdrop && !this.pressInMeasure && tentMode && ui.drawing !== null && tentControlsEnabled(ui)
      this.pressStart = p
      if (this.pressInBackdrop || this.pressInMeasure) {
        // 맞추기 중에는 물건·텐트를 잡지 않습니다(Konva 끌기도 잠금).
        this.lock()
      } else if (this.pressInDraw) {
        if (!panOverride) this.showRubber(p, kind)
      } else if (tentMode) {
        if (!panOverride) onNode = this.pressTent(p, kind, e.pointerId)
      } else {
        const hit = panOverride ? null : this.hitAt(p)
        if (hit?.kind === 'anchor') onNode = true
        if (hit?.kind === 'item') {
          onNode = true
          this.pressItem(hit.id, e.shiftKey, kind)
        }
      }
      // 스페이스·가운데 버튼 끌기는 물건 위에서도 화면 이동입니다. Konva가 물건을 끌지 못하게 잠급니다.
      if (panOverride) this.lock()
    }
    // 텐트 모드의 바닥·외곽선 끌기는 포인터 종류와 상관없이 화면 이동입니다(R10, 마우스도 범위 선택 아님).
    this.handle(
      this.arbiter.down(sample, onNode, this.pressInTent || this.pressInDraw || this.pressInBackdrop || this.pressInMeasure ? 'pan' : 'marquee'),
    )
    if (this.arbiter.pointerCount >= 2) {
      this.lock()
      this.hideRubber()
    }
    // 판정하지 않는 버튼(펜 지우개 등)은 누름으로 치지 않습니다(떼기 처리가 오지 않음).
    if (this.arbiter.pointerCount === 0) ui.setCanvasPressed(false)
  }

  readonly onPointerMove = (e: PointerEvent): void => {
    this.shiftDown = e.shiftKey
    this.altDown = e.altKey
    if (this.arbiter.pointerCount === 0) {
      this.hoverRubber(e)
      return
    }
    const p = this.local(e)
    const before = this.arbiter.pointerCount
    const outs = this.arbiter.move({
      id: e.pointerId,
      pointer: toPointerKind(e.pointerType),
      x: p[0],
      y: p[1],
      buttons: e.buttons,
    })
    // 마우스·펜이 버튼을 뗀 채 움직임 = 떼기를 놓쳤음. 판정기가 떼기로 처리했으므로 여기서도 떼기로 마무리합니다.
    if (this.arbiter.pointerCount < before) {
      this.release(e.pointerId, p, outs)
      return
    }
    this.handle(outs)
    this.dragTent(e.pointerId, p)
    if (this.pressInDraw) this.trackRubber(p, toPointerKind(e.pointerType))
  }

  readonly onPointerUp = (e: PointerEvent): void => {
    if (this.arbiter.pointerCount === 0) return
    const p = this.local(e)
    this.release(
      e.pointerId,
      p,
      this.arbiter.up({ id: e.pointerId, pointer: toPointerKind(e.pointerType), x: p[0], y: p[1], shift: e.shiftKey }),
    )
  }

  /** 포인터 하나를 뗌: 텐트 끌기를 먼저 끝내고(커밋 또는 되돌림) 판정기 출력(탭 등)을 적용합니다. */
  private release(pointerId: number, p: Pt, outs: GestureOutput[]): void {
    this.endTentDrag(pointerId, p)
    this.handle(outs)
    if (this.arbiter.pointerCount === 0) {
      this.tentHit = null
      this.tentPrev = null
      // 터치 고무줄은 누르는 동안만 보입니다(마우스·펜은 hover로 이어짐). setTimeout(afterAllUp)보다 먼저 지웁니다.
      if (this.pressInDraw && this.overlay.getState().drawPointer?.pointer === 'touch') this.hideRubber()
      this.pressInDraw = false
      this.pressInBackdrop = false
      this.pressInMeasure = false
      this.pressStart = null
      this.afterAllUp()
    }
  }

  /** pointercancel·touchcancel·visibilitychange(hidden): 시작 상태로 되돌리고 커밋하지 않습니다(§4.5). */
  readonly cancelAll = (): void => {
    this.handle(this.arbiter.cancel())
    if (this.session || this.isKonvaBusy() || this.tentDrag !== null) this.cancelNodeGesture()
    // 그린 점은 지우지 않습니다(앞 탭들에서 이미 찍힘). 이번 누름의 고무줄만 지웁니다.
    this.overlay.setState({ marquee: null, drawPointer: null })
    this.pressInDraw = false
    this.pressStart = null
    this.afterAllUp()
  }

  /** 떼기를 놓친 앞 제스처의 흔적(끌던 노드·텐트 미리보기·범위 선택 사각형·잠금)을 지웁니다. 새 누름 직전에 부릅니다. */
  private recoverStale(): void {
    this.handle(this.arbiter.cancel())
    if (this.session || this.isKonvaBusy() || this.tentDrag !== null) this.cancelNodeGesture()
    this.overlay.setState({ marquee: null, drawPointer: null })
    this.suppress = false
    this.unlock()
  }

  /** touchstart가 두 번째 pointerdown보다 먼저 오는 브라우저 대비(스파이크의 multiTouchHint와 같은 역할). */
  readonly onTouchStart = (e: TouchEvent): void => {
    if (e.touches.length < 2) return
    if (this.session || this.isKonvaBusy() || this.tentDrag !== null) this.cancelNodeGesture()
    this.lock()
    this.hideRubber()
  }

  readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    const a = wheelAction(e)
    const ui = this.stores.ui.getState()
    if (ui.backdrop?.adjusting === true) {
      if (a.type === 'zoom') scaleBackdropAt(this.stores, a.factor, screenToWorld(ui.view, this.local(e)))
      else moveBackdrop(this.stores, a.dx / ui.view.zoom, a.dy / ui.view.zoom)
      return
    }
    if (a.type === 'zoom') ui.zoomAt(a.factor, this.local(e))
    else ui.panBy(a.dx, a.dy)
  }

  readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Shift') this.shiftDown = true
    if (e.key === 'Alt') this.altDown = true
    if (e.code !== 'Space' || e.isComposing || isEditable(e.target) || isEditable(document.activeElement)) return
    this.space = true
    if (this.host) this.host.style.cursor = 'grab'
    // 캔버스 위의 Space는 페이지 스크롤·버튼 누름 대신 화면 이동에 씁니다(§4.5).
    if (this.hover) e.preventDefault()
  }

  readonly onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === 'Shift') this.shiftDown = false
    if (e.key === 'Alt') this.altDown = false
    if (e.code !== 'Space') return
    this.releaseSpace()
  }

  readonly releaseSpace = (): void => {
    this.shiftDown = false
    this.altDown = false
    this.space = false
    if (this.host) this.host.style.cursor = ''
  }

  readonly onHover = (inside: boolean): void => {
    this.hover = inside
    // 캔버스 밖(그리기 막대·패널)으로 나가면 hover 고무줄을 지웁니다.
    if (!inside && this.arbiter.pointerCount === 0) this.hideRubber()
  }

  // ── 자유 그리기(Plan 4.1) ──────────────────────────────────────────────

  private drawingActive(): boolean {
    const ui = this.stores.ui.getState()
    return ui.mode === 'tent' && ui.drawing !== null && tentControlsEnabled(ui)
  }

  private showRubber(screen: Pt, pointer: PointerKind): void {
    this.overlay.setState({ drawPointer: { screen: [screen[0], screen[1]], pointer, right: this.axisLocked() } })
  }

  private hideRubber(): void {
    if (this.overlay.getState().drawPointer !== null) this.overlay.setState({ drawPointer: null })
  }

  /** 누르지 않은 마우스·펜이 캔버스 위에서 움직일 때(hover) 고무줄. 리스너가 window라 캔버스 밖 이동은 hover로 거릅니다. */
  private hoverRubber(e: PointerEvent): void {
    const pointer = toPointerKind(e.pointerType)
    if (!this.drawingActive() || !rubberVisible({ pointer, hovering: this.hover, pressing: false, moved: false })) {
      this.hideRubber()
      return
    }
    this.showRubber(this.local(e), pointer)
  }

  /** 누르는 동안: 한 손가락·경계 안이면 고무줄을 포인터에, 경계를 넘거나(화면 이동) 두 손가락이면 숨깁니다. */
  private trackRubber(p: Pt, pointer: PointerKind): void {
    const start = this.pressStart
    const moved = start === null || pressMoved(start, p, pointer)
    const visible = this.arbiter.pointerCount === 1 && !this.locked && rubberVisible({ pointer, hovering: this.hover, pressing: true, moved })
    if (visible) this.showRubber(p, pointer)
    else this.hideRubber()
  }

  /**
   * 그리는 중 탭: 첫 점 근처면 닫기(finishDrawing), 아니면 점(appendDrawPoint — 맞춤·교차 판정·문구는 그쪽).
   * 누르는 사이 다른 손가락으로 [그리기 완료]·[그리기 취소]를 눌러 그리기가 끝났으면 탭을 버립니다(대상 선택으로 새지 않게).
   */
  private onDrawTap(o: { x: number; y: number; pointer: PointerKind; shift: boolean }): void {
    const ui = this.stores.ui.getState()
    const drawing = ui.drawing
    if (drawing === null || !tentControlsEnabled(ui)) return
    const effect = drawTapEffect(drawing, [o.x, o.y], o.pointer, ui.view)
    if (effect.kind === 'close') finishDrawing(this.stores)
    else appendDrawPoint(this.stores, effect.raw, { right: o.shift || ui.axisLock })
  }

  readonly onVisibility = (): void => {
    if (document.visibilityState === 'hidden') this.cancelAll()
  }

  private isKonvaBusy(): boolean {
    if (this.tr?.isTransforming()) return true
    for (const n of this.nodes.values()) if (n.isDragging()) return true
    return false
  }

  private afterAllUp(): void {
    // Konva의 mouseup·touchend 처리(같은 이벤트 차례, pointerup 뒤)가 끝난 뒤 풉니다.
    window.setTimeout(() => {
      this.suppress = false
      this.unlock()
      this.stores.ui.getState().setCanvasPressed(false)
    }, 0)
  }

  private handle(outs: GestureOutput[]): void {
    const ui = this.stores.ui.getState()
    for (const o of outs) {
      switch (o.type) {
        case 'pan':
          if (this.pressInBackdrop) moveBackdrop(this.stores, o.dx / ui.view.zoom, o.dy / ui.view.zoom)
          else ui.panBy(o.dx, o.dy)
          break
        case 'zoom':
          if (this.pressInBackdrop) scaleBackdropAt(this.stores, o.factor, screenToWorld(ui.view, [o.cx, o.cy]))
          else ui.zoomAt(o.factor, [o.cx, o.cy])
          break
        case 'tap':
          if (this.pressInBackdrop) break
          if (this.pressInMeasure) {
            measureTap(this.stores, screenToWorld(ui.view, [o.x, o.y]), o.pointer)
            break
          }
          if (this.pressInDraw) this.onDrawTap(o)
          else if (this.pressInTent) this.onTentTap()
          else this.onTap(o.onNode, o.shift)
          break
        case 'marquee':
          this.onMarquee(o)
          break
        case 'cancelNodeGesture':
          this.cancelNodeGesture()
          break
      }
    }
  }

  // ── 선택 ──────────────────────────────────────────────────────────────

  private select(ids: string[]): void {
    const ui = this.stores.ui.getState()
    ui.setSelection(ids)
    // 캔버스에서 직접 고르면 경고 패널 대신 속성 패널(§4.6)
    if (ids.length > 0 && ui.desktopPanel === 'warnings') ui.patch({ desktopPanel: 'auto' })
    this.syncTransformer()
  }

  /**
   * 물건 위에서 누르는 순간 선택을 정해 Transformer에 붙입니다. 그래야 Konva가 끌기를 시작할 때
   * 그룹 멤버·다중 선택이 함께 끌립니다(Transformer가 붙은 노드들을 같이 옮김).
   */
  private pressItem(id: string, shift: boolean, kind: PointerKind): void {
    this.pressId = id
    this.nodes.get(id)?.dragDistance(TAP_SLOP[kind])
    const ui = this.stores.ui.getState()
    if (ui.selection.includes(id)) return
    const layout = this.stores.doc.getState().layout
    const expanded = expandSelection(layout, [id], ui.scopeGroupId ?? undefined)
    this.pressAdded = true
    this.pressPrevSelection = [...ui.selection]
    const toggle = shift || ui.selectToggle
    this.select(toggle ? [...new Set([...ui.selection, ...expanded])] : expanded)
  }

  private onTap(onNode: boolean, shift: boolean): void {
    const ui = this.stores.ui.getState()
    const toggle = shift || ui.selectToggle
    if (!onNode) {
      if (toggle) return
      if (ui.scopeGroupId !== null) ui.patch({ scopeGroupId: null })
      this.select([])
      return
    }
    const id = this.pressId
    if (id === null) return // 핸들 탭
    const layout = this.stores.doc.getState().layout
    const expanded = expandSelection(layout, [id], ui.scopeGroupId ?? undefined)
    if (!toggle) {
      // 같은 물건을 빠르게 두 번 = 모양 편집 화면(배치 모드는 이동·회전만, 2026-10-15)
      const now = Date.now()
      const last = this.lastTap
      this.lastTap = { id, at: now }
      if (last !== null && last.id === id && now - last.at <= DOUBLE_TAP_MS) {
        this.lastTap = null
        ui.patch({ itemMaker: { editId: id } })
        return
      }
      this.select(expanded)
      return
    }
    if (this.pressAdded) return
    const drop = new Set(expanded)
    this.select(ui.selection.filter((x) => !drop.has(x)))
  }

  // ── 텐트 편집(§4.4) ────────────────────────────────────────────────────

  /**
   * 텐트 모드 첫 포인터: 대상을 판정하고(R10), 꼭짓점·선택 안 된 이너는 누르는 순간 선택합니다(바로 끌 수 있게).
   * 바꾸기 직전 선택은 tentPrev에 두어 핀치·취소 때 되돌립니다. 노드처럼 잡는 누름이면 true(화면 이동 아님).
   */
  private pressTent(p: Pt, kind: PointerKind, pointerId: number): boolean {
    const ui = this.stores.ui.getState()
    // 측정 중 등 텐트 컨트롤이 잠기면 누름은 빈 곳(화면 이동)이고 탭도 아무것도 하지 않습니다.
    if (!tentControlsEnabled(ui)) return false
    const layout = this.stores.doc.getState().layout
    const hit = classifyTentPress(layout, ui.tentTarget, ui.view, p, kind, ui.tentLock, ui.outerPending)
    this.tentHit = hit
    const cur: TentSelection = { target: ui.tentTarget, vertexIndex: ui.vertexIndex }
    const next = pressSelection(hit, cur)
    if (next !== null) {
      this.tentPrev = cur
      selectTentTargetFromCanvas(this.stores, next.target, next.vertexIndex)
    }
    this.tentDrag = tentDragFor(hit, pointerId, kind, p, ui.view)
    this.tentDragLive = false
    return pressGrabs(hit)
  }

  /** 탭으로 끝난 텐트 누름: + = 꼭짓점 추가, 이너·외곽 = 대상 선택, 바깥 = 대상 해제(§4.4-2·§4.4-7). */
  private onTentTap(): void {
    const hit = this.tentHit
    this.tentHit = null
    this.tentPrev = null
    if (hit === null) return
    const ui = this.stores.ui.getState()
    if (!tentControlsEnabled(ui)) return
    const effect = tentTapEffect(hit)
    if (effect.kind === 'select') selectTentTargetFromCanvas(this.stores, effect.target, effect.vertexIndex)
    else if (effect.kind === 'insert') insertTargetVertex(this.stores, effect.target, effect.edgeIndex)
  }

  /** 끄는 중: 경계를 넘으면 제스처를 열고, 매 이동마다 미리보기를 그립니다(문서는 그대로). */
  /** 대칭 맞춤 축(끄기면 null) */
  private symmetryAxis(): SymAxis | null {
    const a = this.stores.ui.getState().symmetryAxis
    return a === 'off' ? null : a
  }

  /** 꼭짓점 정렬 붙임 거리(cm): 자석 맞춤이 켜졌으면 화면 SNAP_PX, 꺼졌으면 0(정확히 맞을 때만 안내선) */
  private alignTol(): number {
    const ui = this.stores.ui.getState()
    return snapOn(ui.snapEnabled, this.altDown) && ui.view.zoom > 0 ? SNAP_PX / ui.view.zoom : 0
  }

  /** 꼭짓점 끌기 격자 맞춤(그리기와 같은 격자): 자석 맞춤이 켜졌을 때만(Alt로 반대) */
  private vertexGrid(): { origin: Pt; step: number } | null {
    const ui = this.stores.ui.getState()
    if (!snapOn(ui.snapEnabled, this.altDown)) return null
    return { origin: drawGridOrigin(this.stores.doc.getState().layout.tent, ui.outerPending), step: ui.gridStep }
  }

  private dragTent(pointerId: number, p: Pt): void {
    const drag = this.tentDrag
    if (drag === null || drag.pointerId !== pointerId || this.arbiter.pointerCount !== 1) return
    if (!this.tentDragLive) {
      // 잠금(두 손가락·스페이스) 동안에는 새 텐트 끌기를 시작하지 않습니다.
      if (this.locked || this.suppress || !tentDragStarted(drag, p)) return
      this.tentDragLive = true
      this.openGesture()
    }
    const ui = this.stores.ui.getState()
    const { preview } = tentDragStep(this.stores.doc.getState().layout, drag, p, ui.view, {
      axisLock: this.axisLocked(),
      grid: this.vertexGrid(),
      alignTol: this.alignTol(),
      symmetry: this.symmetryAxis(),
      symmetryMirror: this.stores.ui.getState().symmetryMode === 'mirror',
    })
    this.overlay.setState({ tentPreview: preview })
  }

  /**
   * 손을 뗌: 끄던 중이면 마지막 점으로 다시 계산해 정상일 때만 한 번 커밋합니다(제스처 1번 = 커밋 1번, §8).
   * 잘못된 결과·너무 작은 이동은 커밋하지 않고 미리보기만 지웁니다(기록 0, §4.4-8).
   */
  private endTentDrag(pointerId: number, p: Pt): void {
    const drag = this.tentDrag
    if (drag === null || drag.pointerId !== pointerId) return
    const live = this.tentDragLive
    this.tentDrag = null
    this.tentDragLive = false
    if (!live) return
    const { commit } = tentDragStep(this.stores.doc.getState().layout, drag, p, this.stores.ui.getState().view, {
      axisLock: this.axisLocked(),
      grid: this.vertexGrid(),
      alignTol: this.alignTol(),
      symmetry: this.symmetryAxis(),
      symmetryMirror: this.stores.ui.getState().symmetryMode === 'mirror',
    })
    this.overlay.setState({ tentPreview: null })
    this.closeGesture()
    this.tentPrev = null
    if (commit === null) return
    if (commit.kind === 'vertex') setTargetVertex(this.stores, commit.target, commit.index, commit.world)
    else commitInnerMove(this.stores, commit.innerId, commit.dx, commit.dy)
  }

  /** 두 번째 손가락·취소: 텐트 끌기를 멈추고 미리보기를 지우며, 누르는 순간 바꾼 대상·꼭짓점을 되돌립니다. */
  private cancelTentPress(): void {
    this.tentDrag = null
    this.tentDragLive = false
    this.tentHit = null
    this.overlay.setState({ tentPreview: null })
    const prev = this.tentPrev
    this.tentPrev = null
    if (prev !== null) this.stores.ui.getState().selectTentTarget(prev.target, prev.vertexIndex)
  }

  private onMarquee(o: { x0: number; y0: number; x1: number; y1: number; done: boolean }): void {
    if (!o.done) {
      this.overlay.setState({
        marquee: {
          left: Math.min(o.x0, o.x1),
          top: Math.min(o.y0, o.y1),
          width: Math.abs(o.x1 - o.x0),
          height: Math.abs(o.y1 - o.y0),
        },
      })
      return
    }
    this.overlay.setState({ marquee: null })
    // 취소된 범위 선택은 크기 0인 사각형으로 옵니다(gestures.ts). 선택을 바꾸지 않습니다.
    if (o.x0 === o.x1 && o.y0 === o.y1) return
    const ui = this.stores.ui.getState()
    if (ui.mode !== 'place') return
    const a = screenToWorld(ui.view, [o.x0, o.y0])
    const b = screenToWorld(ui.view, [o.x1, o.y1])
    const hits = itemsInRect(this.stores.doc.getState().layout, rectFromCorners(a[0], a[1], b[0], b[1]), ui.scopeGroupId)
    this.select(this.marqueeAdd ? [...new Set([...ui.selection, ...hits])] : hits)
  }

  /** 선택(ui.selection) 중 그려져 있고 조작할 수 있는 노드를 Transformer에 붙입니다. 제스처 중에는 끝난 뒤로 미룹니다. */
  syncTransformer(): void {
    const tr = this.tr
    if (!tr || this.session) return
    const nodes: Konva.Group[] = []
    for (const id of this.stores.ui.getState().selection) {
      const n = this.nodes.get(id)
      if (n && !this.dimmed.has(id)) nodes.push(n)
    }
    const cur = tr.nodes()
    if (cur.length === nodes.length && cur.every((n, i) => n === nodes[i])) return
    tr.nodes(nodes)
    tr.getLayer()?.batchDraw()
  }

  // ── 잠금·되돌리기 ──────────────────────────────────────────────────────

  /** 두 손가락 이상·스페이스 끌기 동안 새 끌기·변형이 시작되지 않게 합니다(진행 중인 끌기는 Konva가 멈춤 → suppress로 되돌림). */
  private lock(): void {
    if (this.locked) return
    this.locked = true
    for (const n of this.nodes.values()) n.draggable(false)
    this.tr?.listening(false)
  }

  private unlock(): void {
    if (!this.locked) return
    this.locked = false
    for (const [id, n] of this.nodes) n.draggable(!this.dimmed.has(id))
    this.tr?.listening(true)
  }

  /** 노드 속성을 문서 값으로 맞춥니다(scale 1). */
  private restoreNodes(ids: Iterable<string>): void {
    const byId = new Map(this.stores.doc.getState().layout.items.map((it) => [it.id, it] as const))
    for (const id of ids) {
      const n = this.nodes.get(id)
      const it = byId.get(id)
      if (n && it) n.setAttrs({ x: it.x, y: it.y, rotation: it.rotation, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 })
    }
  }

  /** 끌기·변형 동안 실행 취소·다시 실행을 막습니다(doc.beginGesture). */
  private openGesture(): void {
    if (this.gestureOpen) return
    this.stores.doc.getState().beginGesture()
    this.gestureOpen = true
  }

  private closeGesture(): void {
    if (!this.gestureOpen) return
    this.stores.doc.getState().endGesture()
    this.gestureOpen = false
  }

  private beginSession(s: Session): void {
    this.session = s
    this.openGesture()
    this.setActive(new Set(s.ids))
  }

  private endSession(): void {
    this.closeGesture()
    this.session = null
    this.setActive(EMPTY_IDS)
    this.overlay.setState({ badge: null })
    this.syncTransformer()
  }

  /** 두 번째 손가락·취소: 진행 중인 끌기·변형을 멈추고 시작 위치로 되돌립니다. 커밋·실행 취소 기록 없음(§4.5). */
  readonly cancelNodeGesture = (): void => {
    this.suppress = true
    const tr = this.tr
    if (tr?.isTransforming()) tr.stopTransform()
    for (const n of this.nodes.values()) if (n.isDragging()) n.stopDrag()
    if (tr?.isDragging()) tr.stopDrag()
    this.restoreNodes(this.nodes.keys())
    tr?.forceUpdate()
    // 텐트 끌기(꼭짓점·이너)도 시작 위치로: 미리보기를 지우고 커밋하지 않으며, 누를 때 바꾼 대상을 되돌립니다.
    this.cancelTentPress()
    this.endSession()
    // 누르는 순간 바꾼 선택도 되돌립니다(물건 위에서 시작한 핀치가 선택을 바꾸지 않게).
    if (this.pressAdded && this.pressPrevSelection !== null) {
      const prev = this.pressPrevSelection
      this.pressAdded = false
      this.pressPrevSelection = null
      this.select(prev)
    }
  }

  // ── Konva 끌기·변형 → 커밋 ─────────────────────────────────────────────

  readonly onDragStart = (e: Konva.KonvaEventObject<DragEvent>): void => {
    const node = e.target
    if (!node.hasName('item')) return
    if (this.suppress) {
      node.stopDrag()
      return
    }
    if (this.session) return // Transformer가 함께 끄는 다른 노드
    // 상하좌우로만 이동·자석 맞춤의 기준점(dragstart는 첫 위치 갱신 전에 옴)
    this.dragStartAbs = node.absolutePosition()
    const id = node.id()
    const ui = this.stores.ui.getState()
    const layout = this.stores.doc.getState().layout
    const ids = ui.selection.includes(id) ? [...ui.selection] : expandSelection(layout, [id], ui.scopeGroupId ?? undefined)
    this.snap = snapPrepFor(layout, ids, this.stores.ui.getState().gridStep)
    this.beginSession({ kind: 'drag', leadId: id, ids })
  }

  readonly onDragEnd = (e: Konva.KonvaEventObject<DragEvent>): void => {
    const node = e.target
    if (!node.hasName('item')) return
    const s = this.session
    if (this.suppress || s === null || s.kind !== 'drag') {
      this.restoreNodes([node.id()])
      return
    }
    this.dragStartAbs = null
    this.snap = null
    this.overlay.setState({ snapGuides: [] })
    const lead = this.nodes.get(s.leadId)
    const item = this.stores.doc.getState().layout.items.find((it) => it.id === s.leadId)
    const dx = lead && item ? lead.x() - item.x : 0
    const dy = lead && item ? lead.y() - item.y : 0
    this.endSession()
    if (Math.abs(dx) >= MOVE_EPS_CM || Math.abs(dy) >= MOVE_EPS_CM) {
      this.stores.doc.getState().commit((d) => moveItems(d, s.ids, dx, dy))
    }
    this.restoreNodes(s.ids)
  }

  readonly onTransformStart = (): void => {
    if (this.suppress || !this.tr) return
    this.beginSession({ kind: 'transform', ids: this.tr.nodes().map((n) => n.id()) })
  }

  readonly onTransform = (): void => {
    const tr = this.tr
    if (!tr || this.session?.kind !== 'transform') return
    const nodes = tr.nodes()
    const first = nodes[0]
    if (!first) return
    let text: string
    if (tr.getActiveAnchor() === 'rotater') {
      text = `${fmt(normAngle(nodes.length === 1 ? first.rotation() : tr.rotation()))}°`
    } else {
      const item = this.stores.doc.getState().layout.items.find((it) => it.id === first.id())
      if (!item || nodes.length !== 1) return
      text = dimsBadge(item.shape, first.scaleX(), first.scaleY())
    }
    let minX = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const n of nodes) {
      const r = n.getClientRect({ skipStroke: true })
      minX = Math.min(minX, r.x)
      maxX = Math.max(maxX, r.x + r.width)
      maxY = Math.max(maxY, r.y + r.height)
    }
    this.overlay.setState({ badge: { text, x: (minX + maxX) / 2, y: maxY + BADGE_GAP_PX } })
  }

  readonly onTransformEnd = (): void => {
    const tr = this.tr
    if (!tr) return
    const s = this.session
    if (this.suppress || s === null || s.kind !== 'transform') {
      this.restoreNodes(this.nodes.keys())
      tr.forceUpdate()
      return
    }
    const changes = tr.nodes().map((n) => ({
      id: n.id(),
      x: n.x(),
      y: n.y(),
      rotation: n.rotation(),
      scaleX: n.scaleX(),
      scaleY: n.scaleY(),
      skewX: n.skewX(),
      skewY: n.skewY(),
    }))
    if (import.meta.env.DEV) {
      // Konva가 행렬을 분해하며 1e-16 수준의 잡음을 남기므로 그보다 큰 기울임만 잡습니다(§4.6).
      for (const c of changes) {
        console.assert(Math.abs(c.skewX) < SKEW_EPS && Math.abs(c.skewY) < SKEW_EPS, 'transformend: skew가 0이 아님', c)
      }
    }
    for (const n of tr.nodes()) n.scale({ x: 1, y: 1 })
    this.endSession()
    this.stores.doc.getState().commit((d) => {
      for (const c of changes) {
        applyTransform(d, c.id, { x: c.x, y: c.y, rotation: c.rotation, scaleX: c.scaleX, scaleY: c.scaleY })
      }
    })
    this.restoreNodes(s.ids)
    tr.forceUpdate()
  }

  readonly boundBox = (oldBox: Box, newBox: Box): Box => {
    const min = Math.max(MIN_BOX_PX, this.stores.ui.getState().view.zoom * LIMITS.length[0])
    return Math.abs(newBox.width) < min || Math.abs(newBox.height) < min ? oldBox : newBox
  }

  // ── 보기 ──────────────────────────────────────────────────────────────

  /** 처음 크기가 생겼을 때, 그리고 사용자가 보기를 바꾸기 전까지는 크기가 바뀔 때마다 맞춤 보기. */
  autoFitIfUntouched(): void {
    const ui = this.stores.ui.getState()
    if (!(ui.size.width > 0 && ui.size.height > 0)) return
    if (this.autoFit !== null && !sameView(ui.view, this.autoFit)) return
    ui.fitTo(fitBBoxFor(this.stores.doc.getState().layout, ui.outerPending))
    this.autoFit = this.stores.ui.getState().view
  }
}

/** 텐트 편집 레이어 연결: 끄는 중 미리보기는 Board 화면 상태(overlay)에서, 대상·꼭짓점은 화면 스토어에서 읽습니다. */
function TentEditLayer(props: { overlay: StoreApi<Overlay> }): JSX.Element | null {
  const layout = useDoc((s) => s.layout)
  const target = useUi((s) => s.tentTarget)
  const vertexIndex = useUi((s) => s.vertexIndex)
  const view = useUi((s) => s.view)
  const preview = useStore(props.overlay, (s) => s.tentPreview)
  const focus = useUi((s) => s.polygonFocus)
  const guidesVisible = useUi((s) => s.guidesVisible)
  const symmetryAxis = useUi((s) => s.symmetryAxis)
  return (
    <TentLayer
      layout={layout}
      target={target}
      vertexIndex={vertexIndex}
      view={view}
      preview={preview}
      focus={focus}
      showGuides={guidesVisible}
      symmetryAxis={symmetryAxis === 'off' ? null : symmetryAxis}
    />
  )
}

/** 그리는 중 표시: 찍은 점·열린 선·고무줄(그때 보기로 계산 — 휠 이동에도 포인터를 따라감) */
function DrawEditLayer(props: { overlay: StoreApi<Overlay> }): JSX.Element | null {
  const drawing = useUi((s) => s.drawing)
  const view = useUi((s) => s.view)
  const outerPending = useUi((s) => s.outerPending)
  const tent = useDoc((s) => s.layout.tent)
  const gridStep = useUi((s) => s.gridStep)
  const ptr = useStore(props.overlay, (s) => s.drawPointer)
  if (drawing === null) return null
  const rubber = ptr === null ? null : rubberBand(drawing, ptr.screen, ptr.pointer, view, drawGridOrigin(tent, outerPending), gridStep, ptr.right)
  return <DrawLayer drawing={drawing} rubber={rubber} zoom={view.zoom} />
}

/** 자석 맞춤 안내선: 붙은 대상 변을 점선으로(§4.6) */
function SnapGuides(props: { overlay: StoreApi<Overlay> }): JSX.Element | null {
  const guides = useStore(props.overlay, (s) => s.snapGuides)
  if (guides.length === 0) return null
  return (
    <>
      {guides.map((g, i) => (
        <Line
          key={i}
          points={[g.a[0], g.a[1], g.b[0], g.b[1]]}
          stroke={THEME['select']}
          strokeWidth={2}
          dash={[6, 4]}
          strokeScaleEnabled={false}
          listening={false}
        />
      ))}
    </>
  )
}

/** 화면 크기 고정 글자 상자(측정 거리) */
function TagLabel(props: { at: Pt; zoom: number; text: string; color: string }): JSX.Element {
  const k = 1 / props.zoom
  const w = [...props.text].length * 7 + 14
  return (
    <Group x={props.at[0]} y={props.at[1]} scaleX={k} scaleY={k} listening={false}>
      <Rect x={-w / 2} y={-10} width={w} height={20} cornerRadius={10} fill={props.color} />
      <Text x={-w / 2} y={-10} width={w} height={20} text={props.text} fontSize={12} fill={THEME['text-inverse']} align="center" verticalAlign="middle" />
    </Group>
  )
}

/** 거리 재기 표시: 잰 선(양 끝 점·가운데 거리)과 고른 첫 대상 자리 */
function MeasureMarks(): JSX.Element | null {
  const layout = useDoc((s) => s.layout)
  const measuring = useUi((s) => s.measuring)
  const list = useUi((s) => s.measurements)
  const first = useUi((s) => s.measureFirst)
  const zoom = useUi((s) => s.view.zoom)
  if (!measuring || !(zoom > 0)) return null
  const rows = measurementRows(layout, list)
  const color = THEME['accent'] ?? '#36704A'
  const r = 4 / zoom
  return (
    <>
      {rows.map((m) => (
        <Group key={m.id} listening={false}>
          <Line points={[m.p1[0], m.p1[1], m.p2[0], m.p2[1]]} stroke={color} strokeWidth={2} strokeScaleEnabled={false} />
          <Circle x={m.p1[0]} y={m.p1[1]} radius={r} fill={color} />
          <Circle x={m.p2[0]} y={m.p2[1]} radius={r} fill={color} />
          <TagLabel at={[(m.p1[0] + m.p2[0]) / 2, (m.p1[1] + m.p2[1]) / 2]} zoom={zoom} text={m.label} color={color} />
        </Group>
      ))}
      {first !== null && <Circle x={first.at[0]} y={first.at[1]} radius={6 / zoom} stroke={color} strokeWidth={2} strokeScaleEnabled={false} listening={false} />}
    </>
  )
}

/** 이미지 주소 → 불러온 HTMLImageElement(불러오는 중·실패면 null) */
function useHtmlImage(url: string | null): HTMLImageElement | null {
  const [loaded, setLoaded] = useState<{ url: string; img: HTMLImageElement } | null>(null)
  useEffect(() => {
    if (url === null) return
    const img = new window.Image()
    img.onload = () => setLoaded({ url, img })
    img.src = url
    return () => {
      img.onload = null
    }
  }, [url])
  return loaded !== null && loaded.url === url ? loaded.img : null
}

/** 배경 이미지(맨 아래 층, 격자 아래). 맞추기 중이면 점선 테두리 */
function BackdropImage(): JSX.Element | null {
  const bd = useUi((s) => s.backdrop)
  const img = useHtmlImage(bd?.url ?? null)
  if (bd === null || img === null) return null
  const h = bd.w * bd.aspect
  return (
    <>
      <KImage
        image={img}
        x={bd.x}
        y={bd.y}
        offsetX={bd.w / 2}
        offsetY={h / 2}
        rotation={bd.rotation}
        width={bd.w}
        height={h}
        opacity={bd.opacity}
        listening={false}
      />
      {bd.adjusting && (
        <Rect
          x={bd.x}
          y={bd.y}
          offsetX={bd.w / 2}
          offsetY={h / 2}
          rotation={bd.rotation}
          width={bd.w}
          height={h}
          stroke={THEME['select']}
          strokeWidth={1.5}
          dash={[6, 4]}
          strokeScaleEnabled={false}
          listening={false}
        />
      )}
    </>
  )
}

/** 도형 위 치수 층 연결: 텐트 끌기 미리보기 동안에는 숨깁니다(값이 손을 뗄 때 바뀜). */
function DimLayer(props: { overlay: StoreApi<Overlay>; busy: boolean }): JSX.Element | null {
  const dragging = useStore(props.overlay, (s) => s.tentPreview !== null)
  return <DimOverlay busy={props.busy} hidden={dragging} />
}

function BoardOverlay(props: { store: StoreApi<Overlay> }): JSX.Element {
  const marquee = useStore(props.store, (s) => s.marquee)
  const badge = useStore(props.store, (s) => s.badge)
  const tentInvalid = useStore(props.store, (s) => s.tentPreview?.invalid ?? false)
  return (
    <>
      {/* 잘못된 텐트 끌기 안내(§4.4-8)는 캔버스에 그리고, 같은 문구를 여기서 낭독·화면 테스트용으로 냅니다. */}
      <div data-testid="tent-edit-status" role="status" style={VISUALLY_HIDDEN}>
        {tentInvalid ? INVALID_EDIT_STYLE.label : ''}
      </div>
      {marquee && (
        <div
          data-testid="marquee"
          style={{
            position: 'absolute',
            ...marquee,
            border: `1px dashed ${THEME['select']}`,
            background: `${THEME['select']}14`,
            pointerEvents: 'none',
          }}
        />
      )}
      {badge && (
        <div
          data-testid="transform-badge"
          style={{
            position: 'absolute',
            left: badge.x,
            top: badge.y,
            transform: 'translateX(-50%)',
            padding: '2px 6px',
            borderRadius: 4,
            background: THEME['text-primary'],
            color: THEME['text-inverse'],
            fontSize: 12,
            lineHeight: '16px',
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {badge.text}
        </div>
      )}
    </>
  )
}

export function Board(): JSX.Element {
  const stores = useStores()
  const layout = useDoc((s) => s.layout)
  const zones = useZones()
  const stats = useStats()
  const view = useUi((s) => s.view)
  const size = useUi((s) => s.size)
  const mode = useUi((s) => s.mode)
  const scopeGroupId = useUi((s) => s.scopeGroupId)
  const gridVisible = useUi((s) => s.gridVisible)
  const gridStep = useUi((s) => s.gridStep)
  const selection = useUi((s) => s.selection)
  const pointer = useUi((s) => s.pointer)
  const drawing = useUi((s) => s.drawing)
  const tentLock = useUi((s) => s.tentLock)
  const outerPending = useUi((s) => s.outerPending)
  const adjustingBackdrop = useUi((s) => s.backdrop?.adjusting === true)
  const snapEnabled = useUi((s) => s.snapEnabled)

  const hostRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const [activeIds, setActiveIds] = useState<ReadonlySet<string>>(EMPTY_IDS)
  const [overlay] = useState(() =>
    createStore<Overlay>()(() => ({ marquee: null, badge: null, tentPreview: null, drawPointer: null, snapGuides: [] })),
  )
  const ctl = useMemo(() => new BoardController(stores, overlay, setActiveIds), [stores, overlay])

  const scene = useMemo(
    () => buildScene({ layout, zones, stats, view, mode, scopeGroupId, gridVisible, gridStep, size, outerPending }),
    [layout, zones, stats, view, mode, scopeGroupId, gridVisible, gridStep, size, outerPending],
  )
  const dim = useMemo(
    () => tentDim(tentLock, drawing, layout.tent.inners.map((it) => it.id)),
    [tentLock, drawing, layout.tent.inners],
  )
  const zoom = view.zoom
  const selected = useMemo(() => new Set(selection), [selection])

  const itemsById = useMemo(() => new Map(layout.items.map((it) => [it.id, it] as const)), [layout.items])
  const attached = useMemo(
    () =>
      selection
        .map((id) => itemsById.get(id))
        .filter((it): it is Item => it !== undefined && !scene.items.find((n) => n.id === it.id)?.dimmed),
    [selection, itemsById, scene.items],
  )
  const single = attached.length === 1 ? attached[0] : undefined
  const cfg = transformerConfig({ count: attached.length, singleIsCircle: single?.shape.kind === 'circle' }, pointer)
  const anchorHit = cfg.anchorHitPx
  const anchorSize = cfg.anchorSize
  const anchorStyle = useCallback(
    (anchor: Konva.Rect) => {
      anchor.hitFunc((ctx, shape) => {
        const offset = (shape.width() - anchorHit) / 2
        ctx.beginPath()
        ctx.rect(offset, offset, anchorHit, anchorHit)
        ctx.closePath()
        ctx.fillShape(shape)
      })
      if (anchor.hasName('rotater')) anchor.cornerRadius(anchorSize / 2)
    },
    [anchorHit, anchorSize],
  )

  // 컨트롤러에 Konva·DOM 참조와 흐린 물건 목록을 알려 주고, 선택을 Transformer에 붙입니다.
  useLayoutEffect(() => {
    const dimmed = new Set(scene.items.filter((n) => n.dimmed).map((n) => n.id))
    ctl.attach({ host: hostRef.current, stage: stageRef.current, tr: trRef.current }, dimmed)
  }, [ctl, scene, selection])

  // 캔버스 크기 = 컨테이너 크기(ResizeObserver, §4.5)
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const ui = stores.ui
    const measure = () => {
      const width = Math.round(el.clientWidth)
      const height = Math.round(el.clientHeight)
      const cur = ui.getState().size
      if (cur.width !== width || cur.height !== height) ui.getState().setSize({ width, height })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [stores])

  useEffect(() => {
    ctl.autoFitIfUntouched()
  }, [ctl, size.width, size.height])

  // 포인터·휠·키·가시성 연결. pointerdown은 캡처 단계라 Konva보다 먼저 돕니다.
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    // 가운데 버튼은 화면 이동입니다. Konva 기본값([0, 1])이면 가운데 버튼이 물건·핸들을 끕니다.
    Konva.dragButtons = [0]
    // 터치를 뗄 때 브라우저가 이어 보내는 호환 마우스 이벤트·click(고스트 클릭)을 막습니다. 캔버스 입력은 포인터 이벤트만 씁니다.
    // 누르는 순간 연 텐트 시트가 손가락 아래로 오면 그 click이 시트의 펼치기·버튼을 누르기 때문입니다.
    const stopCompatClick = (e: TouchEvent) => {
      // 캔버스 위 DOM 조작 층(치수 숫자)은 click을 받아야 합니다.
      if (e.cancelable && !inCanvasUi(e.target)) e.preventDefault()
    }
    const enter = () => ctl.onHover(true)
    const leave = () => ctl.onHover(false)
    el.addEventListener('pointerdown', ctl.onPointerDown, true)
    el.addEventListener('pointerenter', enter)
    el.addEventListener('pointerleave', leave)
    el.addEventListener('touchstart', ctl.onTouchStart, { capture: true, passive: true })
    el.addEventListener('touchend', stopCompatClick, { capture: true, passive: false })
    el.addEventListener('wheel', ctl.onWheel, { passive: false })
    window.addEventListener('pointermove', ctl.onPointerMove, true)
    window.addEventListener('pointerup', ctl.onPointerUp, true)
    window.addEventListener('pointercancel', ctl.cancelAll, true)
    window.addEventListener('touchcancel', ctl.cancelAll, true)
    window.addEventListener('keydown', ctl.onKeyDown)
    window.addEventListener('keyup', ctl.onKeyUp)
    window.addEventListener('blur', ctl.releaseSpace)
    document.addEventListener('visibilitychange', ctl.onVisibility)
    return () => {
      el.removeEventListener('pointerdown', ctl.onPointerDown, true)
      el.removeEventListener('pointerenter', enter)
      el.removeEventListener('pointerleave', leave)
      el.removeEventListener('touchstart', ctl.onTouchStart, true)
      el.removeEventListener('touchend', stopCompatClick, true)
      el.removeEventListener('wheel', ctl.onWheel)
      window.removeEventListener('pointermove', ctl.onPointerMove, true)
      window.removeEventListener('pointerup', ctl.onPointerUp, true)
      window.removeEventListener('pointercancel', ctl.cancelAll, true)
      window.removeEventListener('touchcancel', ctl.cancelAll, true)
      window.removeEventListener('keydown', ctl.onKeyDown)
      window.removeEventListener('keyup', ctl.onKeyUp)
      window.removeEventListener('blur', ctl.releaseSpace)
      document.removeEventListener('visibilitychange', ctl.onVisibility)
    }
  }, [ctl])

  return (
    <div
      ref={hostRef}
      className="canvas-host"
      data-testid="board"
      data-drawing={drawing !== null ? 'true' : undefined}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: THEME['canvas-bg'],
        touchAction: 'none',
      }}
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={view.panX}
        y={view.panY}
        scaleX={zoom}
        scaleY={zoom}
      >
        <Layer listening={false}>
          <BackdropImage />
          {scene.grid.map((g) => (
            <GridShape key={g.step} strong={g.strong} lines={g.lines} />
          ))}
        </Layer>
        {/* 텐트 입력은 Konva 히트가 아니라 컨트롤러의 순수 판정으로 받습니다(외곽은 채움이 없음, R19). */}
        <Layer listening={false}>
          <TentContent scene={scene} zoom={zoom} dim={dim} />
        </Layer>
        <Layer>
          {scene.items.map((n) => (
            <ItemShape
              key={n.id}
              node={n}
              zoom={zoom}
              selected={selected.has(n.id)}
              dragDistance={TAP_SLOP[pointer]}
              dragBoundFunc={ctl.dragBound}
              register={ctl.register}
              onDragStart={ctl.onDragStart}
              onDragEnd={ctl.onDragEnd}
            />
          ))}
        </Layer>
        <Layer listening={false}>
          <WarningMarks items={scene.items} inners={scene.inners} zoom={zoom} hidden={activeIds} />
          <SnapGuides overlay={overlay} />
          <MeasureMarks />
          {/* 텐트 편집 핸들·선택 테두리·끌기 미리보기(경고 표시 위). 입력은 받지 않습니다.
              그리는 중에는 핸들 대신 그리는 선(누르면 점이 되므로 핸들을 보이지 않음). */}
          {mode === 'tent' && (drawing !== null ? <DrawEditLayer overlay={overlay} /> : <TentEditLayer overlay={overlay} />)}
        </Layer>
        <Layer>
          <Transformer
            ref={trRef}
            resizeEnabled={cfg.resizeEnabled}
            rotateEnabled={cfg.rotateEnabled}
            keepRatio={cfg.keepRatio}
            enabledAnchors={cfg.enabledAnchors}
            anchorSize={cfg.anchorSize}
            rotateAnchorOffset={cfg.rotateAnchorOffset}
            anchorStyleFunc={anchorStyle}
            anchorFill={THEME['bg-surface']}
            anchorStroke={THEME['select']}
            anchorStrokeWidth={1.5}
            anchorCornerRadius={2}
            borderStroke={THEME['select']}
            borderStrokeWidth={1.5}
            rotateLineVisible={false}
            rotationSnaps={snapEnabled ? ROTATION_SNAPS : []}
            rotationSnapTolerance={3}
            flipEnabled={false}
            ignoreStroke
            boundBoxFunc={ctl.boundBox}
            onTransformStart={ctl.onTransformStart}
            onTransform={ctl.onTransform}
            onTransformEnd={ctl.onTransformEnd}
          />
        </Layer>
      </Stage>
      <BoardOverlay store={overlay} />
      <DimLayer overlay={overlay} busy={activeIds.size > 0 || adjustingBackdrop} />
    </div>
  )
}
