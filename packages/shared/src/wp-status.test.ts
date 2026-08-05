import { describe, expect, it } from "vitest";
import { deriveWpStatus, type WpStatusInput } from "./wp-status";

// 3축 상태 모델(공개×콘텐츠×작업) 파생 — 우선순위:
// syncing > failed > mapping_required > published/draft/pending_create/not_linked
// 보조 배지 dirty는 공개 글에만 의미가 있다.

function base(over: Partial<WpStatusInput> = {}): WpStatusInput {
  return {
    wpPublishEnabled: true,
    wpPostId: null,
    wpPostStatus: null,
    wpDirty: false,
    wpLastError: null,
    mappingResolved: true,
    activeJob: null,
    ...over,
  };
}

describe("deriveWpStatus", () => {
  it("체크 안 된 장비 = not_linked", () => {
    expect(deriveWpStatus(base({ wpPublishEnabled: false })).primary).toBe("not_linked");
  });

  it("체크됐지만 매핑 미해석 = mapping_required (글 존재 여부와 무관)", () => {
    expect(deriveWpStatus(base({ mappingResolved: false })).primary).toBe("mapping_required");
    expect(
      deriveWpStatus(base({ mappingResolved: false, wpPostId: 10, wpPostStatus: "publish" }))
        .primary,
    ).toBe("mapping_required");
  });

  it("체크+매핑 OK+글 미생성 = pending_create", () => {
    expect(deriveWpStatus(base()).primary).toBe("pending_create");
  });

  it("초안 글 = draft, 공개 글 = published", () => {
    expect(deriveWpStatus(base({ wpPostId: 10, wpPostStatus: "draft" })).primary).toBe("draft");
    expect(deriveWpStatus(base({ wpPostId: 10, wpPostStatus: "publish" })).primary).toBe(
      "published",
    );
  });

  it("활성 잡(queued/processing)이 있으면 다른 모든 상태보다 우선해 syncing", () => {
    for (const jobStatus of ["queued", "processing"] as const) {
      const s = deriveWpStatus(
        base({ wpPostId: 10, wpPostStatus: "publish", wpLastError: "boom", activeJob: jobStatus }),
      );
      expect(s.primary).toBe("syncing");
    }
  });

  it("wp_last_error가 있으면 failed (syncing 다음 우선순위)", () => {
    const s = deriveWpStatus(base({ wpPostId: 10, wpPostStatus: "publish", wpLastError: "401" }));
    expect(s.primary).toBe("failed");
    expect(s.error).toBe("401");
  });

  it("공개 글 + dirty = 보조 배지 pendingRefresh", () => {
    const s = deriveWpStatus(base({ wpPostId: 10, wpPostStatus: "publish", wpDirty: true }));
    expect(s.primary).toBe("published");
    expect(s.pendingRefresh).toBe(true);
  });

  it("초안 글의 dirty는 보조 배지를 만들지 않는다(초안은 저장 시 자동 동기화)", () => {
    const s = deriveWpStatus(base({ wpPostId: 10, wpPostStatus: "draft", wpDirty: true }));
    expect(s.pendingRefresh).toBe(false);
  });

  it("체크 해제된 장비는 글이 남아 있어도 not_linked (내려간 글)", () => {
    const s = deriveWpStatus(
      base({ wpPublishEnabled: false, wpPostId: 10, wpPostStatus: "draft" }),
    );
    expect(s.primary).toBe("not_linked");
  });
});
