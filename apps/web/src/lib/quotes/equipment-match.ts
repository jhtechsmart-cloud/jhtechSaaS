// 견적 item 이름을 장비 카탈로그(name/model)와 best-effort 매칭한다.
// 견적 item은 equipment_id를 저장하지 않으므로(스냅샷) 이름으로 추정 — 미매칭은 호출측에서 텍스트 폴백.
export type MatchableEquipment = {
  id: string;
  name: string;
  model: string | null;
  category: string | null;
  photos: string[];
};

// 소문자 + 영숫자/한글만(공백·하이픈·기호 제거).
function norm(s: string): string {
  return s.toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
}

export function matchEquipmentName<T extends { name: string; model: string | null }>(
  itemName: string,
  list: T[],
): T | null {
  const key = norm(itemName);
  if (key === "") return null;
  return list.find((e) => norm(e.name) === key || (e.model != null && norm(e.model) === key)) ?? null;
}
