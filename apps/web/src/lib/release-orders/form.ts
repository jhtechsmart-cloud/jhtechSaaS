// 출고의뢰서 작성 폼 순수 로직. 화면 상태는 details 구조와 거의 1:1.
// 저장 권위는 서버 RPC(upsert_release_order) — 여기선 표시·페이로드 정규화만 담당.
import { ReleaseOrderDetailsSchema, type ReleaseOrderDetails } from "@jhtechsaas/shared";

// 체크박스 배열 토글 — 없으면 추가(순서 보존), 있으면 제거.
export function toggleArrayValue(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

// 선택된 장비(device_kind)만 객체로 두고 반대쪽은 null로 정규화.
// 종이 양식이 프린터/커팅기 택1이므로 미선택 패널의 입력은 저장하지 않는다.
// 이미 채워진 선택쪽 입력값은 보존(빈 기본값으로 덮지 않음).
export function normalizeDetailsForKind(
  details: ReleaseOrderDetails,
  kind: "printer" | "cutter",
): ReleaseOrderDetails {
  const emptyPrinter = ReleaseOrderDetailsSchema.parse({ printer: {} }).printer;
  const emptyCutter = ReleaseOrderDetailsSchema.parse({ cutter: {} }).cutter;
  return {
    ...details,
    printer: kind === "printer" ? (details.printer ?? emptyPrinter) : null,
    cutter: kind === "cutter" ? (details.cutter ?? emptyCutter) : null,
  };
}
