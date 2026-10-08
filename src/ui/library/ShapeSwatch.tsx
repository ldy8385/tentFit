import type { ReactNode } from 'react'
import { ringBBox, shapeRing } from '../../core/geom'
import type { ColorKey, Shape } from '../../core/model'

const SVG_STYLE = { display: 'block', overflow: 'visible' } as const

/**
 * 라이브러리 견본·새 도형 미리보기용 작은 SVG(시안 검토 "라이브러리 견본도 실제 모양으로").
 * 상자(size×size px) 안에 비율을 지켜 맞춥니다. 점유 면적 제외 물건은 캔버스와 같은 긴 대시(6-4).
 */
export function ShapeSwatch(p: { shape: Shape; color: ColorKey; countsArea?: boolean; size: number }) {
  const style = {
    fill: `var(--obj-${p.color}-fill)`,
    stroke: `var(--obj-${p.color})`,
    strokeWidth: 1.5,
    strokeDasharray: p.countsArea === false ? '6 4' : undefined,
    vectorEffect: 'non-scaling-stroke',
  } as const
  const s = p.shape
  let viewBox: string
  let body: ReactNode
  if (s.kind === 'circle') {
    const r = s.d / 2
    const pad = s.d * 0.08
    viewBox = `${-r - pad} ${-r - pad} ${s.d + 2 * pad} ${s.d + 2 * pad}`
    body = <circle data-shape="circle" cx={0} cy={0} r={r} style={style} />
  } else {
    const ring = shapeRing(s)
    const b = ringBBox(ring)
    const w = b.maxX - b.minX
    const h = b.maxY - b.minY
    const pad = Math.max(w, h) * 0.08
    viewBox = `${b.minX - pad} ${b.minY - pad} ${w + 2 * pad} ${h + 2 * pad}`
    body = <polygon data-shape={s.kind} points={ring.map(([x, y]) => `${x},${y}`).join(' ')} style={style} />
  }
  return (
    <svg style={SVG_STYLE} width={p.size} height={p.size} viewBox={viewBox} aria-hidden="true" focusable="false">
      {body}
    </svg>
  )
}
