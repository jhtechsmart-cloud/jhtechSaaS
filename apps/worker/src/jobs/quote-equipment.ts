// 견적의 주 장비 id 해석 — 견적 items[0].equipmentId 우선, 없으면 의뢰 신청장비.
// (quote-pdf.ts의 사양·로고 해석 우선순위와 동일. 카탈로그 조회에 공용.)
export function pickQuoteEquipmentId(
  items: unknown,
  applicationEquipmentId: string | null,
): string | null {
  const first = Array.isArray(items)
    ? (items[0] as { equipmentId?: unknown } | undefined)
    : undefined;
  const fromItem =
    typeof first?.equipmentId === "string" && first.equipmentId ? first.equipmentId : null;
  return fromItem ?? applicationEquipmentId ?? null;
}
