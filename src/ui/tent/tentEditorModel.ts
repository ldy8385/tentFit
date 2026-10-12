// 텐트 편집 패널·시트가 쓰는 순수 계산(React 없음). 대상 키, 이름·모양 요약, 편집할 템플릿, 템플릿 칸 반영.
import { ringBBox, shapeRing } from '../../core/geom'
import { round1, type Pt, type Shape, type ShapeTemplate, type Tent } from '../../core/model'
import type { TentTarget } from '../../core/ops/tent'
import { ngonDiameterFromSide, ngonSideFromDiameter } from '../../core/templates'
import { formatNumber } from '../fields/numberInput'

const INNER_PREFIX = 'inner:'

/** 대상을 문자열 하나로: 없음 '' · 외곽 'outer' · 이너 'inner:<id>'. 입력칸 targetId·구독 selector에 씁니다. */
export function targetKey(target: TentTarget | null): string {
  if (target === null) return ''
  return target === 'outer' ? 'outer' : `${INNER_PREFIX}${target.innerId}`
}

/** targetKey의 역. 알 수 없는 글자면 null */
export function parseTargetKey(key: string): TentTarget | null {
  if (key === 'outer') return 'outer'
  if (key.startsWith(INNER_PREFIX) && key.length > INNER_PREFIX.length) return { innerId: key.slice(INNER_PREFIX.length) }
  return null
}

/** 꼭짓점 입력칸 targetId: '<대상 키>#<번호>' */
export function vertexFieldId(target: TentTarget, index: number): string {
  return `${targetKey(target)}#${index}`
}

/** vertexFieldId의 역. 알 수 없는 글자면 null */
export function parseVertexFieldId(id: string): { target: TentTarget; index: number } | null {
  const at = id.lastIndexOf('#')
  if (at < 0) return null
  const target = parseTargetKey(id.slice(0, at))
  const index = Number(id.slice(at + 1))
  if (target === null || !Number.isInteger(index) || index < 0) return null
  return { target, index }
}

/** 자유 다각형 칸 종류: 변 길이(e), 꼭짓점 각도(a), 전체 가로(w)·세로(h) */
export type PolygonFieldKind = 'e' | 'a' | 'w' | 'h'

/**
 * 자유 다각형 칸 targetId: '<대상 키>@<종류><번호>'(번호는 0부터, 가로·세로는 번호 없음).
 * 꼭짓점 좌표 칸('#')과 섞이지 않게 다른 구분자를 씁니다.
 */
export function polygonFieldId(target: TentTarget, kind: PolygonFieldKind, index = 0): string {
  return `${targetKey(target)}@${kind}${kind === 'w' || kind === 'h' ? '' : String(index)}`
}

/** polygonFieldId의 역. 알 수 없는 글자면 null */
export function parsePolygonFieldId(id: string): { target: TentTarget; kind: PolygonFieldKind; index: number } | null {
  const at = id.lastIndexOf('@')
  if (at < 0) return null
  const target = parseTargetKey(id.slice(0, at))
  const rest = id.slice(at + 1)
  const kind = rest.charAt(0)
  if (target === null) return null
  if (kind === 'w' || kind === 'h') return rest.length === 1 ? { target, kind, index: 0 } : null
  if (kind !== 'e' && kind !== 'a') return null
  const index = Number(rest.slice(1))
  if (rest.length < 2 || !Number.isInteger(index) || index < 0) return null
  return { target, kind, index }
}

/** 표시 이름: 외곽은 '외곽', 이너는 그 이름. 없는 이너면 null */
export function targetName(tent: Tent, target: TentTarget): string | null {
  if (target === 'outer') return '외곽'
  return tent.inners.find((it) => it.id === target.innerId)?.name ?? null
}

/** 대상의 도형과 템플릿. 없는 이너면 null */
export function targetShape(tent: Tent, target: TentTarget): { shape: Shape; template: ShapeTemplate | undefined } | null {
  if (target === 'outer') return { shape: tent.outer, template: tent.outerTemplate }
  const inner = tent.inners.find((it) => it.id === target.innerId)
  return inner === undefined ? null : { shape: inner.shape, template: inner.template }
}

/**
 * 편집 칸에 보일 템플릿(§4.4-3 "템플릿이 있는 대상에는 템플릿 치수만").
 * 템플릿이 있으면 그것, 없으면 사각형·원 도형은 같은 치수의 템플릿으로 봅니다. 자유 다각형이면 null(좌표 표).
 */
