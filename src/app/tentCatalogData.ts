// 텐트 프리셋 파일 묶음(스펙 §5.4). 고르기 화면이 동적 import로만 불러서 별도 청크 1개가 됩니다.
// 키는 프로젝트 루트 기준 경로('/presets/tents/generic.json'), 값은 JSON 내용입니다.
export const tentFiles: Record<string, unknown> = import.meta.glob('/presets/tents/*.json', {
  eager: true,
  import: 'default',
})
