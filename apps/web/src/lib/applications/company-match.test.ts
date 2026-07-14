import { describe, expect, it } from "vitest";
import { matchCompany, type CompanyLite } from "./company-match";

const companies: CompanyLite[] = [
  { id: "co-1", name: "재현테크", biz_no: "2208162517" },
  { id: "co-2", name: "　대한 기공　", biz_no: null }, // 전각공백·일반공백 혼재
];

describe("matchCompany — 견적요청 ↔ 고객 마스터 대조", () => {
  it("company_id가 이미 연결돼 있으면 linked(최우선)", () => {
    const r = matchCompany({ company: "다른이름", biz_no: null, company_id: "co-9" }, companies);
    expect(r).toEqual({ kind: "linked", companyId: "co-9" });
  });

  it("사업자번호 일치(하이픈 입력) → biz_no", () => {
    const r = matchCompany({ company: "오타난이름", biz_no: "220-81-62517", company_id: null }, companies);
    expect(r).toEqual({ kind: "biz_no", companyId: "co-1" });
  });

  it("사업자번호 불일치·회사명(정규화) 일치 → name_only", () => {
    const r = matchCompany({ company: "대한기공", biz_no: "999-99-99999", company_id: null }, companies);
    expect(r).toEqual({ kind: "name_only", companyId: "co-2" });
  });

  it("회사명 정규화 — 입력 쪽 공백·대소문자 무시", () => {
    const r = matchCompany({ company: "재현 테크", biz_no: null, company_id: null }, companies);
    expect(r).toEqual({ kind: "name_only", companyId: "co-1" });
  });

  it("아무것도 일치하지 않으면 null", () => {
    const r = matchCompany({ company: "무관업체", biz_no: null, company_id: null }, companies);
    expect(r).toEqual({ kind: null, companyId: null });
  });

  it("빈 입력(회사명 null·biz_no null)은 null", () => {
    const r = matchCompany({ company: null, biz_no: null, company_id: null }, companies);
    expect(r).toEqual({ kind: null, companyId: null });
  });
});
