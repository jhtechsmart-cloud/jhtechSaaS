"use client";
import { useState, useTransition } from "react";
import { deleteQuoteAction, deleteAllQuotesForApplicationAction } from "@/lib/quotes/actions";

// 견적 삭제 버튼 — 관리자(users.manage) 전용. 성공 시 액션이 의뢰로 redirect.
// 버전이 2개 이상이면 '이 버전 삭제'(현재 버전+PDF) + '견적 전체 삭제'(전 버전+PDF) 둘 다,
// 1개면 '견적 삭제' 하나만 노출.
export function DeleteQuoteButton({
  quoteId, applicationId, multiVersion,
}: {
  quoteId: string;
  applicationId: string;
  multiVersion: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ error: string } | null>, confirmMsg: string) {
    if (!window.confirm(confirmMsg)) return;
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (res?.error) setError(res.error); // 성공 시 redirect로 이동 → 여기 도달하면 실패뿐.
    });
  }

  const delVersion = () =>
    run(() => deleteQuoteAction(quoteId), "이 버전 견적과 PDF를 삭제할까요? 되돌릴 수 없습니다.");
  const delAll = () =>
    run(
      () => deleteAllQuotesForApplicationAction(applicationId),
      "이 의뢰의 모든 견적(전 버전)과 PDF를 삭제할까요? 되돌릴 수 없습니다.",
    );

  const danger =
    "rounded-md border border-danger/50 py-2 text-center text-small font-medium text-danger hover:bg-danger/5 disabled:opacity-60";

  return (
    <div className="flex flex-col gap-1">
      {multiVersion ? (
        <div className="flex gap-2">
          <button type="button" onClick={delVersion} disabled={pending} className={`flex-1 ${danger}`}>
            {pending ? "처리 중…" : "이 버전 삭제"}
          </button>
          <button type="button" onClick={delAll} disabled={pending} className={`flex-1 ${danger}`}>
            {pending ? "처리 중…" : "견적 전체 삭제"}
          </button>
        </div>
      ) : (
        <button type="button" onClick={delVersion} disabled={pending} className={danger}>
          {pending ? "삭제 중…" : "견적 삭제"}
        </button>
      )}
      {error && <span className="text-micro text-danger">{error}</span>}
    </div>
  );
}
