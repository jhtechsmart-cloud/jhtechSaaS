import { describe, expect, test } from "vitest";
import {
  requestFormSchema,
  buildSubmitPayload,
  seqNoSchema,
  type RequestFormInput,
} from "./schema";

// 체크섬 유효한 사업자등록번호로 교체 (1234567891 = 유효, 1234567890 = 무효).
const valid: RequestFormInput = {
  company: "재현상사",
  ceo: "홍길동",
  biz_no: "1234567891",
  phone: "02-1234-5678",
  email: "a@b.com",
  address: "서울시 강남구",
  requirements: "포장기 견적 부탁드립니다",
  equipment_id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  privacy_consent: true,
  building_type: "factory",
  location: "ground",
  elevator: "none",
  handling: [],
  power: "single_220",
  pneumatic: "none",
  survey_extra: "",
};

describe("requestFormSchema", () => {
  test("유효 입력 통과", () => {
    expect(requestFormSchema.safeParse(valid).success).toBe(true);
  });
  test("company 누락 시 실패", () => {
    expect(requestFormSchema.safeParse({ ...valid, company: "" }).success).toBe(false);
  });
  test("biz_no 형식 오류 시 실패", () => {
    expect(requestFormSchema.safeParse({ ...valid, biz_no: "12" }).success).toBe(false);
  });
  test("email 형식 오류 시 실패", () => {
    expect(requestFormSchema.safeParse({ ...valid, email: "notanemail" }).success).toBe(false);
  });
  test("phone 형식 오류 시 실패", () => {
    expect(requestFormSchema.safeParse({ ...valid, phone: "abc" }).success).toBe(false);
  });
  test("phone 숫자가 너무 적으면(--------1) 실패", () => {
    expect(requestFormSchema.safeParse({ ...valid, phone: "--------1" }).success).toBe(false);
  });
  test("requirements·equipment_id는 선택", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { requirements, equipment_id, ...core } = valid;
    expect(requestFormSchema.safeParse(core).success).toBe(true);
  });
  test("equipment_id 빈 문자열(hidden input 미선택)은 통과", () => {
    expect(requestFormSchema.safeParse({ ...valid, equipment_id: "" }).success).toBe(true);
  });
});

describe("buildSubmitPayload", () => {
  test("biz_no 하이픈 제거 + fields 구성 + equipment_name 병합", () => {
    const p = buildSubmitPayload(requestFormSchema.parse(valid), "포장기A", {});
    expect(p.biz_no).toBe("1234567891");
    expect(p.company).toBe("재현상사");
    expect(p.fields.requirements).toBe("포장기 견적 부탁드립니다");
    expect(p.fields.equipment_id).toBe("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11");
    expect(p.fields.equipment_name).toBe("포장기A");
  });
  test("빈 requirements·미선택 장비는 fields에서 생략", () => {
    const input = requestFormSchema.parse({
      company: "A", ceo: "B", biz_no: "1234567891", phone: "01012345678",
      email: "a@b.com", address: "주소",
      privacy_consent: true,
      building_type: "factory", location: "ground", elevator: "none",
      handling: [], power: "single_220", pneumatic: "none",
    });
    const p = buildSubmitPayload(input, undefined, {});
    expect(p.fields.requirements).toBeUndefined();
    expect(p.fields.equipment_id).toBeUndefined();
    expect(p.fields.equipment_name).toBeUndefined();
  });
  test("phone은 정규화 없이 그대로 전달된다", () => {
    const p = buildSubmitPayload(requestFormSchema.parse(valid), undefined, {});
    expect(p.phone).toBe("02-1234-5678");
  });
});

describe("seqNoSchema", () => {
  test("REQ-YYYYMMDD-NNNNN 통과", () => {
    expect(seqNoSchema.safeParse("REQ-20260531-00001").success).toBe(true);
    expect(seqNoSchema.safeParse("REQ-20260531-100000").success).toBe(true);
  });
  test("형식 외 거부", () => {
    expect(seqNoSchema.safeParse("nope").success).toBe(false);
    expect(seqNoSchema.safeParse("").success).toBe(false);
  });
});

// ────────────────────────────────────────────────────
// P-A2 신규 테스트: 동의·체크섬·설문·사진슬롯
// ────────────────────────────────────────────────────

const base = {
  company: "재현", ceo: "홍길동", biz_no: "1234567891",
  phone: "02-1234-5678", email: "a@b.com", address: "서울",
  privacy_consent: true, requirements: "",
  building_type: "factory", location: "ground", elevator: "none",
  handling: [], power: "single_220", pneumatic: "none", survey_extra: "",
  equipment_id: "",
};

describe("requestFormSchema (P-A2)", () => {
  test("동의·체크섬·설문 충족 시 통과", () => {
    expect(requestFormSchema.safeParse(base).success).toBe(true);
  });
  test("동의 미체크는 실패", () => {
    expect(requestFormSchema.safeParse({ ...base, privacy_consent: false }).success).toBe(false);
  });
  test("biz_no 체크섬 불일치는 실패", () => {
    expect(requestFormSchema.safeParse({ ...base, biz_no: "1234567890" }).success).toBe(false);
  });
  test("기타사항 다중 체크(handling 배열) 허용", () => {
    expect(requestFormSchema.safeParse({ ...base, handling: ["no_vehicle", "manual"] }).success).toBe(true);
  });
});

describe("buildSubmitPayload (P-A2)", () => {
  test("fields.install_survey·photos·동의를 payload에 구성", () => {
    const input = requestFormSchema.parse({ ...base, handling: ["ladder"] });
    const payload = buildSubmitPayload(input, "XTRA 5000", { ext_entrance: "uuid1/ext_entrance.jpg" });
    expect(payload.privacy_consent).toBe(true);
    expect(payload.privacy_consent_version).toBe("v1.1");
    expect(payload.fields.install_survey.handling).toEqual(["ladder"]);
    expect(payload.fields.photos.ext_entrance).toBe("uuid1/ext_entrance.jpg");
    expect(payload.fields.equipment_name).toBe("XTRA 5000");
    expect(payload.biz_no).toBe("1234567891");
  });
});
