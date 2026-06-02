import { describe, expect, test } from "vitest";
import { buildSections } from "./grouping";
import type { ListConsumablesResult } from "./schema";

const item = (id: string, name: string, unit: string | null = null) => ({ id, name, unit });

describe("buildSections — 장비별 그룹 + 공용 분류", () => {
  test("장비 1대만 매칭된 소모품은 그 장비 섹션에", () => {
    const data: ListConsumablesResult = {
      groups: [{ equipment_id: "e1", equipment_name: "UV프린터", consumables: [item("c1", "UV잉크")] }],
      consumables: [item("c1", "UV잉크")],
    };
    const sections = buildSections(data);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("UV프린터");
    expect(sections[0].items.map((i) => i.id)).toEqual(["c1"]);
  });

  test("여러 장비에 매칭된 소모품은 '공용 소모품' 섹션으로 한 번만(중복제거)", () => {
    const shared = item("c0", "세정액");
    const data: ListConsumablesResult = {
      groups: [
        { equipment_id: "e1", equipment_name: "UV프린터", consumables: [shared, item("c1", "UV잉크")] },
        { equipment_id: "e2", equipment_name: "솔벤트", consumables: [shared, item("c2", "솔벤트잉크")] },
      ],
      consumables: [shared, item("c1", "UV잉크"), item("c2", "솔벤트잉크")],
    };
    const sections = buildSections(data);
    // 공용이 맨 위
    expect(sections[0].title).toBe("공용 소모품");
    expect(sections[0].items.map((i) => i.id)).toEqual(["c0"]);
    // 각 장비 섹션엔 고유 소모품만
    const uv = sections.find((s) => s.title === "UV프린터")!;
    const sol = sections.find((s) => s.title === "솔벤트")!;
    expect(uv.items.map((i) => i.id)).toEqual(["c1"]);
    expect(sol.items.map((i) => i.id)).toEqual(["c2"]);
    // 공용은 어느 장비 섹션에도 중복 등장하지 않음
    expect(uv.items.map((i) => i.id)).not.toContain("c0");
  });

  test("매칭 0건이면 빈 섹션", () => {
    expect(buildSections({ groups: [], consumables: [] })).toEqual([]);
  });

  test("equipment_name이 null이면 '기타 장비'로 표기", () => {
    const data: ListConsumablesResult = {
      groups: [{ equipment_id: "e1", equipment_name: null, consumables: [item("c1", "부품")] }],
      consumables: [item("c1", "부품")],
    };
    expect(buildSections(data)[0].title).toBe("기타 장비");
  });
});
