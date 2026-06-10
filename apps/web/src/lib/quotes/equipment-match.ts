// 매칭 순수 로직은 @jhtechsaas/shared로 이동(웹·워커 공유). 호출부 보존 위해 re-export.
export { matchEquipmentName, normalizeEquipmentKey } from "@jhtechsaas/shared";

// 견적 프레임에서 쓰는 web 측 장비 타입(카탈로그 표시·예상가). shared 매칭과 호환.
export type MatchableEquipment = {
  id: string;
  name: string;
  model: string | null;
  category: string | null;
  photos: string[];
  basePrice: number; // 기본 공급가 — 견적 미발행 시 '예상' 표시에 사용
};
