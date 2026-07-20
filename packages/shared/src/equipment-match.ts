// 견적 item 이름을 장비 카탈로그(name/model)와 best-effort 매칭. 견적 item은 equipment_id를
// 스냅샷이라 저장 안 해 이름으로 추정. 웹(견적 프레임)·워커(견적 PDF) 공유.
// 소문자 + 영숫자/한글만(공백·하이픈·기호 제거).
export function normalizeEquipmentKey(s: string): string {
  return s.toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
}

// 현장 리포트에 기록할 장비 표시명. 카탈로그에 이름이 같고 모델만 다른 행이 실재하므로
// (예: '대형 롤투롤 UV 프린터' = XTRA 5000 / XTRA 3300S) 이름만 쓰면 기사도 문서도 구분 못 한다.
// 모델이 이름에 이미 녹아 있으면(정규화 동일) 덧붙이지 않는다.
export function catalogDeviceLabel(name: string, model: string | null | undefined): string {
  const n = name.trim();
  const m = (model ?? "").trim();
  if (m === "") return n;
  const nk = normalizeEquipmentKey(n);
  const mk = normalizeEquipmentKey(m);
  if (mk === "" || nk === mk || nk.includes(mk)) return n;
  return `${n} (${m})`;
}

// SQL(match_catalog_equipment)의 regexp_replace와 동일해야 하는 정규화 대조셋.
// shared 단위 테스트와 db-test가 같은 벡터를 쓰므로 두 구현이 갈라지면 즉시 깨진다.
export const EQUIPMENT_KEY_VECTORS: { input: string; key: string }[] = [
  { input: "XTRA 3300H", key: "xtra3300h" },
  { input: "  XTRA-3300H  ", key: "xtra3300h" },
  { input: "xtra 3300 h", key: "xtra3300h" },
  { input: "멀티컷 SG1625", key: "멀티컷sg1625" },
  { input: "대형 롤투롤 UV 프린터", key: "대형롤투롤uv프린터" },
  { input: "ER-642 (에코)", key: "er642에코" },
  { input: "", key: "" },
  { input: "   ", key: "" },
  { input: "!!!@@@###", key: "" },
];

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
