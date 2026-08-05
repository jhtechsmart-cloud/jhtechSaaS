// WP 연동 3축 상태 파생(순수) — 공개(미생성/초안/공개) × 콘텐츠(최신/반영대기) × 작업(없음/활성/실패).
// UI는 primary 배지 + pendingRefresh 보조 배지 + error 인라인으로 표현한다.
// 우선순위: syncing > failed > mapping_required > published/draft/pending_create. not_linked는 체크 해제 시 항상.

export type WpPrimaryStatus =
  | "not_linked" // 체크 안 됨(글이 남아 있어도 내려간 상태)
  | "mapping_required" // 체크됐지만 분류의 WP 카테고리 미해석
  | "pending_create" // 체크+매핑 OK, 글 미생성(저장 시 잡 생성 대기)
  | "syncing" // 활성 잡 존재
  | "failed" // 마지막 잡 실패(wp_last_error)
  | "draft"
  | "published";

export interface WpStatusInput {
  wpPublishEnabled: boolean;
  wpPostId: number | null;
  wpPostStatus: "draft" | "publish" | null;
  wpDirty: boolean;
  wpLastError: string | null;
  mappingResolved: boolean;
  activeJob: "queued" | "processing" | null;
}

export interface WpStatus {
  primary: WpPrimaryStatus;
  pendingRefresh: boolean; // 공개 글인데 저장분 미반영 — [홈페이지 갱신] 버튼 노출 근거
  error: string | null;
}

export function deriveWpStatus(input: WpStatusInput): WpStatus {
  const pendingRefresh = input.wpPostStatus === "publish" && input.wpDirty;
  const error = input.wpLastError;

  if (!input.wpPublishEnabled) {
    return { primary: "not_linked", pendingRefresh: false, error: null };
  }
  if (input.activeJob) return { primary: "syncing", pendingRefresh, error: null };
  if (error) return { primary: "failed", pendingRefresh, error };
  if (!input.mappingResolved) return { primary: "mapping_required", pendingRefresh, error: null };
  if (!input.wpPostId) return { primary: "pending_create", pendingRefresh: false, error: null };
  return {
    primary: input.wpPostStatus === "publish" ? "published" : "draft",
    pendingRefresh,
    error: null,
  };
}
