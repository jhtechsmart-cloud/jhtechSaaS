import type { ReportPayload } from "./types";

// 현장 마법사 draft 패치 규칙(순수) — #285 #B'.
// 서명은 "그 시점의 내용"에 대한 확인이므로 내용이 바뀌면 고객·기사 서명이 모두 무효다.
// 순서 = 고객 서명 → 기사 서명. 고객 서명이 바뀌거나 지워지면 기사 서명도 무효(새 고객 서명 = 새 결재).
// 기사 서명만 바꾸는 패치는 고객 서명을 건드리지 않는다.
export const SIGNATURE_KEYS = ["signature_path", "engineer_signature_path"] as const;

export function applyDraftPatch(draft: ReportPayload, patch: Partial<ReportPayload>): ReportPayload {
  const next: ReportPayload = { ...draft, ...patch };
  const touchesOnlySignatures = Object.keys(patch).every((k) => (SIGNATURE_KEYS as readonly string[]).includes(k));
  if (!touchesOnlySignatures) {
    // 내용 변경 → 두 서명 모두 무효화(있을 때만)
    if (draft.signature_path) next.signature_path = "";
    if (draft.engineer_signature_path) next.engineer_signature_path = "";
    return next;
  }
  // 고객 서명이 바뀌었는데(지움·재서명) 기사 서명을 같이 주지 않았으면 기사 서명 무효화
  if ("signature_path" in patch && !("engineer_signature_path" in patch) && patch.signature_path !== draft.signature_path) {
    next.engineer_signature_path = "";
  }
  return next;
}
