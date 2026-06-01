// 보유장비 diff 순수 로직 — 사이드이펙트 없음(서버 모듈 아님).
// actions.ts("use server")에서 import해 사용. 순수 함수라 단위 테스트 용이.
import type { CompanyEquipmentRow } from "@/lib/customers/schema";

// DB row 변환 — equipment_id·label 중 빈 값은 null로 저장.
export function toDbRow(company_id: string, r: CompanyEquipmentRow) {
  return {
    company_id,
    equipment_id: r.equipment_id || null,
    // label은 카탈로그 장비 없을 때만(XOR 보장): equipment_id 있으면 null 강제.
    label: r.equipment_id ? null : r.label || null,
    serial_no: r.serial_no || null,
    purchased_at: r.purchased_at || null,
    install_address: r.install_address || null,
  };
}

// id 보존 diff — 삭제·업데이트·신규 삽입을 분리. replace(전량 삭제 후 재삽입) 금지.
// 기존 id가 submitted에 없으면 삭제, id 있으면 업데이트, id 없으면 신규 삽입.
export function diffEquipment(
  company_id: string,
  existing: string[],
  submitted: CompanyEquipmentRow[],
) {
  const submittedIds = new Set(submitted.filter((r) => r.id).map((r) => r.id));
  const toDelete = existing.filter((id) => !submittedIds.has(id));
  const toUpdate = submitted
    .filter((r) => r.id)
    .map((r) => ({ id: r.id, ...toDbRow(company_id, r) }));
  const toInsert = submitted.filter((r) => !r.id).map((r) => toDbRow(company_id, r));
  return { toDelete, toUpdate, toInsert };
}
