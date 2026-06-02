import { describe, expect, test } from "vitest";
import { diffScopes, toScopeDbRow } from "./scope-diff";
import type { ConsumableScopeRow } from "./schema";

// 테스트용 v4 UUID (버전 비트 4, variant 비트 a)
const CID = "11111111-1111-4111-a111-111111111111";
const EQ = "22222222-2222-4222-a222-222222222222";
const ID1 = "33333333-3333-4333-a333-333333333333";

function row(p: Partial<ConsumableScopeRow>): ConsumableScopeRow {
  return { id: "", category: "", equipment_id: "", ...p };
}

describe("toScopeDbRow — category XOR equipment_id", () => {
  test("equipment_id 있으면 category는 null 강제", () => {
    expect(toScopeDbRow(CID, row({ equipment_id: EQ, category: "무시됨" }))).toEqual({
      consumable_id: CID, category: null, equipment_id: EQ,
    });
  });
  test("category만 있으면 equipment_id는 null", () => {
    expect(toScopeDbRow(CID, row({ category: "UV프린터" }))).toEqual({
      consumable_id: CID, category: "UV프린터", equipment_id: null,
    });
  });
});

describe("diffScopes — id 보존 분리", () => {
  test("기존에 없는 id는 삭제, id 있으면 업데이트, id 없으면 신규", () => {
    const existing = [ID1, "44444444-4444-4444-4444-444444444444"];
    const submitted: ConsumableScopeRow[] = [
      row({ id: ID1, category: "UV프린터" }), // 업데이트
      row({ equipment_id: EQ }), // 신규
    ];
    const { toDelete, toUpdate, toInsert } = diffScopes(CID, existing, submitted);
    expect(toDelete).toEqual(["44444444-4444-4444-4444-444444444444"]);
    expect(toUpdate).toEqual([{ id: ID1, consumable_id: CID, category: "UV프린터", equipment_id: null }]);
    expect(toInsert).toEqual([{ consumable_id: CID, category: null, equipment_id: EQ }]);
  });
});
