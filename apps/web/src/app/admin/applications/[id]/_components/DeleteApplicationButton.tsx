"use client";
import { useState, useTransition } from "react";
import { deleteApplicationAction } from "@/lib/applications/admin-actions";

// 의뢰 통째 삭제 버튼 — 관리자(users.manage) 전용. 성공 시 액션이 /admin/applications로 redirect.
// 발행 견적·출고의뢰서가 있으면 건수를 확인창에 경고해 실수 삭제를 막는다(비가역).
export function DeleteApplicationButton({
  applicationId,
  issuedQuoteCount,
  releaseOrderCount,
}: {
  applicationId: string;
  issuedQuoteCount: number;
  releaseOrderCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDelete() {
    const hasIssued = issuedQuoteCount > 0 || releaseOrderCount > 0;
    const msg = hasIssued
      ? `⚠️ 이 의뢰엔 발행 견적 ${issuedQuoteCount}건 · 출고의뢰서 ${releaseOrderCount}건이 있습니다.\n` +
        `의뢰를 삭제하면 견적(전 버전)·출고의뢰서·PDF·신청 사진이 모두 함께 삭제됩니다. 되돌릴 수 없습니다.\n\n정말 삭제할까요?`
      : "이 의뢰와 관련 견적·출고의뢰서·PDF·신청 사진을 모두 삭제할까요? 되돌릴 수 없습니다.";
    if (!window.confirm(msg)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteApplicationAction(applicationId);
      // 성공 시 redirect로 이동 → 여기 도달하면 실패뿐.
      if (res && "error" in res) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        className="rounded-md border border-danger/50 px-3 py-1.5 text-small font-medium text-danger hover:bg-danger/5 disabled:opacity-60"
      >
        {pending ? "삭제 중…" : "의뢰 삭제"}
      </button>
      {error && <span className="text-micro text-danger">{error}</span>}
    </div>
  );
}
