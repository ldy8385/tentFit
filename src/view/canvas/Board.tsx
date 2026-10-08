// 편집 캔버스(스펙 §4.5·§4.6·§7 규칙 2). 문서 스토어가 원본이고 Konva 노드는 그리기만 합니다.
// - 물건 끌기·핸들 변형은 Konva(draggable·Transformer)가 하고, 손을 뗄 때 doc.commit 한 번으로 반영합니다.
// - 빈 곳 끌기·두 손가락·탭은 GestureArbiter가 판정합니다. 포인터 이벤트는 캔버스 컨테이너의 캡처 단계에서
//   Konva보다 먼저 받습니다(Konva 스파이크에서 실기기로 검증한 연결 방식).
import Konva from 'konva'
import type { Box } from 'konva/lib/shapes/Transformer'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX } from 'react'
import { Layer, Stage, Transformer } from 'react-konva'
import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'
import { useStats, useZones } from '../../app/derived'
import { useDoc, useStores, useUi, type Stores } from '../../app/stores'
import { LIMITS, normAngle, round1, type Item, type Pt, type Shape } from '../../core/model'
import { expandSelection } from '../../core/ops/groups'
import { applyTransform, moveItems } from '../../core/ops/items'
import type { PointerKind } from '../../store/ui'
import { blurActiveInput } from '../../ui/fields/blurActive'
import { THEME } from '../../ui/theme'
import { GestureArbiter, TAP_SLOP, type GestureOutput } from '../gestures'
import { buildScene } from '../scene'
import { layoutBBox, screenToWorld, wheelAction, type View } from '../viewport'
import { itemsInRect, rectFromCorners } from './marquee'
import { GridShape, ItemShape, TentContent, WarningMarks } from './nodes'
import { transformerConfig } from './transformerConfig'

/** 이보다 작게 움직였으면(cm, 저장 단위 0.1cm의 절반) 끌기를 커밋하지 않습니다. */
const MOVE_EPS_CM = 0.05
/** 핸들로 이보다 작게(화면 px) 줄이지 못하게 합니다. 1cm가 이보다 크게 보이면 1cm가 하한입니다. */
const MIN_BOX_PX = 2
const BADGE_GAP_PX = 10
/** transformend의 skew 검사 허용치(부동소수 잡음) */
const SKEW_EPS = 1e-6
const EMPTY_IDS: ReadonlySet<string> = new Set()

type Overlay = {
  marquee: { left: number; top: number; width: number; height: number } | null
  badge: { text: string; x: number; y: number } | null
}

type Session = { kind: 'drag'; leadId: string; ids: string[] } | { kind: 'transform'; ids: string[] }

function toPointerKind(t: string): PointerKind {
  return t === 'touch' || t === 'pen' ? t : 'mouse'
}

function isEditable(el: Element | EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'
}

function sameView(a: View, b: View): boolean {
  return a.zoom === b.zoom && a.panX === b.panX && a.panY === b.panY
}

