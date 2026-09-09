import { describe, expect, it } from "vitest";
import { applyDraftPatch, SIGNATURE_KEYS } from "./draft";
import type { ReportPayload } from "./types";

// #285 #B' — 서명 무효화 규칙(순수): 내용이 바뀌면 고객·기사 서명 둘 다 무효, 고객 서명을 다시 받으면 기사 서명도 무효,
// 기사 서명만 다시 하면 고객 서명은 유지.
const base = {
  signature_path: "r1/signature.png",
  engineer_signature_path: "r1/engineer-signature.png",
  diagnosis: "진단",
} as ReportPayload;

describe("applyDraftPatch", () => {
  it("SIGNATURE_KEYS = 고객·기사 서명 경로 2종", () => {
    expect(SIGNATURE_KEYS).toEqual(["signature_path", "engineer_signature_path"]);
  });

  it("내용(진단)이 바뀌면 고객·기사 서명 모두 무효화", () => {
    const next = applyDraftPatch(base, { diagnosis: "수정" });
    expect(next.diagnosis).toBe("수정");
    expect(next.signature_path).toBe("");
    expect(next.engineer_signature_path).toBe("");
  });

  it("서명이 없는 draft의 내용 변경은 그대로(빈 값 유지)", () => {
    const next = applyDraftPatch({ ...base, signature_path: "", engineer_signature_path: "" }, { diagnosis: "x" });
    expect(next.signature_path).toBe("");
    expect(next.engineer_signature_path).toBe("");
  });

  it("고객 서명을 지우면(다시 받기) 기사 서명도 함께 무효화 — 기사 서명은 고객 서명 뒤 순서", () => {
    const next = applyDraftPatch(base, { signature_path: "" });
    expect(next.signature_path).toBe("");
    expect(next.engineer_signature_path).toBe("");
  });

  it("고객 서명 저장(경로 세팅)은 기존 기사 서명을 지운다(새 고객 서명 = 새 결재)", () => {
    const next = applyDraftPatch({ ...base, signature_path: "" }, { signature_path: "r1/signature.png" });
    expect(next.engineer_signature_path).toBe("");
  });

  it("기사 서명만 바꾸면 고객 서명은 유지", () => {
    const next = applyDraftPatch({ ...base, engineer_signature_path: "" }, { engineer_signature_path: "r1/engineer-signature.png" });
    expect(next.signature_path).toBe("r1/signature.png");
    expect(next.engineer_signature_path).toBe("r1/engineer-signature.png");
    expect(applyDraftPatch(base, { engineer_signature_path: "" }).signature_path).toBe("r1/signature.png");
  });

  it("두 서명 경로를 함께 넣는 패치는 그대로 반영", () => {
    const next = applyDraftPatch({ ...base, signature_path: "", engineer_signature_path: "" }, {
      signature_path: "r1/signature.png",
      engineer_signature_path: "r1/engineer-signature.png",
    });
    expect(next.signature_path).toBe("r1/signature.png");
    expect(next.engineer_signature_path).toBe("r1/engineer-signature.png");
  });
});
