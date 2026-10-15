// 텐트 프리셋 묶음(스펙 §5.4). 고르기 화면이 동적 import로만 불러서 별도 청크 1개가 됩니다.
// 저장소의 텐트 프리셋은 presets/tents.json 하나입니다(2026-10-15, 브랜드별 파일에서 합침). 키 = 루트 기준 경로, 값 = JSON 내용.
// 일반 예시(돔 2인·터널 4인 등)는 배포본에서 없앴고, 시험(단위 시험·e2e = --mode test)에서만
// src/test/fixtures/tents/generic.json을 더합니다. 그 밖의 빌드에서는 이 갈래가 지워져 묶이지 않습니다.
import tentsJson from '../../presets/tents.json'

const testFiles: Record<string, unknown> =
  import.meta.env.MODE === 'test' ? import.meta.glob('/src/test/fixtures/tents/*.json', { eager: true, import: 'default' }) : {}

export const tentFiles: Record<string, unknown> = { '/presets/tents.json': tentsJson, ...testFiles }
