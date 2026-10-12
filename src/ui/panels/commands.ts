// 속성 패널·선택 시트가 부르는 물건 문서 동작. 구현은 app/actions.ts 한 곳에만 있고 여기서는 다시 내보내기만 합니다
// (Plan 3 보류 Minor #23 — 같은 동작 두 벌 금지). 대상 id는 호출한 쪽이 넘깁니다(입력칸은 포커스 시점의 id, 버튼은 누를 때의 선택).
export {
  deleteAndDeselect,
  duplicateAndSelect,
  resize,
  rotateBy90,
  setProps,
  setRotation,
} from '../../app/actions'
