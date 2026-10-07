import { area, inflate, intersect, region, ringArea, ringSelfIntersects, worldRing } from './geom'
import { EPS_AREA, newId, TOL_CM } from './model'
import type { Inner, Item, Layout, Pt, Shape, Tent } from './model'
import { shapeFromTemplate, shapesEqual } from './templates'

export type IssueCode =
  | 'too-few-points'
  | 'self-intersect'
  | 'tiny-area'
  | 'inner-overlap'
  | 'dup-id'
  | 'group-missing'
  | 'group-noncontiguous'
  | 'group-too-small'
  | 'template-mismatch'

export type Issue = { code: IssueCode; path: string; message: string; fixed: boolean }

type RingCode = 'too-few-points' | 'self-intersect' | 'tiny-area'

const RING_MESSAGES: Record<RingCode, string> = {
  'too-few-points': '꼭짓점이 3개보다 적어요',
  'self-intersect': '변끼리 교차해요',
  'tiny-area': '넓이가 1cm² 이하예요',
}

/** 연속으로 같은 점(닫는 점 포함)을 뺀 고리 */
function dedupeRing(ring: Pt[]): Pt[] {
  const out: Pt[] = []
  for (const p of ring) {
    const last = out[out.length - 1]
    if (last === undefined || last[0] !== p[0] || last[1] !== p[1]) out.push(p)
  }
  while (out.length > 1) {
    const first = out[0]
    const last = out[out.length - 1]
    if (first === undefined || last === undefined || first[0] !== last[0] || first[1] !== last[1]) break
    out.pop()
  }
  return out
}

/** 다각형 유효성(§5.3-3): 꼭짓점 3개 이상, 자기교차 없음, 넓이 1cm² 초과 */
export function ringIssue(ring: Pt[]): RingCode | null {
  const pts = dedupeRing(ring)
  if (pts.length < 3) return 'too-few-points'
  if (ringSelfIntersects(pts)) return 'self-intersect'
  if (ringArea(pts) <= 1) return 'tiny-area'
  return null
}

/** 이너끼리 겹침(§5.3-4): area(Iₐ ∩ I_b⁻) > ε 또는 area(I_b ∩ Iₐ⁻) > ε. 5mm 이하 파고듦은 겹침이 아닙니다. */
export function innersOverlap(a: Inner, b: Inner): boolean {
  const ra = region(worldRing(a))
  const rb = region(worldRing(b))
  if (area(intersect(ra, inflate(rb, -TOL_CM))) > EPS_AREA) return true
  return area(intersect(rb, inflate(ra, -TOL_CM))) > EPS_AREA
}

/** 다각형 도형만 검사합니다(사각형·원은 스키마의 길이 범위로 충분). */
function shapeIssue(shape: Shape): RingCode | null {
  return shape.kind === 'polygon' ? ringIssue(shape.points) : null
}

/** 텐트의 기하 이슈(고칠 수 없음): 외곽·이너 다각형 유효성, 이너끼리 겹침. */
export function validateTent(tent: Tent, pathPrefix = 'tent'): Issue[] {
  const issues: Issue[] = []
  const outerCode = shapeIssue(tent.outer)
  if (outerCode) {
    issues.push({ code: outerCode, path: `${pathPrefix}.outer`, message: `외곽: ${RING_MESSAGES[outerCode]}`, fixed: false })
  }
  const validInners: Array<{ inner: Inner; index: number }> = []
  tent.inners.forEach((inner, index) => {
    const code = shapeIssue(inner.shape)
    if (code) {
      issues.push({
        code,
        path: `${pathPrefix}.inners.${index}.shape`,
        message: `${inner.name}: ${RING_MESSAGES[code]}`,
        fixed: false,
      })
    } else {
      validInners.push({ inner, index })
    }
  })
  for (let i = 0; i < validInners.length; i++) {
    for (let j = i + 1; j < validInners.length; j++) {
      const a = validInners[i]
      const b = validInners[j]
      if (a === undefined || b === undefined) continue
      if (innersOverlap(a.inner, b.inner)) {
        issues.push({
          code: 'inner-overlap',
          path: `${pathPrefix}.inners.${b.index}`,
          message: `${a.inner.name}과(와) ${b.inner.name}이(가) 5mm 넘게 겹쳐요`,
          fixed: false,
        })
      }
    }
  }
  return issues
}

/** 템플릿이 있으면 템플릿으로 만든 도형과 비교해 다르면 다시 만듭니다(§5.3-6). */
function fixTemplates(tent: Tent, issues: Issue[]): void {
  if (tent.outerTemplate) {
    const made = shapeFromTemplate(tent.outerTemplate)
    if (!shapesEqual(tent.outer, made)) {
      tent.outer = made
      issues.push({ code: 'template-mismatch', path: 'tent.outer', message: '외곽을 템플릿으로 다시 만들었어요', fixed: true })
    }
  }
  tent.inners.forEach((inner, k) => {
    if (!inner.template) return
    const made = shapeFromTemplate(inner.template)
    if (!shapesEqual(inner.shape, made)) {
      inner.shape = made
      issues.push({
        code: 'template-mismatch',
        path: `tent.inners.${k}.shape`,
        message: `${inner.name}을(를) 템플릿으로 다시 만들었어요`,
        fixed: true,
      })
    }
  })
}

