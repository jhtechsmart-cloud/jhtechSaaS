import { describe, expect, it } from "vitest";
import { ReleaseOrderDetailsSchema, buildReleaseOrderPrefill } from "./release-order";

describe("ReleaseOrderDetailsSchema", () => {
  it("빈 객체도 기본 구조로 채워진다", () => {
    const r = ReleaseOrderDetailsSchema.parse({});
    expect(r.printer).toBeNull();
    expect(r.cutter).toBeNull();
    expect(r.common.computerPrep).toBe(false);
    expect(r.prep.transport).toEqual([]);
    expect(r.site.blower.install).toBe(false);
  });
  it("프린터 값 보존 + 배열 체크박스", () => {
    const r = ReleaseOrderDetailsSchema.parse({
      printer: { rip: "토파즈", headType: "리코 G5i", headCount: "3", colors: ["CMYK", "W"], inkType: "G5i용", inkQty: "1L" },
    });
    expect(r.printer?.rip).toBe("토파즈");
    expect(r.printer?.colors).toEqual(["CMYK", "W"]);
  });
  it("알 수 없는 키는 무시(strip)", () => {
    const r = ReleaseOrderDetailsSchema.parse({ hacker: 1, site: { power: "단상 220V" } });
    expect((r as Record<string, unknown>).hacker).toBeUndefined();
    expect(r.site.power).toBe("단상 220V");
  });
});

describe("buildReleaseOrderPrefill", () => {
  const application = {
    company: "애드넷",
    phone: "010-3218-8850",
    address: "서울 금천구 가산디지털1로 19 1403호",
    fields: {
      install_survey: { building_type: "factory", location: "upper", elevator: "have", power: "single_220", pneumatic: "none" },
    },
  };

  it("의뢰·견적·설문에서 핵심을 채운다", () => {
    const out = buildReleaseOrderPrefill({
      application,
      quote: { items: [{ name: "JU-9060", equipmentId: "e1" }], delivery_date: "2024-11-18", delivery_time: "10:30:00" },
      deviceKind: "printer",
    });
    expect(out.company).toBe("애드넷");
    expect(out.contact_phone).toBe("010-3218-8850");
    expect(out.install_address).toContain("가산디지털");
    expect(out.device_name).toBe("JU-9060");
    expect(out.device_kind).toBe("printer");
    expect(out.install_at).toBe("2024-11-18T10:30:00+09:00");
    // 설문 매핑
    expect(out.details.site.power).toContain("220");
    expect(out.details.prep.electrical).toContain("케이블");
  });

  it("견적 없음·설문 없음도 안전(빈 기본값)", () => {
    const out = buildReleaseOrderPrefill({
      application: { company: "X", phone: "", address: "", fields: {} },
      quote: null,
      deviceKind: null,
    });
    expect(out.device_name).toBe("");
    expect(out.install_at).toBeNull();
    expect(out.device_kind).toBe("printer"); // 미판별 시 기본 프린터
    expect(out.details.site.power).toBe("");
  });
});

describe("buildReleaseOrderPrefill 본사/설치 주소", () => {
  const base = { quote: null, deviceKind: "printer" as const };

  it("연결 고객 있으면 본사=address·설치=address_actual1", () => {
    const r = buildReleaseOrderPrefill({
      ...base,
      application: { company: "A", phone: "", address: "의뢰주소" },
      company: { address: "본사주소", address_actual1: "설치주소" },
    });
    expect(r.hq_address).toBe("본사주소");
    expect(r.install_address).toBe("설치주소");
  });

  it("고객 설치주소 없으면 설치=본사(폴백)", () => {
    const r = buildReleaseOrderPrefill({
      ...base,
      application: { company: "A", phone: "", address: "의뢰주소" },
      company: { address: "본사주소", address_actual1: "" },
    });
    expect(r.hq_address).toBe("본사주소");
    expect(r.install_address).toBe("본사주소");
  });

  it("연결 고객 없으면 본사·설치 모두 의뢰주소 폴백", () => {
    const r = buildReleaseOrderPrefill({
      ...base,
      application: { company: "A", phone: "", address: "의뢰주소" },
      company: null,
    });
    expect(r.hq_address).toBe("의뢰주소");
    expect(r.install_address).toBe("의뢰주소");
  });
});
