import { describe, expect, it } from "vitest";
import { buildStaffServiceRequestPayload, staffServiceRequestFormSchema } from "./staff-schema";
import { PRIVACY_VERSION } from "./schema";
import { channelLabel, isStaffChannel } from "./channel";

const CO = "3f0f7f0e-2c7c-4b3a-9c1a-1e2d3c4b5a69";
const SUB = "8d3d3b1a-4a2b-4c9d-8e7f-0a1b2c3d4e5f";

const base = {
  company_id: CO,
  company_equipment_id: "",
  contact_name: "김담당",
  callback_phone: "010-1234-5678",
  symptom: "전원이 안 켜짐",
  preferred_date: "",
  channel: "phone",
  privacy_consent: true,
};

describe("staffServiceRequestFormSchema", () => {
  it("정상 입력 통과 — 장비 미선택은 undefined, 빈 희망일은 ''", () => {
    const r = staffServiceRequestFormSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.company_equipment_id).toBeUndefined();
      expect(r.data.preferred_date).toBe("");
    }
  });

  it("고객 미선택·증상 없음·동의 미체크·웹 채널은 거부", () => {
    expect(staffServiceRequestFormSchema.safeParse({ ...base, company_id: "" }).success).toBe(false);
    expect(staffServiceRequestFormSchema.safeParse({ ...base, symptom: "   " }).success).toBe(false);
    expect(staffServiceRequestFormSchema.safeParse({ ...base, privacy_consent: false }).success).toBe(false);
    expect(staffServiceRequestFormSchema.safeParse({ ...base, channel: "web" }).success).toBe(false);
  });

  it("희망일은 YYYY-MM-DD만, 회신번호는 숫자 8자리 이상 또는 빈 값", () => {
    expect(staffServiceRequestFormSchema.safeParse({ ...base, preferred_date: "2026-09-01" }).success).toBe(true);
    expect(staffServiceRequestFormSchema.safeParse({ ...base, preferred_date: "9/1" }).success).toBe(false);
    expect(staffServiceRequestFormSchema.safeParse({ ...base, callback_phone: "" }).success).toBe(true);
    expect(staffServiceRequestFormSchema.safeParse({ ...base, callback_phone: "12" }).success).toBe(false);
  });
});

describe("buildStaffServiceRequestPayload", () => {
  it("RPC payload — 동의 버전 상수·submission_id·fields 화이트리스트, 빈 값은 키 제외", () => {
    const parsed = staffServiceRequestFormSchema.parse({ ...base, preferred_date: "2026-09-01" });
    const p = buildStaffServiceRequestPayload(parsed, SUB, { as_photo_1: `${SUB}/as_photo_1.jpg` });
    expect(p).toEqual({
      company_id: CO,
      company_equipment_id: undefined,
      channel: "phone",
      privacy_consent: true,
      privacy_consent_version: PRIVACY_VERSION,
      submission_id: SUB,
      fields: {
        symptom: "전원이 안 켜짐",
        contact_name: "김담당",
        callback_phone: "010-1234-5678",
        preferred_date: "2026-09-01",
        photos: { as_photo_1: `${SUB}/as_photo_1.jpg` },
      },
    });
    const p2 = buildStaffServiceRequestPayload(
      staffServiceRequestFormSchema.parse({ ...base, contact_name: "", callback_phone: "" }),
      SUB,
      {},
    );
    expect(p2.fields).toEqual({ symptom: "전원이 안 켜짐", photos: {} });
  });
});

describe("channel", () => {
  it("라벨·직원 채널 판정", () => {
    expect(channelLabel("web")).toBe("웹");
    expect(channelLabel("phone")).toBe("전화");
    expect(channelLabel(null)).toBe("웹");
    expect(isStaffChannel("visit")).toBe(true);
    expect(isStaffChannel("web")).toBe(false);
  });
});
