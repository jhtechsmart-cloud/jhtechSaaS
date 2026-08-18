import { describe, expect, it } from "vitest";
import {
  DEPARTMENTS,
  DEPARTMENT_KEYS,
  departmentLabel,
  parseDepartment,
} from "./department";

describe("department 상수·순수함수", () => {
  it("부서 3종 = 영업부/기술부/관리부 순서", () => {
    expect(DEPARTMENTS.map((d) => d.label)).toEqual(["영업부", "기술부", "관리부"]);
    expect(DEPARTMENT_KEYS).toEqual(["sales", "tech", "management"]);
  });

  it("departmentLabel — 키→라벨, null/미지정은 빈 문자열", () => {
    expect(departmentLabel("sales")).toBe("영업부");
    expect(departmentLabel("tech")).toBe("기술부");
    expect(departmentLabel("management")).toBe("관리부");
    expect(departmentLabel(null)).toBe("");
    expect(departmentLabel(undefined)).toBe("");
  });

  it("parseDepartment — 폼 값(빈 문자열=공란)을 DB 값(null)로, 모르는 값은 null", () => {
    expect(parseDepartment("sales")).toBe("sales");
    expect(parseDepartment("")).toBeNull();
    expect(parseDepartment(null)).toBeNull();
    expect(parseDepartment(undefined)).toBeNull();
    expect(parseDepartment("영업부")).toBeNull();
    expect(parseDepartment("hr")).toBeNull();
  });
});
