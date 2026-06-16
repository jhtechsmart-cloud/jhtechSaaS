"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { validateNewPassword } from "@jhtechsaas/shared";
import { changeOwnPasswordAction } from "@/lib/users/password-actions";

// 비밀번호 변경 폼 — /admin/account(자발적)와 강제 변경 패널(forced)에서 공용.
// 클라 1차 검증(즉시 피드백) + 서버 액션이 현재 비밀번호 재검증·권위.
export function ChangePasswordForm({ forced = false }: { forced?: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    // 클라 1차 검증.
    if (next !== confirm) {
      setMessage({ kind: "error", text: "새 비밀번호가 일치하지 않습니다" });
      return;
    }
    const violation = validateNewPassword(next, { current });
    if (violation) {
      setMessage({ kind: "error", text: violation });
      return;
    }

    startTransition(async () => {
      const res = await changeOwnPasswordAction({ currentPassword: current, newPassword: next });
      if ("error" in res) {
        setMessage({ kind: "error", text: res.error });
        return;
      }
      setMessage({ kind: "ok", text: "비밀번호가 변경되었습니다" });
      setCurrent("");
      setNext("");
      setConfirm("");
      // 강제 모드: 플래그가 풀렸으니 새로고침하면 콘솔로 진입.
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex max-w-md flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-small font-medium text-text">현재 비밀번호</span>
        <input
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
          autoComplete="current-password"
          className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-small font-medium text-text">새 비밀번호 (8자 이상)</span>
        <input
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-small font-medium text-text">새 비밀번호 확인</span>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
        />
      </label>

      {message && (
        <p
          className={`rounded-md px-3 py-2 text-small font-medium ${
            message.kind === "ok" ? "bg-active/10 text-active" : "bg-danger/10 text-danger"
          }`}
        >
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-accent px-4 py-2 text-body font-medium text-white disabled:opacity-50"
      >
        {pending ? "변경 중…" : forced ? "비밀번호 변경하고 시작하기" : "비밀번호 변경"}
      </button>
    </form>
  );
}
