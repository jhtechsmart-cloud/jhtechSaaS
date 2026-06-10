// 견적 item 이름을 장비 카탈로그(name/model)와 best-effort 매칭. 견적 item은 equipment_id를
// 스냅샷이라 저장 안 해 이름으로 추정. 웹(견적 프레임)·워커(견적 PDF) 공유.
// 소문자 + 영숫자/한글만(공백·하이픈·기호 제거).
export function normalizeEquipmentKey(s: string): string {
  return s.toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
}

export function matchEquipmentName<T extends { name: string; model: string | null }>(
  itemName: string,
  list: T[],
): T | null {
  const key = normalizeEquipmentKey(itemName);
  if (key === "") return null;
  return (
    list.find((e) => normalizeEquipmentKey(e.name) === key || (e.model != null && normalizeEquipmentKey(e.model) === key)) ??
    null
  );
}
