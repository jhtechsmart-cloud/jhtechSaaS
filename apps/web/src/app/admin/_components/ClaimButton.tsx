"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type ClaimResult = { error: string } | { ok: true } | null;

// "내가 맡기" — 미배정 신청을 본인 담당으로 가져온다(self-claim). 서버 액션을 prop으로 받아
// applications/service/supply 3종에 공용. 서버가 RLS+가드로 최종 강제(UI는 노출만).
export function ClaimButton({
  id,
  action,
  label = "내가 맡기",
}: {
  id: string;
  action: (id: string) => Promise<ClaimResult>;
  label?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function claim() {
    setError(null);
    start(async () => {
      const res = await action(id);
      if (res && "error" in res) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={claim}
        disabled={pending}
        className="self-start rounded-md bg-accent px-4 py-2 text-body font-medium text-white disabled:opacity-50"
      >
        {pending ? "처리 중…" : label}
      </button>
      {error && <p className="text-small text-danger">{error}</p>}
    </div>
  );
}
