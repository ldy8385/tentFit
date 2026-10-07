import { z } from 'zod'

// ── 상수 ───────────────────────────────────────────────────────────────
export type Pt = [number, number]

export const SCHEMA_VERSION = 1

export const COLOR_KEYS = ['blue', 'teal', 'green', 'purple', 'pink', 'gray', 'sky', 'brown'] as const
export const ITEM_CATEGORIES = ['MAT', 'CHAIR', 'TABLE', 'FURNITURE', 'RUG', 'ETC'] as const

export const LIMITS = {
  length: [1, 5000],
  offset: [-5000, 5000],
  coord: [-10000, 10000],
  ngonN: [5, 12],
} as const

/** 넓이 판정에서 무시하는 잔여 넓이(cm²) */
export const EPS_AREA = 0.01
/** 경고·겹침 허용 거리(cm). 5mm */
export const TOL_CM = 0.5
/** 전실 조각으로 이름·라벨을 붙이는 최소 넓이(cm²) */
export const MIN_PIECE_AREA = 100

// ── 기본 스키마 조각 ───────────────────────────────────────────────────
const LengthSchema = z.number().min(LIMITS.length[0]).max(LIMITS.length[1])
const OffsetSchema = z.number().min(LIMITS.offset[0]).max(LIMITS.offset[1])
const CoordSchema = z.number().min(LIMITS.coord[0]).max(LIMITS.coord[1])
/** 회전은 아무 실수나 받습니다. [0,360) 정규화는 반영 시점(ops)에서 normAngle로 합니다. */
const RotationSchema = z.number()
const NgonNSchema = z.number().int().min(LIMITS.ngonN[0]).max(LIMITS.ngonN[1])
const IdSchema = z.string().min(1)
const IsoDateTimeSchema = z.iso.datetime({ offset: true })

export const PtSchema = z.tuple([CoordSchema, CoordSchema])

const RectShapeSchema = z.object({ kind: z.literal('rect'), w: LengthSchema, h: LengthSchema })
const CircleShapeSchema = z.object({ kind: z.literal('circle'), d: LengthSchema })
/** 꼭짓점 수·자기교차·넓이 규칙(§5.3-3)은 validate.ts가 검사합니다. */
const PolygonShapeSchema = z.object({ kind: z.literal('polygon'), points: z.array(PtSchema) })

export const ShapeSchema = z.discriminatedUnion('kind', [RectShapeSchema, CircleShapeSchema, PolygonShapeSchema])

export const ShapeTemplateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('rect'), w: LengthSchema, h: LengthSchema, square: z.boolean().optional() }),
  z.object({
    kind: z.literal('trapezoid'),
    front: LengthSchema,
    back: LengthSchema,
    depth: LengthSchema,
    offset: OffsetSchema,
  }),
  z.object({
    kind: z.literal('ngon'),
    n: NgonNSchema,
    sizeBy: z.enum(['diameter', 'side']),
    size: LengthSchema,
  }),
  z.object({ kind: z.literal('circle'), d: LengthSchema }),
])

export const PlacedSchema = z.object({
  id: IdSchema,
  name: z.string(),
  shape: ShapeSchema,
  x: CoordSchema,
  y: CoordSchema,
  rotation: RotationSchema,
})

export const InnerSchema = PlacedSchema.extend({
  template: ShapeTemplateSchema.optional(),
})

export const TentSchema = z.object({
  name: z.string(),
  outer: ShapeSchema,
  outerTemplate: ShapeTemplateSchema.optional(),
  inners: z.array(InnerSchema),
})

export const ItemCategorySchema = z.enum(ITEM_CATEGORIES)
export const ColorKeySchema = z.enum(COLOR_KEYS)

export const ItemSchema = PlacedSchema.extend({
  color: ColorKeySchema,
  category: ItemCategorySchema,
  countsArea: z.boolean(),
  groupId: IdSchema.optional(),
  presetId: z.string().optional(),
})

export const GroupSchema = z.object({ id: IdSchema })

export const LayoutSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: IdSchema,
  name: z.string(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  tent: TentSchema,
  sourcePresetId: z.string().optional(),
  items: z.array(ItemSchema),
  groups: z.array(GroupSchema),
})

export const TentPresetSchema = z.object({
  id: IdSchema,
  brand: z.string().min(1).optional(),
  model: z.string().min(1),
  tent: TentSchema,
  source: z.string().optional(),
  checkedAt: z.iso.date().optional(),
  note: z.string().optional(),
})

