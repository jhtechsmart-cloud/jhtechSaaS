"use client";
import { useState, useTransition } from "react";
import { deleteQuoteAction } from "@/lib/quotes/actions";

// 견적 삭제 버튼 — 관리자(users.manage) 전용. 확인창 후 서버 액션 호출(성공 시 액션이 의뢰로 redirect).
export function DeleteQuoteButton({ quoteId }: { quoteId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDelete() {
    if (!window.confirm("이 견적을 삭제할까요? 되돌릴 수 없습니다.")) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteQuoteAction(quoteId);
      // 성공 시 액션이 redirect로 이동 → 여기 도달하면 실패뿐.
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        className="rounded-md border border-danger/50 py-2 text-center text-small font-medium text-danger hover:bg-danger/5 disabled:opacity-60"
      >
        {pending ? "삭제 중…" : "견적 삭제"}
      </button>
      {error && <span className="text-micro text-danger">{error}</span>}
    </div>
  );
}
