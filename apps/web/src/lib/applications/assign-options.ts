export interface AssignOption {
  id: string;
  name: string;
}

// 의뢰(견적) 담당자 배정 select 옵션.
// 기본 목록은 영업부 직원만(불필요한 인원 노출 방지). 단, 현재 담당자가 영업부가 아니어도
// (과거 배정·부서 미지정) 옵션에 남겨 두어야 select가 실제 값을 보여준다 — 빠지면 '미배정'처럼 보이고
// 저장 버튼도 곧바로 dirty로 켜지는 오해가 생긴다.
export function buildAssignOptions(
  staff: AssignOption[],
  currentAssigneeId: string | null,
  currentAssigneeName: string | null,
): AssignOption[] {
  if (!currentAssigneeId) return staff;
  if (staff.some((s) => s.id === currentAssigneeId)) return staff;
  return [{ id: currentAssigneeId, name: currentAssigneeName ?? "(현재 담당자)" }, ...staff];
}
