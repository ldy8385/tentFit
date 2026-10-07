// Konva 터치 스파이크(버리는 코드). 스펙 §14 ①②③을 실기기에서 판정한다.
// 실행: pnpm spike:touch → 같은 Wi-Fi의 휴대폰에서 https://<맥 IP>:5174 (자체 서명 경고 통과)
// StrictMode는 쓰지 않는다: 개발 모드의 이중 effect가 계측(시도·커밋 수)을 흐리지 않게.
import { memo, useEffect, useLayoutEffect, useRef, useState, version as reactVersion, type RefObject } from 'react'
import { createRoot } from 'react-dom/client'
import Konva from 'konva'
import type { Box } from 'konva/lib/shapes/Transformer'
import { Circle, Group, Layer, Line, Rect, Stage, Text, Transformer, version as reactKonvaVersion } from 'react-konva'
import { TouchGesture, zoomAt, type GestureHost, type Pt } from './gesture'
import {
  attrsDeviation,
  FrameWindow,
  formatMs,
  formatReport,
  judgeAttempt,
  REQUIRED_ATTEMPTS,
  summarize,
  verdictPerf,
  verdictTouch,
  type AttemptKind,
  type AttemptRecord,
  type HandleCheck,
  type NodeAttrs,
} from './metrics'
import { bakeScale, itemLabel, makeSpikeItems, octagonPoints, round1, type SpikeItem } from './shapes'

const INITIAL_SCALE = 0.65 // px/cm, 휴대폰 축척(40cm 스툴 ≈ 26px)
const ANCHOR_PX = 24
const LABEL_FONT_CM = 14
const JUDGE_DELAY_MS = 120 // 모든 손가락을 뗀 뒤 Konva의 touchend 처리가 끝나기를 기다린다
const RECT_ANCHORS = ['top-left', 'top-center', 'top-right', 'middle-right', 'middle-left', 'bottom-left', 'bottom-center', 'bottom-right']
const CORNER_ANCHORS = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
const DEVICE_KEY = 'tentfit-spike-device'
const NAN_ATTRS: NodeAttrs = { x: Number.NaN, y: Number.NaN, rotation: Number.NaN, scaleX: Number.NaN, scaleY: Number.NaN }

type Grab = { id: string; target: 'item' | 'anchor'; start: NodeAttrs; commitsAtDown: number }
type ActiveAttempt = { n: number; id: string; kind: AttemptKind; start: NodeAttrs; commitsAtStart: number; maxDeviation: number }

function readDevice(): string {
  try {
    return localStorage.getItem(DEVICE_KEY) ?? ''
  } catch {
    return ''
  }
}

function writeDevice(v: string): void {
  try {
    localStorage.setItem(DEVICE_KEY, v)
  } catch {
    // 저장소가 막힌 환경: 이번 세션에만 기억한다
  }
}

// 계측 상태는 React 밖에 둔다(끄는 동안 캔버스를 다시 렌더링하지 않게). 오버레이가 500ms마다 읽는다.
const spike = {
  frames: new FrameWindow(10_000),
  attempts: [] as AttemptRecord[],
  attemptSeq: 0,
  armed: false,
  commits: 0,
  view: { scale: INITIAL_SCALE, x: 0, y: 0 },
  device: readDevice(),
  handles: '미확인' as HandleCheck,
}

function normAngle(deg: number): number {
  const r = Math.round((((deg % 360) + 360) % 360) * 100) / 100
  return r >= 360 ? 0 : r + 0
}

function modelAttrs(it: SpikeItem): NodeAttrs {
  return { x: it.x, y: it.y, rotation: it.rotation, scaleX: 1, scaleY: 1 }
}

function nodeAttrs(n: Konva.Node): NodeAttrs {
  return { x: n.x(), y: n.y(), rotation: n.rotation(), scaleX: n.scaleX(), scaleY: n.scaleY() }
}

function toHandleCheck(v: string): HandleCheck {
  return v === '가능' || v === '불가' ? v : '미확인'
}

/** 화면에서 8px보다 작게 줄이지 못하게 한다. */
function boundBox(oldBox: Box, newBox: Box): Box {
  return Math.abs(newBox.width) < 8 || Math.abs(newBox.height) < 8 ? oldBox : newBox
}

type Refs = {
  stage: RefObject<Konva.Stage | null>
  layer: RefObject<Konva.Layer | null>
  tr: RefObject<Konva.Transformer | null>
  items: RefObject<SpikeItem[]>
  selected: RefObject<string | null>
}

