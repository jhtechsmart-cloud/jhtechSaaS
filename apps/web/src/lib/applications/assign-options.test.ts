import { describe, expect, it } from "vitest";
import { buildAssignOptions } from "./assign-options";

const sales = [
  { id: "a", name: "박진석" },
  { id: "b", name: "최영열" },
];

describe("buildAssignOptions — 배정 select 옵션(영업부 + 현재 담당자 보존)", () => {
  it("현재 담당자가 없으면 영업부 목록 그대로", () => {
    expect(buildAssignOptions(sales, null, null)).toEqual(sales);
  });

  it("현재 담당자가 영업부 목록에 있으면 중복 추가하지 않는다", () => {
    expect(buildAssignOptions(sales, "b", "최영열")).toEqual(sales);
  });

  it("현재 담당자가 영업부가 아니면(과거 배정·타부서) 목록 맨 앞에 보존 — 값이 사라져 '미배정'으로 보이는 오해 방지", () => {
    expect(buildAssignOptions(sales, "z", "황현철")).toEqual([
      { id: "z", name: "황현철" },
      ...sales,
    ]);
  });

  it("현재 담당자 이름이 없으면(프로필 조회 실패) 자리표시 이름으로 보존", () => {
    expect(buildAssignOptions(sales, "z", null)[0]).toEqual({ id: "z", name: "(현재 담당자)" });
  });
});
