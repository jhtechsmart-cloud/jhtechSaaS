import { describe, expect, test } from "vitest";
import { cleanRow, transformRows, type RawRow } from "./customers-transform";

// 거래처 엑셀(회계 프로그램 내보내기) → companies 행 변환의 순수 로직.
// 실데이터 양상: 고정폭 공백 패딩, 이메일 "-", 13자리 불량 사업번호 1건,
// 같은 사업번호의 분리 장부((장비)/(NEW)) 30쌍 → 병합.

function raw(over: Partial<RawRow> = {}): RawRow {
  return {
    장부번호: "102.0",
    장부명: "(주)RGB COLOR",
    거래처명: "(주)RGB COLOR",
    사업번호: "211-86-66585",
    대표자: "최용규",
    사업주소: "경기도 군포시 금정동 694-6 ",
    업태: "제조 도매             ",
    종목: "광고물 인쇄 제작외        ",
    우편번호: "",
    실제주소1: "",
    실제주소2: "",
    전화1: "02-500-3700",
    전화2: "",
    팩스: "02-500-3777",
    담당자: "박정호이사",
    휴대폰: "010-4219-0634  ",
    이메일: "rgb@rgbcolor.co.kr",
    ...over,
  };
}

describe("cleanRow — 행 정제", () => {
  test("공백 패딩 trim + 장부번호 정수화 + 사업번호 숫자 정규화", () => {
    const c = cleanRow(raw());
    expect(c.ledgerNo).toBe(102);
    expect(c.bizType).toBe("제조 도매");
    expect(c.bizNo).toBe("2118666585");
    expect(c.mobile).toBe("010-4219-0634");
    expect(c.address).toBe("경기도 군포시 금정동 694-6");
  });

  test("빈 값은 null", () => {
    const c = cleanRow(raw({ 전화2: "", 실제주소1: "   " }));
    expect(c.phone2).toBeNull();
    expect(c.addressActual1).toBeNull();
  });

  test("이메일 '-'는 null", () => {
    expect(cleanRow(raw({ 이메일: "-" })).email).toBeNull();
  });

  test("10자리 아닌 사업번호 → bizNo null + 원본 보존", () => {
    const c = cleanRow(raw({ 사업번호: "6903281464820" }));
    expect(c.bizNo).toBeNull();
    expect(c.bizNoRaw).toBe("6903281464820");
  });

  test("길이 초과는 DB CHECK에 맞게 잘라낸다(name 200자)", () => {
    const c = cleanRow(raw({ 거래처명: "가".repeat(250) }));
    expect(c.name.length).toBe(200);
  });
});

describe("transformRows — 병합·스킵", () => {
  test("같은 사업번호 2행은 정보 많은 행 기준으로 병합, 빈 칸은 상대 행으로 보충", () => {
    const a = raw({ 장부번호: "170.0", 장부명: "기획원이", 사업주소: "경기도 안산시", 팩스: "" });
    const b = raw({ 장부번호: "666.0", 장부명: "기획원이(장비)", 사업주소: "", 전화1: "", 담당자: "", 휴대폰: "", 이메일: "", 팩스: "031-111-2222" });
    const { companies, skipped } = transformRows([a, b]);
    expect(skipped).toHaveLength(0);
    expect(companies).toHaveLength(1);
    const m = companies[0];
    expect(m.ledgerNo).toBe(170); // 정보 많은 행이 대표
    expect(m.ledgerName).toBe("기획원이");
    expect(m.fax).toBe("031-111-2222"); // 빈 칸은 상대 행으로 보충
    expect(m.note).toContain("장부 170");
    expect(m.note).toContain("병합");
    expect(m.note).toContain("666");
  });

  test("정보량 같으면 장부번호 큰 쪽(최신)이 대표", () => {
    const a = raw({ 장부번호: "111.0", 장부명: "(주)수아트" });
    const b = raw({ 장부번호: "1243.0", 장부명: "(주)수아트(NEW)" });
    const { companies } = transformRows([a, b]);
    expect(companies[0].ledgerNo).toBe(1243);
    expect(companies[0].ledgerName).toBe("(주)수아트(NEW)");
  });

  test("'일반고객' 자리표시 행은 스킵", () => {
    const { companies, skipped } = transformRows([raw({ 거래처명: "일반고객", 장부명: "일반고객", 사업번호: "" })]);
    expect(companies).toHaveLength(0);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toContain("자리표시");
  });

  test("사업번호 없는 행은 병합 없이 개별 등록", () => {
    const a = raw({ 장부번호: "298.0", 거래처명: "예일아트", 사업번호: "" });
    const b = raw({ 장부번호: "427.0", 거래처명: "상록", 사업번호: "" });
    const { companies } = transformRows([a, b]);
    expect(companies).toHaveLength(2);
  });

  test("불량 사업번호는 노트에 원본 기록", () => {
    const { companies } = transformRows([raw({ 사업번호: "6903281464820" })]);
    expect(companies[0].bizNo).toBeNull();
    expect(companies[0].note).toContain("6903281464820");
  });
});
