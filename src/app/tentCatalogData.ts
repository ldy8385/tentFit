// 텐트 프리셋 파일 묶음(스펙 §5.4). 고르기 화면이 동적 import로만 불러서 별도 청크 1개가 됩니다.
// 키는 프로젝트 루트 기준 경로('/presets/tents/<slug>.json'), 값은 JSON 내용입니다.
// 일반 예시(돔 2인·터널 4인 등)는 배포본에서 없앴고(소유자 결정 2026-10-15), 시험(단위 시험·e2e = --mode test)에서만
// src/test/fixtures/tents/generic.json을 더합니다. 그 밖의 빌드에서는 이 갈래가 지워져 묶이지 않습니다.
const repoFiles: Record<string, unknown> = import.meta.glob('/presets/tents/*.json', { eager: true, import: 'default' })
const testFiles: Record<string, unknown> =
  import.meta.env.MODE === 'test' ? import.meta.glob('/src/test/fixtures/tents/*.json', { eager: true, import: 'default' }) : {}

export const tentFiles: Record<string, unknown> = { ...repoFiles, ...testFiles }