export function editableTemplate(shape: Shape, template: ShapeTemplate | undefined): ShapeTemplate | null {
  if (template !== undefined) return template
  if (shape.kind === 'rect') return { kind: 'rect', w: shape.w, h: shape.h }
  if (shape.kind === 'circle') return { kind: 'circle', d: shape.d }
  return null
}

/** 모양 이름(템플릿이 있으면 템플릿 기준) */
export function shapeKindLabel(shape: Shape, template: ShapeTemplate | undefined): string {
  const kind = template?.kind ?? shape.kind
  switch (kind) {
    case 'rect':
      return '사각형'
    case 'trapezoid':
      return '사다리꼴'
    case 'ngon':
      return template?.kind === 'ngon' ? `정${template.n}각형` : '정N각형'
    case 'circle':
      return '원'
    case 'hexagon':
      return '육각형'
    case 'polygon':
      return '자유 다각형'
  }
}

/** 크기 글자: 사각형 '620 × 320 cm', 원 '지름 400 cm', 그 밖은 바운딩 박스 '가로 × 세로 cm' */
export function shapeSizeText(shape: Shape): string {
  if (shape.kind === 'rect') return `${formatNumber(shape.w)} × ${formatNumber(shape.h)} cm`
  if (shape.kind === 'circle') return `지름 ${formatNumber(shape.d)} cm`
  const b = ringBBox(shapeRing(shape))
  return `${formatNumber(round1(b.maxX - b.minX))} × ${formatNumber(round1(b.maxY - b.minY))} cm`
}

/** 구성 목록 행의 보조 글자: '사각형 · 620 × 320 cm' */
export function shapeSummary(shape: Shape, template: ShapeTemplate | undefined): string {
  return `${shapeKindLabel(shape, template)} · ${shapeSizeText(shape)}`
}

/** 템플릿 숫자 칸 이름 */
export type TemplateField = 'w' | 'h' | 'front' | 'back' | 'depth' | 'offset' | 'n' | 'size' | 'd' | 'edge'

/**
 * 템플릿 숫자 칸 하나를 바꾼 새 템플릿. 그 템플릿에 없는 칸이면 그대로 돌려줍니다.
 * 정사각형(square)이면 가로·세로를 같이 바꿉니다(§4.8 "w=h로 묶음").
 */
export function applyTemplateField(t: ShapeTemplate, field: TemplateField, value: number): ShapeTemplate {
  switch (t.kind) {
    case 'rect':
      if (field === 'w' || field === 'h') return t.square === true ? { ...t, w: value, h: value } : { ...t, [field]: value }
      return t
    case 'trapezoid':
      if (field === 'front' || field === 'back' || field === 'depth' || field === 'offset') return { ...t, [field]: value }
      return t
    case 'ngon':
      if (field === 'n' || field === 'size') return { ...t, [field]: value }
      return t
    case 'circle':
      return field === 'd' ? { ...t, d: value } : t
    case 'hexagon':
      if (field === 'w' || field === 'h' || field === 'edge') return { ...t, [field]: value }
      return t
  }
}

/** 정사각형 체크: 켜면 세로를 가로에 맞추고, 끄면 지금 치수 그대로 묶음만 풉니다. 사각형이 아니면 그대로 */
export function setSquare(t: ShapeTemplate, square: boolean): ShapeTemplate {
  if (t.kind !== 'rect') return t
  return square ? { ...t, square: true, h: t.w } : { ...t, square: false }
}

/** 정N각형 크기 기준(지름 ↔ 한 변)을 바꾸면서 같은 도형이 되도록 값을 환산합니다(0.1cm 반올림). */
export function switchNgonSizeBy(t: ShapeTemplate, sizeBy: 'diameter' | 'side'): ShapeTemplate {
  if (t.kind !== 'ngon' || t.sizeBy === sizeBy) return t
  const size = sizeBy === 'side' ? ngonSideFromDiameter(t.n, t.size) : ngonDiameterFromSide(t.n, t.size)
  return { ...t, sizeBy, size: round1(size) }
}

/** 두 점이 0.05cm 안에서 같은지(좌표 표에 같은 값을 다시 넣으면 기록을 남기지 않게) */
export function samePoint(a: Pt, b: Pt): boolean {
  return Math.abs(a[0] - b[0]) < 0.05 && Math.abs(a[1] - b[1]) < 0.05
}
