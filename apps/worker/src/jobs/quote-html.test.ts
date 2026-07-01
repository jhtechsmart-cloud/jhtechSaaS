import { describe, expect, test } from "vitest";
import { buildItemTable, renderQuoteHtml, type QuoteHtmlData } from "./quote-html";

describe("buildItemTable — 포함옵션 금액을 장비 줄에 흡수", () => {
  test("장비 단가=기본가+포함옵션, 포함옵션 줄은 이름만(금액 없음)", () => {
    const { htmlItems, includedOptions } = buildItemTable(
      [{ name: "UV3300S", unitPrice: 50_000_000, quantity: 1, equipmentId: "uv" }],
      [{ name: "집진 장치", unitPrice: 800_000, quantity: 1, kind: "included", equipmentId: "uv" }],
    );
    expect(htmlItems[0].amount).toBe(50_800_000); // 기본가 + 포함옵션
    expect(htmlItems[0].unitPrice).toBe(50_800_000); // 최종 단가 = 공급가/수량
    expect(includedOptions).toEqual([{ name: "집진 장치", qtyLabel: "1ea" }]); // 이름만
  });
  test("수량 2 — (기본가+포함옵션)×2, 단가는 최종 단가", () => {
    const { htmlItems } = buildItemTable(
      [{ name: "UV", unitPrice: 50_000_000, quantity: 2, equipmentId: "uv" }],
      [{ name: "집진", unitPrice: 800_000, quantity: 2, kind: "included", equipmentId: "uv" }],
    );
    expect(htmlItems[0].amount).toBe(101_600_000); // (50,000,000+800,000)×2
    expect(htmlItems[0].unitPrice).toBe(50_800_000);
  });
  test("여러 장비 — 각 장비에 자기 포함옵션만 흡수", () => {
    const { htmlItems } = buildItemTable(
      [
        { name: "A", unitPrice: 10_000_000, quantity: 1, equipmentId: "a" },
        { name: "B", unitPrice: 20_000_000, quantity: 1, equipmentId: "b" },
      ],
      [
        { name: "옵A", unitPrice: 500_000, quantity: 1, kind: "included", equipmentId: "a" },
        { name: "옵B", unitPrice: 300_000, quantity: 1, kind: "included", equipmentId: "b" },
      ],
    );
    expect(htmlItems[0].amount).toBe(10_500_000);
    expect(htmlItems[1].amount).toBe(20_300_000);
  });
  test("추가옵션(구 견적)은 별도 금액 줄로 유지", () => {
    const { extraOptions } = buildItemTable(
      [{ name: "장비", unitPrice: 1, quantity: 1 }],
      [{ name: "추가 헤드", unitPrice: 1_000_000, quantity: 2, kind: "extra" }],
    );
    expect(extraOptions).toEqual([{ name: "추가 헤드", qtyLabel: "2ea", unitPrice: 1_000_000, amount: 2_000_000, remark: undefined }]);
  });
  test("equipmentId 없는 구 포함옵션(가격 0)은 첫 장비에 흡수(합계 보존)", () => {
    const { htmlItems } = buildItemTable(
      [{ name: "장비", unitPrice: 5_000_000, quantity: 1 }],
      [{ name: "옛 포함옵션", unitPrice: 0, quantity: 1, kind: "included" }],
    );
    expect(htmlItems[0].amount).toBe(5_000_000);
  });
});

const base: QuoteHtmlData = {
  quoteNo: "JHQ-20260607-001-V1",
  issuedDateLabel: "2026년 5월 29일",
  assigneeName: "대표 이무직",
  assigneePhone: "010-5347-8180",
  recipient: "예일아트",
  recipientManager: null,
  recipientTitle: null,
  supplyPrice: 75_000_000,
  koreanAmount: "칠천오백만",
  items: [{ name: "멀티컷 에코 SG1625 Digital Cutter", qtyLabel: "1SET", unitPrice: 75_000_000, amount: 75_000_000 }],
  includedOptions: [{ name: "기본 3헤드(라우터 기본 포함)", qtyLabel: "1ea" }],
  extraOptions: [],
  specGroups: [],
  notes: ["상기금액은 부가세(V.A.T) 별도 금액입니다.", "본 견적서의 유효기간은 발행일로부터 1개월입니다."],
  modelName: "MULTICUT ECO SG1625 Digital Cutter",
  modelFontDataUri: "data:font/ttf;base64,MODELFONT",
  quoteBgDataUri: "data:image/jpeg;base64,BG",
  topBannerDataUri: "data:image/png;base64,TOPBANNER",
  companyLogoDataUri: "data:image/png;base64,LOGO",
  deviceImageDataUri: "data:image/png;base64,DEV",
  deviceNameDataUri: "data:image/png;base64,NAME",
  stampDataUri: "data:image/png;base64,AAAA",
  fontDataUri: "data:font/ttf;base64,AAAA",
};

