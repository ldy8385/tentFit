# tentFit — 텐트 배치 시뮬레이터

캠핑 텐트 바닥(이너·전실)에 매트·의자·테이블 같은 장비를 실제 치수(cm)로 놓아 보고, 바닥을 얼마나 차지하는지 확인하는 무료 웹 앱입니다.

## 개발

Node 22.12 이상과 pnpm 10.8.1(`package.json`의 `packageManager`)을 씁니다.

| 명령 | 하는 일 |
|---|---|
| `pnpm install` | 의존성 설치 |
| `pnpm dev` | 개발 서버(http://localhost:5173) |
| `pnpm typecheck` | 타입 검사 |
| `pnpm lint` | ESLint(core 경계 규칙 포함) |
| `pnpm test` | Vitest 전체 1회 실행 |
| `pnpm vitest run <파일>` | 테스트 파일 하나만 실행 |
| `pnpm build` | `dist/`로 빌드 |
| `pnpm ci:all` | GitHub Actions·Cloudflare Pages와 같은 전체 검사 |

## 코드 규칙

- `src/core/`는 순수 TypeScript입니다. 상대 경로로 core 밖을 import하지 않고, React·Konva·IndexedDB·스토어 패키지도 쓰지 않습니다. ESLint가 막습니다.
- `clipper2-ts`는 `src/core/geom.ts`만 import합니다.
- `konva`, `react-konva`, `react`, `react-dom`, `clipper2-ts`는 정확한 버전으로 고정하고, 앞의 넷은 함께만 올립니다.
- 커밋 메시지는 `feat: …`, `fix: …`, `chore: …`, `test: …` 형식의 한국어입니다.

## 문서

`docs/`(스펙·계획·조사)는 로컬 전용 작업 문서라 저장소에 넣지 않습니다(`.git/info/exclude`). 저장소에 둘 문서는 `docs/` 밖에 둡니다.