// Konva 노드를 다루는 부분. 모델(React 상태)이 원본이고 Konva 노드는 그리기만 한다(스펙 §7 규칙 2).
function createController(
  refs: Refs,
  setItems: (update: (prev: SpikeItem[]) => SpikeItem[]) => void,
  setSelectedId: (id: string | null) => void,
) {
  let suppress = false // 되돌린 제스처의 dragend·transformend가 커밋하지 못하게
  let grab: Grab | null = null
  let attempt: ActiveAttempt | null = null

  const findItem = (id: string): SpikeItem | undefined => refs.items.current.find((it) => it.id === id)
  const itemNodes = (): Konva.Group[] => refs.layer.current?.find<Konva.Group>('.item') ?? []
  const findNode = (id: string): Konva.Group | undefined => refs.layer.current?.findOne<Konva.Group>(`#${id}`)
  const restoreNode = (node: Konva.Node): void => {
    const it = findItem(node.id())
    if (it) node.setAttrs(modelAttrs(it))
  }

  function trackDeviation(): void {
    if (!attempt) return
    const node = findNode(attempt.id)
    attempt.maxDeviation = Math.max(attempt.maxDeviation, node ? attrsDeviation(attempt.start, nodeAttrs(node)) : Number.NaN)
  }

  function finalize(a: ActiveAttempt): void {
    if (attempt === a) attempt = null
    const node = findNode(a.id)
    const it = findItem(a.id)
    const obs = {
      start: a.start,
      finalNode: node ? nodeAttrs(node) : NAN_ATTRS,
      finalModel: it ? modelAttrs(it) : NAN_ATTRS,
      maxDeviation: a.maxDeviation,
      commits: spike.commits - a.commitsAtStart,
      remaining: Konva.DD._dragElements.size + (refs.tr.current?.isTransforming() ? 1 : 0),
    }
    spike.attempts.push({ ...obs, ...judgeAttempt(obs), n: a.n, kind: a.kind, itemId: a.id })
  }

  const host: GestureHost = {
    hitTest(p) {
      grab = null
      const shape = refs.stage.current?.getIntersection({ x: p[0], y: p[1] })
      if (!shape) return 'empty'
      if (shape.hasName('_anchor')) {
        const id = refs.selected.current
        const it = id === null ? undefined : findItem(id)
        if (!it) return 'empty'
        grab = { id: it.id, target: 'anchor', start: modelAttrs(it), commitsAtDown: spike.commits }
        return 'anchor'
      }
      const group = shape.findAncestor('.item')
      const it = group ? findItem(group.id()) : undefined
      if (!it) return 'empty'
      grab = { id: it.id, target: 'item', start: modelAttrs(it), commitsAtDown: spike.commits }
      return 'item'
    },
    cancelActive(reason) {
      suppress = true
      const tr = refs.tr.current
      const grabbed = grab ? findNode(grab.id) : undefined
      const kind: AttemptKind = grab?.target === 'anchor' ? 'transform' : grabbed?.isDragging() ? 'drag' : 'ready'
      if (tr?.isTransforming()) tr.stopTransform()
      for (const n of itemNodes()) if (n.isDragging()) n.stopDrag()
      if (tr?.isDragging()) tr.stopDrag()
      for (const n of itemNodes()) restoreNode(n)
      tr?.forceUpdate()
      if (reason === 'second-finger' && spike.armed && grab) {
        spike.attemptSeq += 1
        attempt = { n: spike.attemptSeq, id: grab.id, kind, start: grab.start, commitsAtStart: grab.commitsAtDown, maxDeviation: 0 }
        trackDeviation()
      }
    },
    lockShapes() {
      for (const n of itemNodes()) n.draggable(false)
      refs.tr.current?.listening(false)
    },
    unlockShapes() {
      // Konva의 touchend 처리(같은 이벤트 루프 차례)가 끝난 뒤 푼다
      window.setTimeout(() => {
        for (const n of itemNodes()) n.draggable(true)
        refs.tr.current?.listening(true)
      }, 0)
    },
    getView: () => spike.view,
    setView(v) {
      spike.view = v
      const stage = refs.stage.current
      if (!stage) return
      stage.scale({ x: v.scale, y: v.scale })
      stage.position({ x: v.x, y: v.y })
      stage.batchDraw()
    },
    tap() {
      setSelectedId(null)
    },
    allUp() {
      window.setTimeout(() => {
        suppress = false
      }, 0)
      const a = attempt
      if (a) window.setTimeout(() => finalize(a), JUDGE_DELAY_MS)
    },
  }

  function onDragEnd(e: Konva.KonvaEventObject<DragEvent>): void {
    const node = e.currentTarget
    if (suppress) {
      restoreNode(node)
      return
    }
    const id = node.id()
    const x = round1(node.x())
    const y = round1(node.y())
    spike.commits += 1
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, x, y } : it)))
  }

  function onTransformEnd(e: Konva.KonvaEventObject<Event>): void {
    const node = e.currentTarget
    const it = findItem(node.id())
    if (!it) return
    if (suppress) {
      restoreNode(node)
      refs.tr.current?.forceUpdate()
      return
    }
    const { w, h } = bakeScale(it, node.scaleX(), node.scaleY())
    const x = round1(node.x())
    const y = round1(node.y())
    const rotation = normAngle(node.rotation())
    node.scale({ x: 1, y: 1 }) // scale은 치수로 옮기고 1로 되돌린다(스펙 §7 규칙 2)
    spike.commits += 1
    setItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, w, h, x, y, rotation } : p)))
  }

  function select(id: string): void {
    setSelectedId(id)
  }

  return { host, onDragEnd, onTransformEnd, select, trackDeviation }
}

