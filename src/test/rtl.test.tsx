// @vitest-environment happy-dom
// 컴포넌트 테스트 기반 확인: happy-dom + @testing-library/react + src/test/setup.ts(자동 정리·act 환경).
import { fireEvent, render, screen } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { describe, expect, it } from 'vitest'

function Counter() {
  const [n, setN] = useState(0)
  return (
    <button type="button" onClick={() => setN((v) => v + 1)}>
      눌림 {n}
    </button>
  )
}

function Delayed() {
  const [text, setText] = useState('기다리는 중')
  useEffect(() => {
    const t = setTimeout(() => setText('끝'), 10)
    return () => clearTimeout(t)
  }, [])
  return <p>{text}</p>
}

describe('컴포넌트 테스트 기반', () => {
  it('렌더하고 클릭으로 상태를 바꾼다', () => {
    render(<Counter />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button').textContent).toBe('눌림 1')
  })

  it('앞 테스트의 화면은 자동으로 정리된다(setup.ts의 cleanup)', () => {
    expect(document.body.children).toHaveLength(0)
    render(<Counter />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('React act 환경이 켜져 있고, 타이머 뒤 갱신을 findBy로 기다릴 수 있다', async () => {
    expect((globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT).toBe(true)
    render(<Delayed />)
    expect(await screen.findByText('끝')).toBeTruthy()
  })
})
