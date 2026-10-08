// 입력칸 공용 규칙(스펙 §4.2 모바일 입력 규칙). React와 무관한 순수 함수입니다.

/** 오류 문구를 보여 주는 시간(ms). 범위 밖·빈 값으로 반영하면 마지막 유효값으로 되돌리고 이만큼 보여 줍니다. */
export const ERROR_MS = 1500
/** 입력칸 글자 크기(px). 16px보다 작으면 iOS가 포커스할 때 페이지를 확대합니다. */
export const INPUT_FONT_PX = 16

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string }

/**
 * 입력 글자를 숫자로 바꿉니다. 앞뒤 공백, 천 단위 쉼표, 유니코드 마이너스(−)를 받습니다.
 * 빈 글자나 숫자가 아닌 글자는 NaN입니다(Number('')가 0인 것을 막음).
 */
export function parseNumberInput(text: string): number {
  const t = text.trim().replace(/,/g, '').replace(/−/g, '-')
  if (t === '') return Number.NaN
  const n = Number(t)
  return Number.isFinite(n) ? n : Number.NaN
}

/** 표시용 글자. 소수 둘째 자리까지(회전 0.01°), -0은 '0', 유한하지 않으면 빈 글자입니다. */
export function formatNumber(v: number): string {
  if (!Number.isFinite(v)) return ''
  const r = Math.round(v * 100) / 100
  return r === 0 ? '0' : String(r)
}

function formatBound(v: number): string {
  return v.toLocaleString('ko-KR', { maximumFractionDigits: 2 })
}

/** 숫자 입력 검사. 숫자가 아니면 '숫자를 입력해 주세요', 범위 밖이면 '1~5,000 사이로 입력해 주세요'. */
export function checkNumber(text: string, min: number, max: number): Checked<number> {
  const n = parseNumberInput(text)
  if (Number.isNaN(n)) return { ok: false, error: '숫자를 입력해 주세요' }
  if (n < min || n > max) return { ok: false, error: `${formatBound(min)}~${formatBound(max)} 사이로 입력해 주세요` }
  return { ok: true, value: n === 0 ? 0 : n }
}

/** 이름 입력 검사. 앞뒤 공백을 떼고, 비면 되돌립니다. */
export function checkText(text: string): Checked<string> {
  const v = text.trim()
  if (v === '') return { ok: false, error: '비워 둘 수 없어요' }
  return { ok: true, value: v }
}

/** [±] 버튼: 부호를 바꾼 글자. 숫자가 아니면 null(아무것도 하지 않음). 0은 0 그대로입니다. */
export function flipSignText(text: string): string | null {
  const n = parseNumberInput(text)
  if (Number.isNaN(n)) return null
  return formatNumber(n === 0 ? 0 : -n)
}

/** 화살표 위·아래: step만큼 더한 값을 범위 안으로 자른 글자. 숫자가 아니면 null입니다. */
export function stepText(text: string, delta: number, min: number, max: number): string | null {
  const n = parseNumberInput(text)
  if (Number.isNaN(n)) return null
  return formatNumber(Math.min(max, Math.max(min, n + delta)))
}