/** 물건의 로컬 짧은 변(cm): 사각형 min(w,h), 원 d, 다각형 bbox의 짧은 쪽 */
function localShortSide(shape: Shape): number {
  if (shape.kind === 'rect') return Math.min(shape.w, shape.h)
  if (shape.kind === 'circle') return shape.d
  const xs = shape.points.map((p) => p[0])
  const ys = shape.points.map((p) => p[1])
  return Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
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
  private pressId: string | null = null
  private marqueeAdd = false
  /** 마지막 자동 맞춤 보기. 사용자가 보기를 바꾸지 않았으면 크기가 바뀔 때 다시 맞춥니다. */
  private autoFit: View | null = null

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

  readonly onPointerDown = (e: PointerEvent): void => {
    // 오른쪽 버튼(겹친 물건 목록)은 이후 계획에서 붙입니다.
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return
    blurActiveInput()
    const kind = toPointerKind(e.pointerType)
    const ui = this.stores.ui.getState()
    ui.setPointer(kind)
    const p = this.local(e)
    const panOverride = this.space || e.button === 1
    let onNode = false
    if (this.arbiter.pointerCount === 0) {
      this.pressAdded = false
      this.pressId = null
      this.marqueeAdd = e.shiftKey
      const hit = panOverride ? null : this.hitAt(p)
      if (hit?.kind === 'anchor') onNode = true
      if (hit?.kind === 'item') {
        onNode = true
        this.pressItem(hit.id, e.shiftKey, kind)
      }
      // 스페이스·가운데 버튼 끌기는 물건 위에서도 화면 이동입니다. Konva가 물건을 끌지 못하게 잠급니다.
      if (panOverride) this.lock()
    }
    this.handle(
      this.arbiter.down(
        { id: e.pointerId, pointer: kind, x: p[0], y: p[1], button: e.button, shift: e.shiftKey, space: this.space },
        onNode,
      ),
    )
    if (this.arbiter.pointerCount >= 2) this.lock()
  }

  readonly onPointerMove = (e: PointerEvent): void => {
    if (this.arbiter.pointerCount === 0) return
    const p = this.local(e)
    this.handle(this.arbiter.move({ id: e.pointerId, pointer: toPointerKind(e.pointerType), x: p[0], y: p[1] }))
  }

  readonly onPointerUp = (e: PointerEvent): void => {
    if (this.arbiter.pointerCount === 0) return
    const p = this.local(e)
    this.handle(
      this.arbiter.up({ id: e.pointerId, pointer: toPointerKind(e.pointerType), x: p[0], y: p[1], shift: e.shiftKey }),
    )
    if (this.arbiter.pointerCount === 0) this.afterAllUp()
  }

  /** pointercancel·touchcancel·visibilitychange(hidden): 시작 상태로 되돌리고 커밋하지 않습니다(§4.5). */
  readonly cancelAll = (): void => {
    this.handle(this.arbiter.cancel())
    if (this.session || this.isKonvaBusy()) this.cancelNodeGesture()
    this.overlay.setState({ marquee: null })
    this.afterAllUp()
  }

  /** touchstart가 두 번째 pointerdown보다 먼저 오는 브라우저 대비(스파이크의 multiTouchHint와 같은 역할). */
  readonly onTouchStart = (e: TouchEvent): void => {
    if (e.touches.length < 2) return
    if (this.session || this.isKonvaBusy()) this.cancelNodeGesture()
    this.lock()
  }

  readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    const a = wheelAction(e)
    const ui = this.stores.ui.getState()
    if (a.type === 'zoom') ui.zoomAt(a.factor, this.local(e))
    else ui.panBy(a.dx, a.dy)
  }

  readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.code !== 'Space' || e.isComposing || isEditable(e.target) || isEditable(document.activeElement)) return
    this.space = true
    if (this.host) this.host.style.cursor = 'grab'
    // 캔버스 위의 Space는 페이지 스크롤·버튼 누름 대신 화면 이동에 씁니다(§4.5).
    if (this.hover) e.preventDefault()
  }

  readonly onKeyUp = (e: KeyboardEvent): void => {
    if (e.code !== 'Space') return
    this.releaseSpace()
  }

  readonly releaseSpace = (): void => {
    this.space = false
    if (this.host) this.host.style.cursor = ''
  }

  readonly onHover = (inside: boolean): void => {
    this.hover = inside
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
    }, 0)
  }

  private handle(outs: GestureOutput[]): void {
    const ui = this.stores.ui.getState()
    for (const o of outs) {
      switch (o.type) {
        case 'pan':
          ui.panBy(o.dx, o.dy)
          break
        case 'zoom':
          ui.zoomAt(o.factor, [o.cx, o.cy])
          break
        case 'tap':
          this.onTap(o.onNode, o.shift)
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
      this.select(expanded)
      return
    }
    if (this.pressAdded) return
    const drop = new Set(expanded)
    this.select(ui.selection.filter((x) => !drop.has(x)))
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

  private beginSession(s: Session): void {
    this.session = s
    this.stores.doc.getState().beginGesture()
    this.gestureOpen = true
    this.setActive(new Set(s.ids))
  }

  private endSession(): void {
    if (this.gestureOpen) {
      this.stores.doc.getState().endGesture()
      this.gestureOpen = false
    }
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
    this.endSession()
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
    const id = node.id()
    const ui = this.stores.ui.getState()
    const ids = ui.selection.includes(id)
      ? [...ui.selection]
      : expandSelection(this.stores.doc.getState().layout, [id], ui.scopeGroupId ?? undefined)
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
    ui.fitTo(layoutBBox(this.stores.doc.getState().layout))
    this.autoFit = this.stores.ui.getState().view
  }
}

function BoardOverlay(props: { store: StoreApi<Overlay> }): JSX.Element {
  const marquee = useStore(props.store, (s) => s.marquee)
  const badge = useStore(props.store, (s) => s.badge)
  return (
    <>
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
  const selection = useUi((s) => s.selection)
  const pointer = useUi((s) => s.pointer)

  const hostRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const [activeIds, setActiveIds] = useState<ReadonlySet<string>>(EMPTY_IDS)
  const [overlay] = useState(() => createStore<Overlay>()(() => ({ marquee: null, badge: null })))
  const ctl = useMemo(() => new BoardController(stores, overlay, setActiveIds), [stores, overlay])

  const scene = useMemo(
    () => buildScene({ layout, zones, stats, view, mode, scopeGroupId, gridVisible, size }),
    [layout, zones, stats, view, mode, scopeGroupId, gridVisible, size],
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
  const cfg = transformerConfig(
    { count: attached.length, singleIsCircle: single?.shape.kind === 'circle' },
    pointer,
    single ? localShortSide(single.shape) * zoom : 0,
  )
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
    const enter = () => ctl.onHover(true)
    const leave = () => ctl.onHover(false)
    el.addEventListener('pointerdown', ctl.onPointerDown, true)
    el.addEventListener('pointerenter', enter)
    el.addEventListener('pointerleave', leave)
    el.addEventListener('touchstart', ctl.onTouchStart, { capture: true, passive: true })
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
          {scene.grid.map((g) => (
            <GridShape key={g.level} level={g.level} lines={g.lines} />
          ))}
        </Layer>
        <Layer listening={mode === 'tent'}>
          <TentContent scene={scene} zoom={zoom} />
        </Layer>
        <Layer>
          {scene.items.map((n) => (
            <ItemShape
              key={n.id}
              node={n}
              zoom={zoom}
              selected={selected.has(n.id)}
              dragDistance={TAP_SLOP[pointer]}
              register={ctl.register}
              onDragStart={ctl.onDragStart}
              onDragEnd={ctl.onDragEnd}
            />
          ))}
        </Layer>
        <Layer listening={false}>
          <WarningMarks items={scene.items} inners={scene.inners} zoom={zoom} hidden={activeIds} />
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
    </div>
  )
}
