// 소모품 scope diff 순수 로직 — 사이드이펙트 없음(서버 모듈 아님).
// actions.ts("use server")에서 import. P-B equipment-diff.ts 미러.
import type { ConsumableScopeRow } from "@/lib/consumables/schema";

// DB row 변환 — equipment_id 있으면 category는 null 강제(XOR 보장).
export function toScopeDbRow(consumable_id: string, r: ConsumableScopeRow) {
  return {
    consumable_id,
    category: r.equipment_id ? null : r.category || null,
    equipment_id: r.equipment_id || null,
  };
}

// id 보존 diff — 삭제·업데이트·신규를 분리. replace(전량 삭제 후 재삽입) 금지.
export function diffScopes(
  consumable_id: string,
  existing: string[],
  submitted: ConsumableScopeRow[],
) {
  const submittedIds = new Set(submitted.filter((r) => r.id).map((r) => r.id));
  const toDelete = existing.filter((id) => !submittedIds.has(id));
  const toUpdate = submitted
    .filter((r) => r.id)
    .map((r) => ({ id: r.id, ...toScopeDbRow(consumable_id, r) }));
  const toInsert = submitted.filter((r) => !r.id).map((r) => toScopeDbRow(consumable_id, r));
  return { toDelete, toUpdate, toInsert };
}