/**
 * 이너·물건·그룹 id 중복 정리(§5.1: 한 배치 안에서 서로 겹치지 않음).
 * 돌려주는 맵은 "정리 후 그룹 id → 입력 groups 배열의 위치"로, 그룹 이슈 경로에 씁니다.
 */
function fixIds(layout: Layout, issues: Issue[]): Map<string, number> {
  const taken = new Set<string>()
  const renew = (target: Inner | Item, path: string) => {
    if (!taken.has(target.id)) {
      taken.add(target.id)
      return
    }
    const old = target.id
    target.id = newId()
    taken.add(target.id)
    issues.push({ code: 'dup-id', path, message: `중복된 id(${old})에 새 id를 줬어요`, fixed: true })
  }
  layout.tent.inners.forEach((inner, k) => renew(inner, `tent.inners.${k}.id`))
  layout.items.forEach((item, i) => renew(item, `items.${i}.id`))

  const seen = new Set<string>()
  const groupIndex = new Map<string, number>()
  const groups: Layout['groups'] = []
  layout.groups.forEach((group, g) => {
    if (seen.has(group.id)) {
      issues.push({ code: 'dup-id', path: `groups.${g}.id`, message: `그룹 목록의 중복(${group.id})을 하나로 합쳤어요`, fixed: true })
      return
    }
    seen.add(group.id)
    let id = group.id
    if (taken.has(id)) {
      id = newId()
      for (const item of layout.items) if (item.groupId === group.id) item.groupId = id
      issues.push({ code: 'dup-id', path: `groups.${g}.id`, message: `이너·물건과 겹친 그룹 id(${group.id})에 새 id를 줬어요`, fixed: true })
    }
    taken.add(id)
    groupIndex.set(id, g)
    groups.push({ id })
  })
  layout.groups = groups
  return groupIndex
}

/** 그룹 불변식(§5.3-1·2) 정리: 없는 그룹 참조 제거 → 멤버 1개 이하 그룹 해제 → 흩어진 멤버를 가장 위 멤버 자리로 모음. */
function fixGroups(layout: Layout, groupIndex: Map<string, number>, issues: Issue[]): void {
  const groupPath = (id: string, fallback: number) => `groups.${groupIndex.get(id) ?? fallback}`
  const known = new Set(layout.groups.map((g) => g.id))
  layout.items.forEach((item, i) => {
    if (item.groupId !== undefined && !known.has(item.groupId)) {
      issues.push({ code: 'group-missing', path: `items.${i}.groupId`, message: `없는 그룹(${item.groupId}) 참조를 지웠어요`, fixed: true })
      delete item.groupId
    }
  })

  const kept: Layout['groups'] = []
  layout.groups.forEach((group, g) => {
    const members = layout.items.filter((item) => item.groupId === group.id)
    if (members.length >= 2) {
      kept.push(group)
      return
    }
    for (const m of members) delete m.groupId
    issues.push({
      code: 'group-too-small',
      path: groupPath(group.id, g),
      message: members.length === 1 ? '멤버가 1개인 그룹을 해제했어요' : '멤버가 없는 그룹을 지웠어요',
      fixed: true,
    })
  })
  layout.groups = kept

  layout.groups.forEach((group, g) => {
    const idx: number[] = []
    layout.items.forEach((item, i) => {
      if (item.groupId === group.id) idx.push(i)
    })
    const firstIdx = idx[0]
    const lastIdx = idx[idx.length - 1]
    if (firstIdx === undefined || lastIdx === undefined || lastIdx - firstIdx + 1 === idx.length) return
    const members = layout.items.filter((item) => item.groupId === group.id)
    const others = layout.items.filter((item) => item.groupId !== group.id)
    const insertAt = layout.items.slice(0, lastIdx).filter((item) => item.groupId !== group.id).length
    layout.items = [...others.slice(0, insertAt), ...members, ...others.slice(insertAt)]
    issues.push({ code: 'group-noncontiguous', path: groupPath(group.id, g), message: '흩어진 그룹 멤버를 한자리로 모았어요', fixed: true })
  })
}

/**
 * 배치 전체 검사(§5.3). 입력은 바꾸지 않고 정규화한 복사본을 돌려줍니다.
 * 고칠 수 있는 위반은 고치고 fixed: true로 남기며, 고칠 수 없는 기하 위반이 하나라도 있으면 ok: false입니다.
 * 이슈 경로는 모두 입력 배치의 위치 기준입니다(순서를 바꾸는 그룹 정리를 맨 마지막에 합니다).
 */
export function validateLayout(layout: Layout): { ok: boolean; layout: Layout; issues: Issue[] } {
  const out = structuredClone(layout)
  const issues: Issue[] = []

  fixTemplates(out.tent, issues)
  issues.push(...validateTent(out.tent, 'tent'))
  out.items.forEach((item, i) => {
    const code = shapeIssue(item.shape)
    if (code) issues.push({ code, path: `items.${i}.shape`, message: `${item.name}: ${RING_MESSAGES[code]}`, fixed: false })
  })
  const groupIndex = fixIds(out, issues)
  fixGroups(out, groupIndex, issues)

  return { ok: issues.every((i) => i.fixed), layout: out, issues }
}