export const ItemPresetSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  category: ItemCategorySchema,
  shape: ShapeSchema,
  color: ColorKeySchema,
  countsArea: z.boolean(),
})

export const ExportFileSchema = z.object({
  format: z.literal('tentfit'),
  schemaVersion: z.literal(SCHEMA_VERSION),
  exportedAt: IsoDateTimeSchema,
  layouts: z.array(LayoutSchema),
  myTents: z.array(TentPresetSchema),
  myItems: z.array(ItemPresetSchema),
})

export const MyTentsSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  items: z.array(TentPresetSchema),
})

export const MyItemsSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  items: z.array(ItemPresetSchema),
})

// ── 파일용 스키마(저장소 presets/) ─────────────────────────────────────
// 템플릿이 있으면 outer(이너는 shape)를 생략할 수 있습니다(§5.4).
const TentFileInnerSchema = PlacedSchema.extend({
  shape: ShapeSchema.optional(),
  template: ShapeTemplateSchema.optional(),
}).refine((v) => v.shape !== undefined || v.template !== undefined, {
  message: 'shape나 template 중 하나는 있어야 해요',
  path: ['shape'],
})

const TentFileTentSchema = z
  .object({
    name: z.string(),
    outer: ShapeSchema.optional(),
    outerTemplate: ShapeTemplateSchema.optional(),
    inners: z.array(TentFileInnerSchema),
  })
  .refine((v) => v.outer !== undefined || v.outerTemplate !== undefined, {
    message: 'outer나 outerTemplate 중 하나는 있어야 해요',
    path: ['outer'],
  })

export const TentFileEntrySchema = TentPresetSchema.extend({
  tent: TentFileTentSchema,
})

export const TentPresetFileSchema = z.object({
  $schema: z.string().optional(),
  presets: z.array(TentFileEntrySchema),
})

export const ItemPresetFileSchema = z.object({
  $schema: z.string().optional(),
  items: z.array(ItemPresetSchema),
})

// ── 타입 ───────────────────────────────────────────────────────────────
export type Shape = z.infer<typeof ShapeSchema>
export type ShapeTemplate = z.infer<typeof ShapeTemplateSchema>
export type Placed = z.infer<typeof PlacedSchema>
export type Inner = z.infer<typeof InnerSchema>
export type Tent = z.infer<typeof TentSchema>
export type ItemCategory = z.infer<typeof ItemCategorySchema>
export type ColorKey = z.infer<typeof ColorKeySchema>
export type Item = z.infer<typeof ItemSchema>
export type Group = z.infer<typeof GroupSchema>
export type Layout = z.infer<typeof LayoutSchema>
export type TentPreset = z.infer<typeof TentPresetSchema>
export type ItemPreset = z.infer<typeof ItemPresetSchema>
export type ExportFile = z.infer<typeof ExportFileSchema>
export type TentFileEntry = z.infer<typeof TentFileEntrySchema>

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  MAT: '매트',
  CHAIR: '의자',
  TABLE: '테이블',
  FURNITURE: '수납·가구',
  RUG: '깔개',
  ETC: '기타',
}

// ── 함수 ───────────────────────────────────────────────────────────────
/** 0.1 단위 반올림. -0을 남기지 않습니다. */
export function round1(v: number): number {
  const r = Math.round(v * 10) / 10
  return r === 0 ? 0 : r
}

/** [0,360)로 정규화하고 0.01° 단위로 반올림합니다. 359.996 → 0, -90 → 270. -0을 남기지 않습니다. */
export function normAngle(deg: number): number {
  const r = Math.round(deg * 100) / 100
  let m = r % 360
  if (m < 0) m += 360
  m = Math.round(m * 100) / 100
  if (m >= 360) m -= 360
  return m === 0 ? 0 : m
}

export function newId(): string {
  return crypto.randomUUID()
}

/** 텐트의 복사본(D10)을 가진 빈 배치를 만듭니다. */
export function createLayout(
  tent: Tent,
  opts: { name: string; sourcePresetId?: string; id?: string; now?: string },
): Layout {
  const now = opts.now ?? new Date().toISOString()
  const layout: Layout = {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id ?? newId(),
    name: opts.name,
    createdAt: now,
    updatedAt: now,
    tent: structuredClone(tent),
    items: [],
    groups: [],
  }
  if (opts.sourcePresetId !== undefined) layout.sourcePresetId = opts.sourcePresetId
  return layout
}
