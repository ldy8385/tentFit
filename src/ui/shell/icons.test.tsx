// @vitest-environment happy-dom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  BackIcon,
  ChevronRightIcon,
  FolderIcon,
  ShapeCircleIcon,
  ShapeFreeIcon,
  ShapeNgonIcon,
  ShapeRectIcon,
  ShapeTrapezoidIcon,
  TrashIcon,
} from './icons'

const ICONS = {
  BackIcon,
  ChevronRightIcon,
  FolderIcon,
  TrashIcon,
  ShapeRectIcon,
  ShapeTrapezoidIcon,
  ShapeNgonIcon,
  ShapeCircleIcon,
  ShapeFreeIcon,
}

describe('icons(Plan 4 추가분)', () => {
  for (const [name, Icon] of Object.entries(ICONS)) {
    it(`${name}: 장식용 svg(aria-hidden, currentColor), size를 따른다`, () => {
      const { container } = render(<Icon size={18} />)
      const svg = container.querySelector('svg')!
      expect(svg.getAttribute('aria-hidden')).toBe('true')
      expect(svg.getAttribute('stroke')).toBe('currentColor')
      expect(svg.getAttribute('width')).toBe('18')
      expect(svg.childElementCount).toBeGreaterThan(0)
    })
  }
})
