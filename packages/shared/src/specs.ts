// 장비 사양 = 항목+값 행(순서 보존). DB는 jsonb, 도메인은 Spec[].
// /spec D2: 자유 입력. 카테고리 템플릿은 후속(#12).
export interface Spec {
  label: string;
  value: string;
}

// DB jsonb(any) → Spec[]. 레거시 {}·null·비정형 입력을 방어적으로 정규화.
export function parseSpecs(raw: unknown): Spec[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (r): r is Record<string, unknown> =>
        typeof r === "object" && r !== null && "label" in r && "value" in r,
    )
    .map((r) => ({ label: String(r.label), value: String(r.value) }));
}

// Spec[] → DB 저장용. 빈 행 제거 + 트림(AC6: 순서 보존).
export function serializeSpecs(specs: Spec[]): Spec[] {
  return specs
    .map((s) => ({ label: s.label.trim(), value: s.value.trim() }))
    .filter((s) => s.label !== "" || s.value !== "");
}
