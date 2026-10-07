# 기본 프리셋

앱에 들어가는 기본 텐트·물건 프리셋입니다. 관리자가 조사해 직접 고칩니다.

## 파일

| 파일 | 내용 |
|---|---|
| `tents/generic.json` | 일반 예시(브랜드 없음). 예약된 파일 이름입니다 |
| `tents/<브랜드 slug>.json` | 브랜드별 텐트. 파일 이름(확장자 제외)이 slug입니다. 소문자·숫자·하이픈을 권장합니다 |
| `items.json` | 물건 |
| `tents.schema.json`, `items.schema.json` | `pnpm gen:schemas`가 만든 파일입니다. 직접 고치지 마세요 |

## 텐트 규칙

- `id`는 `<파일 slug>/<모델 slug>`입니다. id는 텐트와 물건을 통틀어 겹치면 안 됩니다.
- `generic.json` 밖에서는 `brand`가 필수입니다. `source`(출처 URL)와 `checkedAt`(`YYYY-MM-DD`)도 적어 주세요.
- 모양은 템플릿(`outerTemplate`, 이너의 `template`)으로 적고 `outer`·`shape`는 생략합니다. 둘 다 적으면 템플릿으로 만든 도형과 0.1cm 넘게 다를 때 검사가 실패합니다.
- 단위는 cm입니다. 원점은 외곽 바운딩 박스의 중심이고, x는 오른쪽, y는 아래쪽(텐트 앞쪽)이 +입니다.
- 이너 `id`는 `node -e "console.log(crypto.randomUUID())"`로 만든 값을 씁니다.
- 이너는 외곽 안에 있어야 하고(이탈 0), 이너끼리 5mm 넘게 겹치면 안 됩니다.

## 물건 규칙

- `id`는 `items/<slug>` 형식으로 씁니다.
- 깔개(`RUG`)는 `countsArea: false`, 나머지는 `true`입니다.

## 확인

고친 뒤에는 `pnpm validate-presets`로 검사합니다. 실패하면 파일과 위치가 한 줄씩 나오고 exit code 1로 끝납니다.

모델 스키마(`src/core/model.ts`)를 바꿨다면 `pnpm gen:schemas`로 스키마 파일을 다시 만들어 함께 커밋합니다. CI는 다시 만든 결과가 커밋된 파일과 다르면 실패합니다.
