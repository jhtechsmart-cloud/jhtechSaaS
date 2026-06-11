import { describe, expect, test } from "vitest";
import { buildCompanySearchOr, regionOf } from "./list-search";

describe("buildCompanySearchOr — 고객 목록 서버검색 OR 절", () => {
  test("업체명·장부명은 입력 그대로, 사업자번호는 숫자만으로 매칭", () => {
    const or = buildCompanySearchOr("211-86-66585");
    expect(or).toContain("name.ilike.%211-86-66585%");
    expect(or).toContain("ledger_name.ilike.%211-86-66585%");
    expect(or).toContain("biz_no.ilike.%2118666585%"); // DB는 숫자 정규화 저장
  });

  test("전화번호 검색 — phone1·mobile 포함(저장 형식=하이픈)", () => {
    const or = buildCompanySearchOr("02-500-3700");
    expect(or).toContain("phone1.ilike.%02-500-3700%");
    expect(or).toContain("mobile.ilike.%02-500-3700%");
  });

  test("숫자 없는 검색어는 전화·사업자번호 절 생략", () => {
    const or = buildCompanySearchOr("수아트");
    expect(or).toContain("name.ilike.%수아트%");
    expect(or).not.toContain("biz_no");
    expect(or).not.toContain("phone1");
  });

  test("PostgREST 메타문자 제거 + 빈 검색어는 null", () => {
    expect(buildCompanySearchOr("a,b(c)%d_e*f\\g")).not.toMatch(/[,()%_*\\]%[^,]*ilike/); // 정제됨
    expect(buildCompanySearchOr("   ")).toBeNull();
    expect(buildCompanySearchOr(",()%_")).toBeNull();
  });
});

describe("regionOf — 주소 앞부분에서 시·도 추출", () => {
  test.each([
    ["경기도 군포시 금정동 694-6", "경기"],
    ["서울특별시 서초구 양재동", "서울"],
    ["서울 강남구", "서울"],
    ["부산광역시 연제구 거제동", "부산"],
    ["대전광역시 중구 유천동", "대전"],
    ["전라북도 전주시", "전북"],
    ["전북 전주시 완산구", "전북"],
    ["충청남도 천안시", "충남"],
    ["경상북도 포항시 남구", "경북"],
    ["경남 김해시", "경남"],
    ["제주특별자치도 제주시", "제주"],
    ["강원특별자치도 원주시", "강원"],
    ["세종특별자치시", "세종"],
  ])("%s → %s", (addr, want) => {
    expect(regionOf(addr)).toBe(want);
  });

  test("인식 불가·빈 주소는 null", () => {
    expect(regionOf("미상")).toBeNull();
    expect(regionOf("")).toBeNull();
    expect(regionOf(null)).toBeNull();
  });
});
