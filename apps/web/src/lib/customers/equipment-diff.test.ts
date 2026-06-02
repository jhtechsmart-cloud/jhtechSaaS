// diffEquipment — non-server 순수 함수. 서버 모킹 불필요.
import { describe, expect, test } from "vitest";
import { diffEquipment } from "./equipment-diff";
import type { CompanyEquipmentRow } from "./schema";

const row = (o: Partial<CompanyEquipmentRow>): CompanyEquipmentRow => ({
  id: "", equipment_id: "", label: "", serial_no: "", purchased_at: "", install_address: "", ...o,
});

describe("diffEquipment — id 보존 diff(replace 금지)", () => {
  test("신규(id 없음)=insert, 사라진 기존 id=delete, 남은 id=update", () => {
    const existing = ["A", "B", "C"];
    const submitted = [row({ id: "A", label: "a2" }), row({ id: "C", label: "c" }), row({ label: "신규" })];
    const d = diffEquipment("CID", existing, submitted);
    expect(d.toDelete.sort()).toEqual(["B"]);
    expect(d.toUpdate.map((u) => u.id)).toEqual(["A", "C"]);
    expect(d.toInsert).toHaveLength(1);
    expect(d.toInsert[0].company_id).toBe("CID");
  });
});