type Controller = ReturnType<typeof createController>

type ItemNodeProps = {
  item: SpikeItem
  onSelect: Controller['select']
  onDragEnd: Controller['onDragEnd']
  onTransformEnd: Controller['onTransformEnd']
}

const ItemNode = memo(function ItemNode({ item, onSelect, onDragEnd, onTransformEnd }: ItemNodeProps) {
  const select = () => onSelect(item.id)
  const fill = `${item.color}cc`
  const labelH = Math.min(item.h, LABEL_FONT_CM * 2) // 라벨이 도형의 바운딩 박스를 넘지 않게(Transformer 상자 = 도형)
  return (
    <Group
      id={item.id}
      name="item"
      x={item.x}
      y={item.y}
      rotation={item.rotation}
      draggable
      onClick={select}
      onTap={select}
      onDragEnd={onDragEnd}
      onTransformEnd={onTransformEnd}
    >
      {item.kind === 'rect' && (
        <Rect
          x={-item.w / 2}
          y={-item.h / 2}
          width={item.w}
          height={item.h}
          fill={fill}
          stroke="#1f2933"
          strokeWidth={1.5}
          strokeScaleEnabled={false}
          perfectDrawEnabled={false}
        />
      )}
      {item.kind === 'circle' && (
        <Circle radius={item.w / 2} fill={fill} stroke="#1f2933" strokeWidth={1.5} strokeScaleEnabled={false} perfectDrawEnabled={false} />
      )}
      {item.kind === 'octagon' && (
        <Line
          points={octagonPoints(item.w)}
          closed
          fill={fill}
          stroke="#1f2933"
          strokeWidth={1.5}
          strokeScaleEnabled={false}
          perfectDrawEnabled={false}
        />
      )}
      <Text
        x={-item.w / 2}
        y={-labelH / 2}
        width={item.w}
        height={labelH}
        text={itemLabel(item)}
        fontSize={LABEL_FONT_CM}
        lineHeight={1}
        align="center"
        verticalAlign="middle"
        wrap="none"
        ellipsis
        fill="#111827"
        listening={false}
        perfectDrawEnabled={false}
      />
    </Group>
  )
})