describe("renderQuoteHtml", () => {
  test("핵심 데이터가 HTML에 포함된다", () => {
    const html = renderQuoteHtml(base);
    expect(html).toContain("JHQ-20260607-001-V1");
    expect(html).toContain("예일아트");
    expect(html).toContain("일금 칠천오백만원정");
    expect(html).toContain("75,000,000");
    expect(html).toContain("멀티컷 에코 SG1625");
    expect(html).toContain("113-81-80804"); // 공급자
    expect(html).toContain("data:image/jpeg;base64,BG");   // 배경
    expect(html).toContain("data:image/png;base64,TOPBANNER"); // 상단 헤더 배경
    expect(html).toContain("data:image/png;base64,LOGO");  // 회사 로고
    expect(html).toContain("data:image/png;base64,DEV");   // 우하단 장비 이미지
    expect(html).toContain("data:image/png;base64,NAME");  // 좌하단 장비 네임
    expect(html).toContain("MULTICUT ECO SG1625 Digital Cutter"); // 상단 모델명
  });
  test("포함/추가 옵션이 그룹 소제목으로 구분되어 렌더", () => {
    const html = renderQuoteHtml({
      ...base,
      includedOptions: [{ name: "자동 급지", qtyLabel: "1ea" }],
      extraOptions: [{ name: "추가 헤드", qtyLabel: "2ea", unitPrice: 1_000_000, amount: 2_000_000 }],
    });
    expect(html).toContain("자동 급지"); // 포함옵션 이름은 표시
    expect(html).toContain("포함 옵션"); // 그룹 소제목
    expect(html).toContain("추가 옵션"); // 그룹 소제목
    expect(html).not.toContain('class="num">포함'); // 단가/공급가 칸엔 '포함' 없음(빈칸)
    expect(html).toContain('class="remark muted">포함'); // '포함'은 비고 칸에 표기
    expect(html).toContain("추가 헤드");
    expect(html).toContain("2,000,000"); // 추가옵션 금액은 표시
  });
  test("포함옵션만 있으면 '추가 옵션' 소제목은 미출력(반대도 동일)", () => {
    const incOnly = renderQuoteHtml({ ...base, includedOptions: [{ name: "자동 급지", qtyLabel: "1ea" }], extraOptions: [] });
    expect(incOnly).toContain("포함 옵션");
    expect(incOnly).not.toContain("추가 옵션");
    const extraOnly = renderQuoteHtml({ ...base, includedOptions: [], extraOptions: [{ name: "추가 헤드", qtyLabel: "1ea", unitPrice: 1, amount: 1 }] });
    expect(extraOnly).toContain("추가 옵션");
    expect(extraOnly).not.toContain("포함 옵션");
  });
  test("항목 비고는 '비 고' 칸에 출력 — 장비·추가옵션 줄 모두", () => {
    const html = renderQuoteHtml({
      ...base,
      items: [{ name: "커팅기", qtyLabel: "1SET", unitPrice: 50_000_000, amount: 50_000_000, remark: "설치 포함" }],
      extraOptions: [{ name: "칼날", qtyLabel: "10ea", unitPrice: 400_000, amount: 4_000_000, remark: "소모품" }],
    });
    expect(html).toContain("설치 포함");
    expect(html).toContain("소모품");
    expect(html).toContain('class="remark"');
  });
  test("편집된 특기사항(notes)이 그대로 번호 매겨 렌더", () => {
    const html = renderQuoteHtml({ ...base, notes: ["부가세 별도", "설치 2주 이내"] });
    expect(html).toContain("1. 부가세 별도");
    expect(html).toContain("2. 설치 2주 이내");
  });
  test("특기사항이 빈 배열이면 특기사항 내용 줄 없음", () => {
    const html = renderQuoteHtml({ ...base, notes: [] });
    expect(html).toContain("특 기 사 항"); // 섹션 띠는 유지
    expect(html).not.toContain('class="note"'); // 내용 줄 없음
  });
  test("수신처에 담당자·직책이 있으면 '회사 담당자 직책님 귀하'로 렌더", () => {
    const html = renderQuoteHtml({ ...base, recipientManager: "홍길동", recipientTitle: "과장" });
    expect(html).toContain("예일아트");
    expect(html).toContain("홍길동 과장님");
    expect(html).toContain('class="rcontact"');
  });
  test("담당자·직책 없으면(공개폼 의뢰) 회사명만 — 담당자 span·'님' 미출력", () => {
    const html = renderQuoteHtml({ ...base, recipientManager: null, recipientTitle: null });
    expect(html).toContain("예일아트");
    expect(html).not.toContain('class="rcontact"');
    expect(html).not.toContain("님</span>"); // 회사명만일 땐 '님' 안 붙임("예일아트 귀하")
  });
  test("담당자만 있고 직책 없으면 '담당자님'으로 표기", () => {
    const html = renderQuoteHtml({ ...base, recipientManager: "홍길동", recipientTitle: null });
    expect(html).toContain('class="rcontact"');
    expect(html).toContain("홍길동님");
  });
  test("specGroups 없으면 장비사양 섹션 미출력", () => {
    expect(renderQuoteHtml(base)).not.toContain("장비사양");
    const withSpecs = renderQuoteHtml({ ...base, specGroups: [{ group: "성능", items: [{ label: "해상도", value: "1200DPI" }] }] });
    expect(withSpecs).toContain("장비사양");
    expect(withSpecs).toContain("1200DPI");
  });
  test("그룹 제목('사양' 등)은 표시 안 함 — 항목/값만", () => {
    const html = renderQuoteHtml({ ...base, specGroups: [{ group: "사양", items: [{ label: "해상도", value: "1200DPI" }] }] });
    expect(html).toContain("1200DPI");
    expect(html).not.toContain('class="spec-title"'); // 그룹 제목 미렌더
  });
  test("항목 이름(라벨) 없거나 값 없는 항목은 PDF 미포함 — 둘 다 있어야 포함", () => {
    const html = renderQuoteHtml({
      ...base,
      specGroups: [{ group: "성능", items: [
        { label: "해상도", value: "1200DPI" }, // 라벨+값 → 포함
        { label: "", value: "1,600mm × 1,200mm" }, // 라벨 없음(크기 목록류) → 제외
        { label: "  ", value: "이더넷" }, // 공백 라벨 → 제외
        { label: "무게", value: "" }, // 값 없음 → 제외
      ] }],
    });
    expect(html).toContain("해상도");
    expect(html).toContain("1200DPI");
    expect(html).not.toContain("1,600mm"); // 라벨 없는 값 제외
    expect(html).not.toContain("이더넷");
    expect(html).not.toContain("무게");
  });
  test("포함 항목(라벨+값) 하나도 없으면 장비사양 섹션 자체 미출력", () => {
    const html = renderQuoteHtml({ ...base, specGroups: [{ group: "성능", items: [
      { label: "해상도", value: "" }, // 값 없음
      { label: "", value: "1,600mm" }, // 라벨 없음
    ] }] });
    expect(html).not.toContain("장비사양");
  });
  test("장비 이미지/네임 없으면 해당 요소 미출력(배경·로고는 항상)", () => {
    const html = renderQuoteHtml({ ...base, deviceImageDataUri: null, deviceNameDataUri: null });
    expect(html).toContain("data:image/jpeg;base64,BG");
    expect(html).not.toContain("data:image/png;base64,DEV");
    expect(html).not.toContain("data:image/png;base64,NAME");
  });
});
