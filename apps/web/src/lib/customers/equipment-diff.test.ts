// diffEquipment는 actions.ts에서 export된 순수 함수. 서버 의존성(server-only, supabase, next)은 모킹.
import { describe, expect, test, vi } from "vitest";

// "use server" 파일의 서버 전용 모듈 격리 — 순수 로직만 테스트.
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/auth/guard", () => ({ requireCustomersManage: vi.fn() }));

import { diffEquipment } from "./actions";
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