function App() {
  const [items, setItems] = useState<SpikeItem[]>(makeSpikeItems)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const layerRef = useRef<Konva.Layer>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const itemsRef = useRef(items)
  const selectedRef = useRef(selectedId)
  const placedRef = useRef(false)
  const [ctrl] = useState(() =>
    createController({ stage: stageRef, layer: layerRef, tr: trRef, items: itemsRef, selected: selectedRef }, setItems, setSelectedId),
  )

  useLayoutEffect(() => {
    itemsRef.current = items
    selectedRef.current = selectedId
  })

  // 캔버스(Stage) 크기는 컨테이너의 ResizeObserver로 맞춘다(스펙 §4.5)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const width = el.clientWidth
      const height = el.clientHeight
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 첫 크기가 정해지면 월드 원점을 화면 가운데에 둔다
  useEffect(() => {
    if (placedRef.current || size.width === 0) return
    placedRef.current = true
    ctrl.host.setView({ scale: INITIAL_SCALE, x: size.width / 2, y: size.height / 2 })
  }, [size, ctrl])

  // 단일 선택 → Transformer
  useEffect(() => {
    const tr = trRef.current
    if (!tr) return
    const node = selectedId === null ? undefined : layerRef.current?.findOne<Konva.Group>(`#${selectedId}`)
    tr.nodes(node ? [node] : [])
  }, [selectedId])

  // 포인터 → 제스처 상태 기계. 캡처 단계라서 Konva의 처리보다 먼저 돈다.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const gesture = new TouchGesture(ctrl.host)
    const local = (e: { clientX: number; clientY: number }): Pt => {
      const r = el.getBoundingClientRect()
      return [e.clientX - r.left, e.clientY - r.top]
    }
    const onDown = (e: PointerEvent) => {
      const active = document.activeElement
      if (active instanceof HTMLElement) active.blur()
      gesture.down(e.pointerId, local(e), e.pointerType)
    }
    const onMove = (e: PointerEvent) => {
      gesture.move(e.pointerId, local(e))
      ctrl.trackDeviation()
    }
    const onUp = (e: PointerEvent) => gesture.up(e.pointerId, local(e))
    const onCancel = (e: PointerEvent) => gesture.cancel(e.pointerId)
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) gesture.multiTouchHint()
    }
    const onTouchCancel = () => gesture.reset()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') gesture.reset()
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      ctrl.host.setView(zoomAt(ctrl.host.getView(), local(e), Math.exp(-e.deltaY * 0.0015)))
    }
    const block = (e: Event) => e.preventDefault()

    el.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onCancel, true)
    el.addEventListener('touchstart', onTouchStart, { capture: true, passive: true })
    window.addEventListener('touchcancel', onTouchCancel, true)
    document.addEventListener('visibilitychange', onVisibility)
    el.addEventListener('wheel', onWheel, { passive: false })
    document.addEventListener('gesturestart', block, { passive: false })
    document.addEventListener('gesturechange', block, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onCancel, true)
      el.removeEventListener('touchstart', onTouchStart, true)
      window.removeEventListener('touchcancel', onTouchCancel, true)
      document.removeEventListener('visibilitychange', onVisibility)
      el.removeEventListener('wheel', onWheel)
      document.removeEventListener('gesturestart', block)
      document.removeEventListener('gesturechange', block)
    }
  }, [ctrl])

  // rAF 간격 계측(스펙 §14 ③)과 두 번째 손가락 뒤 움직임 감시(①ⓑ)
  useEffect(() => {
    let raf = 0
    const loop = (t: number) => {
      spike.frames.tick(t, Konva.isDragging())
      ctrl.trackDeviation()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [ctrl])

  const selected = selectedId === null ? undefined : items.find((it) => it.id === selectedId)
  const keepRatio = selected !== undefined && selected.kind !== 'rect'

  return (
    <>
      <div ref={containerRef} className="stage-wrap">
        <Stage ref={stageRef} width={size.width} height={size.height}>
          <Layer ref={layerRef}>
            {items.map((it) => (
              <ItemNode key={it.id} item={it} onSelect={ctrl.select} onDragEnd={ctrl.onDragEnd} onTransformEnd={ctrl.onTransformEnd} />
            ))}
          </Layer>
          <Layer>
            <Transformer
              ref={trRef}
              anchorSize={ANCHOR_PX}
              anchorCornerRadius={4}
              rotateAnchorOffset={36}
              keepRatio={keepRatio}
              enabledAnchors={keepRatio ? CORNER_ANCHORS : RECT_ANCHORS}
              flipEnabled={false}
              ignoreStroke
              boundBoxFunc={boundBox}
            />
          </Layer>
        </Stage>
      </div>
      <Overlay />
    </>
  )
}

function Overlay() {
  const [, setTick] = useState(0)
  const [open, setOpen] = useState(true)
  const [message, setMessage] = useState('')
  const [fallback, setFallback] = useState<string | null>(null)
  const refresh = () => setTick((t) => t + 1)

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 500)
    return () => window.clearInterval(id)
  }, [])

  const frames = spike.frames.stats()
  const s = summarize(spike.attempts)
  const last = spike.attempts[spike.attempts.length - 1]
  const report = () =>
    formatReport({
      date: new Date().toLocaleDateString('sv-SE'),
      device: spike.device,
      userAgent: navigator.userAgent,
      screen: `${screen.width}×${screen.height} @${window.devicePixelRatio}x`,
      versions: `konva ${Konva.version} · react-konva ${reactKonvaVersion} · react ${reactVersion}`,
      handles: spike.handles,
      frames: spike.frames.stats(),
      attempts: spike.attempts,
    })

  async function copy(): Promise<void> {
    const text = report()
    try {
      await navigator.clipboard.writeText(text)
      setFallback(null)
      setMessage('복사했어요')
    } catch {
      setFallback(text)
      setMessage('자동 복사 실패 — 아래 글을 길게 눌러 복사하세요')
    }
  }

  async function save(): Promise<void> {
    try {
      const res = await fetch('/__spike/results', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: report(),
      })
      setMessage(res.ok ? '맥의 docs/plans/spike-results.md 끝에 붙였어요' : `저장 실패(${res.status}) — [결과 복사]를 쓰세요`)
    } catch {
      setMessage('저장 실패 — [결과 복사]를 쓰세요')
    }
  }

  if (!open) {
    return (
      <div className="overlay">
        <button onClick={() => setOpen(true)}>계측 열기</button> 시도 {s.total} · 통과 {s.passed}
      </div>
    )
  }

  return (
    <div className="overlay">
      <div>
        konva {Konva.version} · react-konva {reactKonvaVersion} · react {reactVersion} · {spike.view.scale.toFixed(2)}px/cm
      </div>
      <div>
        ③ 끌기 p95 <b className={verdictPerf(frames) === '실패' ? 'bad' : 'ok'}>{formatMs(frames.dragP95)}</b> (끌기{' '}
        {frames.dragSeconds.toFixed(1)}초 · 표본 {frames.dragCount}) → {verdictPerf(frames)} · 전체 p95 {formatMs(frames.allP95)}
      </div>
      <div>
        ① 시도 {s.total}/{REQUIRED_ATTEMPTS} · 통과 {s.passed} (ⓐ{s.a} ⓑ{s.b} ⓒ{s.c}) → {verdictTouch(s)} ·{' '}
        {spike.armed ? '기록 중' : '기록 꺼짐'} · 커밋 {spike.commits}
      </div>
      {last && (
        <div className={last.pass ? 'ok' : 'bad'}>
          #{last.n} {last.kind} {last.itemId} ⓐ{last.a ? 'O' : 'X'} ⓑ{last.b ? 'O' : 'X'} ⓒ{last.c ? 'O' : 'X'} 편차{' '}
          {last.maxDeviation.toFixed(3)} 커밋 {last.commits} 남은 끌기 {last.remaining}
        </div>
      )}
      <div className="row">
        <button
          className={spike.armed ? 'on' : ''}
          onClick={() => {
            spike.armed = !spike.armed
            refresh()
          }}
        >
          {spike.armed ? '기록 중지' : '기록 시작'}
        </button>
        <button
          onClick={() => {
            spike.attempts = []
            spike.attemptSeq = 0
            refresh()
          }}
        >
          시도 초기화
        </button>
        <button
          onClick={() => {
            spike.frames.reset()
            refresh()
          }}
        >
          성능 초기화
        </button>
      </div>
      <div className="row">
        <input
          value={spike.device}
          placeholder="기기 모델명"
          onChange={(e) => {
            spike.device = e.target.value
            writeDevice(e.target.value)
            refresh()
          }}
        />
        <select
          value={spike.handles}
          onChange={(e) => {
            spike.handles = toHandleCheck(e.target.value)
            refresh()
          }}
        >
          <option value="미확인">② 핸들 미확인</option>
          <option value="가능">② 핸들 가능</option>
          <option value="불가">② 핸들 불가</option>
        </select>
      </div>
      <div className="row">
        <button onClick={() => void copy()}>결과 복사</button>
        <button onClick={() => void save()}>맥에 저장</button>
        <button onClick={() => setOpen(false)}>접기</button>
      </div>
      {message !== '' && <div>{message}</div>}
      {fallback !== null && <textarea readOnly value={fallback} onFocus={(e) => e.currentTarget.select()} />}
    </div>
  )
}

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root 요소가 없습니다')
createRoot(rootEl).render(<App />)
