import { describe, expect, it } from "vitest";
import { needsUnpublishConfirm } from "./wp-form-logic";

// 공개된 홈페이지 글이 내려가는 저장에만 확인 모달(1회) — 초안·미연동은 모달 없음.

describe("needsUnpublishConfirm", () => {
  it("공개 글 장비의 체크 해제 저장 → 확인 필요", () => {
    expect(
      needsUnpublishConfirm({ initialEnabled: true, wpPostStatus: "publish", nextEnabled: false, nextStatus: "active" }),
    ).toBe(true);
  });

  it("공개 글 장비의 inactive 전환 저장 → 확인 필요 (체크 유지여도 글이 내려감)", () => {
    expect(
      needsUnpublishConfirm({ initialEnabled: true, wpPostStatus: "publish", nextEnabled: true, nextStatus: "inactive" }),
    ).toBe(true);
  });

  it("초안 글 장비의 체크 해제 → 모달 없음 (이미 비공개)", () => {
    expect(
      needsUnpublishConfirm({ initialEnabled: true, wpPostStatus: "draft", nextEnabled: false, nextStatus: "active" }),
    ).toBe(false);
  });

  it("체크 유지 + active 유지 → 모달 없음", () => {
    expect(
      needsUnpublishConfirm({ initialEnabled: true, wpPostStatus: "publish", nextEnabled: true, nextStatus: "active" }),
    ).toBe(false);
  });

  it("미연동 장비(wpPostStatus null) → 어떤 저장도 모달 없음", () => {
    expect(
      needsUnpublishConfirm({ initialEnabled: false, wpPostStatus: null, nextEnabled: false, nextStatus: "inactive" }),
    ).toBe(false);
  });
});
