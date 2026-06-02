import { describe, expect, test } from "vitest";
import { diffScopes, toScopeDbRow } from "./scope-diff";
import type { ConsumableScopeRow } from "./schema";

// 테스트용 v4 UUID (버전 비트 4, variant 비트 a)
const CID = "11111111-1111-4111-a111-111111111111";
const EQ = "22222222-2222-4222-a222-222222222222";
const ID1 = "33333333-3333-4333-a333-333333333333";
const CAT = "55555555-5555-4555-a555-555555555555";

function row(p: Partial<ConsumableScopeRow>): ConsumableScopeRow {
  return { id: "", category_id: "", equipment_id: "", ...p };
}

describe("toScopeDbRow — category_id XOR equipment_id", () => {
  test("equipment_id 있으면 category_id는 null 강제", () => {
    expect(toScopeDbRow(CID, row({ equipment_id: EQ, category_id: CAT }))).toEqual({
      consumable_id: CID, category_id: null, equipment_id: EQ,
    });
  });
  test("category_id만 있으면 equipment_id는 null", () => {
    expect(toScopeDbRow(CID, row({ category_id: CAT }))).toEqual({
      consumable_id: CID, category_id: CAT, equipment_id: null,
    });
  });
});

// 테스트용 v4 UUID (버전 비트 4, variant 비트 a)
const ID2 = "44444444-4444-4444-a444-444444444444";

describe("diffScopes — id 보존 분리", () => {
  test("기존에 없는 id는 삭제, id 있으면 업데이트, id 없으면 신규", () => {
    const existing = [ID1, ID2];
    const submitted: ConsumableScopeRow[] = [
      row({ id: ID1, category_id: CAT }), // 업데이트
      row({ equipment_id: EQ }), // 신규
    ];
    const { toDelete, toUpdate, toInsert } = diffScopes(CID, existing, submitted);
    expect(toDelete).toEqual([ID2]);
    expect(toUpdate).toEqual([{ id: ID1, consumable_id: CID, category_id: CAT, equipment_id: null }]);
    expect(toInsert).toEqual([{ consumable_id: CID, category_id: null, equipment_id: EQ }]);
  });

  test("submitted 비어있으면 기존 전량 삭제", () => {
    // 제출된 항목이 없으면 기존 행 전부 삭제 대상
    const existing = [ID1, ID2];
    const { toDelete, toUpdate, toInsert } = diffScopes(CID, existing, []);
    expect(toDelete).toEqual(existing);
    expect(toUpdate).toEqual([]);
    expect(toInsert).toEqual([]);
  });

  test("existing 비어있으면 전량 신규", () => {
    // 기존 행이 없으면 제출된 항목 모두 INSERT 대상
    const submitted: ConsumableScopeRow[] = [
      row({ category_id: CAT }),
      row({ equipment_id: EQ }),
    ];
    const { toDelete, toUpdate, toInsert } = diffScopes(CID, [], submitted);
    expect(toDelete).toEqual([]);
    expect(toUpdate).toEqual([]);
    expect(toInsert).toEqual([
      { consumable_id: CID, category_id: CAT, equipment_id: null },
      { consumable_id: CID, category_id: null, equipment_id: EQ },
    ]);
  });
});
