// 말줄임으로 잘린 글자에 마우스를 올리면 전체 글자를 툴팁(title)으로 보여 줍니다(소유자 요청 2026-10-15).
// 문서 전체에 한 번 겁니다: 올린 곳에서 몇 단계 위까지 말줄임(text-overflow: ellipsis 또는 line-clamp) 요소를 찾아,
// 실제로 잘렸을 때만 title을 붙이고 잘리지 않았으면 붙였던 title을 뗍니다. 원래 title이 있는 요소는 건드리지 않습니다.
// 터치는 툴팁이 없으므로 마우스·펜만 봅니다.

/** 우리가 붙인 title 표시 */
const MARK = 'data-auto-title'
/** 올린 요소에서 위로 찾는 단계 수(이름 글자 조각 → 이름 칸 정도) */
const MAX_DEPTH = 3

type Clip = 'width' | 'height' | null

function clipOf(el: Element): Clip {
  const cs = getComputedStyle(el)
  // 브라우저마다 읽히는 이름이 달라 둘 다 봅니다(크롬·사파리 = -webkit-, 표준 = line-clamp).
  for (const name of ['-webkit-line-clamp', 'line-clamp']) {
    const v = cs.getPropertyValue(name).trim()
    if (v !== '' && v !== 'none') return 'height'
  }
  return cs.textOverflow === 'ellipsis' ? 'width' : null
}

function sync(el: HTMLElement, clip: Exclude<Clip, null>): void {
  if (el.hasAttribute('title') && !el.hasAttribute(MARK)) return
  const text = (el.textContent ?? '').trim()
  const cut = clip === 'width' ? el.scrollWidth > el.clientWidth : el.scrollHeight > el.clientHeight
  if (cut && text !== '') {
    el.title = text
    el.setAttribute(MARK, '')
  } else if (el.hasAttribute(MARK)) {
    el.removeAttribute('title')
    el.removeAttribute(MARK)
  }
}

/** 문서에 붙입니다. 돌려준 함수로 뗍니다. */
export function installAutoTitle(doc: Document): () => void {
  const onOver = (e: Event): void => {
    const type = (e as PointerEvent).pointerType
    if (type !== 'mouse' && type !== 'pen') return
    let el = e.target instanceof Element ? e.target : null
    for (let i = 0; i < MAX_DEPTH && el !== null && el !== doc.body; i++, el = el.parentElement) {
      const clip = clipOf(el)
      if (clip !== null && el instanceof HTMLElement) {
        sync(el, clip)
        return
      }
    }
  }
  doc.addEventListener('pointerover', onOver, true)
  return () => doc.removeEventListener('pointerover', onOver, true)
}
