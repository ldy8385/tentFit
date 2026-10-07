const FONT_STACK =
  '-apple-system, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif'

/** 임시 첫 화면. Plan 3(편집기 골격)에서 교체합니다. */
export default function App() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        margin: 0,
        fontFamily: FONT_STACK,
      }}
    >
      <h1>tentFit — 텐트 배치 시뮬레이터</h1>
    </main>
  )
}
