import { describe, expect, test } from "vitest";
import {
  supplyRequestFormSchema,
  buildSupplyRequestPayload,
  supSeqNoSchema,
  type SupplyRequestFormInput,
} from "./schema";

describe("supplyRequestFormSchema — 신청자·동의·biz_no", () => {
  const base = { biz_no: "1234567891", requester_name: "구매담당", requester_phone: "02-123-4567", note: "", privacy_consent: true as const };

  test("정상 입력 통과", () => {
    expect(supplyRequestFormSchema.safeParse(base).success).toBe(true);
  });
  test("동의 false 거부", () => {
    expect(supplyRequestFormSchema.safeParse({ ...base, privacy_consent: false }).success).toBe(false);
  });
  test("신청자명 빈값 거부", () => {
    expect(supplyRequestFormSchema.safeParse({ ...base, requester_name: "" }).success).toBe(false);
  });
  test("체크섬 틀린 biz_no 거부", () => {
    expect(supplyRequestFormSchema.safeParse({ ...base, biz_no: "1234567890" }).success).toBe(false);
  });
  test("note 2000자 초과 거부", () => {
    expect(supplyRequestFormSchema.safeParse({ ...base, note: "가".repeat(2001) }).success).toBe(false);
  });
});

describe("buildSupplyRequestPayload — biz 정규화·items·메모 선택", () => {
  const input: SupplyRequestFormInput = {
    biz_no: "123-45-67891", requester_name: "홍길동", requester_phone: "010-1111-2222", note: "", privacy_consent: true,
  };

  test("biz_no 하이픈 제거 + items 전달 + 빈 메모는 제외", () => {
    const p = buildSupplyRequestPayload(input, [{ consumable_id: "c1", qty: 3 }]);
    expect(p.biz_no).toBe("1234567891");
    expect(p.items).toEqual([{ consumable_id: "c1", qty: 3 }]);
    expect(p.privacy_consent).toBe(true);
    expect(p.privacy_consent_version).toBe("v1.0");
    expect("note" in p).toBe(false); // 빈 메모는 payload에서 제외
  });

  test("메모 있으면 포함", () => {
    const p = buildSupplyRequestPayload({ ...input, note: "급해요" }, [{ consumable_id: "c1", qty: 1 }]);
    expect(p.note).toBe("급해요");
  });
});

describe("supSeqNoSchema — SUP- 형식", () => {
  test("유효/무효 형식", () => {
    expect(supSeqNoSchema.safeParse("SUP-20260603-00001").success).toBe(true);
    expect(supSeqNoSchema.safeParse("AS-20260603-00001").success).toBe(false);
  });
});
