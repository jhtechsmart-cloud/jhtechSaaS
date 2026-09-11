import { describe, expect, it } from "vitest";
import { buildFollowUpSeed, followUpBlockReason, followUpReference } from "./followup";
import type { ServiceReportRow } from "./types";

// #285 #D — 후속 방문 리포트: 원 리포트(부모)에서 고객·장비만 물려받고 진단·조치·청구는 새로 쓴다.
// 불변식(자기 자신 금지·1단·확정 이후·후속 미처리)은 DB RPC가 최종 강제하고, 여기선 진입 전에 이유를 보여준다.
const parent = {
  id: "p1",
  seq_no: "SR-20260909-00020",
  status: "issued",
  parent_report_id: null,
  company_id: "c1",
  company_equipment_id: "ce1",
  catalog_equipment_id: "eq1",
  service_request_id: "sr1",
  customer_name: "아트원 작업실",
  customer_biz_no: "1192533871",
  customer_tel: "02-857-4120",
  customer_addr: "서울 금천구",
  recipient_email: "cust@x.com",
  device_name: "JU-2513UV",
  device_serial: "JU2513-0417",
  purchased_at: "2025-10-01",
  faults: ["접촉불량"],
  diagnosis: "SSR 접촉불량",
  action_text: "재납땜 후 정상\n부품 수급 대기\n다음 방문 시 교체",
  follow_needed: true,
  follow_memo: "SSR 모듈 교체",
  follow_date: "2026-09-20",
  follow_resolved_at: null,
  signature_path: "p1/signature.png",
  engineer_signature_path: "p1/engineer-signature.png",
  photos_before: ["p1/before-1.jpg"],
  photos_after: [],
  parts: [{ name: "SSR", qty: 1, price: 15000 }],
  charge_type: "paid",
  free_reason: null,
  visit_fee: 90000,
  overtime_fee: 0,
  issued_at: "2026-09-09T05:00:00Z",
} as unknown as ServiceReportRow;

describe("followUpBlockReason — 진입 가능 여부", () => {
  it("확정·후속 미처리 부모는 진입 가능(null)", () => {
    expect(followUpBlockReason(parent)).toBeNull();
    expect(followUpBlockReason({ ...parent, status: "approved" } as ServiceReportRow)).toBeNull();
    expect(followUpBlockReason({ ...parent, status: "completed" } as ServiceReportRow)).toBeNull();
  });
  it("작성 중·무효 리포트는 부모가 될 수 없다", () => {
    expect(followUpBlockReason({ ...parent, status: "draft" } as ServiceReportRow)).toMatch(/확정/);
    expect(followUpBlockReason({ ...parent, status: "voided" } as ServiceReportRow)).toMatch(/무효/);
  });
  it("후속조치가 필요 없거나 이미 처리된 리포트는 진입 불가", () => {
    expect(followUpBlockReason({ ...parent, follow_needed: false } as ServiceReportRow)).toMatch(/후속조치/);
    expect(followUpBlockReason({ ...parent, follow_resolved_at: "2026-09-10T00:00:00Z" } as ServiceReportRow)).toMatch(/이미 처리/);
  });
  it("후속 리포트를 부모로 지정할 수 없다(1단만)", () => {
    expect(followUpBlockReason({ ...parent, parent_report_id: "p0" } as ServiceReportRow)).toMatch(/1단/);
  });
});

describe("buildFollowUpSeed — 물려받는 것과 비우는 것", () => {
  const seed = buildFollowUpSeed(parent);

  it("고객·장비·의뢰·수신처는 물려받는다", () => {
    expect(seed).toMatchObject({
      parent_report_id: "p1",
      company_id: "c1",
      company_equipment_id: "ce1",
      catalog_equipment_id: "eq1",
      service_request_id: "sr1",
      customer_name: "아트원 작업실",
      customer_tel: "02-857-4120",
      device_name: "JU-2513UV",
      device_serial: "JU2513-0417",
      purchased_at: "2025-10-01",
      recipient_email: "cust@x.com",
    });
  });

  it("진단·조치·부품·청구·후속은 비운다 — 이번 방문 내용을 새로 쓴다", () => {
    expect(seed.faults).toEqual([]);
    expect(seed.diagnosis).toBe("");
    expect(seed.action_text).toBe("");
    expect(seed.parts).toEqual([]);
    expect(seed.visit_fee).toBe(0);
    expect(seed.charge_type).toBe("paid");
    expect(seed.follow_needed).toBe(false);
    expect(seed.follow_memo).toBe("");
  });

  it("서명·사진은 절대 물려받지 않는다 — 원 리포트 서명이 새 문서에 붙으면 위조", () => {
    expect(seed.signature_path).toBe("");
    expect(seed.engineer_signature_path).toBe("");
    expect(seed.photos_before).toEqual([]);
    expect(seed.photos_after).toEqual([]);
  });
});

describe("followUpReference — 읽기 전용 참고 카드", () => {
  it("원 리포트 번호·확정일(KST)·고장 분류·후속 예정 + 조치 3줄 요약", () => {
    const ref = followUpReference(parent);
    expect(ref).toMatchObject({
      seqNo: "SR-20260909-00020",
      issuedAtLabel: "2026-09-09 14:00",
      faults: ["접촉불량"],
      followLabel: "SSR 모듈 교체 (예정일 2026-09-20)",
    });
    expect(ref.actionSummary.split("\n")).toHaveLength(3);
  });
  it("조치가 3줄을 넘으면 3줄까지만 + 말줄임", () => {
    const ref = followUpReference({ ...parent, action_text: "a\nb\nc\nd\ne" } as ServiceReportRow);
    expect(ref.actionSummary).toBe("a\nb\nc…");
  });
});
